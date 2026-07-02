<script lang="ts">
	import { RAG_CORPUS, RAG_CORPUS_VERSION, RAG_DIMS } from '$lib/data/rag-corpus'
	import { golem } from '$lib/golem/golem'
	import { registrySet } from '$lib/golem/registry.svelte'
	import type { SamplingWorkerResponse } from '$lib/golem/types'
	import { createSamplingWorker } from '$lib/ml/workers'

	interface GenToken {
		text: string
		cls: string
		title: string
	}
	interface Retrieved {
		text: string
		score: number
	}

	let ragCorpusVecs: Float32Array | null = null
	let indexStatus = $state('')
	let buildBusy = $state(false)
	let query = $state('attention mechanism in transformers')
	let k = $state(3)
	let temp = $state(0.8)
	let maxTok = $state(50)
	let compare = $state(false)

	let genEnabled = $state(false)
	let running = $state(false)
	let status = $state('')
	let showResults = $state(false)

	let retrieved = $state<Retrieved[]>([])
	let contextText = $state('')
	let tps = $state('')
	let outWithPrompt = $state('')
	let outWith = $state<GenToken[]>([])
	let metaWith = $state('')
	let showWithout = $state(false)
	let outWithoutPrompt = $state('')
	let outWithout = $state<GenToken[]>([])
	let metaWithout = $state('')

	let worker: Worker | null = null
	function getWorker(): Worker {
		if (!worker) worker = createSamplingWorker()
		return worker
	}

	let stopped = false
	function stop() {
		stopped = true
		worker?.postMessage({ type: 'stop' })
	}

	$effect(() => {
		golem.loadIndex(RAG_CORPUS_VERSION, 'RAG index').then((cached) => {
			if (!cached) return
			ragCorpusVecs = cached
			indexStatus = `${RAG_CORPUS.length} passages (cached)`
			genEnabled = true
		})
	})

	async function buildIndex() {
		buildBusy = true
		genEnabled = false
		indexStatus = 'Initializing…'
		registrySet(RAG_CORPUS_VERSION, { status: 'loading' })
		try {
			await golem.loadEmbedder((info) => {
				if (info.status === 'progress') indexStatus = `Downloading model: ${(info.progress ?? 0).toFixed(0)}%`
				else if (info.status === 'done') indexStatus = 'Loading model…'
			})
			const allVecs = new Float32Array(RAG_CORPUS.length * RAG_DIMS)
			for (let i = 0; i < RAG_CORPUS.length; i++) {
				indexStatus = `Embedding passage ${i + 1} / ${RAG_CORPUS.length}…`
				const vec = await golem.embed(RAG_CORPUS[i])
				allVecs.set(vec, i * RAG_DIMS)
			}
			ragCorpusVecs = allVecs
			await golem.saveIndex(RAG_CORPUS_VERSION, 'RAG index', ragCorpusVecs)
			indexStatus = `${RAG_CORPUS.length} passages indexed and cached`
			genEnabled = true
		} catch (err) {
			registrySet(RAG_CORPUS_VERSION, { status: 'error' })
			indexStatus = 'Error: ' + (err instanceof Error ? err.message : String(err))
		} finally {
			buildBusy = false
		}
	}

	async function run(e: SubmitEvent) {
		e.preventDefault()
		const q = query.trim()
		if (!q || !ragCorpusVecs) return

		const kk = Math.max(1, Math.min(5, Math.floor(Number(k) || 3)))
		const t = Math.max(0.1, Number(temp) || 0.8)
		const mt = Math.max(10, Math.min(100, Math.floor(Number(maxTok) || 50)))
		const doCompare = compare

		stopped = false
		running = true
		status = 'Embedding query…'
		showResults = false
		showWithout = false

		let qVec: number[]
		try {
			qVec = await golem.embed(q)
		} catch (err) {
			status = 'Error: ' + (err instanceof Error ? err.message : String(err))
			running = false
			return
		}

		const scores: { i: number; score: number }[] = []
		for (let i = 0; i < RAG_CORPUS.length; i++) {
			let dot = 0
			const off = i * RAG_DIMS
			for (let j = 0; j < RAG_DIMS; j++) dot += qVec[j] * ragCorpusVecs[off + j]
			scores.push({ i, score: dot })
		}
		scores.sort((a, b) => b.score - a.score)
		const top = scores.slice(0, kk)

		retrieved = top.map(({ i, score }) => ({ text: RAG_CORPUS[i], score }))

		const context = top.map(({ i }) => RAG_CORPUS[i]).join('\n\n')
		const fullPrompt = context + '\n\n' + q
		contextText = fullPrompt

		outWith = []
		metaWith = ''
		outWithPrompt = q + ' '
		showResults = true
		tps = ''
		status = 'Generating with context…'

		let genStart: number | null = null
		const w = getWorker()

		w.onmessage = ({ data }: MessageEvent<SamplingWorkerResponse>) => {
			if (data.type === 'status') {
				status = data.text
			} else if (data.type === 'model_status') {
				if (!golem._isModelLoaded()) registrySet('xenova-gpt2-lm', { status: data.status, progress: data.progress })
			} else if (data.type === 'token') {
				if (data.step === 0) genStart = Date.now()
				outWith = [...outWith, { text: data.text, cls: data.step % 2 === 0 ? 'gen-tok-a' : 'gen-tok-b', title: (data.prob * 100).toFixed(1) + '%' }]
				if (data.step > 0 && genStart) tps = ((data.step + 1) / ((Date.now() - genStart) / 1000)).toFixed(2) + ' tok/s'
			} else if (data.type === 'done') {
				const finalTps = genStart && data.stepCount > 1 ? (data.stepCount / ((Date.now() - genStart) / 1000)).toFixed(2) + ' tok/s' : ''
				metaWith = `${data.stepCount} token${data.stepCount !== 1 ? 's' : ''}  ·  temperature ${t}  ·  ${data.stopReason}${finalTps ? '  ·  ' + finalTps : ''}`
				tps = ''

				if (doCompare && !stopped) {
					status = 'Generating without context…'
					showWithout = true
					outWithout = []
					metaWithout = ''
					outWithoutPrompt = q + ' '

					w.onmessage = ({ data: d }: MessageEvent<SamplingWorkerResponse>) => {
						if (d.type === 'status') {
							status = d.text
						} else if (d.type === 'token') {
							outWithout = [...outWithout, { text: d.text, cls: d.step % 2 === 0 ? 'gen-tok-a' : 'gen-tok-b', title: (d.prob * 100).toFixed(1) + '%' }]
						} else if (d.type === 'done') {
							metaWithout = `${d.stepCount} token${d.stepCount !== 1 ? 's' : ''}  ·  temperature ${t}  ·  ${d.stopReason}`
							status = ''
							running = false
						} else if (d.type === 'error') {
							status = 'Error: ' + d.message
							running = false
						}
					}

					w.postMessage({ type: 'generate', prompt: q, strategy: 'temperature', temp: t, k: 40, p: 0.9, maxTok: mt })
				} else {
					status = ''
					running = false
				}
			} else if (data.type === 'error') {
				status = 'Error: ' + data.message
				running = false
			}
		}

		w.postMessage({ type: 'generate', prompt: fullPrompt, strategy: 'temperature', temp: t, k: 40, p: 0.9, maxTok: mt })
	}

	const maxScore = $derived(retrieved.length ? retrieved[0].score : 1)
