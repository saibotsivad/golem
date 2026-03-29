import { AutoTokenizer, GPT2LMHeadModel, pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js'

env.allowLocalModels = false

// ── model registry ─────────────────────────────────────────────────────────
// status values: 'unknown' | 'absent' | 'cached' | 'loading' | 'downloading' | 'ready' | 'error'
// 'cached'  = file is in browser storage but not instantiated this session
// 'loading' = file is in storage, being read/initialized into memory
// 'downloading' = actively fetching from network (progress 0–100)
// 'ready'   = fully loaded and available in memory
const REGISTRY = {
	'xenova-gpt2':    { label: 'GPT-2 tokenizer',      size: '~800 KB', status: 'unknown', progress: null },
	'gpt2-lm':        { label: 'GPT-2 LM',             size: '~81 MB',  status: 'unknown', progress: null },
	'minilm':         { label: 'all-MiniLM-L6-v2',     size: '~23 MB',  status: 'unknown', progress: null },
	'search-index':   { label: 'Semantic search index', size: null,      status: 'unknown', progress: null },
	'rag-index':      { label: 'RAG index',             size: null,      status: 'unknown', progress: null },
}
const _registryListeners = []
function registrySubscribe(fn) { _registryListeners.push(fn) }
function registrySet(key, update) {
	Object.assign(REGISTRY[key], update)
	for (const fn of _registryListeners) fn()
}
function registryDelete(key) {
	delete REGISTRY[key]
	for (const fn of _registryListeners) fn()
}

// Probe browser Cache API (used by Transformers.js) to detect pre-cached files.
// Guard: only update if status is still 'unknown' so we never overwrite a live
// 'loading'/'ready' state that the tokenizer auto-start may have already set.
async function probeTransformersCache() {
	try {
		const cache = await caches.open('transformers-cache')
		const urls  = (await cache.keys()).map(r => r.url)
		if (REGISTRY['xenova-gpt2'].status === 'unknown')
			registrySet('xenova-gpt2', { status: urls.some(u => u.includes('Xenova/gpt2') && /tokenizer|vocab|merges/.test(u)) ? 'cached' : 'absent' })
		if (REGISTRY['gpt2-lm'].status === 'unknown')
			registrySet('gpt2-lm',        { status: urls.some(u => u.includes('Xenova/gpt2') && u.includes('onnx')) ? 'cached' : 'absent' })
		if (REGISTRY['minilm'].status === 'unknown')
			registrySet('minilm',         { status: urls.some(u => u.includes('Xenova/all-MiniLM-L6-v2')) ? 'cached' : 'absent' })
	} catch { /* Cache API unavailable — statuses stay 'unknown' */ }
}
probeTransformersCache()

// ── shared GPT-2 model (§2 and §3) ────────────────────────────────────────
let lmModel = null

async function ensureModel(onProgress) {
	if (lmModel) return lmModel
	registrySet('gpt2-lm', { status: 'loading', progress: null })
	lmModel = await GPT2LMHeadModel.from_pretrained('Xenova/gpt2', {
		quantized: true,
		progress_callback: info => {
			if (info.status === 'progress') registrySet('gpt2-lm', { status: 'downloading', progress: info.progress })
			else if (info.status === 'done') registrySet('gpt2-lm', { status: 'loading',     progress: null })
			if (onProgress) onProgress(info)
		},
	})
	registrySet('gpt2-lm', { status: 'ready', progress: null })
	return lmModel
}

// ── shared helpers ─────────────────────────────────────────────────────────
function softmaxWithTemp(logits, temp) {
	const n = logits.length
	let max = -Infinity
	for (let i = 0; i < n; i++) if (logits[i] > max) max = logits[i]
	const out = new Float64Array(n)
	let sum = 0
	for (let i = 0; i < n; i++) { out[i] = Math.exp((logits[i] - max) / temp); sum += out[i] }
	for (let i = 0; i < n; i++) out[i] /= sum
	return out
}

function getLogits(output) {
	const { logits } = output
	const seqLen    = logits.dims[1]
	const vocabSize = logits.dims[2]
	const offset    = (seqLen - 1) * vocabSize
	return { lastLogits: logits.data.subarray(offset, offset + vocabSize), seqLen, vocabSize }
}

function escHtml(s) {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}


// ── shared embedder (§4 and §5) — runs in a worker to keep UI responsive ──
const _EMBED_WORKER_SRC = `
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js'
env.allowLocalModels = false

let _pipePromise = null

function getPipe() {
	if (!_pipePromise) {
		_pipePromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
			quantized: true,
			progress_callback: info => self.postMessage({ type: 'model_progress', info }),
		}).then(p => { self.postMessage({ type: 'model_ready' }); return p })
	}
	return _pipePromise
}

self.onmessage = async ({ data }) => {
	if (data.type === 'load') {
		await getPipe()
	} else if (data.type === 'embed') {
		try {
			const p   = await getPipe()
			const out = await p(data.text, { pooling: 'mean', normalize: true })
			const vec = new Float32Array(out.data)
			self.postMessage({ type: 'result', id: data.id, vec }, [vec.buffer])
		} catch (err) {
			self.postMessage({ type: 'error', id: data.id, message: err.message })
		}
	}
}
`

const _embedWorker = new Worker(
	URL.createObjectURL(new Blob([_EMBED_WORKER_SRC], { type: 'text/javascript' })),
	{ type: 'module' }
)
let _embedReady      = false
let _embedReadyCbs   = []
let _embedLoadSent   = false
let _embedNextId     = 0
const _embedProgressListeners = new Set()
const _embedPending           = new Map()

_embedWorker.onmessage = ({ data }) => {
	if (data.type === 'model_progress') {
		const { info } = data
		if (info.status === 'progress') registrySet('minilm', { status: 'downloading', progress: info.progress })
		else if (info.status === 'done') registrySet('minilm', { status: 'loading',    progress: null })
		for (const fn of _embedProgressListeners) fn(info)
	} else if (data.type === 'model_ready') {
		registrySet('minilm', { status: 'ready', progress: null })
		_embedReady = true
		for (const fn of _embedReadyCbs) fn()
		_embedReadyCbs = []
	} else if (data.type === 'result') {
		const cb = _embedPending.get(data.id)
		if (cb) { _embedPending.delete(data.id); cb.resolve(Array.from(data.vec)) }
	} else if (data.type === 'error') {
		const cb = _embedPending.get(data.id)
		if (cb) { _embedPending.delete(data.id); cb.reject(new Error(data.message)) }
	}
}

async function ensureEmbedder(onProgress) {
	if (onProgress) _embedProgressListeners.add(onProgress)
	if (!_embedLoadSent) {
		_embedLoadSent = true
		registrySet('minilm', { status: 'loading', progress: null })
		_embedWorker.postMessage({ type: 'load' })
	}
	if (!_embedReady) await new Promise(resolve => _embedReadyCbs.push(resolve))
	if (onProgress) _embedProgressListeners.delete(onProgress)
}

async function embed(text) {
	await ensureEmbedder()
	const id = _embedNextId++
	return new Promise((resolve, reject) => {
		_embedPending.set(id, { resolve, reject })
		_embedWorker.postMessage({ type: 'embed', id, text })
	})
}

function cosine(a, b) {
	let dot = 0, na = 0, nb = 0
	for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2 }
	return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

function drawEmbedding(canvas, vec, scale) {
	const ctx = canvas.getContext('2d')
	const w = canvas.width, h = canvas.height, n = vec.length
	ctx.clearRect(0, 0, w, h)
	for (let i = 0; i < n; i++) {
		const x0 = Math.floor(i * w / n)
		const x1 = Math.floor((i + 1) * w / n)
		const v  = vec[i] / scale  // [-1, 1]
		let r, g, b
		if (v >= 0) {
			const t = Math.min(1, v)
			r = Math.round(255 * (1 - t * 0.5))
			g = Math.round(255 * (1 - t * 0.5))
			b = 255
		} else {
			const t = Math.min(1, -v)
			r = 255
			g = Math.round(255 * (1 - t * 0.5))
			b = Math.round(255 * (1 - t * 0.5))
		}
		ctx.fillStyle = `rgb(${r},${g},${b})`
		ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h)
	}
}

