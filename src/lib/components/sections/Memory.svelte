<script lang="ts">
	import { golem } from '$lib/golem/golem'
	import { registrySet } from '$lib/golem/registry.svelte'
	import type { StoredMemory } from '$lib/golem/types'
	import { drawEmbedding, vecScale } from '$lib/ml/canvas'

	const DIMS = 384

	let memories = $state<StoredMemory[]>([])
	let addInput = $state('')
	let addBusy = $state(false)
	let addStatus = $state('')

	let editingId = $state<string | null>(null)
	let editText = $state('')
	let editBusy = $state(false)

	$effect(() => {
		golem.loadMemories().then((m) => {
			memories = m
		})
	})

	// Svelte action: paint the memory's embedding vector onto its canvas and
	// repaint whenever the vector changes.
	function embeddingCanvas(node: HTMLCanvasElement, vec: Float32Array) {
		const draw = (v: Float32Array) => drawEmbedding(node, v, vecScale(v))
		draw(vec)
		return { update: draw }
	}

	async function add(e: SubmitEvent) {
		e.preventDefault()
		const text = addInput.trim()
		if (!text) return
		addBusy = true
		addStatus = 'Initializing embedder…'
		try {
			await golem.loadEmbedder((info) => {
				if (info.status === 'progress') addStatus = `Downloading model: ${(info.progress ?? 0).toFixed(0)}%`
				else if (info.status === 'done') addStatus = 'Loading model…'
			})
			addStatus = 'Embedding…'
			const vec = new Float32Array(await golem.embed(text))
			const id = crypto.randomUUID()
			await golem.saveMemory(id, text, vec)
			memories = [...memories, { id, text, vec }]
			addInput = ''
			addStatus = ''
		} catch (err) {
			addStatus = 'Error: ' + (err instanceof Error ? err.message : String(err))
		} finally {
			addBusy = false
		}
	}

	function startEdit(mem: StoredMemory) {
		editingId = mem.id
		editText = mem.text
	}

	function cancelEdit() {
		editingId = null
	}

	async function saveEdit(mem: StoredMemory) {
		const newText = editText.trim()
		if (!newText) return
		editBusy = true
		try {
			const vec = new Float32Array(await golem.embed(newText))
			await golem.saveMemory(mem.id, newText, vec)
			memories = memories.map((m) => (m.id === mem.id ? { ...m, text: newText, vec } : m))
			editingId = null
		} catch {
			/* leave editor open on failure */
		} finally {
			editBusy = false
		}
	}

	async function remove(id: string) {
		await golem.deleteMemory(id)
		memories = memories.filter((m) => m.id !== id)
		if (memories.length === 0) registrySet('memories', { status: 'absent' })
	}

	async function clearAll() {
		await golem.clearMemories()
		memories = []
	}
</script>

<h2>§7 — Memory</h2>
<p>
	An agent's "memory" is a writable version of the retrieval index from §5–§6. Each fact is embedded once and stored
	in IndexedDB — the same technique used to build the static corpus in §6, but now you control what goes in. When you
	query the agent in the next section, these memories will be retrieved by similarity and injected into the prompt as
	context, closing the loop from storage to generation.
</p>
<p class="param-note">
	Add a few facts about yourself or anything you want the agent to remember: <em>"I prefer concise explanations"</em>,
	<em>"I am a machine learning engineer"</em>, <em>"My favorite programming language is JavaScript"</em>.
</p>

<form onsubmit={add}>
	<textarea class="mem-add-input" bind:value={addInput} placeholder="Enter a fact or preference to remember…" rows="2"></textarea>
	<button type="submit" class="mem-add-btn" disabled={addBusy}>Add memory  [~23 MB embedder, same as §4–§6]</button>
</form>
<div class="section-status">{addStatus}</div>

{#if memories.length > 0}
	<div class="mem-list-wrap">
		<div class="mem-list-header">
			<span class="mem-count">{memories.length} memor{memories.length === 1 ? 'y' : 'ies'}</span>
			<button type="button" class="mem-clear-all-btn" onclick={clearAll}>clear all</button>
		</div>
		<div>
			{#each memories as mem (mem.id)}
				<div class="mem-row">
					<canvas class="mem-canvas" width={DIMS} height="8" use:embeddingCanvas={mem.vec}></canvas>
					<div class="mem-body">
						{#if editingId === mem.id}
							<textarea class="mem-edit-ta" bind:value={editText} rows="2"></textarea>
							<div class="mem-actions">
								<button type="button" onclick={() => saveEdit(mem)} disabled={editBusy}>{editBusy ? 'embedding…' : 'save'}</button>
								<button type="button" onclick={cancelEdit}>cancel</button>
							</div>
						{:else}
							<div class="mem-text">{mem.text}</div>
							<div class="mem-actions">
								<button type="button" onclick={() => startEdit(mem)}>edit</button>
								<button type="button" onclick={() => remove(mem.id)}>delete</button>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	.mem-add-input { width: 100%; box-sizing: border-box; }
	.mem-add-btn { margin-top: 0.4rem; }
	.mem-list-wrap { margin-top: 1.4rem; }
	.mem-list-header {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		margin-bottom: 0.5rem;
		border-bottom: 1px solid #ddd;
		padding-bottom: 0.3rem;
	}
	.mem-count { font-size: 0.85rem; color: #555; }
	.mem-clear-all-btn { padding: 0.1rem 0.5rem; font-size: 0.8rem; }
	.mem-row { padding: 0.55rem 0; border-bottom: 1px solid #eee; }
	.mem-canvas {
		display: block;
		width: 100%;
		height: 8px;
		image-rendering: pixelated;
		margin-bottom: 0.35rem;
	}
	.mem-body { display: flex; align-items: flex-start; gap: 0.6rem; }
	.mem-text { flex: 1; font-size: 0.9rem; line-height: 1.4; }
	.mem-actions { display: flex; gap: 0.3rem; flex-shrink: 0; }
	.mem-actions button { padding: 0.1rem 0.5rem; font-size: 0.8rem; }
	.mem-edit-ta {
		flex: 1;
		font-family: inherit;
		font-size: 0.9rem;
		min-height: 3rem;
		box-sizing: border-box;
	}
</style>
