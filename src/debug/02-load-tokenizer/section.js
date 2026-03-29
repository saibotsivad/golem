// ── debug panel: load arbitrary tokenizer ─────────────────────────────────
const _debugLoadedTokenizers = new Map() // registryKey → AutoTokenizer instance

function _tokModelNameToKey(name) {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const _debugTokForm   = document.getElementById('debug-tok-form')
const _debugTokInput  = document.getElementById('debug-tok-input')
const _debugTokBtn    = document.getElementById('debug-tok-btn')
const _debugTokStatus = document.getElementById('debug-tok-status')

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
