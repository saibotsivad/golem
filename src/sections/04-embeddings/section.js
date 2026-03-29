// ── §4 embeddings ─────────────────────────────────────────────────────────
{
const embedStatus  = document.getElementById('embed-status')
const embedBtn     = document.getElementById('embed-btn')
const embedResults = document.getElementById('embed-results')
const embedSimEl   = document.getElementById('embed-similarity')
const embedNoteEl  = document.getElementById('embed-note')
const canvasA      = document.getElementById('canvas-a')
const canvasB      = document.getElementById('canvas-b')
const canvasDiff   = document.getElementById('canvas-diff')

document.getElementById('embed-form').addEventListener('submit', async e => {
	e.preventDefault()
	const textA = document.getElementById('embed-a').value
	const textB = document.getElementById('embed-b').value
	if (!textA || !textB) return

	embedBtn.disabled = true
	embedStatus.textContent = 'Initializing…'

	try {
		await golem.loadEmbedder(info => {
			if (info.status === 'progress')
				embedStatus.textContent = `Downloading model: ${info.progress.toFixed(0)}%`
			else if (info.status === 'done')
				embedStatus.textContent = 'Loading model into memory…'
		})
		const [vecA, vecB] = await Promise.all([golem.embed(textA), golem.embed(textB)])

		// Use the same scale for both canvases so patterns are comparable
		const scale = Math.max(...vecA.map(Math.abs), ...vecB.map(Math.abs))
		drawEmbedding(canvasA, vecA, scale)
		drawEmbedding(canvasB, vecB, scale)
		drawEmbeddingDiff(canvasDiff, vecA, vecB, scale)

		const sim = cosine(vecA, vecB)
		const pct = (sim * 100).toFixed(1)
		embedSimEl.textContent = `Cosine similarity: ${sim.toFixed(4)}  (${pct}%)`

		const note = sim > 0.8 ? 'very similar'
		           : sim > 0.6 ? 'related'
		           : sim > 0.4 ? 'loosely related'
		           :             'dissimilar'
		embedNoteEl.textContent = `${note}  ·  384 dimensions  ·  model: all-MiniLM-L6-v2`

		embedResults.hidden = false
		embedStatus.textContent = ''
	} catch (err) {
		embedStatus.textContent = 'Error: ' + err.message
		console.error(err)
	} finally {
		embedBtn.disabled = false
	}
})
}
