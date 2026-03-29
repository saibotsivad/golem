// ── §3 sampling strategies ────────────────────────────────────────────────
const sampleStatus  = document.getElementById('sample-status')
const sampleBtn     = document.getElementById('sample-btn')
const sampleStopBtn = document.getElementById('sample-stop-btn')
const sampleInput   = document.getElementById('sample-input')
const sampleOutput  = document.getElementById('sample-output')
const sampleText    = document.getElementById('sample-text')
const sampleMeta    = document.getElementById('sample-meta')
const strategyEl    = document.getElementById('strategy')
const sampleTempEl  = document.getElementById('sample-temp')
const sampleKEl     = document.getElementById('sample-k')
const samplePEl     = document.getElementById('sample-p')
const sampleMaxEl   = document.getElementById('sample-max')

// Show/hide strategy-specific params
strategyEl.addEventListener('change', () => {
	const s = strategyEl.value
	document.getElementById('param-temp-label').hidden = s === 'greedy'
	document.getElementById('param-k-label').hidden    = s !== 'topk'
	document.getElementById('param-p-label').hidden    = s !== 'topp'
})

// ── Web Worker for background inference ───────────────────────────────────
// The worker runs the full generation loop off the main thread so the UI
// stays responsive during (WASM-backed) model inference.
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
			// Yield to the macrotask queue so a pending 'stop' message can be
			// processed. Without this, WASM inference resolves synchronously and
			// the loop never gives the message handler a chance to set stopRequested.
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

// Lazy-create a persistent worker so the loaded model survives across generates.
let samplingWorker = null
function getSamplingWorker() {
	if (!samplingWorker) {
		const blob = new Blob([SAMPLING_WORKER_CODE], { type: 'text/javascript' })
		samplingWorker = new Worker(URL.createObjectURL(blob), { type: 'module' })
	}
	return samplingWorker
}

sampleStopBtn.addEventListener('click', () => {
	if (samplingWorker) samplingWorker.postMessage({ type: 'stop' })
})

document.getElementById('sample-form').addEventListener('submit', e => {
	e.preventDefault()
	const prompt = sampleInput.value
	if (!prompt) return

	const strategy = strategyEl.value
	const temp     = Math.max(0.01, parseFloat(sampleTempEl.value) || 1.0)
	const k        = Math.max(1, parseInt(sampleKEl.value) || 40)
	const p        = Math.max(0.01, Math.min(1, parseFloat(samplePEl.value) || 0.9))
	const maxTok   = Math.max(1, Math.min(200, parseInt(sampleMaxEl.value) || 40))

	sampleBtn.disabled     = true
	sampleStopBtn.disabled = false
	sampleStatus.textContent = 'Initializing\u2026'

	sampleOutput.hidden = false
	sampleText.innerHTML = ''
	const promptSpan = document.createElement('span')
	promptSpan.className = 'gen-prompt'
	promptSpan.textContent = prompt
	sampleText.appendChild(promptSpan)
	sampleMeta.textContent = ''

	const worker = getSamplingWorker()
	worker.onmessage = ({ data }) => {
		if (data.type === 'status') {
			sampleStatus.textContent = data.text
		} else if (data.type === 'token') {
			const span = document.createElement('span')
			span.className = 'gen-tok gen-tok-' + (data.step % 2 === 0 ? 'a' : 'b')
			span.title = (data.prob * 100).toFixed(1) + '%'
			span.textContent = data.text
			sampleText.appendChild(span)
		} else if (data.type === 'done') {
			sampleMeta.textContent = data.stepCount + ' token' + (data.stepCount !== 1 ? 's' : '') + ' generated  \xb7  strategy: ' + data.strategyLabel + '  \xb7  ' + data.stopReason
			sampleStatus.textContent = ''
			sampleBtn.disabled     = false
			sampleStopBtn.disabled = true
		} else if (data.type === 'error') {
			sampleStatus.textContent = 'Error: ' + data.message
			console.error(data.message)
			sampleBtn.disabled     = false
			sampleStopBtn.disabled = true
		}
	}

	worker.postMessage({ type: 'generate', prompt, strategy, temp, k, p, maxTok })
})
