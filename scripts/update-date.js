import { readFileSync, writeFileSync } from 'fs'

const file = new URL('../docs/index.html', import.meta.url).pathname
const html = readFileSync(file, 'utf8')
const date = new Date().toISOString()
const updated = html.replace(/<span id="updated">[^<]*<\/span>/, `<span id="updated">${date}</span>`)
writeFileSync(file, updated)
console.log(`Updated to ${date}`)