</script>

<h2>§6 — Retrieval-Augmented Generation</h2>
<p>
	RAG combines §5 and §3 into one pipeline: embed a query, retrieve the most relevant passages from a corpus, prepend
	them to the prompt, then generate. The retrieved context steers GPT-2 toward topic-relevant continuations — even
	though GPT-2 isn't instruction-tuned and won't produce clean "answers". The demo makes each step visible: which
	passages were retrieved, exactly what string is fed to the model, and how the output shifts when context is present
	versus absent.
</p>
<p class="param-note">
	Try <em>"how attention works"</em>, <em>"training a language model"</em>, <em>"searching by meaning"</em>, or
	<em>"why models make things up"</em>.
</p>

<div class="rag-index-row">
	<button type="button" onclick={buildIndex} disabled={buildBusy}>Build RAG index  [~23 MB, same embedder as §4–§5]</button><span
		class="rag-index-status">{indexStatus}</span>
</div>

<form onsubmit={run}>
	<textarea class="rag-query" bind:value={query} placeholder="Enter a topic or phrase…"></textarea>
	<div class="param-row">
		<label>Retrieve k passages
			<input type="number" bind:value={k} min="1" max="5" step="1" />
		</label>
		<label>Temperature
			<input type="number" bind:value={temp} min="0.1" max="2.0" step="0.1" />
		</label>
		<label>Max tokens
			<input type="number" bind:value={maxTok} min="10" max="100" step="5" />
		</label>
	</div>
	<div class="rag-compare-row">
		<label class="rag-compare-label">
			<input type="checkbox" bind:checked={compare} /> also generate without retrieved context
		</label>
	</div>
	<button type="submit" disabled={!genEnabled || running}>Retrieve &amp; Generate  [~81 MB model]</button>
	<button type="button" onclick={stop} disabled={!running}>Stop</button>
