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

		const key = golem.modelKey(name)
		if (golem._isLoaded(key)) {
			status = `Already loaded (registry key: ${key})`
			return
		}

		busy = true
		status = ''
		try {
			await golem.loadTokenizer(name, saveLocally)
			status = `Ready. Registry key: ${key}`
		} catch (err) {
			status = `Error: ${err instanceof Error ? err.message : String(err)}`
		} finally {
			busy = false
		}
	}
</script>

<div class="debug-load">
	<p class="debug-heading">Load tokenizer</p>
	<form onsubmit={submit}>
		<div class="debug-row">
			<input type="text" bind:value={modelName} placeholder="e.g. Xenova/bert-base-uncased" />
			<label class="debug-save-label"><input type="checkbox" bind:checked={saveLocally} /> save locally</label>
			<button type="submit" disabled={busy}>Load</button>
		</div>
		<p class="param-note">
			HuggingFace model name for <code>AutoTokenizer.from_pretrained</code>. Try
			<code>Xenova/bert-base-uncased</code> — BERT’s WordPiece tokenizer (~570&nbsp;KB), a useful contrast to
			GPT-2’s BPE: subword units use <code>##</code> continuation markers and a 30k vocabulary instead of 50k. For
			something that will really push the browser: <code>Xenova/bloom-560m</code> — byte-level BPE with a
			250,880-token vocabulary (~17&nbsp;MB <code>tokenizer.json</code>), 5&times; larger than GPT-2.
		</p>
		<details class="debug-api">
			<summary>console API</summary>
			<pre>// What's loaded?
golem.tokenizers()
// &rarr; {'{'} 'gpt2-tokenizer': 'ready', 'xenova-bert-base-uncased': 'ready' {'}'}

// Smoke-test tokenization
golem.tokenize('gpt2-tokenizer', 'Hello, world!')
// &rarr; [{'{'} piece: 'Hello', id: 15496 {'}'}, &hellip;]

// Verify round-trips
const tokens = golem.tokenize('gpt2-tokenizer', 'The quick brown fox')
golem.decode('gpt2-tokenizer', tokens.map(t =&gt; t.id))
// &rarr; 'The quick brown fox'</pre>
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
