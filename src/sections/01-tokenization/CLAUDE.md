# §1 — Tokenization

Demonstrates GPT-2 BPE tokenization: takes user text, encodes it with the tokenizer, and renders each token as a colored span with its integer ID.

## Key detail

This section **sets the shared `tokenizer` variable** (declared in `shared.js`) by calling `golem.loadTokenizer('Xenova/gpt2', false)` and storing the returned instance. `golem.loadTokenizer` handles REGISTRY updates and progress tracking. The registry key for the GPT-2 tokenizer is `'xenova-gpt2'`. Since the `.then()` fires asynchronously (after all sync JS executes), `tokenizer` is available to §2 and §3 by the time they need it.

## DOM elements owned

`#tokenize-form`, `#tokenize-input`, `#tokenize-btn`, `#tokenize-status`, `#tokenize-results`, `#token-summary`, `#token-visual`, `#token-ids`
