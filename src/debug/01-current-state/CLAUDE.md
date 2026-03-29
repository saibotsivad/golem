# Debug: Current Asset State

Renders a table showing every entry in `REGISTRY` — asset label, size, and current status (including download progress). Subscribes to registry changes so it updates live as models download or initialize. Also owns the debug toggle button behavior.

## Shared state used

- `REGISTRY` (shared.js) — iterated via `Object.values()` to build table rows
- `registrySubscribe(fn)` (shared.js) — triggers re-render on any status change

## Toggle behavior

This panel owns the `#debug-toggle-btn` click handler. Clicking toggles `hidden` on both `#debug-panel` and `#sections`, and updates the button text between "debug" and "back".

## DOM elements owned

`#debug-state-rows` (tbody populated on each render); reads `#debug-panel`, `#sections`, `#debug-toggle-btn` from the page shell.
