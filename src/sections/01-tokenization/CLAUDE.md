# §1 — Tokenization

Demonstrates GPT-2 BPE tokenization: takes user text, encodes it with the tokenizer, and renders each token as a colored span with its integer ID.

## Key detail

This section declares a block-local `tokenizer` and loads it via `golem.loadTokenizer('Xenova/gpt2', false)`. §2 does the same independently — the second call returns the already-cached instance from `golem`'s internal Map with no re-download. The registry key for the GPT-2 tokenizer is `'xenova-gpt2'`.

## DOM elements owned

`#tokenize-form`, `#tokenize-input`, `#tokenize-btn`, `#tokenize-status`, `#tokenize-results`, `#token-summary`, `#token-visual`, `#token-ids`
