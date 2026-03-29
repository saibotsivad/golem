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

let stopRequested = false
sampleStopBtn.addEventListener('click', () => { stopRequested = true })

function sampleToken(probs, strategy, temp, k, p) {
	const n = probs.length

	if (strategy === 'greedy') {
		let best = 0
		for (let i = 1; i < n; i++) if (probs[i] > probs[best]) best = i
		return { id: best, prob: probs[best] }
	}

	if (strategy === 'temperature') {
		// Sample directly from the distribution (temperature already baked in via softmax)
		let r = Math.random()
		let cum = 0
		for (let i = 0; i < n; i++) {
			cum += probs[i]
			if (r <= cum) return { id: i, prob: probs[i] }
		}
		return { id: n - 1, prob: probs[n - 1] }
	}

	// top-k or top-p: sort by probability descending, then take candidates
	const sorted = Array.from({ length: n }, (_, i) => i)
	sorted.sort((a, b) => probs[b] - probs[a])

	let candidates
	if (strategy === 'topk') {
		candidates = sorted.slice(0, k)
	} else { // topp
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

document.getElementById('sample-form').addEventListener('submit', async e => {
	e.preventDefault()
	const prompt   = sampleInput.value
	if (!prompt) return

	const strategy = strategyEl.value
	const temp     = Math.max(0.01, parseFloat(sampleTempEl.value) || 1.0)
	const k        = Math.max(1, parseInt(sampleKEl.value) || 40)
	const p        = Math.max(0.01, Math.min(1, parseFloat(samplePEl.value) || 0.9))
	const maxTok   = Math.max(1, Math.min(200, parseInt(sampleMaxEl.value) || 40))

	sampleBtn.disabled    = true
	sampleStopBtn.disabled = false
	stopRequested          = false
	sampleStatus.textContent = 'Initializing…'

	// Prepare output area
	sampleOutput.hidden = false
	sampleText.innerHTML = ''
	const promptSpan = document.createElement('span')
	promptSpan.className = 'gen-prompt'
	promptSpan.textContent = prompt
	sampleText.appendChild(promptSpan)
	sampleMeta.textContent = ''

	try {
		const model = await ensureModel(info => {
			if (info.status === 'progress')
				sampleStatus.textContent = `Downloading model: ${info.progress.toFixed(0)}%`
			else if (info.status === 'done')
				sampleStatus.textContent = 'Loading model into memory…'
		})

		const GPT2_EOS = 50256
		let generatedIds = []
		let stepCount    = 0
		let stopReason   = 'limit reached'

		while (stepCount < maxTok) {
			if (stopRequested) { stopReason = 'stopped'; break }

			sampleStatus.textContent = `Generating token ${stepCount + 1} / ${maxTok}…`

			const currentText = prompt + (generatedIds.length ? tokenizer.decode(generatedIds) : '')
			const inputs = tokenizer(currentText, { truncation: true, max_length: 1024 })
			const output = await model(inputs)
			const { lastLogits } = getLogits(output)

			const effectiveTemp = strategy === 'greedy' ? 1.0 : temp
			const probs = softmaxWithTemp(lastLogits, effectiveTemp)
			const { id, prob } = sampleToken(probs, strategy, temp, k, p)

			if (id === GPT2_EOS) { stopReason = 'end-of-sequence token'; break }

			generatedIds.push(id)
			const tokenText = tokenizer.decode([id])
			const span = document.createElement('span')
			span.className = `gen-tok gen-tok-${stepCount % 2 === 0 ? 'a' : 'b'}`
			span.title = `${(prob * 100).toFixed(1)}%`
			span.textContent = tokenText
			sampleText.appendChild(span)

			stepCount++
		}

		const strategyLabel = strategy === 'topk' ? `top-k (k=${k})` :
		                      strategy === 'topp' ? `top-p (p=${p})` :
		                      strategy === 'temperature' ? `temperature (${temp})` : 'greedy'
		sampleMeta.textContent = `${stepCount} token${stepCount !== 1 ? 's' : ''} generated  ·  strategy: ${strategyLabel}  ·  ${stopReason}`
		sampleStatus.textContent = ''
	} catch (err) {
		sampleStatus.textContent = 'Error: ' + err.message
		console.error(err)
	} finally {
		sampleBtn.disabled     = false
		sampleStopBtn.disabled = true
	}
})
