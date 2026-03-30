# Debug: Load Language Model

Form for loading any HuggingFace causal LM at runtime via `AutoModelForCausalLM`. Delegates all loading, persistence, and unloading to `golem.js` (`window.golem`). Owns the form UI and manages clear buttons in the asset table for both the fixed `gpt2-lm` entry and arbitrary loaded LMs.

## What this panel does

- On form submit: calls `golem.loadLM(modelName, saveLocally)`, which adds a REGISTRY entry keyed `{slug}-lm` (e.g. `xenova-distilgpt2-lm`)
- Watches REGISTRY via `registrySubscribe` to auto-register ✕ clear buttons for two cases:
  - Fixed `gpt2-lm` entry (managed by `golem.loadModel/unloadModel`; loaded by §2/§3)
  - Arbitrary LM entries (managed by `golem.loadLM/unloadLM`; loaded via this form)
- Clear fns call `golem.unloadModel()` or `golem.unloadLM(key)` then remove themselves

## Key naming

`golem.loadLM()` appends `-lm` to the model slug to avoid collisions with tokenizer keys (both tokenizers and causal LMs derive their slug from the HuggingFace model name). Example: `Xenova/distilgpt2` → `xenova-distilgpt2-lm`.

## Ordering note

`renderCurrentState` (from `01-current-state`) subscribes to REGISTRY before this panel's subscriber. After registering a new clear fn, this panel calls `renderCurrentState()` explicitly to force a second render with the ✕ button.

## Cross-panel dependency

`_debugClearFns` is declared in `01-current-state/section.js` (which runs first in build order). This panel populates it. `renderCurrentState` is also declared in `01-current-state` and called explicitly here.

## Shared state used

- `window.golem` (golem.js) — `loadLM`, `unloadLM`, `unloadModel`, `modelKey`, `_isLMLoaded`
- `_debugClearFns` (01-current-state/section.js) — map of key → async clear fn
- `renderCurrentState` (01-current-state/section.js) — called to force re-render
- `registrySubscribe` (shared.js) — watches for newly-ready LM entries
- `REGISTRY` (shared.js) — checked for `gpt2-lm` and arbitrary LM keys
- `escHtml` (shared.js) — escapes error messages

## DOM elements owned

`#debug-lm-form`, `#debug-lm-input`, `#debug-lm-save`, `#debug-lm-btn`, `#debug-lm-status`
