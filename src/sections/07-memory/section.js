// ── §7 memory ───────────────────────────────────────────────────────────────
{
const DIMS = 384

const addForm     = document.getElementById('mem-add-form')
const addInput    = document.getElementById('mem-add-input')
const addBtn      = document.getElementById('mem-add-btn')
const addStatus   = document.getElementById('mem-add-status')
const listWrap    = document.getElementById('mem-list-wrap')
const listEl      = document.getElementById('mem-list')
const countEl     = document.getElementById('mem-count')
const clearAllBtn = document.getElementById('mem-clear-all-btn')

let _memories = []  // [{id, text, vec: Float32Array}]

function vecScale(vec) {
	let max = 0
	for (let i = 0; i < vec.length; i++) if (Math.abs(vec[i]) > max) max = Math.abs(vec[i])
	return max || 1
}

function renderList() {
	countEl.textContent = `${_memories.length} memor${_memories.length === 1 ? 'y' : 'ies'}`
	listWrap.hidden = _memories.length === 0
	listEl.innerHTML = ''
	for (const mem of _memories) listEl.appendChild(makeMemRow(mem))
}

function makeMemRow(mem) {
	const row = document.createElement('div')
	row.className = 'mem-row'

	const canvas = document.createElement('canvas')
	canvas.className = 'mem-canvas'
	canvas.width  = DIMS
	canvas.height = 8
	drawEmbedding(canvas, mem.vec, vecScale(mem.vec))

	const body = document.createElement('div')
	body.className = 'mem-body'

	const textEl = document.createElement('div')
	textEl.className = 'mem-text'
	textEl.textContent = mem.text

	const actions = document.createElement('div')
	actions.className = 'mem-actions'

	const editBtn = document.createElement('button')
	editBtn.type = 'button'
	editBtn.textContent = 'edit'
	editBtn.addEventListener('click', () => startEdit(body, mem))

	const delBtn = document.createElement('button')
	delBtn.type = 'button'
	delBtn.textContent = 'delete'
	delBtn.addEventListener('click', () => handleDelete(mem.id))

	actions.append(editBtn, delBtn)
	body.append(textEl, actions)
	row.append(canvas, body)
	return row
}

function startEdit(body, mem) {
	const textEl  = body.querySelector('.mem-text')
	const actions = body.querySelector('.mem-actions')

	const ta = document.createElement('textarea')
	ta.className = 'mem-edit-ta'
	ta.value = mem.text
	ta.rows = 2

	const saveBtn = document.createElement('button')
	saveBtn.type = 'button'
	saveBtn.textContent = 'save'

	const cancelBtn = document.createElement('button')
	cancelBtn.type = 'button'
	cancelBtn.textContent = 'cancel'

	cancelBtn.addEventListener('click', () => renderList())

	saveBtn.addEventListener('click', async () => {
		const newText = ta.value.trim()
		if (!newText) return
		saveBtn.disabled = true
		saveBtn.textContent = 'embedding\u2026'
		try {
			const vec = new Float32Array(await golem.embed(newText))
			await golem.saveMemory(mem.id, newText, vec)
			mem.text = newText
			mem.vec  = vec
			renderList()
		} catch (err) {
			saveBtn.disabled = false
			saveBtn.textContent = 'save'
		}
	})

	textEl.replaceWith(ta)
	actions.innerHTML = ''
	actions.append(saveBtn, cancelBtn)
	ta.focus()
}

async function handleDelete(id) {
	await golem.deleteMemory(id)
	_memories = _memories.filter(m => m.id !== id)
	if (_memories.length === 0) registrySet('memories', { status: 'absent' })
	renderList()
}

clearAllBtn.addEventListener('click', async () => {
	await golem.clearMemories()
	_memories = []
	renderList()
})

addForm.addEventListener('submit', async e => {
	e.preventDefault()
	const text = addInput.value.trim()
	if (!text) return
	addBtn.disabled = true
	addStatus.textContent = 'Initializing embedder\u2026'
	try {
		await golem.loadEmbedder(info => {
			if (info.status === 'progress')
				addStatus.textContent = `Downloading model: ${info.progress.toFixed(0)}%`
			else if (info.status === 'done')
				addStatus.textContent = 'Loading model\u2026'
		})
		addStatus.textContent = 'Embedding\u2026'
		const vec = new Float32Array(await golem.embed(text))
		const id  = crypto.randomUUID()
		await golem.saveMemory(id, text, vec)
		_memories.push({ id, text, vec })
		addInput.value = ''
		addStatus.textContent = ''
		renderList()
	} catch (err) {
		addStatus.textContent = 'Error: ' + err.message
	} finally {
		addBtn.disabled = false
	}
})

// Load persisted memories on page init
;(async () => {
	_memories = await golem.loadMemories()
	renderList()
})()
}
