// ── golem public API ───────────────────────────────────────────────────────
// window.golem is the developer-facing API for loading and using models.
// It is in scope for all debug panels and section JS files, and is accessible
// from the browser console for interactive development.
//
// golem.modelKey(name)             → registry key string
// golem.loadTokenizer(name[,save]) → Promise<AutoTokenizer>
// golem.unloadTokenizer(key)       → Promise<void>
// golem.tokenizers()               → { [key]: status }
// golem.tokenize(key, text[, cb])  → [{piece, id}, …]
// golem.decode(key, ids)           → string
// golem.loadLM(name[,save,prog])   → Promise<AutoModelForCausalLM>
// golem.unloadLM(key)              → Promise<void>
// golem.models()                   → { [key]: status }
// golem.loadModel([onProgress])    → Promise<AutoModelForCausalLM>  (Xenova/gpt2 shorthand)
// golem.loadEmbedder([onProgress]) → Promise<void>
// golem.embed(text)                → Promise<number[]>  (384-dim unit vector)

const _loadedTokenizers = new Map() // registryKey → AutoTokenizer instance
const _loadedLMs        = new Map() // registryKey → AutoModelForCausalLM instance

// Capture REGISTRY keys that existed at startup so unloadLM knows whether to
// reset a pre-declared entry to 'cached' or remove it entirely.
const _predeclaredKeys = new Set(Object.keys(REGISTRY))

