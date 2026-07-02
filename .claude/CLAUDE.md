# golem

Interactive, browser-only demos of core AI/LLM concepts (tokenization, next-token prediction, sampling, embeddings, semantic search, RAG, memory, and a memory-grounded agent). Everything runs client-side in the browser — no server, no API keys.

## Tech stack

- **SvelteKit 2** + **Svelte 5** (runes: `$state`, `$derived`, `$effect`, `$props`) + **TypeScript** (strict)
- **Vite** for bundling / dev server
- **`@sveltejs/adapter-static`** — the whole app is prerendered to static files and deployed to GitHub Pages
- **`@xenova/transformers`** for in-browser model inference (WASM/ONNX)

## Project structure

- `src/routes/+layout.ts` — `prerender = true`, `ssr = false`
- `src/routes/+page.svelte` — page shell; toggles the debug panel vs. the eight sections
- `src/lib/golem/` — the model/asset layer
  - `registry.svelte.ts` — Svelte 5 runes store tracking every asset's load status (replaces the old REGISTRY pub/sub)
  - `golem.ts` — the `window.golem` developer API; tokenizer / LM / embedder / vector-index / memory management; call `initGolem()` once on mount
  - `idb.ts` — typed IndexedDB persistence (`golem` DB v4: search, tokenizers, models, embedders, memories)
  - `types.ts` — shared types and Web Worker message contracts
- `src/lib/ml/` — `math.ts`, `canvas.ts`, plus module Web Workers `sampling.worker.ts` (GPT-2 generation) and `embedder.worker.ts` (feature extraction), and `workers.ts` factory
- `src/lib/data/` — the §5 search corpus and §6 RAG corpus
- `src/lib/components/sections/` — the eight demo sections (§1–§8)
- `src/lib/components/debug/` — debug panels (asset state table + loader forms)
- `static/` — favicon assets and `.nojekyll`

## Key constraints

- **Browser-only runtime**: all model work runs in the browser. Transformers.js is imported only in Web Workers and dynamically in browser-only code so the prerender/SSR pass stays clean.
- **Storage**: IndexedDB for persistence; the browser Cache API holds downloaded model files.
- **Deploy target**: GitHub Pages via `.github/workflows/deploy.yml`, built with `BASE_PATH=/golem`.

## UI style

Science/educational demo aesthetic — plain and functional, like an academic tool or terminal output.

- **No**: drop shadows, border-radius, gradients, animations, gratuitous hover effects
- **Yes**: clean monospace typography, readability, sensible whitespace, functional form controls

## Dev workflow

- `npm run dev` — dev server
- `npm run build` — static build into `./build`
- `npm run preview` — preview the production build
- `npm run check` — type-check
