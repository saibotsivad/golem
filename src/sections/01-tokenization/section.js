// ── §1 tokenization ───────────────────────────────────────────────────────
{
const tokStatus = document.getElementById('tokenize-status')
const tokBtn    = document.getElementById('tokenize-btn')
const tokInput  = document.getElementById('tokenize-input')

let tokenizer = null
golem.loadTokenizer('Xenova/gpt2', false)
	.then(tok => {
		tokenizer = tok
		tokStatus.textContent = ''
		tokBtn.disabled = false
		tokInput.focus()
	})
	.catch(err => {
		tokStatus.textContent = 'Failed to load tokenizer: ' + err.message
	})

const tokResults = document.getElementById('tokenize-results')
const tokSummary = document.getElementById('token-summary')
const tokVisual  = document.getElementById('token-visual')
const tokIds     = document.getElementById('token-ids')

document.getElementById('tokenize-form').addEventListener('submit', e => {
	e.preventDefault()
	const text = tokInput.value
	if (!text || !tokenizer) return

	const encoded = tokenizer(text, { add_special_tokens: false })
	const ids   = Array.from(encoded.input_ids.data)
	const pieces = ids.map(id => tokenizer.decode([id], { skip_special_tokens: false }))

	tokSummary.textContent = `${ids.length} token${ids.length !== 1 ? 's' : ''}`
	tokVisual.innerHTML = pieces
		.map((piece, i) => `<span class="tok" title="id\u00a0${ids[i]}">${escHtml(piece)}</span>`)
		.join('')
	tokIds.textContent = 'IDs: ' + ids.join(', ')
	tokResults.hidden = false
	tokStatus.textContent = ''
})
}
