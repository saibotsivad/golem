# src/

Source files assembled by `build.mjs` into `docs/index.html`. Never edit `docs/index.html` directly.

## Assembly order

`build.mjs` reads directories under `sections/` sorted alphabetically (hence the `NN-` numeric prefix), then concatenates:

| Output block | Sources (in order) |
|---|---|
| `<style>` | `global.css`, then each `sections/NN-name/section.css` |
| body HTML | each `sections/NN-name/section.html` |
| `<script type="module">` | `shared.js`, then each `sections/NN-name/section.js` |

Because all JS lands in a single `<script type="module">`, every variable and function declared in `shared.js` is in scope for all `section.js` files. No `import`/`export` is needed between sections.

## shared.js

Declares shared state and helpers used across sections:

- `tokenizer` — GPT-2 BPE tokenizer (`AutoTokenizer`); set by §1, read by §2 and §3
- `lmModel` — GPT-2 causal LM (`GPT2LMHeadModel`); lazily loaded via `ensureModel(onProgress)`
- `embedder` — sentence embedding pipeline (`all-MiniLM-L6-v2`); lazily loaded via `ensureEmbedder(onProgress)`
- `softmaxWithTemp(logits, temp)` — applies temperature and returns a `Float64Array` of probabilities
- `getLogits(output)` — extracts last-token logits from a model output tensor
- `escHtml(s)` — minimal HTML escaping for user-supplied strings
- `embed(text)` — convenience wrapper: calls `ensureEmbedder()` then returns `Array<number>`
- `cosine(a, b)` — cosine similarity between two equal-length arrays
- `drawEmbedding(canvas, vec, scale)` — renders a float vector as a blue/red color bar on a canvas

## global.css

Base styles only: reset, body typography, h1/h2/p/a/small, textarea, button, `.section-status`, `.param-row`, `.param-note`. Section-specific selectors go in the section's own `section.css`.
