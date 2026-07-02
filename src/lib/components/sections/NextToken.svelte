<script lang="ts">
	import { golem } from '$lib/golem/golem'
	import { getLogits, softmaxWithTemp } from '$lib/ml/math'

	interface PredRow {
		id: number
		token: string
		prob: number
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let tokenizer: any = $state(null)
	let input = $state('The quick brown fox')
	let temperature = $state(1.0)
	let topN = $state(20)

	let busy = $state(false)
	let status = $state('')
	let header = $state('')
	let rows = $state<PredRow[]>([])
	let showResults = $state(false)

	$effect(() => {
		golem.loadTokenizer('Xenova/gpt2', false).then((tok) => {
			tokenizer = tok
		})
	})

	async function runPrediction() {
		if (!input) return
		const temp = Math.max(0.01, Number(temperature) || 1.0)
		const n = Math.max(1, Math.min(200, Math.floor(Number(topN) || 20)))

		busy = true
		status = 'Initializing…'
		try {
			const model = await golem.loadModel((info) => {
				if (info.status === 'progress') status = `Downloading model: ${(info.progress ?? 0).toFixed(0)}%`
				else if (info.status === 'done') status = 'Loading model into memory…'
			})

			status = 'Running inference…'
			const inputs = tokenizer(input, { truncation: true, max_length: 1024 })
			const output = await model(inputs)
			const { lastLogits, seqLen, vocabSize } = getLogits(output)
			const probs = softmaxWithTemp(lastLogits, temp)

			const indices = Array.from({ length: vocabSize }, (_, i) => i)
			indices.sort((a, b) => probs[b] - probs[a])
			const top = indices.slice(0, n).map((id) => ({ id, token: tokenizer.decode([id]) as string, prob: probs[id] }))

			const cumProb = (top.reduce((s, t) => s + t.prob, 0) * 100).toFixed(1)
			header =
				`top ${top.length} of 50,257 tokens  ·  temperature: ${temp}  ·  ` +
				`input: ${seqLen} token${seqLen !== 1 ? 's' : ''}  ·  cumulative probability shown: ${cumProb}%`
			rows = top
			showResults = true
			status = ''
		} catch (err) {
			status = 'Error: ' + (err instanceof Error ? err.message : String(err))
			console.error(err)
		} finally {
			busy = false
		}
	}

	function appendToken(row: PredRow) {
		if (busy) return
		input += tokenizer.decode([row.id])
		runPrediction()
	}

	const topProb = $derived(rows.length ? rows[0].prob : 1)
</script>

<h2>§2 — Next-Token Prediction</h2>
<p>
	At each step, a language model produces a <em>probability distribution</em> over every token in its vocabulary —
	not a single answer. This demo runs <strong>GPT-2</strong> (quantized, ~81 MB, cached after first download) fully
	in-browser and shows that raw distribution for the token that would follow your input. Click any row to append that
	token and recalculate.
</p>

<form onsubmit={(e) => { e.preventDefault(); runPrediction() }}>
	<textarea bind:value={input} placeholder="Enter a prompt…"></textarea>
	<div class="param-row">
		<label>Temperature
			<input type="number" bind:value={temperature} min="0.1" max="5.0" step="0.1" />
		</label>
		<label>Show top
			<input type="number" bind:value={topN} min="5" max="100" step="1" /> tokens
		</label>
	</div>
	<p class="param-note">Temperature &lt; 1 sharpens the distribution; &gt; 1 flattens it.</p>
	<button type="submit" disabled={busy}>Predict next token  [downloads ~81 MB on first run]</button>
</form>
<div class="section-status">{status}</div>

{#if showResults}
	<div class="predict-results">
		<div class="pred-header">{header}</div>
		<div class="pred-chart">
			{#each rows as row (row.id)}
				<div class="pred-row" onclick={() => appendToken(row)} role="button" tabindex="0"
					onkeydown={(e) => { if (e.key === 'Enter') appendToken(row) }}>
					<span class="pred-token" title={'id\u00a0' + row.id}>{row.token}</span>
					<div class="pred-bar-wrap"><div class="pred-bar" style:width={(row.prob / topProb * 100).toFixed(1) + '%'}></div></div>
					<span class="pred-pct">{(row.prob * 100).toFixed(2)}%</span>
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	.predict-results { margin-top: 1.2rem; }
	.pred-header { font-size: 0.85rem; margin-bottom: 0.5rem; color: #444; }
	.pred-row {
		display: grid;
		grid-template-columns: 16ch 1fr 5.5ch;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 2px;
		font-size: 0.82rem;
		cursor: pointer;
	}
	.pred-row:hover { background: #f0f0f0; }
	.pred-token {
		white-space: pre;
		overflow: hidden;
		text-overflow: ellipsis;
		text-align: right;
		padding-right: 0.4rem;
		border-right: 1px solid #ccc;
	}
	.pred-bar-wrap { background: #e8e8e8; height: 1em; }
	.pred-bar { background: #222; height: 100%; }
	.pred-pct { text-align: right; color: #444; }
</style>
