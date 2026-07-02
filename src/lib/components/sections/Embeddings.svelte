<script lang="ts">
	import { golem } from '$lib/golem/golem'
	import { drawEmbedding, drawEmbeddingDiff } from '$lib/ml/canvas'
	import { cosine } from '$lib/ml/math'

	let textA = $state('A dog ran across the field.')
	let textB = $state('The puppy sprinted through the meadow.')
	let busy = $state(false)
	let status = $state('')
	let showResults = $state(false)
	let similarity = $state('')
	let note = $state('')

	let canvasA = $state<HTMLCanvasElement | null>(null)
	let canvasB = $state<HTMLCanvasElement | null>(null)
	let canvasDiff = $state<HTMLCanvasElement | null>(null)

	async function compare(e: SubmitEvent) {
		e.preventDefault()
		if (!textA || !textB) return

		busy = true
		status = 'Initializing…'
		try {
			await golem.loadEmbedder((info) => {
				if (info.status === 'progress') status = `Downloading model: ${(info.progress ?? 0).toFixed(0)}%`
				else if (info.status === 'done') status = 'Loading model into memory…'
				else if (info.status === 'ready') status = 'Embedding…'
			})
			status = 'Embedding…'
			const [vecA, vecB] = await Promise.all([golem.embed(textA), golem.embed(textB)])

			showResults = true

			const scale = Math.max(...vecA.map(Math.abs), ...vecB.map(Math.abs))
			if (canvasA) drawEmbedding(canvasA, vecA, scale)
			if (canvasB) drawEmbedding(canvasB, vecB, scale)
			if (canvasDiff) drawEmbeddingDiff(canvasDiff, vecA, vecB, scale)

			const sim = cosine(vecA, vecB)
			similarity = `Cosine similarity: ${sim.toFixed(4)}  (${(sim * 100).toFixed(1)}%)`
			const label = sim > 0.8 ? 'very similar' : sim > 0.6 ? 'related' : sim > 0.4 ? 'loosely related' : 'dissimilar'
			note = `${label}  ·  384 dimensions  ·  model: all-MiniLM-L6-v2`
			status = ''
		} catch (err) {
			status = 'Error: ' + (err instanceof Error ? err.message : String(err))
			console.error(err)
		} finally {
			busy = false
		}
	}
</script>

<h2>§4 — Embeddings</h2>
<p>
	An embedding encodes text as a point in high-dimensional space: semantically similar texts land near each other
	regardless of surface wording. This demo uses
	<a href="https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2" target="_blank" rel="noopener">all-MiniLM-L6-v2</a>
	(~23 MB quantized) to produce 384-dimensional sentence vectors, then measures their
	<strong>cosine similarity</strong> — the angle between the two vectors in that space.
</p>
<p class="param-note">
	Each bar below is the full 384-dimensional vector visualized left-to-right:
	<span style="background:#88aaff;padding:0 0.3em;">blue = positive</span>,
	<span style="background:#ff8888;padding:0 0.3em;">red = negative</span>. Similar sentences produce similar-looking
	patterns.
</p>

<form onsubmit={compare}>
	<label class="ab-label" for="embed-a">A</label>
	<textarea id="embed-a" bind:value={textA} style="min-height:3.5rem"></textarea>
	<label class="ab-label" for="embed-b" style="margin-top:0.5rem;display:block">B</label>
	<textarea id="embed-b" bind:value={textB} style="min-height:3.5rem"></textarea>
	<button type="submit" disabled={busy}>Compare embeddings  [downloads ~23 MB on first run]</button>
</form>
<div class="section-status">{status}</div>

<div class="embed-results" hidden={!showResults}>
	<div class="embed-row">
		<span class="embed-label">A</span>
		<canvas bind:this={canvasA} class="embed-canvas" width="384" height="24"></canvas>
	</div>
	<div class="embed-row">
		<span class="embed-label">B</span>
		<canvas bind:this={canvasB} class="embed-canvas" width="384" height="24"></canvas>
	</div>
	<div class="embed-row">
		<span class="embed-label">diff</span>
		<canvas bind:this={canvasDiff} class="embed-canvas" width="384" height="24"></canvas>
	</div>
	<div class="embed-similarity">{similarity}</div>
	<div class="embed-note">{note}</div>
</div>

<style>
	.ab-label { font-size: 0.85rem; }
	.embed-results { margin-top: 1.2rem; }
	.embed-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 0.4rem;
	}
	.embed-label { font-size: 0.85rem; color: #555; width: 2.4rem; flex-shrink: 0; }
	.embed-canvas {
		display: block;
		border: 1px solid #ccc;
		image-rendering: pixelated;
		width: 100%;
		height: 24px;
	}
	.embed-similarity { margin-top: 0.8rem; font-size: 1rem; }
	.embed-note { font-size: 0.8rem; color: #555; margin-top: 0.2rem; }
</style>
