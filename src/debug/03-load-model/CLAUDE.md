# Debug: Load Language Model

Button panel for manually loading the GPT-2 language model into memory. Delegates all loading and unloading to `golem.js` (`window.golem`). Owns the load button UI and wires the ✕ clear button in the asset table.

## What this panel does

- On button click: calls `golem.loadModel()` and reports status in `#debug-lm-status`
- Watches REGISTRY via `registrySubscribe` to auto-register a ✕ clear button
  (via `_debugClearFns`) whenever `gpt2-lm` becomes ready — covers loads triggered
  by §2/§3 section code as well as explicit loads through this panel
- The clear fn calls `golem.unloadModel()` then removes itself from `_debugClearFns`

## Ordering note

`renderCurrentState` (from `01-current-state`) subscribes to REGISTRY before
this panel's subscriber does. So when the model becomes ready, `renderCurrentState`
fires first (before the clear fn exists). This panel's subscriber calls
`renderCurrentState()` explicitly after registering the clear fn to force a
second render with the ✕ button.

## Cross-panel dependency

`_debugClearFns` is declared in `01-current-state/section.js` (which runs first
in build order). This panel populates it. `renderCurrentState` is also declared
in `01-current-state` and called explicitly here.

## Shared state used

- `window.golem` (golem.js) — `loadModel`, `unloadModel`, `_isModelLoaded`
- `_debugClearFns` (01-current-state/section.js) — map of key → async clear fn
- `renderCurrentState` (01-current-state/section.js) — called to force re-render
- `registrySubscribe` (shared.js) — watches for model becoming ready
- `REGISTRY` (shared.js) — checks `gpt2-lm` status
- `escHtml` (shared.js) — escapes error messages

## DOM elements owned

`#debug-lm-btn`, `#debug-lm-status`
