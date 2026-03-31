// ── debug panel: memories ──────────────────────────────────────────────────
// Auto-wire a ✕ clear button in the state table for 'memories' whenever the
// store is non-empty. _debugClearFns and renderCurrentState are declared in
// panel 01-current-state which runs before this panel.
function _wireMemoriesClearBtn() {
	const status = REGISTRY['memories']?.status
	if (status === 'ready' && !_debugClearFns.has('memories')) {
		_debugClearFns.set('memories', async () => {
			_debugClearFns.delete('memories')
			await golem.clearMemories()
		})
		renderCurrentState()
	}
}
registrySubscribe(_wireMemoriesClearBtn)
_wireMemoriesClearBtn()
