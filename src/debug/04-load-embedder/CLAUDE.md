# Debug: Load Embedding Model

Form for loading any HuggingFace feature-extraction model at runtime. Each model runs in its own Web Worker (to keep the UI responsive). Delegates all loading and unloading to `golem.js` (`window.golem`). Owns the form UI and manages clear buttons in the asset table.

## What this panel does

- On form submit: calls `golem.loadEmb(modelName, saveLocally)`, which spawns a Worker, adds a REGISTRY entry keyed `{slug}-emb` (e.g. `xenova-all-minilm-l6-v2-emb`)
- Watches REGISTRY via `registrySubscribe` to auto-register ✕ clear buttons for any entry where `_isEmbLoaded(key)` is true
- Clear fns call `golem.unloadEmb(key)` (terminates the Worker) then remove themselves

## Key naming

`golem.loadEmb()` appends `-emb` to the model slug to avoid collisions with tokenizer and LM keys. Example: `Xenova/all-MiniLM-L6-v2` → `xenova-all-minilm-l6-v2-emb`.

The pre-declared `xenova-all-minilm-l6-v2-emb` entry is the same one used by `golem.loadEmbedder()` and `golem.embed()` (the §4/§5/§6 API). Loading it here pre-warms it for those sections with no duplicate.

## Ordering note

`renderCurrentState` (from `01-current-state`) subscribes to REGISTRY before this panel's subscriber. After registering a new clear fn, this panel calls `renderCurrentState()` explicitly to force a second render with the ✕ button.

## Cross-panel dependency

`_debugClearFns` is declared in `01-current-state/section.js` (which runs first in build order). `renderCurrentState` is also declared there and called explicitly here.

## Shared state used

- `window.golem` (golem.js) — `loadEmb`, `unloadEmb`, `modelKey`, `_isEmbLoaded`
- `_debugClearFns` (01-current-state/section.js) — map of key → async clear fn
- `renderCurrentState` (01-current-state/section.js) — called to force re-render
- `registrySubscribe` (shared.js) — watches for newly-ready embedder entries
- `REGISTRY` (shared.js) — checked for ready embedder keys
- `escHtml` (shared.js) — escapes error messages

## DOM elements owned

`#debug-emb-form`, `#debug-emb-input`, `#debug-emb-save`, `#debug-emb-btn`, `#debug-emb-status`
