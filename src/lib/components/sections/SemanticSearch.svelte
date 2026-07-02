<script lang="ts">
	import { CORPUS_VERSION, SEARCH_CORPUS, SEARCH_DIMS } from '$lib/data/search-corpus'
	import { golem } from '$lib/golem/golem'
	import { registrySet } from '$lib/golem/registry.svelte'
	import { drawEmbeddingGrid } from '$lib/ml/canvas'

	interface SearchResult {
		text: string
		score: number
	}

	let corpusVecs: Float32Array | null = null
	let indexStatus = $state('')
	let showGrid = $state(false)
	let buildBusy = $state(false)
	let query = $state('')
	let searchEnabled = $state(false)
	let searchBusy = $state(false)
	let searchStatus = $state('')
	let header = $state('')
	let results = $state<SearchResult[]>([])
	let showResults = $state(false)

	let gridCanvas = $state<HTMLCanvasElement | null>(null)

	$effect(() => {
		golem.loadIndex(CORPUS_VERSION, 'Semantic search index').then((cached) => {
			if (!cached) return
			corpusVecs = cached
			indexStatus = `${SEARCH_CORPUS.length} passages (cached)`
			showGrid = true
			if (gridCanvas) drawEmbeddingGrid(gridCanvas, corpusVecs, SEARCH_CORPUS.length, SEARCH_DIMS)
			searchEnabled = true
		})
	})

	async function buildIndex() {
		buildBusy = true
		indexStatus = 'Initializing…'
		registrySet(CORPUS_VERSION, { status: 'loading' })
		try {
			await golem.loadEmbedder((info) => {
				if (info.status === 'progress') indexStatus = `Downloading model: ${(info.progress ?? 0).toFixed(0)}%`
				else if (info.status === 'done') indexStatus = 'Loading model…'
			})
			const allVecs = new Float32Array(SEARCH_CORPUS.length * SEARCH_DIMS)
			showGrid = true
			for (let i = 0; i < SEARCH_CORPUS.length; i++) {
				indexStatus = `Embedding passage ${i + 1} / ${SEARCH_CORPUS.length}…`
				const vec = await golem.embed(SEARCH_CORPUS[i])
				allVecs.set(vec, i * SEARCH_DIMS)
				if (gridCanvas) drawEmbeddingGrid(gridCanvas, allVecs, i + 1, SEARCH_DIMS, SEARCH_CORPUS.length)
			}
			corpusVecs = allVecs
			await golem.saveIndex(CORPUS_VERSION, 'Semantic search index', corpusVecs)
			indexStatus = `${SEARCH_CORPUS.length} passages indexed and cached`
			searchEnabled = true
		} catch (err) {
			registrySet(CORPUS_VERSION, { status: 'absent' })
			indexStatus = 'Error: ' + (err instanceof Error ? err.message : String(err))
		} finally {
			buildBusy = false
		}
	}

	async function search(e: SubmitEvent) {
		e.preventDefault()
		const q = query.trim()
		if (!q || !corpusVecs) return

		searchBusy = true
		searchStatus = 'Embedding query…'
		try {
			await golem.loadEmbedder((info) => {
				if (info.status === 'progress') searchStatus = `Downloading model: ${(info.progress ?? 0).toFixed(0)}%`
			})
			const qVec = await golem.embed(q)

			const scores: { i: number; score: number }[] = []
			for (let i = 0; i < SEARCH_CORPUS.length; i++) {
				let dot = 0
				const off = i * SEARCH_DIMS
				for (let j = 0; j < SEARCH_DIMS; j++) dot += qVec[j] * corpusVecs[off + j]
				scores.push({ i, score: dot })
			}
			scores.sort((a, b) => b.score - a.score)
			const top = scores.slice(0, 10)

			header = `Top ${top.length} of ${SEARCH_CORPUS.length} passages for: "${q}"`
			results = top.map(({ i, score }) => ({ text: SEARCH_CORPUS[i], score }))
			showResults = true
			searchStatus = ''
		} catch (err) {
			searchStatus = 'Error: ' + (err instanceof Error ? err.message : String(err))
			console.error(err)
		} finally {
			searchBusy = false
		}
	}

	const maxScore = $derived(results.length ? results[0].score : 1)
</script>

<h2>§5 — Semantic Search</h2>
<p>
	Embeddings make it possible to search by <em>meaning</em> rather than by matching keywords. The corpus here is 40
	one-sentence descriptions of AI/ML concepts — the same ideas demonstrated in §1–§4. The index is built once with the
	same all-MiniLM-L6-v2 model from §4 and stored in IndexedDB so subsequent visits skip the embedding step entirely.
</p>
<p class="param-note">
	Try queries that don't share words with any passage: <em>"breaking text into pieces"</em>,
	<em>"making output more creative"</em>, <em>"how the model focuses on relevant words"</em>,
	<em>"preventing wrong answers"</em>.
</p>

<div class="index-row">
	<button type="button" onclick={buildIndex} disabled={buildBusy}>Build search index  [uses same ~23 MB model as §4]</button><span
		class="index-status">{indexStatus}</span>
</div>
<div class="embed-row" hidden={!showGrid}>
	<span class="embed-label grid-label">index</span>
	<canvas bind:this={gridCanvas} class="embed-canvas grid-canvas" width="384" height="240"></canvas>
</div>

<form class="search-input-row" onsubmit={search}>
	<input type="text" bind:value={query} placeholder="Search by meaning…" disabled={!searchEnabled} />
	<button type="submit" disabled={!searchEnabled || searchBusy}>Search</button>
</form>
<div class="section-status">{searchStatus}</div>

{#if showResults}
	<div class="search-results">
		<div class="search-header">{header}</div>
		<div class="search-list">
			{#each results as r (r.text)}
				<div class="result-row">
					<div class="result-meta">
						<span class="result-score">{r.score.toFixed(3)}</span>
						<div class="result-bar-wrap"><div class="result-bar" style:width={(r.score / maxScore * 100).toFixed(1) + '%'}></div></div>
					</div>
					<div class="result-text">{r.text}</div>
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	.embed-row { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.4rem; }
	.embed-label { font-size: 0.85rem; color: #555; flex-shrink: 0; }
	.embed-canvas { display: block; border: 1px solid #ccc; image-rendering: pixelated; width: 100%; }
	.grid-canvas { height: 240px; }
	.grid-label { width: 2.8rem; }
	.index-row { margin-bottom: 0.4rem; }
	.index-status { font-size: 0.85rem; color: #555; margin-left: 0.8rem; }
	.search-input-row { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
	.search-input-row input {
		flex: 1;
		font-family: inherit;
		font-size: 0.95rem;
		padding: 0.3rem 0.5rem;
		border: 1px solid #000;
		min-width: 0;
	}
	.search-input-row input:focus { outline: 2px solid #000; outline-offset: 1px; }
	.search-results { margin-top: 1.2rem; }
	.search-header { font-size: 0.85rem; color: #444; margin-bottom: 0.6rem; }
	.result-row { margin-bottom: 0.9rem; }
	.result-meta { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.2rem; }
	.result-score { font-size: 0.8rem; color: #444; width: 4.5ch; flex-shrink: 0; text-align: right; }
	.result-bar-wrap { flex: 1; background: #e8e8e8; height: 0.65em; }
	.result-bar { background: #222; height: 100%; }
	.result-text { font-size: 0.88rem; line-height: 1.4; }
</style>
