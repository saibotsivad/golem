# §2 — Next-Token Prediction

Runs GPT-2 inference in-browser and displays the full probability distribution over the 50,257-token vocabulary for the next token after the user's prompt. Clicking any row in the chart appends that token to the input and re-runs inference.

## Shared state used

- `tokenizer` — block-local; loaded via `golem.loadTokenizer('Xenova/gpt2', false)` at section init (returns cached instance if §1 already loaded it)
- `golem.loadModel(onProgress)` — lazily loads the ~81 MB quantized GPT-2 model
- `softmaxWithTemp`, `getLogits`, `escHtml` (shared.js)

## DOM elements owned

`#predict-form`, `#predict-input`, `#predict-btn`, `#predict-status`, `#temperature`, `#top-n`, `#predict-results`, `#pred-header`, `#pred-chart`
