// ── debug panel: load embedding model ──────────────────────────────────────
// Delegates loading/unloading to golem.js (window.golem).
// Owns the form UI and registers ✕ clear buttons in the asset table via
// _debugClearFns (declared in 01-current-state/section.js).

// Auto-wire clear buttons for embedder entries that are ready or cached.
// All embedder keys end with '-emb' (enforced by golem.loadEmb). Clicking ✕
// calls golem.unloadEmb, which terminates the Worker (if running), removes the
// IDB entry, and clears the model's files from the browser Cache API.
registrySubscribe(() => {
	let added = false
	for (const key of Object.keys(REGISTRY)) {
		const status = REGISTRY[key].status
		if (key.endsWith('-emb') && (status === 'ready' || status === 'cached') && !_debugClearFns.has(key)) {
			_debugClearFns.set(key, async () => {
				_debugClearFns.delete(key)
				await window.golem.unloadEmb(key)
			})
			added = true
		}
	}
	if (added) renderCurrentState()
})

const _debugEmbForm   = document.getElementById('debug-emb-form')
const _debugEmbInput  = document.getElementById('debug-emb-input')
const _debugEmbBtn    = document.getElementById('debug-emb-btn')
const _debugEmbStatus = document.getElementById('debug-emb-status')

_debugEmbForm.addEventListener('submit', async e => {
	e.preventDefault()
	const modelName = _debugEmbInput.value.trim()
	if (!modelName) return

	const key = window.golem.modelKey(modelName) + '-emb'
	if (window.golem._isEmbLoaded(key)) {
		_debugEmbStatus.textContent = `Already loaded (registry key: ${key})`
		return
	}

	_debugEmbBtn.disabled = true
	_debugEmbStatus.textContent = ''

	try {
		const saveLocally = document.getElementById('debug-emb-save').checked
		await window.golem.loadEmb(modelName, saveLocally)
		_debugEmbStatus.textContent = `Ready. Registry key: ${key}`
	} catch (err) {
		_debugEmbStatus.textContent = `Error: ${escHtml(err.message)}`
	} finally {
		_debugEmbBtn.disabled = false
	}
})