function drawEmbeddingDiff(canvas, vecA, vecB, scale) {
	const ctx = canvas.getContext('2d')
	const w = canvas.width, h = canvas.height, n = vecA.length
	ctx.clearRect(0, 0, w, h)
	for (let i = 0; i < n; i++) {
		const x0 = Math.floor(i * w / n)
		const x1 = Math.floor((i + 1) * w / n)
		const diff = Math.abs(vecA[i] - vecB[i]) / (2 * scale)  // [0, 1]
		const t = Math.round(255 * (1 - Math.min(1, diff)))
		ctx.fillStyle = `rgb(${t},${t},${t})`
		ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h)
	}
}

// ── shared IDB helpers for embedding/search indices ────────────────────────
// DB 'golem', store 'search' — used by §5 and §6 to cache flat Float32Array
// embedding indices between page loads.
function _openSearchDb() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open('golem', 1)
		req.onupgradeneeded = e => {
			const db = e.target.result
			if (!db.objectStoreNames.contains('search')) db.createObjectStore('search')
		}
		req.onsuccess = e => resolve(e.target.result)
		req.onerror  = e => reject(e.target.error)
	})
}
async function idbGet(key) {
	try {
		const db = await _openSearchDb()
		return new Promise((resolve, reject) => {
			const tx  = db.transaction('search', 'readonly')
			const req = tx.objectStore('search').get(key)
			req.onsuccess = e => resolve(e.target.result ?? null)
			req.onerror   = e => reject(e.target.error)
		})
	} catch { return null }
}
async function idbPut(key, value) {
	try {
		const db = await _openSearchDb()
		return new Promise((resolve, reject) => {
			const tx  = db.transaction('search', 'readwrite')
			const req = tx.objectStore('search').put(value, key)
			req.onsuccess = () => resolve()
			req.onerror   = e => reject(e.target.error)
		})
	} catch {}
}

