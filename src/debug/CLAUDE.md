# src/debug/

Debug panels assembled by `build.mjs` into the `<div id="debug-panel">` block. The panel is hidden by default; the "debug" link in the site header toggles it and hides the main content sections.

## Structure

Each subdirectory follows the same three-file convention as content sections:

| File | Purpose |
|---|---|
| `section.html` | HTML fragment rendered inside `#debug-panel` |
| `section.css` | CSS scoped to this panel's elements |
| `section.js` | JS; runs after `shared.js`, before any content section JS |

Directories are sorted alphabetically at build time, so use a `NN-` numeric prefix to control order.

## Available shared state

All debug panel JS has access to:

- `REGISTRY` — live status of every tracked asset (`xenova-gpt2`, `xenova-gpt2-lm`, `minilm`, `search-index`, `rag-index`)
- `registrySubscribe(fn)` — register a zero-argument callback invoked whenever any registry entry changes
- All other helpers from `shared.js` (`embed`, `cosine`, `escHtml`, etc.)

Debug panels must **not** call `registrySet` — they observe state only.

## Panels

- `01-current-state/` — table showing every REGISTRY asset with its current status and download progress
- `02-load-tokenizer/` — form to load any HuggingFace tokenizer by model name; registers it in REGISTRY so its status appears in the current-state table

## Pattern: asset loader panels

`02-load-tokenizer` is the canonical example. When adding a new loader panel for a different asset type, follow this structure:

### HTML structure

```html
<div class="debug-load-<asset>">
  <p class="debug-<asset>-heading">Load <asset></p>
  <form id="debug-<asset>-form">
    <div class="debug-<asset>-row">
      <!-- input(s), optional checkboxes (e.g. "save locally"), submit button -->
    </div>
    <p class="param-note">
      <!-- Explain the input format. Suggest at least two concrete examples:
           one small/fast (good for quick testing), one large (shows scale).
           Include why each is interesting — architecture, vocab size, file size, etc. -->
    </p>
    <details class="debug-<asset>-api">
      <summary>console API</summary>
      <pre>
        <!-- Show the golem.* calls a developer would actually type in DevTools:
             - how to check what's loaded
             - how to do a quick smoke-test
             - how to exercise a slightly more advanced usage pattern
             Include inline comments with expected output so it's self-documenting. -->
      </pre>
    </details>
  </form>
  <div id="debug-<asset>-status" class="section-status"></div>
</div>
```

### Key conventions

- **`param-note`**: always include at least one small example (quick to load) and one large example (stress-tests the browser). Explain what makes each interesting beyond just the name — token vocabulary size, file size, algorithm differences, etc.
- **`details`/`summary` console API block**: show `golem.*` calls only. Cover: listing what's loaded, a basic usage call with expected output, and a slightly more advanced pattern. Use inline `// → …` comments to show expected output.
- **`section-status` div**: used for load-progress / error feedback; wired up in `section.js`.
- **Clear button wiring**: after loading succeeds, register an async clear fn in `_debugClearFns[key]` that calls the matching `golem.unload*` method, then call `renderCurrentState()` explicitly to force the ✕ button to appear immediately (before the next REGISTRY tick).
