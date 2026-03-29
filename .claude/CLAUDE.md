# golem

Proof-of-concept demo of AI core technologies (tokenization, LLM, RAG, vector search, MCP, etc.) that runs entirely in modern Google Chrome with no installation required.

## Project structure

- `docs/` — GitHub Pages site root; `docs/index.html` is the entry point
- `package.json` — npm-managed dependencies and build scripts (ESM, `"type": "module"`)
- `.claude/` — Claude Code configuration

## Key constraints

- **Browser-only runtime**: all code must run in Chrome without a server. No Node.js at runtime.
- **No install required**: users visit the site and everything works in-browser.
- **Storage**: use IndexedDB for persistence (models, memories, embeddings, etc.).
- **Deploy target**: GitHub Pages from the `docs/` folder.

## Dev workflow

- `npm run build` — builds the site into `docs/`
- Dependencies installed via npm in the repo root; bundled for the browser as needed.
