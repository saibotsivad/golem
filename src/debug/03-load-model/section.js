// ── debug panel: load causal language model ────────────────────────────────
// Delegates loading/unloading to golem.js (window.golem).
// Owns the form UI and registers ✕ clear buttons in the asset table via
// _debugClearFns (declared in 01-current-state/section.js).

// Auto-wire clear buttons whenever any LM entry becomes ready.
// Two cases handled:
//   1. Fixed 'gpt2-lm' — managed by golem.loadModel/unloadModel; loaded by §2/§3
//   2. Arbitrary LMs  — managed by golem.loadLM/unloadLM; loaded via this form
// Calls renderCurrentState() explicitly after each registration because
// renderCurrentState's own subscriber fires first, missing the new clear fn.
registrySubscribe(() => {
	let added = false

	if (REGISTRY['gpt2-lm']?.status === 'ready' && !_debugClearFns.has('gpt2-lm')) {
		_debugClearFns.set('gpt2-lm', async () => {
			_debugClearFns.delete('gpt2-lm')
			await window.golem.unloadModel()
		})
		added = true
	}

	for (const key of Object.keys(REGISTRY)) {
		if (REGISTRY[key].status === 'ready' && window.golem._isLMLoaded(key) && !_debugClearFns.has(key)) {
			_debugClearFns.set(key, async () => {
				_debugClearFns.delete(key)
				await window.golem.unloadLM(key)
			})
			added = true
		}
	}

	if (added) renderCurrentState()
})

const _debugLmForm   = document.getElementById('debug-lm-form')
const _debugLmInput  = document.getElementById('debug-lm-input')
const _debugLmBtn    = document.getElementById('debug-lm-btn')
const _debugLmStatus = document.getElementById('debug-lm-status')

_debugLmForm.addEventListener('submit', async e => {
	e.preventDefault()
	const modelName = _debugLmInput.value.trim()
	if (!modelName) return

	const key = window.golem.modelKey(modelName) + '-lm'
	if (window.golem._isLMLoaded(key)) {
		_debugLmStatus.textContent = `Already loaded (registry key: ${key})`
		return
	}

	_debugLmBtn.disabled = true
	_debugLmStatus.textContent = ''

	try {
		const saveLocally = document.getElementById('debug-lm-save').checked
		await window.golem.loadLM(modelName, saveLocally)
		_debugLmStatus.textContent = `Ready. Registry key: ${key}`
	} catch (err) {
		_debugLmStatus.textContent = `Error: ${escHtml(err.message)}`
	} finally {
		_debugLmBtn.disabled = false
	}
})
