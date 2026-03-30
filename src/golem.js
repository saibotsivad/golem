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
// golem.loadEmb(name[,save,prog])  → Promise<void>  (any HuggingFace feature-extraction model)
// golem.unloadEmb(key)             → Promise<void>
// golem.embedders()                → { [key]: status }
// golem.embedWith(key, text)       → Promise<number[]>  (unit vector)
// golem.loadEmbedder([onProgress]) → Promise<void>  (all-MiniLM-L6-v2 shorthand)
// golem.embed(text)                → Promise<number[]>  (384-dim unit vector, auto-loads MiniLM)
//
// Vector index management
// golem.loadIndex(key, label)               → Promise<Float32Array|null>
// golem.saveIndex(key, label, data)         → Promise<void>
// golem.deleteIndex(key)                    → Promise<void>
// golem.indexes()                           → { [key]: status }

const _loadedTokenizers = new Map() // registryKey → AutoTokenizer instance
const _loadedLMs        = new Map() // registryKey → AutoModelForCausalLM instance
const _loadedEmbedders  = new Map() // registryKey → { worker, nextId, pending }
const _indexKeys        = new Set() // registryKeys that are vector indices

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

// ── IDB helpers — search (index) store ────────────────────────────────────
// Uses _openDb() from shared.js (same 'golem' DB, 'search' store).
// The 'search' store uses out-of-line keys (no keyPath), so put() takes (value, key).
async function _idbIdxGet(key) {
	const db = await _openDb()
	return new Promise((res, rej) => {
		const req = db.transaction('search', 'readonly').objectStore('search').get(key)
		req.onsuccess = () => res(req.result ?? null)
		req.onerror   = () => rej(req.error)
	})
}
async function _idbIdxPut(key, value) {
	const db = await _openDb()
	return new Promise((res, rej) => {
		const tx = db.transaction('search', 'readwrite')
		tx.objectStore('search').put(value, key)
		tx.oncomplete = res
		tx.onerror    = () => rej(tx.error)
	})
}
async function _idbIdxDelete(key) {
	const db = await _openDb()
	return new Promise((res, rej) => {
		const tx = db.transaction('search', 'readwrite')
		tx.objectStore('search').delete(key)
		tx.oncomplete = res
		tx.onerror    = () => rej(tx.error)
	})
}
async function _idbIdxGetAllKeys() {
	const db = await _openDb()
	return new Promise((res, rej) => {
		const req = db.transaction('search', 'readonly').objectStore('search').getAllKeys()
		req.onsuccess = () => res(req.result)
		req.onerror   = () => rej(req.error)
	})
}

// ── embedder worker factory ────────────────────────────────────────────────
// Each embedder gets its own Worker with the model name baked in.
function _makeEmbedWorkerSrc(modelName) {
	return `
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js'
env.allowLocalModels = false

let _pipePromise = null

function getPipe() {
	if (!_pipePromise) {
		_pipePromise = pipeline('feature-extraction', ${JSON.stringify(modelName)}, {
			quantized: true,
			progress_callback: info => self.postMessage({ type: 'model_progress', info }),
		}).then(p => { self.postMessage({ type: 'model_ready' }); return p })
	}
	return _pipePromise
}

self.onmessage = async ({ data }) => {
	if (data.type === 'load') {
		await getPipe()
	} else if (data.type === 'embed') {
		try {
			const p   = await getPipe()
			const out = await p(data.text, { pooling: 'mean', normalize: true })
			const vec = new Float32Array(out.data)
			self.postMessage({ type: 'result', id: data.id, vec }, [vec.buffer])
		} catch (err) {
			self.postMessage({ type: 'error', id: data.id, message: err.message })
		}
	}
}
`
}

