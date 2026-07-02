<script lang="ts">
	import { golem } from '$lib/golem/golem'
	import { registrySet } from '$lib/golem/registry.svelte'
	import type { SamplingStrategy, SamplingWorkerResponse } from '$lib/golem/types'
	import { cosine } from '$lib/ml/math'
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

	let template = $state('Facts: [[memories]]\n\n[[message]]')
	let memK = $state(3)
	let strategy = $state<SamplingStrategy>('temperature')
	let temp = $state(1.0)
	let k = $state(40)
	let p = $state(0.9)
	let maxTok = $state(40)
	let message = $state('')

	let running = $state(false)
	let status = $state('')
	let showResults = $state(false)
	let retrievedMode = $state<'none' | 'empty' | 'list'>('list')
	let retrieved = $state<Retrieved[]>([])
	let assembled = $state('')
	let output = $state<GenToken[]>([])
	let meta = $state('')

	let worker: Worker | null = null
	function getWorker(): Worker {
		if (!worker) worker = createSamplingWorker()
		return worker
	}

	function stop() {
		worker?.postMessage({ type: 'stop' })
	}

	async function generate(e: SubmitEvent) {
		e.preventDefault()
		const msg = message.trim()
		if (!msg) return

		const s = strategy
		const t = Math.max(0.01, Number(temp) || 1.0)
		const kk = Math.max(1, Math.floor(Number(k) || 40))
		const pp = Math.max(0.01, Math.min(1, Number(p) || 0.9))
		const mt = Math.max(1, Math.min(200, Math.floor(Number(maxTok) || 40)))
		const mk = Math.max(1, Math.floor(Number(memK) || 3))

		running = true
		output = []
		meta = ''
		status = ''

		try {
			const needsRetrieval = template.includes('[[memories]]')
			let memText = '(no memories stored)'
			retrieved = []

			if (needsRetrieval) {
				status = 'Loading memories…'
				const memories = await golem.loadMemories()
				if (memories.length > 0) {
					status = 'Loading embedder…'
					await golem.loadEmbedder((info) => {
						if (info.status === 'progress') status = `Downloading embedder: ${(info.progress ?? 0).toFixed(0)}%`
						else if (info.status === 'done') status = 'Loading embedder…'
					})
					status = 'Embedding message…'
					const qVec = await golem.embed(msg)
					const scored = memories.map((m) => ({ ...m, score: cosine(qVec, m.vec) }))
					scored.sort((a, b) => b.score - a.score)
					const top = scored.slice(0, Math.min(mk, scored.length))
					retrieved = top.map((m) => ({ text: m.text, score: m.score }))
					memText = top.map((m) => m.text).join(', ')
				}
			}

			assembled = template.replace(/\[\[memories\]\]/g, memText).replace(/\[\[message\]\]/g, msg)

			if (!needsRetrieval) retrievedMode = 'none'
			else if (retrieved.length === 0) retrievedMode = 'empty'
			else retrievedMode = 'list'

			showResults = true
			status = 'Generating…'

			const w = getWorker()
			w.onmessage = ({ data }: MessageEvent<SamplingWorkerResponse>) => {
				if (data.type === 'status') {
					status = data.text
				} else if (data.type === 'model_status') {
					if (!golem._isModelLoaded()) registrySet('xenova-gpt2-lm', { status: data.status, progress: data.progress })
				} else if (data.type === 'token') {
					output = [...output, { text: data.text, cls: data.step % 2 === 0 ? 'gen-tok-a' : 'gen-tok-b', title: (data.prob * 100).toFixed(1) + '%' }]
				} else if (data.type === 'done') {
					meta = `${data.stepCount} token${data.stepCount !== 1 ? 's' : ''} generated  ·  strategy: ${data.strategyLabel}  ·  ${data.stopReason}`
					status = ''
					running = false
				} else if (data.type === 'error') {
					status = 'Error: ' + data.message
					running = false
				}
			}

			w.postMessage({ type: 'generate', prompt: assembled, strategy: s, temp: t, k: kk, p: pp, maxTok: mt })
		} catch (err) {
			status = 'Error: ' + (err instanceof Error ? err.message : String(err))
			running = false
		}
	}

	const maxScore = $derived(retrieved.length ? retrieved[0].score : 1)
</script>

<h2>§8 — Memory-Grounded Generation</h2>
<p>
	The memories stored in §7 are put to work here. When you send a message it is embedded with the same model that
	stored the memories, and the most similar memories are retrieved by cosine similarity — exactly like §5 semantic
	search, but over your personal store. Those memories are then substituted into a prompt template before GPT-2
	generates a continuation. This is the core loop behind most memory-enabled agents:
	<em>embed → retrieve → inject → generate</em>.
</p>
<p class="param-note">
	<code>[[memories]]</code> is replaced by the top-k retrieved memories as a comma-separated list.<br />
	<code>[[message]]</code> is replaced verbatim by your message below.<br />
	Both placeholders are optional — leave one out to skip that step.
