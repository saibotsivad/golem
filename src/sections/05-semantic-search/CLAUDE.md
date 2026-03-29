# §5 — Semantic Search

Semantic search over a fixed corpus of 40 AI/ML concept sentences. Embeddings are computed once with `all-MiniLM-L6-v2`, stored as a flat `Float32Array` in IndexedDB under the key `CORPUS_VERSION`, and reloaded on subsequent page visits. Search is a brute-force dot product (valid because all vectors are unit-normalized).

## Shared state used

- `golem.loadEmbedder(onProgress)` — same model instance as §4
- `golem.embed(text)` — embeds passages and query via the shared worker
- `idbGet(key)` / `idbPut(key, value)` (shared.js) — cache embedding index in IndexedDB
- `escHtml` (shared.js) — used when rendering result text

## Corpus versioning

`CORPUS_VERSION = 'v1'` is the IndexedDB key. If the corpus changes, bump this string so users automatically rebuild the index rather than searching against stale embeddings.

## DOM elements owned

`#build-index-btn`, `#index-status`, `#search-form`, `#search-query`, `#search-btn`, `#search-status`, `#search-results`, `#search-header`, `#search-list`
