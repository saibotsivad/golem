// ── debug panel: load embedding model ──────────────────────────────────────
// Delegates loading/unloading to golem.js (window.golem).
// Owns the form UI and registers ✕ clear buttons in the asset table via
// _debugClearFns (declared in 01-current-state/section.js).

// Auto-wire clear buttons whenever any embedder entry becomes ready.
// All embedders are managed through golem.loadEmb/_isEmbLoaded, so a single
// loop covers all cases including the canonical all-MiniLM loaded via
// golem.loadEmbedder() / golem.embed().
registrySubscribe(() => {
	let added = false
	for (const key of Object.keys(REGISTRY)) {
		if (REGISTRY[key].status === 'ready' && window.golem._isEmbLoaded(key) && !_debugClearFns.has(key)) {
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