function _modelNameToKey(name) {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// ── IDB helpers — tokenizers store ────────────────────────────────────────
// Uses _openDb() from shared.js (same 'golem' DB, 'tokenizers' store).
async function _idbTokGetAll() {
	const db = await _openDb()
	return new Promise((res, rej) => {
		const req = db.transaction('tokenizers', 'readonly').objectStore('tokenizers').getAll()
		req.onsuccess = () => res(req.result)
		req.onerror = () => rej(req.error)
	})
}
async function _idbTokPut(key, modelName) {
	const db = await _openDb()
	return new Promise((res, rej) => {
		const tx = db.transaction('tokenizers', 'readwrite')
		tx.objectStore('tokenizers').put({ key, modelName })
		tx.oncomplete = res
		tx.onerror = () => rej(tx.error)
	})
}
async function _idbTokDelete(key) {
	const db = await _openDb()
	return new Promise((res, rej) => {
		const tx = db.transaction('tokenizers', 'readwrite')
		tx.objectStore('tokenizers').delete(key)
		tx.oncomplete = res
		tx.onerror = () => rej(tx.error)
	})
}

// ── IDB helpers — models store ─────────────────────────────────────────────
async function _idbLMGetAll() {
	const db = await _openDb()
	return new Promise((res, rej) => {
		const req = db.transaction('models', 'readonly').objectStore('models').getAll()
		req.onsuccess = () => res(req.result)
		req.onerror = () => rej(req.error)
	})
}
async function _idbLMPut(key, modelName) {
	const db = await _openDb()
	return new Promise((res, rej) => {
		const tx = db.transaction('models', 'readwrite')
		tx.objectStore('models').put({ key, modelName })
		tx.oncomplete = res
		tx.onerror = () => rej(tx.error)
	})
}
async function _idbLMDelete(key) {
	const db = await _openDb()
	return new Promise((res, rej) => {
		const tx = db.transaction('models', 'readwrite')
		tx.objectStore('models').delete(key)
		tx.oncomplete = res
		tx.onerror = () => rej(tx.error)
	})
}

// ── public API ─────────────────────────────────────────────────────────────
window.golem = {
	// Convert a HuggingFace model name to its REGISTRY key.
	// e.g. 'Xenova/bert-base-uncased' → 'xenova-bert-base-uncased'
	modelKey(name) { return _modelNameToKey(name) },

	// True if the given registry key is a tokenizer instance held by golem.
	_isLoaded(key) { return _loadedTokenizers.has(key) },

	// True if the given registry key is a causal LM instance held by golem.loadLM.
	// Covers all models loaded via loadLM, including the GPT-2 shorthand (key: xenova-gpt2-lm).
	_isLMLoaded(key) { return _loadedLMs.has(key) },

	// True if the canonical GPT-2 model (Xenova/gpt2, key: xenova-gpt2-lm) is in memory.
	// Used by §3/§6 model_status guards to avoid clobbering REGISTRY when the main-thread
	// model is already loaded.
	_isModelLoaded() { return _loadedLMs.has('xenova-gpt2-lm') },

	// Load an AutoTokenizer by HuggingFace model name.
	// saveLocally (default true): write to IndexedDB for auto-restore on next visit.
	// Returns the AutoTokenizer instance.
	async loadTokenizer(modelName, saveLocally = true) {
		const key = _modelNameToKey(modelName)
		if (_loadedTokenizers.has(key)) return _loadedTokenizers.get(key)

		const wasPreregistered = !!REGISTRY[key]
		if (!wasPreregistered) {
			REGISTRY[key] = { label: modelName, size: null, status: 'loading', progress: null }
		}
		registrySet(key, { status: 'loading' })

		try {
			const tok = await AutoTokenizer.from_pretrained(modelName, {
				progress_callback: info => {
					if (info.status === 'progress') registrySet(key, { status: 'downloading', progress: info.progress })
					else if (info.status === 'done')  registrySet(key, { status: 'loading',     progress: null })
				},
			})
			_loadedTokenizers.set(key, tok)
			if (saveLocally) await _idbTokPut(key, modelName)
			registrySet(key, { status: 'ready', progress: null })
			return tok
		} catch (err) {
			if (wasPreregistered) registrySet(key, { status: 'error' })
			else registryDelete(key)
			throw err
		}
	},

	// Remove a tokenizer from memory and from IndexedDB.
	async unloadTokenizer(key) {
		_loadedTokenizers.delete(key)
		try { await _idbTokDelete(key) } catch {}
		registryDelete(key)
	},

	// List all tokenizers loaded via golem.loadTokenizer.
	tokenizers() {
		const out = {}
		for (const key of _loadedTokenizers.keys()) out[key] = REGISTRY[key]?.status ?? 'ready'
		return out
	},

	// Encode text with the named tokenizer.
	// callback(piece, id, index) is called for each token if provided.
	// Always returns [{piece, id}, …].
	tokenize(key, text, cb) {
		const tok = _loadedTokenizers.get(key)
		if (!tok) {
			const status = REGISTRY[key]?.status
			if (status) throw new Error(`Tokenizer "${key}" is not usable yet (status: ${status})`)
			throw new Error(`Unknown key "${key}" — run golem.tokenizers() to list loaded tokenizers`)
		}
		const encoded = tok(text, { add_special_tokens: false })
		const ids     = Array.from(encoded.input_ids.data)
		const tokens  = ids.map(id => ({ piece: tok.decode([id], { skip_special_tokens: false }), id }))
		if (cb) for (let i = 0; i < tokens.length; i++) cb(tokens[i].piece, tokens[i].id, i)
		return tokens
	},

	// Decode token IDs back to a string.
	decode(key, ids) {
		const tok = _loadedTokenizers.get(key)
		if (!tok) {
			const status = REGISTRY[key]?.status
			if (status) throw new Error(`Tokenizer "${key}" is not usable yet (status: ${status})`)
			throw new Error(`Unknown key "${key}" — run golem.tokenizers() to list loaded tokenizers`)
		}
		return tok.decode(ids, { skip_special_tokens: true })
	},

	// Load an arbitrary causal LM by HuggingFace model name via AutoModelForCausalLM.
	// Registry key is the model slug with a '-lm' suffix (e.g. 'Xenova/distilgpt2' →
	// 'xenova-distilgpt2-lm') to avoid collisions with tokenizer keys.
	// saveLocally (default true): persist in IndexedDB for auto-restore on next visit.
	// onProgress: optional callback forwarded from each progress_callback event.
	// Returns the AutoModelForCausalLM instance.
	async loadLM(modelName, saveLocally = true, onProgress = null) {
		const key = _modelNameToKey(modelName) + '-lm'
		if (_loadedLMs.has(key)) return _loadedLMs.get(key)

		if (!REGISTRY[key]) {
			REGISTRY[key] = { label: modelName, size: null, status: 'loading', progress: null }
		}
		registrySet(key, { status: 'loading' })

		try {
			const model = await AutoModelForCausalLM.from_pretrained(modelName, {
				quantized: true,
				progress_callback: info => {
					if (info.status === 'progress') {
						registrySet(key, { status: 'downloading', progress: info.progress })
						if (onProgress) onProgress(info)
					} else if (info.status === 'done') {
						registrySet(key, { status: 'loading', progress: null })
						if (onProgress) onProgress(info)
					}
				},
			})
			_loadedLMs.set(key, model)
			if (saveLocally) await _idbLMPut(key, modelName)
			registrySet(key, { status: 'ready', progress: null })
			return model
		} catch (err) {
			// Pre-declared entries (e.g. xenova-gpt2-lm) get status 'error';
			// dynamic entries are removed from REGISTRY entirely.
			if (_predeclaredKeys.has(key)) registrySet(key, { status: 'error' })
			else registryDelete(key)
			throw err
		}
	},

	// Remove a causal LM from memory and from IndexedDB.
	// Pre-declared entries (e.g. xenova-gpt2-lm) reset to 'cached' — files remain
	// in the browser cache. Dynamic entries are removed from REGISTRY entirely.
	async unloadLM(key) {
		_loadedLMs.delete(key)
		try { await _idbLMDelete(key) } catch {}
		if (_predeclaredKeys.has(key))
			registrySet(key, { status: 'cached', progress: null })
		else
			registryDelete(key)
	},

	// List all causal LMs loaded via golem.loadLM.
	// Returns { [registryKey]: status }
	models() {
		const out = {}
		for (const key of _loadedLMs.keys()) out[key] = REGISTRY[key]?.status ?? 'ready'
		return out
	},

	// Load the GPT-2 language model — shorthand for loadLM('Xenova/gpt2', false, onProgress).
	// Registry key: 'xenova-gpt2-lm'. Used by §2 (next-token prediction).
	// saveLocally is false so this pre-declared model is not written to the models store.
	async loadModel(onProgress) { return window.golem.loadLM('Xenova/gpt2', false, onProgress) },

	// Release the GPT-2 model — shorthand for unloadLM('xenova-gpt2-lm').
	async unloadModel() { return window.golem.unloadLM('xenova-gpt2-lm') },

	// Load the all-MiniLM-L6-v2 embedding model (wraps ensureEmbedder from shared.js).
	async loadEmbedder(onProgress) { return ensureEmbedder(onProgress) },

	// Embed text using all-MiniLM-L6-v2. Loads the model on first call.
	// Returns Array<number> of 384 dimensions.
	async embed(text) { return embed(text) },
}

// Auto-restore tokenizers saved in previous sessions.
;(async () => {
	let saved
	try { saved = await _idbTokGetAll() } catch { return }
	for (const { modelName } of saved) {
		try { await window.golem.loadTokenizer(modelName, false) } catch {}
	}
})()

// Auto-restore causal LMs saved in previous sessions.
;(async () => {
	let saved
	try { saved = await _idbLMGetAll() } catch { return }
	for (const { modelName } of saved) {
		try { await window.golem.loadLM(modelName, false) } catch {}
	}
})()
