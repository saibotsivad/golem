import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [sveltekit()],
	define: {
		// Build timestamp shown in the header, mirroring the original build.mjs.
		__BUILD_TIME__: JSON.stringify(new Date().toISOString()),
	},
	worker: {
		format: 'es',
	},
	// Transformers.js pulls in optional Node-only backends (onnxruntime-node,
	// sharp) that must never be bundled for the browser. Excluding it from
	// dependency pre-bundling keeps its own lazy CDN/WASM loading intact; it is
	// only ever imported from browser-only code paths and Web Workers.
	optimizeDeps: {
		exclude: ['@xenova/transformers'],
	},
})
