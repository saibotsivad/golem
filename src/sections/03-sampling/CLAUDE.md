# §3 — Sampling Strategies

Autoregressive text generation loop using the same GPT-2 model as §2. Supports four strategies: greedy, temperature, top-k, and top-p (nucleus). The strategy selector shows/hides the relevant parameter inputs. A Stop button sets `stopRequested = true` to break the generation loop.

## Shared state used

- `tokenizer` (set by §1) — encodes running context, decodes generated token IDs
- `ensureModel(onProgress)` (shared.js) — same cached model instance as §2
- `softmaxWithTemp`, `getLogits` (shared.js)

## Key implementation note

Each generation step re-tokenizes the full prompt + generated text so far (no KV cache). This is slow but correct for a demo; `max_length: 1024` prevents runaway context growth.

## DOM elements owned

`#sample-form`, `#sample-input`, `#sample-btn`, `#sample-stop-btn`, `#sample-status`, `#strategy`, `#sample-temp`, `#sample-k`, `#sample-p`, `#sample-max`, `#sample-output`, `#sample-text`, `#sample-meta`, `#param-temp-label`, `#param-k-label`, `#param-p-label`
