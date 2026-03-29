# golem

Proof-of-concept demo of AI core technologies (tokenization, LLM, RAG, vector search, MCP, etc.) that runs entirely in modern Google Chrome with no installation required.

## Project structure

- `docs/` — GitHub Pages site root; `docs/index.html` is the entry point (never edit directly)
- `src/` — all source files; see `src/CLAUDE.md` for detailed architecture
- `src/shared.js` — shared state and helpers (REGISTRY, models, embedder, utilities)
- `src/golem.js` — public developer API (`window.golem`): tokenizer loading/unloading, IDB persistence, `tokenize`/`decode`, model/embedder wrappers
- `src/sections/NN-name/` — numbered content sections (HTML, CSS, JS)
- `src/debug/NN-name/` — numbered debug panels shown in the debug overlay
- `src/global.css` — base/reset styles only
- `src/template.html` — page shell with `<!-- STYLES -->`, `<!-- DEBUG -->`, `<!-- SECTIONS -->`, `<!-- SCRIPT -->` placeholders
- `build.mjs` — assembles everything into `docs/index.html`
- `package.json` — npm-managed build scripts (ESM, `"type": "module"`)
- `.claude/` — Claude Code configuration

## Key constraints

- **Browser-only runtime**: all code must run in Chrome without a server. No Node.js at runtime.
- **No install required**: users visit the site and everything works in-browser.
- **Storage**: use IndexedDB for persistence (models, memories, embeddings, etc.).
- **Deploy target**: GitHub Pages from the `docs/` folder.
- **No UI framework**: vanilla JavaScript only. No React, Vue, Svelte, etc.

## UI style

This is a science/educational demo site. The aesthetic is plain and functional — think academic tool or terminal output, not a product landing page.

- **No**: hover effects, drop shadows, border-radius, gradients, animations, fancy transitions
- **Yes**: clean typography, good readability, sensible whitespace, functional form controls
- Fix legitimately bad browser defaults (e.g. textarea styling) but do not over-style beyond what aids usability
- Monospace font throughout is appropriate for this kind of demo

## Dev workflow

- `npm run build` — assembles `src/` into `docs/index.html`
- See `src/CLAUDE.md` for how to add a new content section or debug panel
