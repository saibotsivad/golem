// ── §8 memory-grounded generation ──────────────────────────────────────────
{
const templateEl  = document.getElementById('agent-template')
const memKEl      = document.getElementById('agent-mem-k')
const strategyEl  = document.getElementById('agent-strategy')
const tempEl      = document.getElementById('agent-temp')
const topkEl      = document.getElementById('agent-topk')
const toppEl      = document.getElementById('agent-topp')
const maxEl       = document.getElementById('agent-max')
const messageEl   = document.getElementById('agent-message')
const genBtn      = document.getElementById('agent-gen-btn')
const stopBtn     = document.getElementById('agent-stop-btn')
const statusEl    = document.getElementById('agent-status')
const resultsEl   = document.getElementById('agent-results')
const retrievedEl = document.getElementById('agent-retrieved')
const promptBoxEl = document.getElementById('agent-prompt-box')
const outputEl    = document.getElementById('agent-output')
const metaEl      = document.getElementById('agent-meta')

// Show/hide strategy-specific params (same pattern as §3)
strategyEl.addEventListener('change', () => {
	const s = strategyEl.value
	document.getElementById('agent-temp-label').hidden = s === 'greedy'
	document.getElementById('agent-topk-label').hidden = s !== 'topk'
	document.getElementById('agent-topp-label').hidden = s !== 'topp'
})

// Lazy-create a persistent worker so the loaded GPT-2 survives across generates.
// Uses the same SAMPLING_WORKER_CODE as §3 and §6 — each section gets its own
// independent Worker instance so they never contend over the same model.
let agentWorker = null
function getAgentWorker() {
	if (!agentWorker) {
		const blob = new Blob([SAMPLING_WORKER_CODE], { type: 'text/javascript' })
		agentWorker = new Worker(URL.createObjectURL(blob), { type: 'module' })
	}
	return agentWorker
}

stopBtn.addEventListener('click', () => {
	if (agentWorker) agentWorker.postMessage({ type: 'stop' })
})

document.getElementById('agent-form').addEventListener('submit', async e => {
	e.preventDefault()
	const template = templateEl.value
	const message  = messageEl.value.trim()
	if (!message) return

	const strategy = strategyEl.value
	const temp     = Math.max(0.01, parseFloat(tempEl.value) || 1.0)
	const k        = Math.max(1, parseInt(topkEl.value) || 40)
	const p        = Math.max(0.01, Math.min(1, parseFloat(toppEl.value) || 0.9))
	const maxTok   = Math.max(1, Math.min(200, parseInt(maxEl.value) || 40))
	const memK     = Math.max(1, parseInt(memKEl.value) || 3)

	genBtn.disabled  = true
	stopBtn.disabled = false
	outputEl.innerHTML = ''
	metaEl.textContent = ''
	statusEl.textContent = ''

	try {
		// ── Step 1: retrieve memories (only if template uses [[memories]]) ─
		const needsRetrieval = template.includes('[[memories]]')
		let memText  = '(no memories stored)'
		let retrieved = []

		if (needsRetrieval) {
			statusEl.textContent = 'Loading memories\u2026'
			const memories = await golem.loadMemories()

			if (memories.length > 0) {
				statusEl.textContent = 'Loading embedder\u2026'
				await golem.loadEmbedder(info => {
					if (info.status === 'progress')
						statusEl.textContent = `Downloading embedder: ${info.progress.toFixed(0)}%`
					else if (info.status === 'done')
						statusEl.textContent = 'Loading embedder\u2026'
				})
				statusEl.textContent = 'Embedding message\u2026'
				const qVec = await golem.embed(message)
				const scored = memories.map(m => ({ ...m, score: cosine(qVec, m.vec) }))
				scored.sort((a, b) => b.score - a.score)
				retrieved = scored.slice(0, Math.min(memK, scored.length))
				memText = retrieved.map(m => m.text).join(', ')
			}
		}

		// ── Step 2: substitute placeholders ───────────────────────────────
		const assembled = template
			.replace(/\[\[memories\]\]/g, memText)
			.replace(/\[\[message\]\]/g, message)

		// ── Step 3: render retrieved memories ─────────────────────────────
		if (!needsRetrieval) {
			retrievedEl.innerHTML = '<p class="agent-no-mem">Template has no <code>[[memories]]</code> — retrieval skipped.</p>'
		} else if (retrieved.length === 0) {
			retrievedEl.innerHTML = '<p class="agent-no-mem">No memories stored — replaced with "(no memories stored)".</p>'
		} else {
			const maxScore = retrieved[0].score
			retrievedEl.innerHTML = retrieved.map(({ text, score }) =>
				`<div class="agent-mem-row">` +
				`<div class="agent-mem-meta">` +
				`<span class="agent-mem-score">${score.toFixed(3)}</span>` +
				`<div class="agent-bar-wrap"><div class="agent-bar" style="width:${(score / maxScore * 100).toFixed(1)}%"></div></div>` +
				`</div>` +
				`<div class="agent-mem-text">${escHtml(text)}</div>` +
				`</div>`
			).join('')
		}

		// ── Step 4: show assembled prompt ─────────────────────────────────
		promptBoxEl.textContent = assembled
		resultsEl.hidden = false

		// ── Step 5: set up output area and start generation ───────────────
		const promptSpan = document.createElement('span')
		promptSpan.className = 'gen-prompt'
		promptSpan.textContent = assembled
		outputEl.appendChild(promptSpan)

		statusEl.textContent = 'Generating\u2026'

		const worker = getAgentWorker()
		worker.onmessage = ({ data }) => {
			if (data.type === 'status') {
				statusEl.textContent = data.text
			} else if (data.type === 'model_status') {
				// Same guard as §3: don't clobber REGISTRY if main-thread model is loaded
				if (!window.golem._isModelLoaded())
					registrySet('xenova-gpt2-lm', { status: data.status, progress: data.progress })
			} else if (data.type === 'token') {
				const span = document.createElement('span')
				span.className = 'gen-tok gen-tok-' + (data.step % 2 === 0 ? 'a' : 'b')
				span.title = (data.prob * 100).toFixed(1) + '%'
				span.textContent = data.text
				outputEl.appendChild(span)
			} else if (data.type === 'done') {
				metaEl.textContent = data.stepCount + ' token' + (data.stepCount !== 1 ? 's' : '') + ' generated  \xb7  strategy: ' + data.strategyLabel + '  \xb7  ' + data.stopReason
				statusEl.textContent = ''
				genBtn.disabled  = false
				stopBtn.disabled = true
			} else if (data.type === 'error') {
				statusEl.textContent = 'Error: ' + data.message
				genBtn.disabled  = false
				stopBtn.disabled = true
			}
		}

		worker.postMessage({ type: 'generate', prompt: assembled, strategy, temp, k, p, maxTok })
	} catch (err) {
		statusEl.textContent = 'Error: ' + err.message
		genBtn.disabled  = false
		stopBtn.disabled = true
	}
})
}
