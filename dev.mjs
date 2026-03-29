import { createServer } from 'node:http'
import { readFileSync, watch } from 'node:fs'
import { join, extname, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const root = dirname(fileURLToPath(import.meta.url))
const docsDir = join(root, 'docs')
const srcDir = join(root, 'src')
const PORT = 8080

const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css',
	'.js': 'application/javascript',
	'.json': 'application/json',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.wasm': 'application/wasm',
}

function build() {
	try {
		execSync('node build.mjs', { cwd: root, stdio: 'inherit' })
	} catch {
		console.error('[dev] build failed')
	}
}

// Initial build
build()

// Watch src/ and rebuild on changes (debounced)
let debounce
watch(srcDir, { recursive: true }, (_, filename) => {
	clearTimeout(debounce)
	debounce = setTimeout(() => {
		console.log(`[watch] ${filename} changed — rebuilding`)
		build()
	}, 50)
})

// Serve docs/
createServer((req, res) => {
	const urlPath = (req.url || '/').split('?')[0]
	const safePath = resolve(docsDir, '.' + urlPath)

	// Prevent path traversal
	if (!safePath.startsWith(docsDir)) {
		res.writeHead(403)
		res.end('Forbidden')
		return
	}

	const filePath = urlPath.endsWith('/') ? join(safePath, 'index.html') : safePath

	try {
		const data = readFileSync(filePath)
		const ext = extname(filePath)
		res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
		res.end(data)
	} catch {
		// Fall back to index.html for SPA-style routing
		try {
			const data = readFileSync(join(docsDir, 'index.html'))
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
			res.end(data)
		} catch {
			res.writeHead(404)
			res.end('Not found')
		}
	}
}).listen(PORT, () => {
	console.log(`[dev] http://localhost:${PORT}`)
})
