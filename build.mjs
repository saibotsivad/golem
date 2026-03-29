import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = dirname(fileURLToPath(import.meta.url))
const src  = join(root, 'src')

// Gather section directories in sorted order
const sectionDirs = readdirSync(join(src, 'sections'), { withFileTypes: true })
	.filter(e => e.isDirectory())
	.map(e => e.name)
	.sort()

// Assemble CSS
const cssParts = [readFileSync(join(src, 'global.css'), 'utf8')]
for (const dir of sectionDirs) {
	cssParts.push(readFileSync(join(src, 'sections', dir, 'section.css'), 'utf8'))
}
const styleBlock = `<style>\n${cssParts.join('\n')}\n</style>`

// Assemble HTML sections
const htmlParts = []
for (const dir of sectionDirs) {
	htmlParts.push(readFileSync(join(src, 'sections', dir, 'section.html'), 'utf8'))
}
const sectionsBlock = htmlParts.join('\n\n')

// Assemble JS
const jsParts = [readFileSync(join(src, 'shared.js'), 'utf8')]
for (const dir of sectionDirs) {
	jsParts.push(readFileSync(join(src, 'sections', dir, 'section.js'), 'utf8'))
}
const scriptBlock = `<script type="module">\n${jsParts.join('\n\n')}\n</script>`

// Build final HTML
let html = readFileSync(join(src, 'template.html'), 'utf8')
html = html.replace('<!-- STYLES -->', styleBlock)
html = html.replace('<!-- SECTIONS -->', sectionsBlock)
html = html.replace('<!-- SCRIPT -->', scriptBlock)
html = html.replace(/<span id="updated">[^<]*<\/span>/, `<span id="updated">${new Date().toISOString()}</span>`)

writeFileSync(join(root, 'docs', 'index.html'), html)
console.log(`Built docs/index.html (${sectionDirs.length} sections)`)
