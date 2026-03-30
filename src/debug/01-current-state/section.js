// ── debug panel: current asset state ──────────────────────────────────────
// _debugClearFns is declared here (panel 01, runs first) so panel 02 can
// populate it. Keys match REGISTRY keys; values are async clear functions.
const _debugClearFns = new Map()

const _debugStatusClass = {
	ready: 'status-ready', cached: 'status-cached', absent: 'status-absent',
	downloading: 'status-downloading', loading: 'status-loading',
	error: 'status-error', unknown: 'status-unknown',
}
const _debugStatusLabel = {
	ready: 'ready', cached: 'cached', absent: 'not cached',
	loading: 'initializing\u2026', error: 'error', unknown: '\u2014',
}

function renderCurrentState() {
	document.getElementById('debug-state-rows').innerHTML =
		Object.entries(REGISTRY).map(([key, { label, size, status, progress }]) => {
			const cls  = _debugStatusClass[status] || ''
			const text = status === 'downloading' && progress !== null
				? `downloading ${progress.toFixed(0)}%`
				: (_debugStatusLabel[status] || status)
			const action = _debugClearFns.has(key)
				? `<button class="debug-clear-btn" data-clear-key="${key}">\u2715</button>`
				: ''
			return `<tr><td>${label}</td><td style="color:#999">${size ?? ''}</td><td class="${cls}">${text}</td><td>${action}</td></tr>`
		}).join('')
}
registrySubscribe(renderCurrentState)
renderCurrentState()

// Auto-wire ✕ clear buttons for vector indices managed by golem.
// Runs on every registry change; adds a clear fn whenever an index becomes ready/cached,
// self-removing when called so the button disappears after deletion.
registrySubscribe(() => {
	let added = false
	for (const key of Object.keys(window.golem.indexes())) {
		const status = REGISTRY[key]?.status
		if ((status === 'ready' || status === 'cached') && !_debugClearFns.has(key)) {
			_debugClearFns.set(key, async () => {
				_debugClearFns.delete(key)
				await window.golem.deleteIndex(key)
			})
			added = true
		}
	}
	if (added) renderCurrentState()
})

// Event delegation for clear buttons — attached once, survives innerHTML replacements
document.getElementById('debug-state-rows').addEventListener('click', e => {
	const btn = e.target.closest('[data-clear-key]')
	if (!btn) return
	const fn = _debugClearFns.get(btn.dataset.clearKey)
	if (fn) fn()
})

document.getElementById('debug-toggle-btn').addEventListener('click', e => {
	e.preventDefault()
	const panel    = document.getElementById('debug-panel')
	const sections = document.getElementById('sections')
	const btn      = e.currentTarget
	const showing  = !panel.hidden
	panel.hidden    = showing
	sections.hidden = !showing
	btn.textContent = showing ? 'debug' : 'back'
})