// ── GPT-2 sampling worker source ──────────────────────────────────────────
// Shared by §3 (sampling) and §6 (RAG) — each section creates its own Worker
// instance from this string so they never contend over the same worker.
const SAMPLING_WORKER_CODE = `
import { AutoTokenizer, GPT2LMHeadModel, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js'

env.allowLocalModels = false

let tokenizer = null
let lmModel   = null
let stopRequested = false

function softmaxWithTemp(logits, temp) {
	const n = logits.length
	let max = -Infinity
	for (let i = 0; i < n; i++) if (logits[i] > max) max = logits[i]
	const out = new Float64Array(n)
	let sum = 0
	for (let i = 0; i < n; i++) { out[i] = Math.exp((logits[i] - max) / temp); sum += out[i] }
	for (let i = 0; i < n; i++) out[i] /= sum
	return out
}

function getLogits(output) {
	const { logits } = output
	const seqLen    = logits.dims[1]
	const vocabSize = logits.dims[2]
	const offset    = (seqLen - 1) * vocabSize
	return { lastLogits: logits.data.subarray(offset, offset + vocabSize) }
}

function sampleToken(probs, strategy, temp, k, p) {
	const n = probs.length

	if (strategy === 'greedy') {
		let best = 0
		for (let i = 1; i < n; i++) if (probs[i] > probs[best]) best = i
		return { id: best, prob: probs[best] }
	}

	if (strategy === 'temperature') {
		let r = Math.random(), cum = 0
		for (let i = 0; i < n; i++) {
			cum += probs[i]
			if (r <= cum) return { id: i, prob: probs[i] }
		}
		return { id: n - 1, prob: probs[n - 1] }
	}

	const sorted = Array.from({ length: n }, (_, i) => i).sort((a, b) => probs[b] - probs[a])
	let candidates
	if (strategy === 'topk') {
		candidates = sorted.slice(0, k)
	} else {
		candidates = []
		let cumSum = 0
		for (const i of sorted) {
			candidates.push(i)
			cumSum += probs[i]
			if (cumSum >= p) break
		}
	}

	let sum = 0
	for (const i of candidates) sum += probs[i]
	let r = Math.random() * sum
	for (const i of candidates) {
		r -= probs[i]
		if (r <= 0) return { id: i, prob: probs[i] }
	}
	const last = candidates[candidates.length - 1]
	return { id: last, prob: probs[last] }
}

self.onmessage = async ({ data }) => {
	if (data.type === 'stop') { stopRequested = true; return }
	if (data.type !== 'generate') return

	stopRequested = false
	const { prompt, strategy, temp, k, p, maxTok } = data

	try {
		if (!tokenizer) {
			self.postMessage({ type: 'status', text: 'Loading tokenizer\u2026' })
			tokenizer = await AutoTokenizer.from_pretrained('Xenova/gpt2')
		}

		if (!lmModel) {
			lmModel = await GPT2LMHeadModel.from_pretrained('Xenova/gpt2', {
				quantized: true,
				progress_callback: info => {
					if (info.status === 'progress')
						self.postMessage({ type: 'status', text: 'Downloading model: ' + info.progress.toFixed(0) + '%' })
					else if (info.status === 'done')
						self.postMessage({ type: 'status', text: 'Loading model into memory\u2026' })
				},
			})
		}

		const GPT2_EOS  = 50256
		let generatedIds = []
		let stepCount    = 0
		let stopReason   = 'limit reached'

		while (stepCount < maxTok) {
			await new Promise(resolve => setTimeout(resolve, 0))
			if (stopRequested) { stopReason = 'stopped'; break }
			self.postMessage({ type: 'status', text: 'Generating token ' + (stepCount + 1) + ' / ' + maxTok + '\u2026' })

			const currentText = prompt + (generatedIds.length ? tokenizer.decode(generatedIds) : '')
			const inputs = tokenizer(currentText, { truncation: true, max_length: 1024 })
			const output = await lmModel(inputs)
			const { lastLogits } = getLogits(output)

			const effectiveTemp = strategy === 'greedy' ? 1.0 : temp
			const probs = softmaxWithTemp(lastLogits, effectiveTemp)
			const { id, prob } = sampleToken(probs, strategy, temp, k, p)

			if (id === GPT2_EOS) { stopReason = 'end-of-sequence token'; break }

			generatedIds.push(id)
			self.postMessage({ type: 'token', text: tokenizer.decode([id]), prob, step: stepCount })
			stepCount++
		}

		const strategyLabel = strategy === 'topk' ? 'top-k (k=' + k + ')' :
		                      strategy === 'topp' ? 'top-p (p=' + p + ')' :
		                      strategy === 'temperature' ? 'temperature (' + temp + ')' : 'greedy'
		self.postMessage({ type: 'done', stepCount, strategyLabel, stopReason })
	} catch (err) {
		self.postMessage({ type: 'error', message: err.message })
	}
}
`

