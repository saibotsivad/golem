# §3 — Sampling Strategies

Autoregressive text generation loop using GPT-2. Supports four strategies: greedy, temperature, top-k, and top-p (nucleus). The strategy selector shows/hides the relevant parameter inputs. A Stop button sends `{ type: 'stop' }` to the worker to break the generation loop.

## Architecture note

Unlike §2 which runs a single forward pass on the main thread, §3 runs many sequential forward passes (one per generated token). These run inside a Web Worker (`SAMPLING_WORKER_CODE`) so the UI stays responsive. As a result, the model instance lives in the worker, not in `lmModel` on the main thread. `golem.loadModel()` is intentionally not called from this section — the worker manages its own GPT-2 instance.

To keep the debug panel accurate, the section handles `{ type: 'model_status', status, progress }` messages from the worker and calls `registrySet('xenova-gpt2-lm', …)` — but only when `window.golem._isModelLoaded()` is false, so the worker never clobbers REGISTRY when §2 has the model loaded on the main thread.

## Shared state used

- `SAMPLING_WORKER_CODE` (shared.js) — worker source string; also used by §6
- `registrySet` (shared.js) — updates `xenova-gpt2-lm` status based on `model_status` worker messages
- `window.golem._isModelLoaded()` (golem.js) — guards REGISTRY updates so the worker doesn't clobber the main-thread model state

## Key implementation note

Each generation step re-tokenizes the full prompt + generated text so far (no KV cache). This is slow but correct for a demo; `max_length: 1024` prevents runaway context growth.

## DOM elements owned

`#sample-form`, `#sample-input`, `#sample-btn`, `#sample-stop-btn`, `#sample-status`, `#strategy`, `#sample-temp`, `#sample-k`, `#sample-p`, `#sample-max`, `#sample-output`, `#sample-text`, `#sample-meta`, `#param-temp-label`, `#param-k-label`, `#param-p-label`
