// ── §6 Retrieval-Augmented Generation ─────────────────────────────────────
// idbGet / idbPut defined in shared.js and available to all sections.
// SAMPLING_WORKER_CODE defined in shared.js (also used by §3).
{
const RAG_CORPUS_VERSION = 'rag-v1'
const RAG_DIMS = 384

// 20 multi-sentence passages about ML/AI concepts — richer than the §5
// one-liners so GPT-2 has more context to continue from.
const RAG_CORPUS = [
	'Tokenization splits raw text into smaller units called tokens before it enters a language model. GPT-2 uses byte-pair encoding, which merges common character sequences into single tokens while splitting rare words into subwords. A vocabulary of 50,257 tokens covers most English text with an average of around 1.3 tokens per word.',
	'Language models are trained to predict the next token in a sequence given all preceding tokens. During training the model sees billions of examples and adjusts its weights to assign higher probability to real text. This process bakes factual knowledge, grammar, and reasoning patterns into the model\'s parameters.',
	'Greedy decoding always selects the highest-probability token at each generation step. It is fast and deterministic, but tends to produce repetitive or formulaic text because it never explores less-likely but potentially more interesting continuations. Most text generation applications use sampling strategies instead.',
	'Temperature scaling controls how peaked or flat the probability distribution is before sampling a token. A low temperature concentrates probability on the top tokens, producing more predictable output. A high temperature spreads probability more evenly, producing more varied and sometimes surprising continuations.',
	'Top-k sampling restricts each generation step to only the k most probable tokens, zeroing out the rest before sampling. This prevents selecting very unlikely tokens while still allowing for diversity. Values of k between 10 and 50 strike a practical balance between coherence and variety.',
	'Nucleus sampling, or top-p sampling, selects the smallest set of tokens whose cumulative probability exceeds a threshold p. When the model is confident, the candidate set is small; when uncertain, more tokens qualify. This adaptive behavior often outperforms fixed top-k sampling.',
	'Word embeddings map tokens to points in a dense vector space where semantic relationships correspond to geometric distance. Early models like Word2Vec showed that analogy relationships can be expressed as vector arithmetic: the vector for king minus man plus woman lands near queen. Neural language models learn their own embeddings jointly with the rest of the model.',
	'Sentence embeddings compress a full sentence into a single fixed-length vector encoding its overall meaning. Models like all-MiniLM are trained with contrastive objectives so that semantically similar sentences end up close together in the embedding space. A 384-dimensional vector can capture surprisingly rich semantic distinctions.',
	'Cosine similarity measures the angle between two vectors in embedding space, returning a value between negative one and one. Sentences with cosine similarity above 0.85 are typically paraphrases or closely related. Because it measures direction rather than magnitude, it is robust to differences in sentence length.',
	'Semantic search finds documents whose meaning is related to a query, even when they share no exact words. The query and all documents are embedded into the same vector space and ranked by similarity. This overcomes the vocabulary mismatch problem that makes keyword search brittle.',
	'Vector databases store embedding vectors and support fast approximate nearest-neighbor queries over millions of entries. Index structures like HNSW organize vectors geometrically so that similar items can be found without scanning every entry. For small corpora, brute-force dot product search is exact and entirely practical.',
	'Retrieval-augmented generation prepends passages from an external corpus to the model prompt before generating. The model then produces text conditioned on both the retrieved context and the user\'s input. This grounds the output in specific, retrievable facts rather than relying solely on the model\'s parametric memory.',
	'The key mechanic of RAG is that retrieval and generation are separate, swappable components. The retriever selects relevant passages using embedding similarity; the generator conditions its output on those passages as part of its context window. No fine-tuning of the language model is required to incorporate new knowledge.',
	'The attention mechanism lets each token in a sequence gather information from all other tokens. For each position the model computes compatibility scores between a learned query vector and all key vectors, then aggregates the corresponding value vectors using the softmax-normalized scores. This allows any token to directly influence any other, regardless of sequence distance.',
	'Multi-head attention runs several independent attention operations in parallel. Each head learns to focus on different aspects of the relationships between tokens, such as syntax, coreference, or factual associations. The outputs of all heads are concatenated and projected back to the model dimension.',
	'Transformer blocks apply self-attention followed by a feed-forward network, with residual connections and layer normalization around each sub-layer. Stacking many such blocks creates models capable of learning complex hierarchical representations of language. The depth and width of the stack largely determine the model\'s capacity.',
	'BERT is an encoder-only transformer trained with masked language modeling, predicting randomly hidden tokens using bidirectional context. By seeing context from both directions simultaneously it produces rich contextual representations suited for classification, retrieval, and question answering. Sentence embedding models like all-MiniLM are fine-tuned versions of BERT-family models.',
	'GPT models are decoder-only transformers that generate text autoregressively, predicting one token at a time from left to right. A causal mask prevents any position from attending to future tokens, preserving the autoregressive property. GPT-2 was trained on 40 GB of web text and remains a useful demonstration model.',
	'Quantization reduces model size by storing weights in fewer bits than standard 32-bit floats. An 8-bit quantized model uses roughly a quarter of the memory with only a small drop in quality. Quantization makes it practical to run models with tens of millions of parameters directly in a browser via WebAssembly.',
	'Hallucination refers to fluent, confident-sounding model output that is factually incorrect or entirely fabricated. It arises because the model is optimized to produce plausible continuations, not to verify claims against external facts. Retrieval-augmented generation mitigates hallucination by giving the model grounded source passages to draw from.',
]

// ── DOM refs ───────────────────────────────────────────────────────────────
const ragBuildBtn       = document.getElementById('rag-build-btn')
const ragIndexStatus    = document.getElementById('rag-index-status')
const ragQuery          = document.getElementById('rag-query')
const ragKEl            = document.getElementById('rag-k')
const ragTempEl         = document.getElementById('rag-temp')
const ragMaxEl          = document.getElementById('rag-max')
const ragCompareEl      = document.getElementById('rag-compare')
const ragBtn            = document.getElementById('rag-btn')
const ragStopBtn        = document.getElementById('rag-stop-btn')
const ragStatus         = document.getElementById('rag-status')
const ragResults        = document.getElementById('rag-results')
const ragRetrievedList  = document.getElementById('rag-retrieved-list')
const ragContextBox     = document.getElementById('rag-context-box')
const ragStopInline     = document.getElementById('rag-stop-inline')
const ragTps            = document.getElementById('rag-tps')
const ragOutputWith     = document.getElementById('rag-output-with')
const ragMetaWith       = document.getElementById('rag-meta-with')
const ragWithoutSection = document.getElementById('rag-without-section')
const ragOutputWithout  = document.getElementById('rag-output-without')
const ragMetaWithout    = document.getElementById('rag-meta-without')

let ragCorpusVecs = null  // Float32Array [RAG_CORPUS.length × RAG_DIMS]

// ── load cached index on page start ───────────────────────────────────────
idbGet(RAG_CORPUS_VERSION).then(cached => {
	if (!cached) { registrySet('rag-index', { status: 'absent' }); return }
	ragCorpusVecs = cached
	registrySet('rag-index', { status: 'ready' })
	ragIndexStatus.textContent = `${RAG_CORPUS.length} passages (cached)`
	ragBtn.disabled = false
}).catch(() => { registrySet('rag-index', { status: 'absent' }) })

// ── build index ────────────────────────────────────────────────────────────
ragBuildBtn.addEventListener('click', async () => {
	ragBuildBtn.disabled = true
	ragBtn.disabled      = true
	ragIndexStatus.textContent = 'Initializing…'
	registrySet('rag-index', { status: 'loading' })
	try {
		await golem.loadEmbedder(info => {
			if (info.status === 'progress')
				ragIndexStatus.textContent = `Downloading model: ${info.progress.toFixed(0)}%`
			else if (info.status === 'done')
				ragIndexStatus.textContent = 'Loading model…'
		})
		const allVecs = new Float32Array(RAG_CORPUS.length * RAG_DIMS)
		for (let i = 0; i < RAG_CORPUS.length; i++) {
			ragIndexStatus.textContent = `Embedding passage ${i + 1} / ${RAG_CORPUS.length}…`
			const vec = await golem.embed(RAG_CORPUS[i])
			allVecs.set(vec, i * RAG_DIMS)
		}
		ragCorpusVecs = allVecs
		await idbPut(RAG_CORPUS_VERSION, ragCorpusVecs)
		registrySet('rag-index', { status: 'ready' })
		ragIndexStatus.textContent = `${RAG_CORPUS.length} passages indexed and cached`
		ragBtn.disabled      = false
		ragBuildBtn.disabled = false
	} catch (err) {
		registrySet('rag-index', { status: 'error' })
		ragIndexStatus.textContent = 'Error: ' + err.message
		ragBuildBtn.disabled = false
	}
})

// ── generation worker (separate from §3 to avoid concurrent-use conflicts) ─
let ragWorker = null
function getRagWorker() {
	if (!ragWorker) {
		const blob = new Blob([SAMPLING_WORKER_CODE], { type: 'text/javascript' })
		ragWorker = new Worker(URL.createObjectURL(blob), { type: 'module' })
	}
	return ragWorker
}

let ragStopped = false
function ragStop() {
	ragStopped = true
	if (ragWorker) ragWorker.postMessage({ type: 'stop' })
}
ragStopBtn.addEventListener('click', ragStop)
ragStopInline.addEventListener('click', ragStop)

// ── RAG pipeline ───────────────────────────────────────────────────────────
document.getElementById('rag-form').addEventListener('submit', async e => {
	e.preventDefault()
	const query = ragQuery.value.trim()
	if (!query || !ragCorpusVecs) return

	const k      = Math.max(1, Math.min(5, parseInt(ragKEl.value)   || 3))
	const temp   = Math.max(0.1, parseFloat(ragTempEl.value)        || 0.8)
	const maxTok = Math.max(10, Math.min(100, parseInt(ragMaxEl.value) || 50))
	const compare = ragCompareEl.checked

	ragStopped          = false
	ragBtn.disabled     = true
	ragStopBtn.disabled = false; ragStopInline.disabled = false
	ragStatus.textContent = 'Embedding query…'
	ragResults.hidden = true
	ragWithoutSection.hidden = true

	// ── Step 1: embed query ────────────────────────────────────────────────
	let qVec
	try {
		qVec = await golem.embed(query)
	} catch (err) {
		ragStatus.textContent = 'Error: ' + err.message
		ragBtn.disabled = false; ragStopBtn.disabled = true; ragStopInline.disabled = true
		return
	}

	// ── Step 2: brute-force dot product search (vectors are unit-normalized) ─
	const scores = []
	for (let i = 0; i < RAG_CORPUS.length; i++) {
		let dot = 0
		const off = i * RAG_DIMS
		for (let j = 0; j < RAG_DIMS; j++) dot += qVec[j] * ragCorpusVecs[off + j]
		scores.push({ i, score: dot })
	}
	scores.sort((a, b) => b.score - a.score)
	const top      = scores.slice(0, k)
	const maxScore = top[0].score

	// ── Step 3: render retrieved passages ─────────────────────────────────
	ragRetrievedList.innerHTML = top.map(({ i, score }) =>
		`<div class="rag-passage-row">` +
		`<div class="rag-passage-meta">` +
		`<span class="rag-passage-score">${score.toFixed(3)}</span>` +
		`<div class="rag-bar-wrap"><div class="rag-bar" style="width:${(score / maxScore * 100).toFixed(1)}%"></div></div>` +
		`</div>` +
		`<div class="rag-passage-text">${escHtml(RAG_CORPUS[i])}</div>` +
		`</div>`
	).join('')

	// ── Step 4: build augmented prompt ────────────────────────────────────
	// RAG is just text concatenation: retrieved passages + query.
	const contextText = top.map(({ i }) => RAG_CORPUS[i]).join('\n\n')
	const fullPrompt  = contextText + '\n\n' + query

	ragContextBox.textContent = fullPrompt

	// ── Step 5: render output area and start generation ───────────────────
	ragOutputWith.innerHTML = ''
	ragMetaWith.textContent = ''
	const promptSpan = document.createElement('span')
	promptSpan.className = 'gen-prompt'
	promptSpan.textContent = query + ' '
	ragOutputWith.appendChild(promptSpan)

	ragResults.hidden = false
	ragTps.textContent = ''
	ragStatus.textContent = 'Generating with context…'

	let ragGenStart = null
	const worker = getRagWorker()

	worker.onmessage = ({ data }) => {
		if (data.type === 'status') {
			ragStatus.textContent = data.text
		} else if (data.type === 'model_status') {
			// Mirror §3: reflect worker model loading in REGISTRY only when the
			// main-thread model is not already loaded.
			if (!window.golem._isModelLoaded())
				registrySet('xenova-gpt2-lm', { status: data.status, progress: data.progress })
		} else if (data.type === 'token') {
			if (data.step === 0) ragGenStart = Date.now()
			const span = document.createElement('span')
			span.className = 'gen-tok gen-tok-' + (data.step % 2 === 0 ? 'a' : 'b')
			span.title = (data.prob * 100).toFixed(1) + '%'
			span.textContent = data.text
			ragOutputWith.appendChild(span)
			if (data.step > 0) {
				const tps = (data.step + 1) / ((Date.now() - ragGenStart) / 1000)
				ragTps.textContent = tps.toFixed(2) + ' tok/s'
			}
		} else if (data.type === 'done') {
			const finalTps = ragGenStart && data.stepCount > 1
				? (data.stepCount / ((Date.now() - ragGenStart) / 1000)).toFixed(2) + ' tok/s'
				: ''
			ragMetaWith.textContent = `${data.stepCount} token${data.stepCount !== 1 ? 's' : ''}  \xb7  temperature ${temp}  \xb7  ${data.stopReason}${finalTps ? '  \xb7  ' + finalTps : ''}`
			ragTps.textContent = ''

			if (compare && !ragStopped) {
				// ── Phase 2: generate without context ──────────────────────
				ragStatus.textContent = 'Generating without context…'
				ragWithoutSection.hidden = false
				ragOutputWithout.innerHTML = ''
				ragMetaWithout.textContent = ''
				const barePromptSpan = document.createElement('span')
				barePromptSpan.className = 'gen-prompt'
				barePromptSpan.textContent = query + ' '
				ragOutputWithout.appendChild(barePromptSpan)

				worker.onmessage = ({ data: d }) => {
					if (d.type === 'status') {
						ragStatus.textContent = d.text
					} else if (d.type === 'token') {
						const span = document.createElement('span')
						span.className = 'gen-tok gen-tok-' + (d.step % 2 === 0 ? 'a' : 'b')
						span.title = (d.prob * 100).toFixed(1) + '%'
						span.textContent = d.text
						ragOutputWithout.appendChild(span)
					} else if (d.type === 'done') {
						ragMetaWithout.textContent = `${d.stepCount} token${d.stepCount !== 1 ? 's' : ''}  \xb7  temperature ${temp}  \xb7  ${d.stopReason}`
						ragStatus.textContent = ''
						ragBtn.disabled = false; ragStopBtn.disabled = true; ragStopInline.disabled = true
					} else if (d.type === 'error') {
						ragStatus.textContent = 'Error: ' + d.message
						ragBtn.disabled = false; ragStopBtn.disabled = true; ragStopInline.disabled = true
					}
				}

				worker.postMessage({ type: 'generate', prompt: query, strategy: 'temperature', temp, k: 40, p: 0.9, maxTok })
			} else {
				ragStatus.textContent = ''
				ragBtn.disabled = false; ragStopBtn.disabled = true; ragStopInline.disabled = true
			}
		} else if (data.type === 'error') {
			ragStatus.textContent = 'Error: ' + data.message
			ragBtn.disabled = false; ragStopBtn.disabled = true; ragStopInline.disabled = true
		}
	}

	worker.postMessage({ type: 'generate', prompt: fullPrompt, strategy: 'temperature', temp, k: 40, p: 0.9, maxTok })
})
}
