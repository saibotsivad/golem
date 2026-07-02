<script lang="ts">
	import { golem } from '$lib/golem/golem'
	import { registrySet } from '$lib/golem/registry.svelte'
	import type { SamplingStrategy, SamplingWorkerResponse } from '$lib/golem/types'
	import { createSamplingWorker } from '$lib/ml/workers'

	interface GenToken {
		text: string
		cls: string
		title: string
	}

	let input = $state('The quick brown fox')
	let strategy = $state<SamplingStrategy>('temperature')
	let temp = $state(1.0)
	let k = $state(40)
	let p = $state(0.9)
	let maxTok = $state(40)

	let running = $state(false)
	let status = $state('')
	let showOutput = $state(false)
	let prompt = $state('')
	let genTokens = $state<GenToken[]>([])
	let meta = $state('')

	// Lazy persistent worker so the loaded model survives across generations.
	let worker: Worker | null = null
	function getWorker(): Worker {
		if (!worker) worker = createSamplingWorker()
		return worker
	}

	function stop() {
		worker?.postMessage({ type: 'stop' })
	}

	function generate(e: SubmitEvent) {
		e.preventDefault()
		if (!input) return

		const s = strategy
		const t = Math.max(0.01, Number(temp) || 1.0)
		const kk = Math.max(1, Math.floor(Number(k) || 40))
		const pp = Math.max(0.01, Math.min(1, Number(p) || 0.9))
		const mt = Math.max(1, Math.min(200, Math.floor(Number(maxTok) || 40)))

		running = true
		status = 'Initializing…'
		showOutput = true
		prompt = input
		genTokens = []
		meta = ''

		const w = getWorker()
		w.onmessage = ({ data }: MessageEvent<SamplingWorkerResponse>) => {
			if (data.type === 'status') {
				status = data.text
			} else if (data.type === 'model_status') {
				if (!golem._isModelLoaded()) registrySet('xenova-gpt2-lm', { status: data.status, progress: data.progress })
			} else if (data.type === 'token') {
				genTokens = [...genTokens, { text: data.text, cls: data.step % 2 === 0 ? 'gen-tok-a' : 'gen-tok-b', title: (data.prob * 100).toFixed(1) + '%' }]
			} else if (data.type === 'done') {
				meta = `${data.stepCount} token${data.stepCount !== 1 ? 's' : ''} generated  ·  strategy: ${data.strategyLabel}  ·  ${data.stopReason}`
				status = ''
				running = false
			} else if (data.type === 'error') {
				status = 'Error: ' + data.message
				console.error(data.message)
				running = false
			}
		}

		w.postMessage({ type: 'generate', prompt: input, strategy: s, temp: t, k: kk, p: pp, maxTok: mt })
	}
</script>

<h2>§3 — Sampling Strategies</h2>
<p>
	Autoregressive generation is a loop: run the model, get a distribution, <em>pick</em> a token, append it, repeat.
	How you pick determines the character of the output. The four strategies below all operate on the same probability
	distribution from §2.
</p>
<p class="param-note">
	<strong>Greedy</strong> — always take the highest-probability token. Deterministic; tends toward repetitive, "safe"
	text.<br />
	<strong>Temperature</strong> — sample from the full distribution. Higher temperature = more random.<br />
	<strong>Top-k</strong> — restrict sampling to the k most probable tokens, then sample.<br />
	<strong>Top-p (nucleus)</strong> — restrict sampling to the smallest set of tokens whose cumulative probability ≥ p,
	then sample.
</p>

<form onsubmit={generate}>
	<textarea bind:value={input} placeholder="Enter a prompt…"></textarea>
	<div class="param-row">
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
	<button type="submit" disabled={running}>Generate  [uses same ~81 MB model as §2]</button>
	<button type="button" onclick={stop} disabled={!running}>Stop</button>
</form>
<div class="section-status">{status}</div>

{#if showOutput}
	<div class="sample-output">
		<div class="sample-text">
			<span class="gen-prompt">{prompt}</span>{#each genTokens as tok, i (i)}<span class="gen-tok {tok.cls}" title={tok.title}>{tok.text}</span>{/each}
		</div>
		<div class="sample-meta">{meta}</div>
	</div>
{/if}

<style>
	.sample-output {
		margin-top: 1.2rem;
		border: 1px solid #ccc;
		padding: 0.5rem;
		font-size: 0.95rem;
		line-height: 2;
		word-break: break-all;
	}
	.sample-meta { font-size: 0.8rem; color: #555; margin-top: 0.5rem; }
</style>
