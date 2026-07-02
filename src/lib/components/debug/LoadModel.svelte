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

		const key = golem.modelKey(name) + '-lm'
		if (golem._isLMLoaded(key)) {
			status = `Already loaded (registry key: ${key})`
			return
		}

		busy = true
		status = ''
		try {
			await golem.loadLM(name, saveLocally)
			status = `Ready. Registry key: ${key}`
		} catch (err) {
			status = `Error: ${err instanceof Error ? err.message : String(err)}`
		} finally {
			busy = false
		}
	}
</script>

<div class="debug-load">
	<p class="debug-heading">Load language model</p>
	<form onsubmit={submit}>
		<div class="debug-row">
			<input type="text" bind:value={modelName} placeholder="e.g. Xenova/distilgpt2" />
			<label class="debug-save-label"><input type="checkbox" bind:checked={saveLocally} /> save locally</label>
			<button type="submit" disabled={busy}>Load</button>
		</div>
		<p class="param-note">
			HuggingFace model name for <code>AutoModelForCausalLM.from_pretrained</code>. Try
			<code>Xenova/distilgpt2</code> — a distilled GPT-2 (82&nbsp;M parameters, ~40&nbsp;MB quantized) that shares
			GPT-2’s tokenizer and vocabulary. For a heavier test: <code>Xenova/gpt2-medium</code> — 345&nbsp;M
			parameters, ~170&nbsp;MB quantized. Registry keys get a <code>-lm</code> suffix (e.g.
			<code>xenova-distilgpt2-lm</code>). Loading <code>Xenova/gpt2</code> here pre-warms the same
			<code>xenova-gpt2-lm</code> instance that §2 and §3 use via <code>golem.loadModel()</code> — no duplicate
			download.
		</p>
		<details class="debug-api">
			<summary>console API</summary>
			<pre>// What's loaded?
golem.models()
// &rarr; {'{'} 'xenova-distilgpt2-lm': 'ready' {'}'}

// Pre-warm the GPT-2 model used by §2/§3 — same instance, no duplicate
const m = await golem.loadLM('Xenova/gpt2')

// Release from memory (browser cache stays — next load is instant)
await golem.unloadLM('xenova-gpt2-lm')</pre>
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
