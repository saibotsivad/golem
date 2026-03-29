# src/debug/

Debug panels assembled by `build.mjs` into the `<div id="debug-panel">` block. The panel is hidden by default; the "debug" link in the site header toggles it and hides the main content sections.

## Structure

Each subdirectory follows the same three-file convention as content sections:

| File | Purpose |
|---|---|
| `section.html` | HTML fragment rendered inside `#debug-panel` |
| `section.css` | CSS scoped to this panel's elements |
| `section.js` | JS; runs after `shared.js`, before any content section JS |

Directories are sorted alphabetically at build time, so use a `NN-` numeric prefix to control order.

## Available shared state

All debug panel JS has access to:

- `REGISTRY` — live status of every tracked asset (`gpt2-tokenizer`, `gpt2-lm`, `minilm`, `search-index`, `rag-index`)
- `registrySubscribe(fn)` — register a zero-argument callback invoked whenever any registry entry changes
- All other helpers from `shared.js` (`embed`, `cosine`, `escHtml`, etc.)

Debug panels must **not** call `registrySet` — they observe state only.

## Panels

- `01-current-state/` — table showing every REGISTRY asset with its current status and download progress
- `02-load-tokenizer/` — form to load any HuggingFace tokenizer by model name; registers it in REGISTRY so its status appears in the current-state table
