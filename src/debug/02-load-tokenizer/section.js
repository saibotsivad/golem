// ── debug panel: load arbitrary tokenizer ─────────────────────────────────
const _debugLoadedTokenizers = new Map() // registryKey → AutoTokenizer instance

function _tokModelNameToKey(name) {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const _debugTokForm   = document.getElementById('debug-tok-form')
const _debugTokInput  = document.getElementById('debug-tok-input')
const _debugTokBtn    = document.getElementById('debug-tok-btn')
const _debugTokStatus = document.getElementById('debug-tok-status')

// ── console API ───────────────────────────────────────────────────────────
// Exposed on window.golem so a developer can use it from the browser console.
//
// golem.tokenizers()
//   Returns { [registryKey]: status } for every tokenizer known to the page —
//   both the static GPT-2 tokenizer loaded by §1 and any loaded via this panel.
//
// golem.tokenize(key, text[, callback])
//   Encodes `text` with the named tokenizer.
//   If `callback` is provided it is called as callback(piece, id, index) for
//   each token — useful for writing and testing iterative token-processing code.
//   Always returns an array of { piece, id } objects regardless.
//   `piece` is the decoded text the token contributes (e.g. ' world', 'ization').
//
// golem.decode(key, ids)
//   Decodes an array of token IDs back to a string. Closes the round-trip after
//   golem.tokenize so you can verify encode→decode round-trips correctly.
//
// Error messages distinguish "key exists but not ready yet" from "unknown key"
// so you know whether to wait or check your spelling.
window.golem = {
	tokenizers() {
		const out = {}
		if (REGISTRY['gpt2-tokenizer']) out['gpt2-tokenizer'] = REGISTRY['gpt2-tokenizer'].status
		for (const key of _debugLoadedTokenizers.keys()) out[key] = REGISTRY[key]?.status ?? 'ready'
		return out
	},

	tokenize(key, text, cb) {
		const tok = key === 'gpt2-tokenizer' ? tokenizer : _debugLoadedTokenizers.get(key)
		if (!tok) {
			const status = REGISTRY[key]?.status
			if (status) throw new Error(`Tokenizer "${key}" is not usable yet (status: ${status})`)
			throw new Error(`Unknown tokenizer key "${key}" — run golem.tokenizers() to list loaded tokenizers`)
		}
		const encoded = tok(text, { add_special_tokens: false })
		const ids     = Array.from(encoded.input_ids.data)
		const tokens  = ids.map((id, i) => ({ piece: tok.decode([id], { skip_special_tokens: false }), id }))
		if (cb) for (let i = 0; i < tokens.length; i++) cb(tokens[i].piece, tokens[i].id, i)
		return tokens
	},

	decode(key, ids) {
		const tok = key === 'gpt2-tokenizer' ? tokenizer : _debugLoadedTokenizers.get(key)
		if (!tok) {
			const status = REGISTRY[key]?.status
			if (status) throw new Error(`Tokenizer "${key}" is not usable yet (status: ${status})`)
			throw new Error(`Unknown tokenizer key "${key}" — run golem.tokenizers() to list loaded tokenizers`)
		}
		return tok.decode(ids, { skip_special_tokens: true })
	},
}

_debugTokForm.addEventListener('submit', async e => {
	e.preventDefault()
	const modelName = _debugTokInput.value.trim()
	if (!modelName) return

	const key = _tokModelNameToKey(modelName)

	if (_debugLoadedTokenizers.has(key)) {
		_debugTokStatus.textContent = `Already loaded (registry key: ${key})`
		return
	}

	_debugTokBtn.disabled = true
	_debugTokStatus.textContent = ''

	// Create registry entry, then call registrySet to notify listeners
	REGISTRY[key] = { label: modelName, size: null, status: 'loading', progress: null }
	registrySet(key, { status: 'loading' }) // Object.assign is a no-op here; fires listeners

	try {
		const tok = await AutoTokenizer.from_pretrained(modelName, {
			progress_callback: info => {
				if (info.status === 'progress') registrySet(key, { status: 'downloading', progress: info.progress })
				else if (info.status === 'done')  registrySet(key, { status: 'loading',     progress: null })
			},
		})
		registrySet(key, { status: 'ready', progress: null })
		_debugLoadedTokenizers.set(key, tok)
		_debugTokStatus.textContent = `Ready. Registry key: ${key}`
	} catch (err) {
		registrySet(key, { status: 'error', progress: null })
		_debugTokStatus.textContent = `Error: ${escHtml(err.message)}`
	} finally {
		_debugTokBtn.disabled = false
	}
})