</form>
<div class="section-status">{status}</div>

{#if showResults}
	<div class="rag-results">
		<div class="rag-label">retrieved passages</div>
		<div>
			{#each retrieved as r (r.text)}
				<div class="rag-passage-row">
					<div class="rag-passage-meta">
						<span class="rag-passage-score">{r.score.toFixed(3)}</span>
						<div class="rag-bar-wrap"><div class="rag-bar" style:width={(r.score / maxScore * 100).toFixed(1) + '%'}></div></div>
					</div>
					<div class="rag-passage-text">{r.text}</div>
				</div>
			{/each}
		</div>

		<div class="rag-label">context fed to model</div>
		<pre class="rag-context-box">{contextText}</pre>

		<div class="rag-label-row">
			<span class="rag-label rag-label-inline">generation — with retrieved context</span>
			<span class="rag-tps">{tps}</span>
			<button type="button" onclick={stop} disabled={!running}>Stop</button>
		</div>
		<div class="rag-gen-output"><span class="gen-prompt">{outWithPrompt}</span>{#each outWith as tok, i (i)}<span class="gen-tok {tok.cls}" title={tok.title}>{tok.text}</span>{/each}</div>
		<div class="rag-meta">{metaWith}</div>

		{#if showWithout}
			<div class="rag-label">generation — without context (bare query)</div>
			<div class="rag-gen-output"><span class="gen-prompt">{outWithoutPrompt}</span>{#each outWithout as tok, i (i)}<span class="gen-tok {tok.cls}" title={tok.title}>{tok.text}</span>{/each}</div>
			<div class="rag-meta">{metaWithout}</div>
		{/if}
	</div>
{/if}

<style>
	.rag-index-row { margin-bottom: 0.5rem; }
	.rag-index-status { font-size: 0.85rem; color: #555; margin-left: 0.8rem; }
	.rag-query { min-height: 3.5rem; }
	.rag-compare-row { margin: 0.4rem 0 0; }
	.rag-compare-label { font-size: 0.9rem; display: flex; align-items: center; gap: 0.4rem; cursor: pointer; }
	.rag-results { margin-top: 1.4rem; }
	.rag-label-row { display: flex; align-items: baseline; gap: 0.8rem; margin: 1.2rem 0 0.5rem; border-bottom: 1px solid #ddd; padding-bottom: 0.2rem; }
	.rag-label-row .rag-label-inline { margin: 0; border: none; padding: 0; flex: 1; }
	.rag-label-row button { margin-top: 0; padding: 0.1rem 0.6rem; font-size: 0.75rem; }
	.rag-tps { font-size: 0.75rem; color: #888; min-width: 7ch; }
	.rag-label {
		font-size: 0.75rem;
		color: #666;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin: 1.2rem 0 0.5rem;
		border-bottom: 1px solid #ddd;
		padding-bottom: 0.2rem;
	}
	.rag-passage-row { margin-bottom: 0.9rem; }
	.rag-passage-meta { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.2rem; }
	.rag-passage-score { font-size: 0.8rem; color: #444; width: 4.5ch; flex-shrink: 0; text-align: right; }
	.rag-bar-wrap { flex: 1; background: #e8e8e8; height: 0.65em; }
	.rag-bar { background: #222; height: 100%; }
	.rag-passage-text { font-size: 0.88rem; line-height: 1.45; }
	.rag-context-box {
		white-space: pre-wrap;
		word-break: break-word;
		font-family: inherit;
		font-size: 0.82rem;
		line-height: 1.5;
		background: #f6f6f6;
		border-left: 3px solid #ccc;
		padding: 0.6rem 0.8rem;
		margin: 0;
		max-height: 10rem;
		overflow-y: auto;
		color: #444;
	}
	.rag-gen-output {
		font-family: inherit;
		font-size: 0.95rem;
		line-height: 2;
		word-break: break-word;
		border: 1px solid #ccc;
		padding: 0.5rem;
		min-height: 2.5em;
	}
	.rag-meta { font-size: 0.8rem; color: #555; margin-top: 0.4rem; }
</style>