</p>

<form onsubmit={generate}>
	<div class="agent-field-label">Prompt template</div>
	<textarea class="agent-template" bind:value={template} rows="4"></textarea>

	<div class="param-row">
		<label>Retrieve k
			<input type="number" bind:value={memK} min="1" max="10" step="1" />
		</label>
		<label>Strategy
			<select bind:value={strategy}>
				<option value="greedy">greedy</option>
				<option value="temperature">temperature</option>
				<option value="topk">top-k</option>
				<option value="topp">top-p (nucleus)</option>
			</select>
		</label>
		{#if strategy !== 'greedy'}
			<label>Temperature
				<input type="number" bind:value={temp} min="0.1" max="5.0" step="0.1" />
			</label>
		{/if}
		{#if strategy === 'topk'}
			<label>K
				<input type="number" bind:value={k} min="1" max="500" step="1" />
			</label>
		{/if}
		{#if strategy === 'topp'}
			<label>P
				<input type="number" bind:value={p} min="0.01" max="1.0" step="0.01" />
			</label>
		{/if}
		<label>Max tokens
			<input type="number" bind:value={maxTok} min="1" max="200" step="1" />
		</label>
	</div>

	<div class="agent-field-label">Message</div>
	<textarea class="agent-message" bind:value={message} rows="2" placeholder="Enter your message…"></textarea>

	<button type="submit" disabled={running}>Generate  [~23 MB embedder + ~81 MB model]</button>
	<button type="button" onclick={stop} disabled={!running}>Stop</button>
</form>
<div class="section-status">{status}</div>

{#if showResults}
	<div class="agent-results">
		<div class="agent-label">retrieved memories</div>
		<div>
			{#if retrievedMode === 'none'}
				<p class="agent-no-mem">Template has no <code>[[memories]]</code> — retrieval skipped.</p>
			{:else if retrievedMode === 'empty'}
				<p class="agent-no-mem">No memories stored — replaced with "(no memories stored)".</p>
			{:else}
				{#each retrieved as r (r.text)}
					<div class="agent-mem-row">
						<div class="agent-mem-meta">
							<span class="agent-mem-score">{r.score.toFixed(3)}</span>
							<div class="agent-bar-wrap"><div class="agent-bar" style:width={(r.score / maxScore * 100).toFixed(1) + '%'}></div></div>
						</div>
						<div class="agent-mem-text">{r.text}</div>
					</div>
				{/each}
			{/if}
		</div>

		<div class="agent-label">assembled prompt</div>
		<pre class="agent-prompt-box">{assembled}</pre>

		<div class="agent-label">generated output</div>
		<div class="agent-output"><span class="gen-prompt">{assembled}</span>{#each output as tok, i (i)}<span class="gen-tok {tok.cls}" title={tok.title}>{tok.text}</span>{/each}</div>
		<div class="agent-meta">{meta}</div>
	</div>
{/if}

<style>
	.agent-field-label {
		font-size: 0.75rem;
		color: #666;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin: 0.9rem 0 0.2rem;
	}
	.agent-field-label:first-child { margin-top: 0; }
	.agent-template, .agent-message { width: 100%; box-sizing: border-box; }
	.agent-results { margin-top: 1.4rem; }
	.agent-label {
		font-size: 0.75rem;
		color: #666;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin: 1.2rem 0 0.5rem;
		border-bottom: 1px solid #ddd;
		padding-bottom: 0.2rem;
	}
	.agent-no-mem { font-size: 0.85rem; color: #888; font-style: italic; margin: 0; }
	.agent-mem-row { margin-bottom: 0.8rem; }
	.agent-mem-meta { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.2rem; }
	.agent-mem-score { font-size: 0.8rem; color: #444; width: 4.5ch; flex-shrink: 0; text-align: right; }
	.agent-bar-wrap { flex: 1; background: #e8e8e8; height: 0.65em; }
	.agent-bar { background: #222; height: 100%; }
	.agent-mem-text { font-size: 0.88rem; line-height: 1.4; }
	.agent-prompt-box {
		white-space: pre-wrap;
		word-break: break-word;
		font-family: inherit;
		font-size: 0.82rem;
		line-height: 1.5;
		background: #f6f6f6;
		border-left: 3px solid #ccc;
		padding: 0.6rem 0.8rem;
		margin: 0;
		max-height: 12rem;
		overflow-y: auto;
		color: #444;
	}
	.agent-output {
		font-family: inherit;
		font-size: 0.95rem;
		line-height: 2;
		word-break: break-word;
		border: 1px solid #ccc;
		padding: 0.5rem;
		min-height: 2.5em;
	}
	.agent-meta { font-size: 0.8rem; color: #555; margin-top: 0.4rem; }
</style>