// ── IDB helpers — embedders store ─────────────────────────────────────────
async function _idbEmbGetAll() {
	const db = await _openDb()
	return new Promise((res, rej) => {
		const req = db.transaction('embedders', 'readonly').objectStore('embedders').getAll()
		req.onsuccess = () => res(req.result)
		req.onerror = () => rej(req.error)
	})
}
async function _idbEmbPut(key, modelName) {
	const db = await _openDb()
	return new Promise((res, rej) => {
		const tx = db.transaction('embedders', 'readwrite')
		tx.objectStore('embedders').put({ key, modelName })
		tx.oncomplete = res
		tx.onerror = () => rej(tx.error)
	})
}
async function _idbEmbDelete(key) {
	const db = await _openDb()
	return new Promise((res, rej) => {
		const tx = db.transaction('embedders', 'readwrite')
		tx.objectStore('embedders').delete(key)
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

	// True if the given registry key is an embedder held by golem.loadEmb.
	_isEmbLoaded(key) { return _loadedEmbedders.has(key) },

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

	// Load an arbitrary feature-extraction (embedding) model by HuggingFace name.
	// Each model runs in its own Web Worker. Registry key is slug + '-emb'.
	// saveLocally (default true): persist in IndexedDB for auto-restore on next visit.
	// onProgress: optional callback forwarded from each progress_callback event.
	async loadEmb(modelName, saveLocally = true, onProgress = null) {
		const key = _modelNameToKey(modelName) + '-emb'
		if (_loadedEmbedders.has(key)) return

		if (!REGISTRY[key]) {
			REGISTRY[key] = { label: modelName, size: null, status: 'loading', progress: null }
		}
		registrySet(key, { status: 'loading', progress: null })

		const worker = new Worker(
			URL.createObjectURL(new Blob([_makeEmbedWorkerSrc(modelName)], { type: 'text/javascript' })),
			{ type: 'module' }
		)
		const entry = { worker, nextId: 0, pending: new Map(), progressListeners: new Set() }
		if (onProgress) entry.progressListeners.add(onProgress)

		const readyPromise = new Promise((resolve, reject) => {
			worker.onmessage = ({ data }) => {
				if (data.type === 'model_progress') {
					const { info } = data
					if (info.status === 'progress') registrySet(key, { status: 'downloading', progress: info.progress })
					else if (info.status === 'done') registrySet(key, { status: 'loading', progress: null })
					for (const fn of entry.progressListeners) fn(info)
				} else if (data.type === 'model_ready') {
					registrySet(key, { status: 'ready', progress: null })
					resolve()
				} else if (data.type === 'result') {
					const cb = entry.pending.get(data.id)
					if (cb) { entry.pending.delete(data.id); cb.resolve(Array.from(data.vec)) }
				} else if (data.type === 'error') {
					const cb = entry.pending.get(data.id)
					if (cb) { entry.pending.delete(data.id); cb.reject(new Error(data.message)) }
					else reject(new Error(data.message))
				}
			}
			worker.onerror = err => reject(err)
		})

		worker.postMessage({ type: 'load' })
		try {
			await readyPromise
		} catch (err) {
			worker.terminate()
			if (_predeclaredKeys.has(key)) registrySet(key, { status: 'error' })
			else registryDelete(key)
			throw err
		}

		_loadedEmbedders.set(key, entry)
		if (saveLocally) await _idbEmbPut(key, modelName)
		if (onProgress) entry.progressListeners.delete(onProgress)
	},

	// Remove an embedder from memory, terminate its Worker, and remove from IndexedDB.
	// Pre-declared entries reset to 'cached'; dynamic entries are removed from REGISTRY.
	async unloadEmb(key) {
		const entry = _loadedEmbedders.get(key)
		if (entry) {
			for (const [, cb] of entry.pending) cb.reject(new Error('Embedder unloaded'))
			entry.pending.clear()
			entry.worker.terminate()
			_loadedEmbedders.delete(key)
		}
		try { await _idbEmbDelete(key) } catch {}
		if (_predeclaredKeys.has(key))
			registrySet(key, { status: 'cached', progress: null })
		else
			registryDelete(key)
	},

	// List all embedders loaded via golem.loadEmb.
	// Returns { [registryKey]: status }
	embedders() {
		const out = {}
		for (const key of _loadedEmbedders.keys()) out[key] = REGISTRY[key]?.status ?? 'ready'
		return out
	},

	// Embed text using a specific embedder by registry key.
	// Returns Array<number> (unit vector with model-specific dimensions).
	async embedWith(key, text) {
		const entry = _loadedEmbedders.get(key)
		if (!entry) throw new Error(`Embedder "${key}" is not loaded — call golem.loadEmb() first`)
		const id = entry.nextId++
		return new Promise((resolve, reject) => {
			entry.pending.set(id, { resolve, reject })
			entry.worker.postMessage({ type: 'embed', id, text })
		})
	},

	// Load all-MiniLM-L6-v2 (shorthand for loadEmb('Xenova/all-MiniLM-L6-v2', false, onProgress)).
	// Used by §4, §5, §6. saveLocally is false so this pre-declared entry is not written to IDB.
	async loadEmbedder(onProgress) { return window.golem.loadEmb('Xenova/all-MiniLM-L6-v2', false, onProgress) },

	// Embed text using all-MiniLM-L6-v2. Auto-loads on first call.
	// Returns Array<number> of 384 dimensions.
	async embed(text) {
		await window.golem.loadEmbedder()
		return window.golem.embedWith('xenova-all-minilm-l6-v2-emb', text)
	},

	// ── Vector index management ───────────────────────────────────────────────

	// Load an embedding index from IndexedDB.
	// Initializes the REGISTRY entry with the given label; updates label if entry
	// already exists. Returns Float32Array if found in IDB, null if absent.
	// Never throws — IDB errors are treated as absent.
	async loadIndex(key, label) {
		if (!REGISTRY[key]) {
			REGISTRY[key] = { label, size: null, status: 'unknown', progress: null }
		} else if (label) {
			REGISTRY[key].label = label
		}
		_indexKeys.add(key)
		try {
			const data = await _idbIdxGet(key)
			registrySet(key, { status: data ? 'ready' : 'absent' })
			return data ?? null
		} catch {
			registrySet(key, { status: 'absent' })
			return null
		}
	},

	// Save an embedding index to IndexedDB and mark it ready in the registry.
	async saveIndex(key, label, data) {
		if (!REGISTRY[key]) {
			REGISTRY[key] = { label, size: null, status: 'unknown', progress: null }
		} else if (label) {
			REGISTRY[key].label = label
		}
		_indexKeys.add(key)
		await _idbIdxPut(key, data)
		registrySet(key, { status: 'ready', progress: null })
	},

	// Delete an embedding index from IndexedDB and mark it absent in the registry.
	async deleteIndex(key) {
		await _idbIdxDelete(key)
		if (REGISTRY[key]) registrySet(key, { status: 'absent', progress: null })
	},

	// List all tracked embedding indices.
	// Returns { [key]: status } matching the shape of golem.models() / golem.tokenizers().
	indexes() {
		const out = {}
		for (const key of _indexKeys) out[key] = REGISTRY[key]?.status ?? 'unknown'
		return out
	},
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

// Auto-restore embedders saved in previous sessions.
;(async () => {
	let saved
	try { saved = await _idbEmbGetAll() } catch { return }
	for (const { modelName } of saved) {
		try { await window.golem.loadEmb(modelName, false) } catch {}
	}
})()

// Auto-discover vector indices saved in previous sessions.
// Sections call loadIndex() on page load with proper labels; this runs concurrently
// and registers any IDB keys that arrive first, using the key itself as a fallback label.
;(async () => {
	let keys
	try { keys = await _idbIdxGetAllKeys() } catch { return }
	for (const key of keys) {
		_indexKeys.add(key)
		if (!REGISTRY[key]) {
			REGISTRY[key] = { label: key, size: null, status: 'cached', progress: null }
			registrySet(key, { status: 'cached' })
		} else if (REGISTRY[key].status === 'unknown') {
			registrySet(key, { status: 'cached' })
		}
	}
})()
