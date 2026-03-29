// ── debug panel: load GPT-2 language model ─────────────────────────────────
// Delegates loading/unloading to golem.js (window.golem).
// Owns the load button UI and registers the ✕ clear button in the asset table
// via _debugClearFns (declared in 01-current-state/section.js).

// Auto-wire the clear button whenever the model becomes ready — covers both
// explicit loads via this panel and loads triggered by §2/§3 section code.
// Calls renderCurrentState() explicitly after registering because
// renderCurrentState's own subscriber fires before this one, so the ✕ button
// would not appear until the next REGISTRY change without the manual call.
registrySubscribe(() => {
	if (REGISTRY['gpt2-lm']?.status === 'ready' && window.golem._isModelLoaded() && !_debugClearFns.has('gpt2-lm')) {
		_debugClearFns.set('gpt2-lm', async () => {
			_debugClearFns.delete('gpt2-lm')
			await window.golem.unloadModel()
		})
		renderCurrentState()
	}
})

const _debugLmBtn    = document.getElementById('debug-lm-btn')
const _debugLmStatus = document.getElementById('debug-lm-status')

_debugLmBtn.addEventListener('click', async () => {
	if (window.golem._isModelLoaded()) {
		_debugLmStatus.textContent = 'Already loaded (registry key: gpt2-lm)'
		return
	}

	_debugLmBtn.disabled = true
	_debugLmStatus.textContent = ''

	try {
		await window.golem.loadModel()
		_debugLmStatus.textContent = 'Ready. Registry key: gpt2-lm'
	} catch (err) {
		_debugLmStatus.textContent = `Error: ${escHtml(err.message)}`
	} finally {
		_debugLmBtn.disabled = false
	}
})
