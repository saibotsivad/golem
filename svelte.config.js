import adapter from '@sveltejs/adapter-static'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

// GitHub Pages serves the project site from a sub-path (/golem). The workflow
// sets BASE_PATH accordingly; local dev/build default to the root.
const base = process.env.BASE_PATH ?? ''

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			// Emit a fully static site (index.html + hashed assets) suitable for
			// GitHub Pages. A 404.html fallback keeps deep links working.
			fallback: '404.html',
			precompress: false,
			strict: true,
		}),
		paths: {
			base,
			relative: false,
		},
	},
}

export default config
