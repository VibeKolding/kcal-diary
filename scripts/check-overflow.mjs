// Ищет текст, вылезший за поля: обходит текстовые узлы каждого экрана на
// узком телефоне (320 px) и сравнивает рамку текста с рамкой родителя.
// Многоточие и line-clamp — намеренная обрезка, они не считаются.
//
// Нужен запущенный `npm run preview` (порт 4173) и Chromium из кэша
// Playwright. Профиль сеется прямо в IndexedDB, онбординг не проходится.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'

const PORT = 9340
const BASE = process.env.PREVIEW_URL ?? 'http://localhost:4173'
// Последний адрес открывает панель упражнения: без него содержимое панели —
// плитки фактов в три колонки, техника, ошибки — не проверялось ни на одном
// маршруте, хотя на 320 px ломается в первую очередь именно оно.
const ROUTES = [
  '/', '/gym', '/gym/chest/male',
  '/gym/chest/male?open=chest-bench-barbell',
  '/stats', '/profile',
]
const WIDTHS = [320, 375]

const cache = join(homedir(), 'Library/Caches/ms-playwright')
const bin = [
  'chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
].map((p) => join(cache, p)).find(existsSync)
if (!bin) { console.error('Chromium из кэша Playwright не найден'); process.exit(2) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const prof = mkdtempSync(join(tmpdir(), 'kcal-overflow-'))
const chrome = spawn(bin, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })

let wsUrl
for (let i = 0; i < 40 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl
  } catch { /* ещё поднимается */ }
  if (!wsUrl) await sleep(300)
}
const ws = new WebSocket(wsUrl)
await new Promise((r) => { ws.onopen = r })
let id = 0
const pending = new Map()
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  const p = pending.get(m.id)
  if (!p) return
  pending.delete(m.id)
  m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result)
}
const send = (method, params = {}) => new Promise((resolve, reject) => {
  pending.set(++id, { resolve, reject })
  ws.send(JSON.stringify({ id, method, params }))
})
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'JS error')
  return r.result.value
}

await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
await send('Network.setBypassServiceWorker', { bypass: true })
const go = async (path) => { await send('Page.navigate', { url: BASE + path }); await sleep(2800) }

await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true })
await go('/')
await evaluate(`(async () => {
  const foods = await (await fetch('/data/foods.json')).json()
  const db = await new Promise((res, rej) => { const rq = indexedDB.open('kcal-diary'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error) })
  const put = (store, v) => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(v); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  const d = new Date(); const date = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
  await put('profile', { id: 1, sex: 'male', birthDate: '1996-01-01', heightCm: 175, activity: 'light', goal: 'lose', ratePerWeek: 0.5, targets: { kcal: 1790, protein: 150, fat: 60, carbs: 163 }, targetsManual: false, theme: 'dark', waterGoalMl: 2250, targetWeightKg: 70, createdAt: Date.now() })
  await put('weights', { date, kg: 75 }); await put('meta', { key: 'onboarded', value: true })
  // Самое длинное название в базе — худший случай для полей
  const longest = [...foods.items].sort((a, b) => b.n.length - a.n.length)[0]
  await put('entries', { id: 'overflow-check', date, meal: 'snack', title: longest.n, category: longest.c, grams: 100, per100: { kcal: longest.k, protein: longest.p, fat: longest.f, carbs: longest.u }, createdAt: Date.now() })
  return longest.n
})()`)

const AUDIT = `(() => {
  const out = []
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let n
  while ((n = w.nextNode())) {
    const t = (n.nodeValue || '').trim(); if (!t) continue
    const p = n.parentElement; if (!p || ['SCRIPT', 'STYLE'].includes(p.tagName)) continue
    const cs = getComputedStyle(p)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    if (cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none') continue
    // Скрытый текст для скринридера намеренно сжат в один пиксель
    if (p.closest('.sr-only')) continue
    const r = document.createRange(); r.selectNodeContents(n)
    const tr = r.getBoundingClientRect(); if (!tr.width) continue
    const pr = p.getBoundingClientRect()
    const pad = (k) => parseFloat(cs[k]) || 0
    const right = tr.right - (pr.right - pad('paddingRight'))
    const left = (pr.left + pad('paddingLeft')) - tr.left
    const viewport = tr.right - document.documentElement.clientWidth
    if (right > 1.5 || left > 1.5 || viewport > 1.5) {
      out.push({ text: t.slice(0, 50), el: p.tagName + '.' + String(p.className).slice(0, 30), right: +right.toFixed(1), left: +left.toFixed(1), viewport: +viewport.toFixed(1) })
    }
  }
  return out
})()`

let total = 0
for (const width of WIDTHS) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 812, deviceScaleFactor: 2, mobile: true })
  for (const route of ROUTES) {
    await go(route)
    const hits = await evaluate(AUDIT)
    total += hits.length
    const mark = hits.length ? '✗' : '✓'
    console.log(`${mark} ${width}px ${route}${hits.length ? ` — ${hits.length}` : ''}`)
    for (const h of hits) console.log(`    «${h.text}» в ${h.el}: вправо ${h.right}px, влево ${h.left}px, за экран ${h.viewport}px`)
  }
}

ws.close(); chrome.kill()
rmSync(prof, { recursive: true, force: true })
if (total > 0) { console.error(`\nТекст вылезает за поля: ${total}`); process.exit(1) }
console.log('\nПереполнения текста нет')