function drawEmbeddingGrid(canvas, vecs, count, dims, totalRows) {
	const ctx = canvas.getContext('2d')
	const w = canvas.width
	const rowH = Math.max(1, Math.floor(canvas.height / (totalRows ?? count)))
	let scale = 0
	for (let i = 0; i < count * dims; i++) scale = Math.max(scale, Math.abs(vecs[i]))
	if (scale === 0) scale = 1
	ctx.clearRect(0, 0, w, canvas.height)
	for (let row = 0; row < count; row++) {
		const y0 = row * rowH
		for (let j = 0; j < dims; j++) {
			const x0 = Math.floor(j * w / dims)
			const x1 = Math.floor((j + 1) * w / dims)
			const v  = vecs[row * dims + j] / scale
			let r, g, b
			if (v >= 0) {
				const t = Math.min(1, v)
				r = Math.round(255 * (1 - t * 0.5))
				g = Math.round(255 * (1 - t * 0.5))
				b = 255
			} else {
				const t = Math.min(1, -v)
				r = 255
				g = Math.round(255 * (1 - t * 0.5))
				b = Math.round(255 * (1 - t * 0.5))
			}
			ctx.fillStyle = `rgb(${r},${g},${b})`
			ctx.fillRect(x0, y0, Math.max(1, x1 - x0), rowH)
		}
	}
}

