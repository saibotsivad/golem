<script lang="ts">
	import { golem } from '$lib/golem/golem'

	let modelName = $state('')
	let saveLocally = $state(true)
	let busy = $state(false)
	let status = $state('')

	async function submit(e: SubmitEvent) {
		e.preventDefault()
		const name = modelName.trim()
		if (!name) return

		const key = golem.modelKey(name) + '-emb'
		if (golem._isEmbLoaded(key)) {
			status = `Already loaded (registry key: ${key})`
			return
		}

		busy = true
		status = ''
		try {
			await golem.loadEmb(name, saveLocally)
			status = `Ready. Registry key: ${key}`
		} catch (err) {
			status = `Error: ${err instanceof Error ? err.message : String(err)}`
		} finally {
			busy = false
		}
	}
</script>

<div class="debug-load">
	<p class="debug-heading">Load embedding model</p>
	<form onsubmit={submit}>
		<div class="debug-row">
			<input type="text" bind:value={modelName} placeholder="e.g. Xenova/all-MiniLM-L6-v2" />
			<label class="debug-save-label"><input type="checkbox" bind:checked={saveLocally} /> save locally</label>
			<button type="submit" disabled={busy}>Load</button>
		</div>
		<p class="param-note">
			HuggingFace model name for a <code>feature-extraction</code> pipeline. Registry keys get an
			<code>-emb</code> suffix (e.g. <code>xenova-all-minilm-l6-v2-emb</code>). Try
			<code>Xenova/all-MiniLM-L6-v2</code> — 384-dimensional sentence embeddings, ~23&nbsp;MB quantized, the same
			model used by §4, §5, and §6. For a multilingual alternative:
			<code>Xenova/paraphrase-multilingual-MiniLM-L12-v2</code> — 384 dimensions, 50+ languages, ~120&nbsp;MB
			quantized.
		</p>
		<details class="debug-api">
			<summary>console API</summary>
			<pre>// What's loaded?
golem.embedders()
// &rarr; {'{'} 'xenova-all-minilm-l6-v2-emb': 'ready' {'}'}

// Pre-warm the MiniLM used by §4/§5/§6 — same instance, no duplicate
await golem.loadEmb('Xenova/all-MiniLM-L6-v2')

// The default golem.embed() always uses all-MiniLM-L6-v2
const vec = await golem.embed('hello world')
// &rarr; Array(384) of numbers (unit vector)</pre>
		</details>
	</form>
	<div class="section-status">{status}</div>
</div>

<style>
	.debug-load { border-top: 1px solid #e0e0e0; margin-top: 1rem; padding-top: 1rem; }
	.debug-heading { font-size: 0.85rem; font-weight: bold; color: #333; margin: 0 0 0.5rem; }
	.debug-row { display: flex; gap: 0.5rem; align-items: baseline; flex-wrap: wrap; margin-bottom: 0.3rem; }
	.debug-save-label { font-size: 0.9rem; color: #555; white-space: nowrap; }
	.debug-row input[type='text'] {
		font-family: inherit;
		font-size: 0.9rem;
		padding: 0.15rem 0.4rem;
		border: 1px solid #000;
		flex: 1;
		min-width: 14rem;
	}
	.debug-api { margin-top: 0.4rem; }
	.debug-api > summary { font-size: 0.8rem; color: #555; cursor: pointer; }
	.debug-api pre {
		margin: 0.4rem 0 0;
		font-family: inherit;
		font-size: 0.8rem;
		line-height: 1.45;
		color: #333;
		overflow-x: auto;
		padding: 0;
	}
</style>
