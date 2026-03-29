import { AutoTokenizer, GPT2LMHeadModel, pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js'

env.allowLocalModels = false

// ── model registry ─────────────────────────────────────────────────────────
// status values: 'unknown' | 'absent' | 'cached' | 'loading' | 'downloading' | 'ready' | 'error'
// 'cached'  = file is in browser storage but not instantiated this session
// 'loading' = file is in storage, being read/initialized into memory
// 'downloading' = actively fetching from network (progress 0–100)
// 'ready'   = fully loaded and available in memory
const REGISTRY = {
	'gpt2-tokenizer': { label: 'GPT-2 tokenizer',      size: '~800 KB', status: 'unknown', progress: null },
	'gpt2-lm':        { label: 'GPT-2 LM',             size: '~81 MB',  status: 'unknown', progress: null },
	'minilm':         { label: 'all-MiniLM-L6-v2',     size: '~23 MB',  status: 'unknown', progress: null },
	'search-index':   { label: 'Semantic search index', size: null,      status: 'unknown', progress: null },
}
const _registryListeners = []
function registrySubscribe(fn) { _registryListeners.push(fn) }
function registrySet(key, update) {
	Object.assign(REGISTRY[key], update)
	for (const fn of _registryListeners) fn()
}

// Probe browser Cache API (used by Transformers.js) to detect pre-cached files.
// Guard: only update if status is still 'unknown' so we never overwrite a live
// 'loading'/'ready' state that the tokenizer auto-start may have already set.
async function probeTransformersCache() {
	try {
		const cache = await caches.open('transformers-cache')
		const urls  = (await cache.keys()).map(r => r.url)
		if (REGISTRY['gpt2-tokenizer'].status === 'unknown')
			registrySet('gpt2-tokenizer', { status: urls.some(u => u.includes('Xenova/gpt2') && /tokenizer|vocab|merges/.test(u)) ? 'cached' : 'absent' })
		if (REGISTRY['gpt2-lm'].status === 'unknown')
			registrySet('gpt2-lm',        { status: urls.some(u => u.includes('Xenova/gpt2') && u.includes('onnx')) ? 'cached' : 'absent' })
		if (REGISTRY['minilm'].status === 'unknown')
			registrySet('minilm',         { status: urls.some(u => u.includes('Xenova/all-MiniLM-L6-v2')) ? 'cached' : 'absent' })
	} catch { /* Cache API unavailable — statuses stay 'unknown' */ }
}
probeTransformersCache()

// ── shared tokenizer ───────────────────────────────────────────────────────
let tokenizer = null


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


// ── shared embedder (§4 and §5) ────────────────────────────────────────────
let embedder = null

async function ensureEmbedder(onProgress) {
	if (embedder) return embedder
	registrySet('minilm', { status: 'loading', progress: null })
	embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
		quantized: true,
		progress_callback: info => {
			if (info.status === 'progress') registrySet('minilm', { status: 'downloading', progress: info.progress })
			else if (info.status === 'done') registrySet('minilm', { status: 'loading',     progress: null })
			if (onProgress) onProgress(info)
		},
	})
	registrySet('minilm', { status: 'ready', progress: null })
	return embedder
}

async function embed(text) {
	const ext = await ensureEmbedder()
	const out = await ext(text, { pooling: 'mean', normalize: true })
	return Array.from(out.data)
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

// ── debug panel renderer ────────────────────────────────────────────────────
const _debugStatusClass = {
	ready: 'status-ready', cached: 'status-cached', absent: 'status-absent',
	downloading: 'status-downloading', loading: 'status-loading',
	error: 'status-error', unknown: 'status-unknown',
}
const _debugStatusLabel = {
	ready: 'ready', cached: 'cached', absent: 'not cached',
	loading: 'initializing\u2026', error: 'error', unknown: '\u2014',
}
function renderDebugPanel() {
	const rows = Object.values(REGISTRY).map(({ label, size, status, progress }) => {
		const cls  = _debugStatusClass[status] || ''
		const text = status === 'downloading' && progress !== null
			? `downloading ${progress.toFixed(0)}%`
			: (_debugStatusLabel[status] || status)
		return `<tr><td>${label}</td><td style="color:#999">${size ?? ''}</td><td class="${cls}">${text}</td></tr>`
	})
	document.getElementById('debug-panel').innerHTML =
		`<p style="margin:0 0 0.5rem;font-size:0.85rem;color:#555"><em>cached</em> = in browser storage &nbsp;\xb7&nbsp; <em>ready</em> = instantiated this session</p>` +
		`<table class="debug-table"><thead><tr><th>Asset</th><th>Size</th><th>Status</th></tr></thead><tbody>${rows.join('')}</tbody></table>`
}
registrySubscribe(renderDebugPanel)
renderDebugPanel()

document.getElementById('debug-toggle-btn').addEventListener('click', e => {
	e.preventDefault()
	const panel    = document.getElementById('debug-panel')
	const sections = document.getElementById('sections')
	const btn      = e.currentTarget
	const showing  = !panel.hidden
	panel.hidden    = showing
	sections.hidden = !showing
	btn.textContent = showing ? 'debug' : 'back'
})
