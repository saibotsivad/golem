# Debug: Load Tokenizer

Form for loading any HuggingFace tokenizer at runtime. Delegates all loading,
persistence, and unloading to `golem.js` (`window.golem`). Owns only the form
UI and the wiring of clear buttons into the asset table.

## What this panel does

- On form submit: calls `golem.loadTokenizer(modelName, saveLocally)`
- Watches REGISTRY via `registrySubscribe` to auto-register a ✕ clear button
  (via `_debugClearFns`) for any tokenizer that golem loads or auto-restores
- The clear fn calls `golem.unloadTokenizer(key)` then removes itself from
  `_debugClearFns`

## Ordering note

`renderCurrentState` (from `01-current-state`) subscribes to REGISTRY before
this panel's subscriber does. So when a tokenizer becomes ready, `renderCurrentState`
fires first (before the clear fn exists). This panel's subscriber calls
`renderCurrentState()` explicitly after registering a new clear fn to force a
second render with the ✕ button.

## Cross-panel dependency

`_debugClearFns` is declared in `01-current-state/section.js` (which runs first
in build order). This panel populates it. `renderCurrentState` is also declared
in `01-current-state` and called explicitly here.

## Shared state used

- `window.golem` (golem.js) — `loadTokenizer`, `unloadTokenizer`, `modelKey`, `_isLoaded`
- `_debugClearFns` (01-current-state/section.js) — map of key → async clear fn
- `renderCurrentState` (01-current-state/section.js) — called to force re-render
- `registrySubscribe` (shared.js) — watches for newly-ready tokenizers
- `escHtml` (shared.js) — escapes error messages

## DOM elements owned

`#debug-tok-form`, `#debug-tok-input`, `#debug-tok-save`, `#debug-tok-btn`, `#debug-tok-status`
