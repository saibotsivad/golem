# §8 — Memory-Grounded Generation

Demonstrates the core agentic memory loop: embed message → retrieve memories by cosine similarity → substitute into prompt template → generate with GPT-2.

The prompt template supports two placeholders:
- `[[memories]]` — replaced by the top-k retrieved memories as a comma-separated string
- `[[message]]` — replaced verbatim by the user's message

If the template omits `[[memories]]`, retrieval and embedder loading are skipped entirely.

## Cross-section dependencies

- `SAMPLING_WORKER_CODE` (shared.js) — GPT-2 generation worker; §8 creates its own independent Worker instance (`agentWorker`) so it never contends with §3's or §6's workers
- `golem.loadMemories()` — reads all stored memories from IDB (defined in golem.js)
- `golem.loadEmbedder()` / `golem.embed(text)` — embeds the user's message for similarity search (same MiniLM instance as §4–§7)
- `cosine(a, b)` (shared.js) — scores each memory against the embedded message; safe with mixed Array/Float32Array inputs
- `escHtml(s)` (shared.js) — used when rendering retrieved memory text as HTML
- `registrySet` / `window.golem._isModelLoaded()` — REGISTRY guard for worker model_status messages, identical to §3

## Token rendering

Reuses `.gen-prompt`, `.gen-tok`, `.gen-tok-a`, `.gen-tok-b` CSS classes defined in §3's `section.css`. No need to redefine them here.

## DOM elements owned

`#agent-form`, `#agent-template`, `#agent-mem-k`, `#agent-strategy`, `#agent-temp`, `#agent-topk`, `#agent-topp`, `#agent-max`, `#agent-message`, `#agent-gen-btn`, `#agent-stop-btn`, `#agent-status`, `#agent-results`, `#agent-retrieved`, `#agent-prompt-box`, `#agent-output`, `#agent-meta`, `#agent-temp-label`, `#agent-topk-label`, `#agent-topp-label`
