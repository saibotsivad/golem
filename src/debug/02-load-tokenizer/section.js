// ── debug panel: load arbitrary tokenizer ─────────────────────────────────
// Delegates all loading/unloading to golem.js (window.golem).
// Owns the debug form UI and manages clear buttons in the asset table via
// _debugClearFns, which is declared in 01-current-state/section.js and runs
// before this panel in build order.

// Auto-register clear buttons whenever a golem-managed tokenizer becomes ready.
// Fires on every REGISTRY change; acts only on newly-ready entries.
// Calls renderCurrentState() explicitly because renderCurrentState subscribes
// before this listener does, so by the time this fires the render has already
// run without the new clear button — we need a second pass.
registrySubscribe(() => {
	let added = false
	for (const key of Object.keys(REGISTRY)) {
		if (REGISTRY[key].status === 'ready' && window.golem._isLoaded(key) && !_debugClearFns.has(key)) {
			_debugClearFns.set(key, async () => {
				_debugClearFns.delete(key)
				await window.golem.unloadTokenizer(key)
			})
			added = true
		}
	}
	if (added) renderCurrentState()
})

const _debugTokForm   = document.getElementById('debug-tok-form')
const _debugTokInput  = document.getElementById('debug-tok-input')
const _debugTokBtn    = document.getElementById('debug-tok-btn')
const _debugTokStatus = document.getElementById('debug-tok-status')

_debugTokForm.addEventListener('submit', async e => {
	e.preventDefault()
	const modelName = _debugTokInput.value.trim()
	if (!modelName) return

	const key = window.golem.modelKey(modelName)
	if (window.golem._isLoaded(key)) {
		_debugTokStatus.textContent = `Already loaded (registry key: ${key})`
		return
	}

	_debugTokBtn.disabled = true
	_debugTokStatus.textContent = ''

	try {
		const saveLocally = document.getElementById('debug-tok-save').checked
		await window.golem.loadTokenizer(modelName, saveLocally)
		_debugTokStatus.textContent = `Ready. Registry key: ${key}`
	} catch (err) {
		_debugTokStatus.textContent = `Error: ${escHtml(err.message)}`
	} finally {
		_debugTokBtn.disabled = false
	}
})
