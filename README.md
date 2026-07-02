# golem

Interactive demos of core AI/LLM concepts, running entirely in your browser — no install, no server, no API keys.

**[Try it live →](https://saibotsivad.github.io/golem/)**

## What's inside

- **Tokenization** — See how text is split into tokens using GPT-2's byte-pair encoding. Color-coded spans show exactly where each token boundary falls.
- **Next-token prediction** — Feed a prompt into a quantized GPT-2 model and explore the probability distribution over every possible next token. Adjust temperature, click a token to append it, and watch the distribution shift.
- **Sampling strategies** — Compare greedy, temperature, top-k, and top-p (nucleus) sampling side by side. Same prompt, very different outputs.
- **Embeddings & similarity** — Encode sentences into 384-dimensional vectors with MiniLM and visualize cosine similarity.
- **Semantic search, RAG, memory, and a memory-grounded agent** — Build vector indexes in the browser, retrieve by meaning, and ground GPT-2 generation in retrieved context and your own stored memories.

## How it works

Real pretrained models (GPT-2, all-MiniLM-L6-v2) run client-side via [Transformers.js](https://huggingface.co/docs/transformers.js) and ONNX Runtime in WebAssembly. Models are downloaded from HuggingFace on first visit and cached in IndexedDB / the browser Cache API for subsequent use.

The app is a [SvelteKit](https://svelte.dev/docs/kit) single-page application written in TypeScript, prerendered to static files with `@sveltejs/adapter-static` and deployed to GitHub Pages. All model inference happens in the browser; heavy work (embedding and text generation) runs in module Web Workers to keep the UI responsive.

## Tech stack

- **SvelteKit 2** + **Svelte 5** (runes) + **TypeScript** (strict)
- **Vite** for bundling and dev server
- **`@xenova/transformers`** for in-browser inference
- **`@sveltejs/adapter-static`** for static prerendering

## Project structure

```
src/
  app.html · app.css · app.d.ts
  routes/                     +layout.ts (prerender) · +page.svelte (page shell)
  lib/
    golem/                    typed model/asset API + reactive registry + IndexedDB
      registry.svelte.ts      Svelte 5 runes store tracking asset load status
      golem.ts                window.golem developer API (tokenizers, LMs, embedders, indexes, memories)
      idb.ts                  typed IndexedDB persistence
      types.ts                shared types + worker message contracts
    ml/                       math + canvas helpers and Web Workers
      sampling.worker.ts      GPT-2 autoregressive generation worker
      embedder.worker.ts      feature-extraction (embedding) worker
    data/                     search + RAG corpora
    components/
      sections/               the eight demo sections (§1–§8)
      debug/                  debug panels (asset state + loaders)
static/                       favicon assets, .nojekyll
```

## Developing

```sh
npm install
npm run dev        # start the dev server
npm run build      # build the static site into ./build
npm run preview    # preview the production build
npm run check      # type-check the project
```

To build for the GitHub Pages sub-path locally:

```sh
BASE_PATH=/golem npm run build
```

## Console API

The model layer is attached to `window.golem` so you can drive it from DevTools, e.g.:

```js
await golem.loadTokenizer('Xenova/gpt2')
golem.tokenize('xenova-gpt2', 'Hello, world!')
await golem.embed('hello world')      // → 384-dim unit vector
golem.models(); golem.embedders(); golem.indexes()
```
