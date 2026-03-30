# §6 — Retrieval-Augmented Generation

RAG pipeline: embed query → brute-force dot product search over 20 multi-sentence corpus passages → concatenate top-k as context → generate with GPT-2.

The corpus is 20 passages (2–3 sentences each) about ML/AI concepts, stored as a flat `Float32Array` in IndexedDB under key `'rag-v1'`. Bump that string if the corpus changes.

## Cross-section dependencies

- `golem.loadIndex` / `golem.saveIndex` — defined in `golem.js`, used for IDB persistence
- `SAMPLING_WORKER_CODE` — defined in `shared.js`, reused verbatim to create `ragWorker` (a separate worker instance to avoid concurrent-use conflicts with §3's `samplingWorker`)

## Shared state used

- `golem.embed(text)` — embeds query via the shared Web Worker (same all-MiniLM instance as §4–§5)
- `golem.loadEmbedder(onProgress)` — triggers model download/load
- `golem.loadIndex(key, label)` / `golem.saveIndex(key, label, data)` — IDB persistence for the embedding index
- `escHtml(s)` (shared.js) — escapes passage text before innerHTML injection
- `SAMPLING_WORKER_CODE` — generation worker source from §3

## Compare mode

When the "also generate without retrieved context" checkbox is checked, a second generation run is queued automatically after the first completes. Both runs use the same `ragWorker` sequentially. `ragStopped` flag prevents the second run if Stop was clicked.

## DOM elements owned

`#rag-build-btn`, `#rag-index-status`, `#rag-form`, `#rag-query`, `#rag-k`, `#rag-temp`, `#rag-max`, `#rag-compare`, `#rag-btn`, `#rag-stop-btn`, `#rag-status`, `#rag-results`, `#rag-retrieved-list`, `#rag-context-box`, `#rag-output-with`, `#rag-meta-with`, `#rag-without-section`, `#rag-output-without`, `#rag-meta-without`
