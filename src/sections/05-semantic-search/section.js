// ── §5 semantic search ─────────────────────────────────────────────────────
const CORPUS_VERSION = 'v1'
const DIMS = 384
const CORPUS = [
	// tokenization
	'Byte Pair Encoding (BPE) builds a vocabulary by iteratively merging the most frequent adjacent byte pairs until a target vocabulary size is reached.',
	'Tokenization converts raw text into integer IDs from a fixed vocabulary; common subwords get single IDs while rare words are split into several tokens.',
	'GPT-2 uses a vocabulary of 50,257 tokens — a mix of individual characters, common subwords, and frequent whole words including a leading-space variant of each.',
	// probability and distributions
	'The softmax function converts a vector of real-valued logits into a probability distribution by exponentiating each value and dividing by the sum.',
	'Entropy quantifies the uncertainty of a probability distribution; a model that spreads probability evenly across many tokens has high entropy and produces more varied output.',
	'Perplexity is the exponentiated average negative log-likelihood of a text under a model, measuring how surprised the model is by each token on average.',
	// sampling
	'Temperature scaling divides every logit by a constant before softmax — values below 1.0 concentrate probability on the top tokens, values above 1.0 spread it more evenly.',
	'Top-k sampling restricts each generation step to the k highest-probability tokens, zeroing out all others before renormalizing and sampling.',
	'Nucleus (top-p) sampling dynamically selects the smallest set of tokens whose cumulative probability reaches p, adapting the candidate pool to how peaked the local distribution is.',
	'Greedy decoding always selects the highest-probability token at each step, producing deterministic but often repetitive output that avoids any low-probability choices.',
	// generation
	'Autoregressive generation produces text one token at a time, feeding each newly generated token back into the model as part of the input for the next step.',
	// attention
	'Self-attention computes, for each token, a weighted combination of all other tokens in the sequence, with weights derived from learned query-key dot products.',
	'Multi-head attention runs several attention operations in parallel with independent learned projections, allowing each head to capture different types of token relationships.',
	'In self-attention, query and key projections determine which tokens attend to each other, while value projections carry the information that gets aggregated.',
	'Positional encodings inject order information into token embeddings because the attention operation itself is permutation-invariant and cannot distinguish token positions.',
	'Visualizing the attention weights of a trained model as a matrix reveals which tokens the model finds most relevant when processing each position.',
	// transformer architecture
	'A transformer block applies self-attention followed by a feed-forward network, with each sub-layer wrapped in a residual connection and layer normalization.',
	'Residual connections add a layer\'s input directly to its output so that gradients can flow unchanged through that path during backpropagation, enabling very deep networks.',
	'Decoder-only transformers like GPT use a causal mask so each token can only attend to previous positions, enforcing the autoregressive property during training.',
	'Encoder-only transformers like BERT are trained with masked language modeling — randomly hiding tokens and predicting them using bidirectional context.',
	// embeddings
	'An embedding is a learned dense vector in a continuous space where semantic relationships between words or sentences correspond to geometric proximity.',
	'Sentence embeddings compress variable-length text into a single fixed-size vector encoding its overall meaning, enabling fast similarity comparisons between arbitrary texts.',
	'Cosine similarity measures the angle between two vectors, ranging from −1 (opposite directions) to 1 (identical direction), and is the standard metric for comparing text embeddings.',
	'Contrastive training pulls embeddings of semantically similar texts toward each other and pushes dissimilar texts apart, shaping the geometry of the embedding space.',
	'A vector index such as FAISS or HNSW supports approximate nearest-neighbor search over millions of embedding vectors in milliseconds by exploiting geometric structure.',
	// retrieval and RAG
	'Dense retrieval embeds queries and documents into the same vector space and finds relevant passages by maximum inner product search rather than keyword matching.',
	'Semantic search finds results by meaning rather than literal word overlap, so a query about animals that change color can match documents mentioning chameleon and pigmentation.',
	'Retrieval-augmented generation (RAG) prepends passages retrieved from an external corpus to the model\'s context before generating, grounding its output in external knowledge and reducing hallucination.',
	// training
	'Pre-training on large text corpora teaches general syntactic and world knowledge; fine-tuning then adapts these representations to a specific downstream task on a smaller dataset.',
	'The cross-entropy loss during language model training is the negative log-probability assigned to the correct next token, and minimizing it pushes the model to assign high probability to real text.',
	'Backpropagation computes the gradient of the loss with respect to every parameter in the network, which gradient descent uses to update weights in the direction that reduces loss.',
	'Fine-tuning updates a pre-trained model\'s weights on a smaller labeled dataset, specializing its representations for a particular task without training from scratch.',
	'Instruction tuning trains a base language model on demonstrations of following natural language instructions, shifting its behavior from next-token prediction toward task completion.',
	'RLHF (reinforcement learning from human feedback) collects human preference rankings over model outputs and uses them to further align a model toward helpful and safe responses.',
	// inference and optimization
	'The context window defines the maximum token sequence a model can attend to at once; information beyond this limit is invisible to the model regardless of its importance.',
	'The KV cache stores key and value tensors computed for earlier tokens so they need not be recomputed at each autoregressive step, dramatically speeding up generation.',
	'Quantization represents model weights in fewer bits (for example int8 instead of float32), reducing memory footprint and increasing throughput with only a small accuracy tradeoff.',
	'Hallucination occurs when a model generates fluent, confident-sounding text that is factually incorrect or entirely fabricated, often on topics underrepresented in its training data.',
	// in-context learning and emergence
	'In-context learning lets a model adapt to new tasks by conditioning on a few input-output examples written into the prompt, without any gradient updates to the model weights.',
	'Zero-shot capability refers to a model\'s ability to follow instructions and perform tasks it was never explicitly trained on, emerging from the breadth and scale of pre-training.',
]

