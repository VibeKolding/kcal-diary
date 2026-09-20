// Незакрытая скобка в глобальном CSS в dev незаметна — Vite подключает каждый
// файл отдельно, — но в сборке всё склеивается, и одна скобка проглатывает
// стили всех последующих компонентов. Поэтому проверяем баланс до сборки.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dirs = ['src/styles', 'src/ui', 'src/app', 'src/features']
let failed = false

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path)
    else if (entry.name.endsWith('.css')) check(path)
  }
}

function check(path) {
  const css = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  let depth = 0
  for (const ch of css) {
    if (ch === '{') depth++
    else if (ch === '}') depth--
    if (depth < 0) break
  }
  if (depth !== 0) {
    console.error(`${path}: скобки не сходятся (баланс ${depth})`)
    failed = true
  }
}

for (const d of dirs) walk(d)
if (failed) process.exit(1)
console.log('CSS: скобки сходятся во всех файлах')
