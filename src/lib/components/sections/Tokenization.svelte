<script lang="ts">
	import { golem } from '$lib/golem/golem'

	interface Token {
		piece: string
		id: number
	}

	let tokenizer: ((text: string, opts: { add_special_tokens: boolean }) => { input_ids: { data: ArrayLike<bigint | number> } }) & {
		decode: (ids: number[], opts?: { skip_special_tokens: boolean }) => string
	} | null = $state(null)

	let status = $state('Loading tokenizer vocabulary…')
	let input = $state('The quick brown fox jumps over the lazy dog.')
	let tokens = $state<Token[]>([])
	let showResults = $state(false)
	let inputEl = $state<HTMLTextAreaElement | null>(null)

	$effect(() => {
		golem
			.loadTokenizer('Xenova/gpt2', false)
			.then((tok) => {
				tokenizer = tok
				status = ''
				inputEl?.focus()
			})
			.catch((err: unknown) => {
				status = 'Failed to load tokenizer: ' + (err instanceof Error ? err.message : String(err))
			})
	})

	function tokenize(e: SubmitEvent) {
		e.preventDefault()
		if (!input || !tokenizer) return
		const encoded = tokenizer(input, { add_special_tokens: false })
		const ids = Array.from(encoded.input_ids.data).map((v) => Number(v))
		tokens = ids.map((id) => ({ id, piece: tokenizer!.decode([id], { skip_special_tokens: false }) }))
		showResults = true
		status = ''
	}
</script>

<h2>§1 — Tokenization</h2>
<p>
	Tokenization is how large language models break text into discrete units before processing. This demo uses the
	<strong>GPT-2 BPE</strong> (Byte Pair Encoding) tokenizer via
	<a href="https://huggingface.co/docs/transformers.js" target="_blank" rel="noopener">Transformers.js</a>. The
	tokenizer vocabulary (~800 KB) is downloaded from HuggingFace on first use and cached by the browser.
</p>

<form onsubmit={tokenize}>
	<textarea bind:value={input} bind:this={inputEl} placeholder="Enter text to tokenize…"></textarea>
	<button type="submit" disabled={!tokenizer}>Tokenize</button>
</form>
<div class="section-status">{status}</div>

{#if showResults}
	<div class="tokenize-results">
		<div class="token-summary">{tokens.length} token{tokens.length !== 1 ? 's' : ''}</div>
		<div class="token-visual">
			{#each tokens as token (token.id + '-' + token.piece)}
				<span class="tok" title={'id\u00a0' + token.id}>{token.piece}</span>
			{/each}
		</div>
		<div class="token-ids">IDs: {tokens.map((t) => t.id).join(', ')}</div>
	</div>
{/if}

<style>
	.tokenize-results { margin-top: 1.2rem; }
	.token-summary { font-size: 0.85rem; margin-bottom: 0.6rem; }
	.token-visual {
		font-size: 0.95rem;
		line-height: 2;
		word-break: break-all;
		border: 1px solid #ccc;
		padding: 0.5rem;
		margin-bottom: 0.8rem;
	}
	.tok { display: inline; white-space: pre; }
	.tok:nth-child(odd) { background: #ddeedd; }
	.tok:nth-child(even) { background: #dde2ee; }
	.token-ids { font-size: 0.8rem; color: #444; word-break: break-all; }
</style>
