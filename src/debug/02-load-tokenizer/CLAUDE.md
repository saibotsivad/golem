# Debug: Load Tokenizer

Lets you load any HuggingFace tokenizer by model name at runtime. Registers the model in `REGISTRY` so the current-state panel tracks it. Loaded tokenizer instances are stored in `_debugLoadedTokenizers` (a `Map` local to this panel) but are not wired into any content section — this is diagnostic/exploratory only.

## Registry key generation

Model name → registry key: lowercase, runs of non-alphanumeric characters collapsed to `-`, leading/trailing `-` stripped. Examples:
- `Xenova/bert-base-uncased` → `xenova-bert-base-uncased`
- `Xenova/gpt2` → `xenova-gpt2`

## Shared state used

- `REGISTRY` (shared.js) — new key added directly before loading begins
- `registrySet(key, update)` (shared.js) — drives status through `loading` → `downloading` → `loading` → `ready` | `error`
- `AutoTokenizer` (shared.js import) — used to load the tokenizer
- `escHtml(s)` (shared.js) — escapes error messages before display

## DOM elements owned

`#debug-tok-form`, `#debug-tok-input`, `#debug-tok-btn`, `#debug-tok-status`
