# golem

Interactive demos of core AI/LLM concepts, running entirely in your browser — no install, no server, no API keys.

**[Try it live →](https://saibotsivad.github.io/golem/)**

## What's inside

- **Tokenization** — See how text is split into tokens using GPT-2's byte-pair encoding. Color-coded spans show exactly where each token boundary falls.
- **Next-token prediction** — Feed a prompt into a quantized GPT-2 model and explore the probability distribution over every possible next token. Adjust temperature, click a token to append it, and watch the distribution shift.
- **Sampling strategies** — Compare greedy, temperature, top-k, and top-p (nucleus) sampling side by side. Same prompt, very different outputs.
- **Embeddings & similarity** — Encode sentences into 384-dimensional vectors with MiniLM and visualize cosine similarity. See why "the cat sat on the mat" and "a feline rested on the rug" are neighbors in embedding space.

## How it works

Real pretrained models (GPT-2, all-MiniLM-L6-v2) run client-side via [Transformers.js](https://huggingface.co/docs/transformers.js) and ONNX Runtime in WebAssembly. Models are downloaded from HuggingFace on first visit and cached in IndexedDB for subsequent use. The entire app is a single HTML page served from GitHub Pages — vanilla JavaScript, no frameworks.
