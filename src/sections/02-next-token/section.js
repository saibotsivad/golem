// ── §2 next-token prediction ──────────────────────────────────────────────
const predictStatus  = document.getElementById('predict-status')
const predictBtn     = document.getElementById('predict-btn')
const predictInput   = document.getElementById('predict-input')
const predictResults = document.getElementById('predict-results')
const predHeader     = document.getElementById('pred-header')
const predChart      = document.getElementById('pred-chart')
const tempInput      = document.getElementById('temperature')
const topNInput      = document.getElementById('top-n')

async function runPrediction() {
	const text = predictInput.value
	if (!text) return

	const temperature = Math.max(0.01, parseFloat(tempInput.value) || 1.0)
	const topN = Math.max(1, Math.min(200, parseInt(topNInput.value) || 20))

	predictBtn.disabled = true
	predictStatus.textContent = 'Initializing…'

	try {
		const model = await ensureModel(info => {
			if (info.status === 'progress')
				predictStatus.textContent = `Downloading model: ${info.progress.toFixed(0)}%`
			else if (info.status === 'done')
				predictStatus.textContent = 'Loading model into memory…'
		})

		predictStatus.textContent = 'Running inference…'
		const inputs = tokenizer(text, { truncation: true, max_length: 1024 })
		const output = await model(inputs)
		const { lastLogits, seqLen, vocabSize } = getLogits(output)
		const probs = softmaxWithTemp(lastLogits, temperature)

		const indices = Array.from({ length: vocabSize }, (_, i) => i)
		indices.sort((a, b) => probs[b] - probs[a])
		const topProbs = indices.slice(0, topN).map(id => ({
			id, token: tokenizer.decode([id]), prob: probs[id],
		}))

		const cumProb = (topProbs.reduce((s, t) => s + t.prob, 0) * 100).toFixed(1)
		predHeader.textContent =
			`top ${topProbs.length} of 50,257 tokens  ·  temperature: ${temperature}  ·  ` +
			`input: ${seqLen} token${seqLen !== 1 ? 's' : ''}  ·  cumulative probability shown: ${cumProb}%`

		predChart.innerHTML = topProbs.map(({ token, prob, id }) =>
			`<div class="pred-row" data-id="${id}">` +
			`<span class="pred-token" title="id\u00a0${id}">${escHtml(token)}</span>` +
			`<div class="pred-bar-wrap"><div class="pred-bar" style="width:${(prob / topProbs[0].prob * 100).toFixed(1)}%"></div></div>` +
			`<span class="pred-pct">${(prob * 100).toFixed(2)}%</span>` +
			`</div>`
		).join('')

		predictResults.hidden = false
		predictStatus.textContent = ''
	} catch (err) {
		predictStatus.textContent = 'Error: ' + err.message
		console.error(err)
	} finally {
		predictBtn.disabled = false
	}
}

document.getElementById('predict-form').addEventListener('submit', e => { e.preventDefault(); runPrediction() })

predChart.addEventListener('click', e => {
	const row = e.target.closest('.pred-row')
	if (!row || predictBtn.disabled) return
	predictInput.value += tokenizer.decode([parseInt(row.dataset.id)])
	runPrediction()
})
