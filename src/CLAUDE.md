# src/

Source files assembled by `build.mjs` into `docs/index.html`. Never edit `docs/index.html` directly.

## Assembly order

`build.mjs` reads directories under `debug/` and `sections/` sorted alphabetically (hence the `NN-` numeric prefix), then concatenates:

| Output block | Sources (in order) |
|---|---|
| `<style>` | `global.css`, then each `debug/NN-name/section.css`, then each `sections/NN-name/section.css` |
| debug HTML | each `debug/NN-name/section.html` — injected into `<div id="debug-panel">` |
| body HTML | each `sections/NN-name/section.html` — injected into `<div id="sections">` |
| `<script type="module">` | `shared.js`, then each `debug/NN-name/section.js`, then each `sections/NN-name/section.js` |

Because all JS lands in a single `<script type="module">`, every variable and function declared in `shared.js` is in scope for all `section.js` and debug `section.js` files, and all earlier section files are in scope for later ones. No `import`/`export` is needed.

---

## Adding a new content section

1. Pick the next available number and a short slug, e.g. `07-attention`.
2. Create the directory `src/sections/07-attention/` with three files:
   - `section.html` — the HTML fragment that appears in the page body. Start with a `<!-- comment -->` header and an `<h2>` title.
   - `section.css` — CSS scoped to this section's elements. May be empty but must exist.
   - `section.js` — JavaScript. All shared helpers and earlier sections' exported symbols are already in scope.
3. Optionally add a `CLAUDE.md` in the directory documenting which shared state is read/written and which DOM element IDs are owned by this section.
4. Run `npm run build`.

**Rules:**
- Own your DOM: use unique IDs (prefixed with your section slug, e.g. `#attn-*`) so there are no conflicts with other sections.
- Do not read or write DOM elements owned by other sections.
- Do not add variables to `shared.js` unless they are consumed by two or more sections. Keep section-local state inside the section's own JS.
- Cross-section symbol use (e.g. §6 reusing `idbGet` from §5) is allowed but must be documented in the consuming section's `CLAUDE.md`.

---

## Adding a new debug panel

1. Pick the next available number, e.g. `02-model-timing`.
2. Create the directory `src/debug/02-model-timing/` with three files:
   - `section.html` — HTML fragment rendered inside `<div id="debug-panel">`. Give any dynamic elements unique IDs.
   - `section.css` — CSS for this panel. May be empty but must exist.
   - `section.js` — JavaScript. Runs after `shared.js` so `REGISTRY`, `registrySubscribe`, and all shared helpers are in scope.
3. Run `npm run build`.

**Typical pattern:** call `registrySubscribe(myRenderFn)` and call `myRenderFn()` once immediately so the panel renders on load and re-renders whenever any registry entry changes. See `debug/01-current-state/section.js` for the canonical example.

**Rules:**
- Debug panels are only visible when the user clicks "debug". Do not put content here that belongs in the main page.
- Use unique DOM IDs to avoid collisions between panels.
- Do not call `registrySet` from a debug panel — debug panels observe state, they do not mutate it.

---

## Global state: shared.js

`shared.js` declares shared state and helpers used across two or more sections. Everything here is in scope for debug panels and all section JS files.

### Model registry

`REGISTRY` tracks the load status of every heavyweight asset. Add an entry here when introducing a new lazily-loaded model or index:

```js
'my-model': { label: 'Human-readable name', size: '~X MB', status: 'unknown', progress: null },
```

Status lifecycle: `unknown` → (`absent` | `cached`) → `loading` → `downloading` (0–100%) → `loading` → `ready` | `error`.

Call `registrySet(key, update)` to update an entry and notify all subscribers. Call `registrySubscribe(fn)` to register a no-argument callback invoked on every change.

### Shared variables

- `tokenizer` — GPT-2 BPE tokenizer (`AutoTokenizer`); set by §1, read by §2 and §3.
- `lmModel` — GPT-2 causal LM (`GPT2LMHeadModel`); lazily loaded via `ensureModel(onProgress)`.
- `embed(text)` — calls `ensureEmbedder()` then returns `Array<number>` (384 dims).

### Shared helpers

- `softmaxWithTemp(logits, temp)` — applies temperature and returns a `Float64Array` of probabilities.
- `getLogits(output)` — extracts last-token logits from a model output tensor.
- `escHtml(s)` — minimal HTML escaping for user-supplied strings.
- `cosine(a, b)` — cosine similarity between two equal-length arrays.
- `drawEmbedding(canvas, vec, scale)` — renders a float vector as a blue/red color bar on a canvas.
- `drawEmbeddingDiff(canvas, vecA, vecB, scale)` — renders per-dimension absolute difference as a grayscale bar.
- `drawEmbeddingGrid(canvas, vecs, count, dims, totalRows)` — renders multiple embedding rows in a single canvas.
- `ensureModel(onProgress)` — lazily loads GPT-2 LM; resolves to the model.
- `ensureEmbedder(onProgress)` — lazily loads all-MiniLM-L6-v2 via a Web Worker; resolves when ready.

### Rules for adding to shared.js

- Only add a symbol if it is (or will imminently be) consumed by two or more sections or debug panels.
- New lazily-loaded assets must add a `REGISTRY` entry and call `registrySet` through their lifecycle.
- Keep the embedder in its Web Worker — never run the embedding pipeline on the main thread.

---

## global.css

Base styles only: reset, body typography, `h1`/`h2`/`p`/`a`/`small`, `textarea`, `button`, `.section-status`, `.param-row`, `.param-note`, `.debug-toggle`, `#debug-panel`. Section-specific and debug-specific selectors go in each component's own `section.css`.
