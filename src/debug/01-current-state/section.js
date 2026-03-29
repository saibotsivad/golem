// ── debug panel: current asset state ──────────────────────────────────────
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
		Object.values(REGISTRY).map(({ label, size, status, progress }) => {
			const cls  = _debugStatusClass[status] || ''
			const text = status === 'downloading' && progress !== null
				? `downloading ${progress.toFixed(0)}%`
				: (_debugStatusLabel[status] || status)
			return `<tr><td>${label}</td><td style="color:#999">${size ?? ''}</td><td class="${cls}">${text}</td></tr>`
		}).join('')
}
registrySubscribe(renderCurrentState)
renderCurrentState()

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
