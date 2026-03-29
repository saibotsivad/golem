import { AutoTokenizer, GPT2LMHeadModel, pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js'

env.allowLocalModels = false

// ── shared tokenizer ───────────────────────────────────────────────────────
let tokenizer = null


// ── shared GPT-2 model (§2 and §3) ────────────────────────────────────────
let lmModel = null

async function ensureModel(onProgress) {
	if (lmModel) return lmModel
	lmModel = await GPT2LMHeadModel.from_pretrained('Xenova/gpt2', {
		quantized: true,
		progress_callback: info => { if (onProgress) onProgress(info) },
	})
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
	embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
		quantized: true,
		progress_callback: info => { if (onProgress) onProgress(info) },
	})
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