const buildIndexBtn  = document.getElementById('build-index-btn')
const indexStatusEl  = document.getElementById('index-status')
const searchQueryEl  = document.getElementById('search-query')
const searchBtn      = document.getElementById('search-btn')
const searchStatus   = document.getElementById('search-status')
const searchResults  = document.getElementById('search-results')
const searchHeader   = document.getElementById('search-header')
const searchList     = document.getElementById('search-list')

let corpusVecs = null  // Float32Array [CORPUS.length × DIMS]

// IndexedDB helpers
function openDB() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open('golem', 1)
		req.onupgradeneeded = e => {
			const db = e.target.result
			if (!db.objectStoreNames.contains('search')) db.createObjectStore('search')
		}
		req.onsuccess = e => resolve(e.target.result)
		req.onerror  = e => reject(e.target.error)
	})
}
async function idbGet(key) {
	try {
		const db = await openDB()
		return new Promise((resolve, reject) => {
			const tx  = db.transaction('search', 'readonly')
			const req = tx.objectStore('search').get(key)
			req.onsuccess = e => resolve(e.target.result ?? null)
			req.onerror   = e => reject(e.target.error)
		})
	} catch { return null }
}
async function idbPut(key, value) {
	try {
		const db = await openDB()
		return new Promise((resolve, reject) => {
			const tx  = db.transaction('search', 'readwrite')
			const req = tx.objectStore('search').put(value, key)
			req.onsuccess = () => resolve()
			req.onerror   = e => reject(e.target.error)
		})
	} catch {}
}

// Eagerly load from cache on page load
idbGet(CORPUS_VERSION).then(cached => {
	if (!cached) { registrySet('search-index', { status: 'absent' }); return }
	corpusVecs = cached
	registrySet('search-index', { status: 'ready' })
	indexStatusEl.textContent = `${CORPUS.length} passages (cached)`
	searchQueryEl.disabled = false
	searchBtn.disabled     = false
}).catch(() => { registrySet('search-index', { status: 'absent' }) })

buildIndexBtn.addEventListener('click', async () => {
	buildIndexBtn.disabled   = true
	indexStatusEl.textContent = 'Initializing…'
	registrySet('search-index', { status: 'loading' })
	try {
		const ext = await ensureEmbedder(info => {
			if (info.status === 'progress')
				indexStatusEl.textContent = `Downloading model: ${info.progress.toFixed(0)}%`
			else if (info.status === 'done')
				indexStatusEl.textContent = 'Loading model…'
		})
		const allVecs = new Float32Array(CORPUS.length * DIMS)
		for (let i = 0; i < CORPUS.length; i++) {
			indexStatusEl.textContent = `Embedding passage ${i + 1} / ${CORPUS.length}…`
			const out = await ext(CORPUS[i], { pooling: 'mean', normalize: true })
			allVecs.set(out.data, i * DIMS)
		}
		corpusVecs = allVecs
		await idbPut(CORPUS_VERSION, corpusVecs)
		registrySet('search-index', { status: 'ready' })
		indexStatusEl.textContent = `${CORPUS.length} passages indexed and cached`
		searchQueryEl.disabled = false
		searchBtn.disabled     = false
		buildIndexBtn.disabled = false
	} catch (err) {
		registrySet('search-index', { status: 'absent' })
		indexStatusEl.textContent = 'Error: ' + err.message
		buildIndexBtn.disabled = false
	}
})

document.getElementById('search-form').addEventListener('submit', async e => {
	e.preventDefault()
	const query = searchQueryEl.value.trim()
	if (!query || !corpusVecs) return

	searchBtn.disabled = true
	searchStatus.textContent = 'Embedding query…'

	try {
		const ext  = await ensureEmbedder(info => {
			if (info.status === 'progress')
				searchStatus.textContent = `Downloading model: ${info.progress.toFixed(0)}%`
		})
		const qOut = await ext(query, { pooling: 'mean', normalize: true })
		const qVec = qOut.data

		// Dot product = cosine similarity (all vectors are unit-normalized)
		const scores = []
		for (let i = 0; i < CORPUS.length; i++) {
			let dot = 0
			const off = i * DIMS
			for (let j = 0; j < DIMS; j++) dot += qVec[j] * corpusVecs[off + j]
			scores.push({ i, score: dot })
		}
		scores.sort((a, b) => b.score - a.score)
		const top = scores.slice(0, 10)
		const maxScore = top[0].score

		searchHeader.textContent = `Top ${top.length} of ${CORPUS.length} passages for: "${query}"`
		searchList.innerHTML = top.map(({ i, score }) =>
			`<div class="result-row">` +
			`<div class="result-meta">` +
			`<span class="result-score">${score.toFixed(3)}</span>` +
			`<div class="result-bar-wrap"><div class="result-bar" style="width:${(score / maxScore * 100).toFixed(1)}%"></div></div>` +
			`</div>` +
			`<div class="result-text">${escHtml(CORPUS[i])}</div>` +
			`</div>`
		).join('')

		searchResults.hidden = false
		searchStatus.textContent = ''
	} catch (err) {
		searchStatus.textContent = 'Error: ' + err.message
		console.error(err)
	} finally {
		searchBtn.disabled = false
	}
})
