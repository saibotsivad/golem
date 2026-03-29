# §4 — Embeddings

Computes 384-dimensional sentence embeddings for two user-supplied texts using `all-MiniLM-L6-v2`, renders each as a blue/red color bar (positive/negative dimensions), and reports their cosine similarity with a qualitative label.

## Shared state used

- `golem.loadEmbedder(onProgress)` — lazily loads the ~23 MB quantized embedding model
- `golem.embed(text)` — returns `Promise<Array<number>>` (384-dim unit vector)
- `cosine(a, b)` (shared.js) — cosine similarity
- `drawEmbedding(canvas, vec, scale)` (shared.js) — renders vector to canvas

Both vectors are scaled to the same max absolute value so the color bars are visually comparable.

## DOM elements owned

`#embed-form`, `#embed-a`, `#embed-b`, `#embed-btn`, `#embed-status`, `#embed-results`, `#canvas-a`, `#canvas-b`, `#canvas-diff`, `#embed-similarity`, `#embed-note`
