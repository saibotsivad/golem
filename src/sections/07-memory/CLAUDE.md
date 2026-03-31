# §7 — Memory

User-editable memory store: add, edit, and delete text memories. Each memory is embedded with all-MiniLM-L6-v2 and stored in IndexedDB as `{ id, text, vec: Float32Array }`. The embedding visualization for each memory uses `drawEmbedding` (same canvas helper as §4).

In §8, these stored memories will be retrieved by cosine similarity and injected into a generation prompt as context.

## Cross-section dependencies

- `golem.loadEmbedder(onProgress)` / `golem.embed(text)` — same MiniLM instance as §4–§6
- `golem.loadMemories()` / `golem.saveMemory(id, text, vec)` / `golem.deleteMemory(id)` / `golem.clearMemories()` — defined in `golem.js`
- `registrySet('memories', ...)` — called directly when the last memory is deleted so the debug panel state table updates immediately
- `drawEmbedding(canvas, vec, scale)` — shared helper from `shared.js`

## Shared state written

- `REGISTRY['memories']` — status set to `'ready'` when memories exist, `'absent'` when empty. Managed primarily by `golem.saveMemory` / `golem.clearMemories`; §7 section.js also calls `registrySet('memories', { status: 'absent' })` directly after the last delete.

## DOM elements owned

`#mem-add-form`, `#mem-add-input`, `#mem-add-btn`, `#mem-add-status`, `#mem-list-wrap`, `#mem-list`, `#mem-count`, `#mem-clear-all-btn`
