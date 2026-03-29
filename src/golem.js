// ── golem public API ───────────────────────────────────────────────────────
// window.golem is the developer-facing API for loading and using models.
// It is in scope for all debug panels and section JS files, and is accessible
// from the browser console for interactive development.
//
// golem.modelKey(name)          → registry key string
// golem.loadTokenizer(name)     → Promise<AutoTokenizer>
// golem.unloadTokenizer(key)    → Promise<void>
// golem.tokenizers()            → { [key]: status }
// golem.tokenize(key, text[, cb]) → [{piece, id}, …]
// golem.decode(key, ids)        → string
// golem.loadModel([onProgress]) → Promise<GPT2LMHeadModel>
// golem.loadEmbedder([onProgress]) → Promise<void>

const _loadedTokenizers = new Map() // registryKey → AutoTokenizer instance

function _modelNameToKey(name) {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// ── IndexedDB: persist tokenizer names so they auto-restore on next load ──
// DB 'golem', store 'tokenizers', keyPath 'key', value { key, modelName }
function _openGolemDb() {
	return new Promise((res, rej) => {
		const r = indexedDB.open('golem-api', 1)
		r.onupgradeneeded = e => e.target.result.createObjectStore('tokenizers', { keyPath: 'key' })
		r.onsuccess = e => res(e.target.result)
		r.onerror = () => rej(r.error)
	})
}
async function _idbTokGetAll() {
	const db = await _openGolemDb()
	return new Promise((res, rej) => {
		const req = db.transaction('tokenizers', 'readonly').objectStore('tokenizers').getAll()
		req.onsuccess = () => res(req.result)
		req.onerror = () => rej(req.error)
	})
}
async function _idbTokPut(key, modelName) {
	const db = await _openGolemDb()
	return new Promise((res, rej) => {
		const tx = db.transaction('tokenizers', 'readwrite')
		tx.objectStore('tokenizers').put({ key, modelName })
		tx.oncomplete = res
		tx.onerror = () => rej(tx.error)
	})
}
async function _idbTokDelete(key) {
	const db = await _openGolemDb()
	return new Promise((res, rej) => {
		const tx = db.transaction('tokenizers', 'readwrite')
		tx.objectStore('tokenizers').delete(key)
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
	// Used by debug panels to distinguish dynamic from static registry entries.
	_isLoaded(key) { return _loadedTokenizers.has(key) },

	// Load an AutoTokenizer by HuggingFace model name.
	// saveLocally (default true): write the name to IndexedDB so it auto-restores
	// on next page visit by re-reading from browser cache (no re-download needed).
	// Returns the AutoTokenizer instance.
	async loadTokenizer(modelName, saveLocally = true) {
		const key = _modelNameToKey(modelName)
		if (_loadedTokenizers.has(key)) return _loadedTokenizers.get(key)

		REGISTRY[key] = { label: modelName, size: null, status: 'loading', progress: null }
		registrySet(key, { status: 'loading' }) // Object.assign no-op; fires listeners to surface new row

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
			registryDelete(key) // remove stuck entry; caller surfaces the error
			throw err
		}
	},

	// Remove a tokenizer from memory and from IndexedDB.
	// The REGISTRY row disappears and the auto-restore entry is deleted.
	async unloadTokenizer(key) {
		_loadedTokenizers.delete(key)
		try { await _idbTokDelete(key) } catch {}
		registryDelete(key)
	},

	// List all tokenizers known to the page: the static GPT-2 tokenizer (§1)
	// and any loaded via golem.loadTokenizer.
	// Returns { [registryKey]: status }
	tokenizers() {
		const out = {}
		if (REGISTRY['gpt2-tokenizer']) out['gpt2-tokenizer'] = REGISTRY['gpt2-tokenizer'].status
		for (const key of _loadedTokenizers.keys()) out[key] = REGISTRY[key]?.status ?? 'ready'
		return out
	},

	// Encode text with the named tokenizer.
	// callback(piece, id, index) is called for each token if provided — mirrors
	// real iterative token-processing code so console snippets transfer directly.
	// Always returns [{piece, id}, …].
	// 'gpt2-tokenizer' refers to the tokenizer loaded by §1.
	tokenize(key, text, cb) {
		const tok = key === 'gpt2-tokenizer' ? tokenizer : _loadedTokenizers.get(key)
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

	// Decode token IDs back to a string. Closes the round-trip from tokenize.
	// 'gpt2-tokenizer' refers to the tokenizer loaded by §1.
	decode(key, ids) {
		const tok = key === 'gpt2-tokenizer' ? tokenizer : _loadedTokenizers.get(key)
		if (!tok) {
			const status = REGISTRY[key]?.status
			if (status) throw new Error(`Tokenizer "${key}" is not usable yet (status: ${status})`)
			throw new Error(`Unknown key "${key}" — run golem.tokenizers() to list loaded tokenizers`)
		}
		return tok.decode(ids, { skip_special_tokens: true })
	},

	// Load the GPT-2 language model (wraps ensureModel from shared.js).
	async loadModel(onProgress) { return ensureModel(onProgress) },

	// Load the all-MiniLM-L6-v2 embedding model (wraps ensureEmbedder from shared.js).
	async loadEmbedder(onProgress) { return ensureEmbedder(onProgress) },
}

// Auto-restore tokenizers saved in previous sessions.
// Runs async so it doesn't block page init — debug panels subscribe to REGISTRY
// synchronously before any awaits resolve, so they catch all status updates.
;(async () => {
	let saved
	try { saved = await _idbTokGetAll() } catch { return }
	for (const { modelName } of saved) {
		try { await window.golem.loadTokenizer(modelName, false) } catch {}
	}
})()
