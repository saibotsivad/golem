// ── §3 sampling strategies ────────────────────────────────────────────────
// SAMPLING_WORKER_CODE is defined in shared.js (also used by §6).
{
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
}
