// Полная проверка экранов: текст, слои, ошибки.
//
// Обходит все экраны и все выдвижные панели на узком телефоне и смотрит
// четыре вещи: не вылез ли текст за свою рамку, не накрыт ли он чужим
// элементом, не шире ли что-нибудь экрана и не ругается ли приложение в
// консоль. Заодно ловит неудачные запросы и ответы с кодом ошибки.
//
// Нужен запущенный `npm run preview` (порт 4173) и Chromium из кэша
// Playwright. Профиль и дневник сеются прямо в IndexedDB, онбординг не
// проходится.
//
// Настройки через окружение: THEME=light|dark, WIDTHS=320,375,414.
//
// ТРИ ЗАМЫСЛА, КОТОРЫЕ НЕЛЬЗЯ СЧИТАТЬ ПОЛОМКОЙ. Без них проверка выдаёт
// полсотни пустых замечаний и перестаёт быть полезной:
//   1. Нижняя панель полупрозрачная, и контент под ней прокручивается.
//      Значит «накрыт» проверяем, только прокрутив элемент к середине
//      экрана, а подписи самой панели пропускаем.
//   2. Выдвижная панель (z-index 41) лежит ВЫШЕ нижней (30), поэтому
//      совпадение прямоугольников с ней ничего не значит.
//   3. Ряды чипов `.row { overflow-x: auto }` уезжают за край намеренно:
//      их листают пальцем.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'

const PORT = 9341
const BASE = process.env.PREVIEW_URL ?? 'http://localhost:4173'
const THEME = process.env.THEME ?? 'dark'
const WIDTHS = (process.env.WIDTHS ?? '320,375').split(',').map(Number)

const cache = join(homedir(), 'Library/Caches/ms-playwright')
const bin = [
  'chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
].map((p) => join(cache, p)).find(existsSync)
if (!bin) { console.error('Chromium из кэша Playwright не найден'); process.exit(2) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const prof = mkdtempSync(join(tmpdir(), 'kcal-screens-'))
const chrome = spawn(bin, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  '--no-first-run', '--hide-scrollbars', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' })

let wsUrl
for (let i = 0; i < 50 && !wsUrl; i++) {
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
const events = []
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.method) { events.push(m); return }
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
const go = async (path, wait = 2800) => { await send('Page.navigate', { url: BASE + path }); await sleep(wait) }
const click = async (text, wait = 1400) => {
  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)})?.click()`)
  await sleep(wait)
}

await send('Page.enable'); await send('Runtime.enable')
await send('Network.enable'); await send('Log.enable')
await send('Network.setBypassServiceWorker', { bypass: true })
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true })
await go('/', 3500)

await evaluate(`(async () => {
  const foods = await (await fetch('/data/foods.json')).json()
  const db = await new Promise((res, rej) => { const rq = indexedDB.open('kcal-diary'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error) })
  const put = (s, v) => new Promise((res, rej) => { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).put(v); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  const dt = (off) => { const d = new Date(); d.setDate(d.getDate() - off); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-') }
  await put('profile', { id: 1, sex: 'male', birthDate: '1996-01-01', heightCm: 175, activity: 'light', goal: 'lose', ratePerWeek: 0.5,
    targets: { kcal: 1790, protein: 150, fat: 60, carbs: 163 }, targetsManual: false, theme: '${THEME}', waterGoalMl: 2250, targetWeightKg: 70, createdAt: Date.now() })
  await put('meta', { key: 'onboarded', value: true })
  // Самые длинные названия в базе — худший случай для полей и карточек
  const longest = [...foods.items].sort((a, b) => b.n.length - a.n.length)
  const meals = ['breakfast', 'lunch', 'dinner', 'snack']
  for (let i = 0; i < 8; i++) {
    const f = longest[i]
    await put('entries', { id: 'check-' + i, date: dt(0), meal: meals[i % 4], title: f.n, category: f.c,
      grams: 120 + i * 37, per100: { kcal: f.k, protein: f.p, fat: f.f, carbs: f.u }, createdAt: Date.now() - i * 1000 })
  }
  // Месяц истории, иначе отчёты пустые и проверять там нечего
  for (let d = 1; d < 30; d++) {
    await put('weights', { date: dt(d), kg: 75 - d * 0.1 })
    for (let i = 0; i < 3; i++) {
      const f = longest[(d + i) % 40]
      await put('entries', { id: 'h' + d + '-' + i, date: dt(d), meal: meals[i % 4], title: f.n, category: f.c,
        grams: 150, per100: { kcal: f.k, protein: f.p, fat: f.f, carbs: f.u }, createdAt: Date.now() - d * 86400000 })
    }
  }
  await put('weights', { date: dt(0), kg: 75 })
  await put('water', { date: dt(0), ml: 1250 })
  await put('favorites', { key: 'exercise:legs-hip-thrust', createdAt: Date.now() })
  return 1
})()`)

const AUDIT = `(() => {
  const res = { overflow: [], covered: [], wide: [], hidden: [] }
  const skip = (el) => !el || el.closest('[inert]') || el.closest('.sr-only') || el.closest('[aria-hidden="true"]')
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX
      if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth + 2) return true
    }
    return false
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let n
  while ((n = walker.nextNode())) {
    const t = (n.nodeValue || '').trim(); if (!t) continue
    const p = n.parentElement
    if (!p || ['SCRIPT', 'STYLE'].includes(p.tagName) || skip(p) || inScroller(p)) continue
    const cs = getComputedStyle(p)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    if (cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none') continue
    const r = document.createRange(); r.selectNodeContents(n)
    const tr = r.getBoundingClientRect(); if (!tr.width) continue
    const pr = p.getBoundingClientRect()
    const pad = (k) => parseFloat(cs[k]) || 0
    const right = tr.right - (pr.right - pad('paddingRight'))
    const left = (pr.left + pad('paddingLeft')) - tr.left
    const vp = tr.right - document.documentElement.clientWidth
    if (right > 1.5 || left > 1.5 || vp > 1.5) {
      res.overflow.push({ text: t.slice(0, 44), el: p.tagName + '.' + String(p.className).slice(0, 26),
        right: +right.toFixed(1), left: +left.toFixed(1), vp: +vp.toFixed(1) })
    }
  }
  const cands = []
  for (const el of document.querySelectorAll('body *')) {
    if (skip(el) || ['SCRIPT', 'STYLE'].includes(el.tagName)) continue
    if (![...el.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim())) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) continue
    const r = el.getBoundingClientRect()
    if (r.width < 6 || r.height < 6) continue
    cands.push(el)
  }
  for (const el of cands) {
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    if (r.width < 6 || r.height < 6) continue
    const pts = [[r.left + r.width * 0.2, r.top + r.height / 2], [r.left + r.width / 2, r.top + r.height / 2],
      [r.right - r.width * 0.2, r.top + r.height / 2]]
    for (const [x, y] of pts) {
      if (x < 1 || y < 1 || x > innerWidth - 1 || y > innerHeight - 1) continue
      const hit = document.elementFromPoint(x, y)
      if (!hit || hit === el || el.contains(hit) || hit.contains(el)) continue
      res.covered.push({ text: (el.textContent || '').trim().slice(0, 40),
        el: el.tagName + '.' + String(el.className).slice(0, 24), by: hit.tagName + '.' + String(hit.className).slice(0, 24) })
      break
    }
  }
  window.scrollTo(0, 0)
  const cw = document.documentElement.clientWidth
  for (const el of document.querySelectorAll('body *')) {
    if (skip(el) || inScroller(el)) continue
    const r = el.getBoundingClientRect()
    if (r.width < 4) continue
    if (r.right > cw + 1.5 || r.left < -1.5) {
      res.wide.push({ el: el.tagName + '.' + String(el.className).slice(0, 28), left: +r.left.toFixed(1), right: +r.right.toFixed(1) })
    }
  }
  window.scrollTo(0, document.body.scrollHeight)
  const bar = document.querySelector('nav[aria-label="Основная навигация"]')
  if (bar) {
    const br = bar.getBoundingClientRect()
    const sheet = document.querySelector('[role="dialog"]')
    for (const el of cands) {
      if (bar.contains(el) || (sheet && sheet.contains(el))) continue
      const r = el.getBoundingClientRect()
      if (r.top > br.top + 4 && r.bottom > br.top && r.top < innerHeight) {
        res.hidden.push({ text: (el.textContent || '').trim().slice(0, 40), el: el.tagName + '.' + String(el.className).slice(0, 24) })
      }
    }
  }
  window.scrollTo(0, 0)
  return res
})()`

const STATES = [
  ['заставка', () => go('/?splash=1', 2600)],
  ['главная', () => go('/', 3000)],
  ['зал: группы', () => go('/gym')],
  ['зал: выбор пола', () => go('/gym/shoulders', 2400)],
  ['зал: список (муж)', () => go('/gym/legs/male', 2400)],
  ['зал: список (жен)', () => go('/gym/triceps/female', 2400)],
  ['зал: карточка упражнения', () => go('/gym/chest/male?open=chest-bench-barbell', 3000)],
  ['отчёты', () => go('/stats', 3200)],
  ['профиль', () => go('/profile', 2800)],
  ['панель: добавить еду', async () => {
    await go('/', 3000)
    await evaluate(`document.querySelector('[aria-label="Добавить еду"]').click()`)
    await sleep(1400)
  }],
  ['панель: штрихкод', () => click('Штрихкод', 1600)],
  ['панель: вручную', () => click('Вручную', 1200)],
  ['панель: рецепты', () => click('Рецепты', 2600)],
  ['панель: каталог блюд', () => click('Каталог', 2600)],
]

let total = 0
for (const width of WIDTHS) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 812, deviceScaleFactor: 2, mobile: true })
  for (const [name, run] of STATES) {
    events.length = 0
    await run()
    const r = await evaluate(AUDIT)
    const errs = events
      .filter((e) => e.method === 'Runtime.exceptionThrown'
        || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
        || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'))
      .map((e) => (e.params.entry?.text ?? e.params.exceptionDetails?.text
        ?? e.params.args?.map((a) => a.value ?? a.description).join(' ') ?? '').slice(0, 160))
    const failed = events
      .filter((e) => e.method === 'Network.loadingFailed' && !String(e.params.errorText).includes('ERR_ABORTED'))
      .map((e) => e.params.errorText)
    const bad = events
      .filter((e) => e.method === 'Network.responseReceived' && e.params.response.status >= 400)
      .map((e) => `${e.params.response.status} ${e.params.response.url.replace(BASE, '')}`)

    const hits = [
      ...r.overflow.map((h) => `текст за рамкой: «${h.text}» в ${h.el} — вправо ${h.right}px, влево ${h.left}px, за экран ${h.vp}px`),
      ...r.covered.map((h) => `текст накрыт: «${h.text}» (${h.el}) закрыт ${h.by}`),
      ...r.wide.map((h) => `шире экрана: ${h.el} — от ${h.left} до ${h.right}`),
      ...r.hidden.map((h) => `не выкручивается из-под панели: «${h.text}» (${h.el})`),
      ...errs.map((t) => `ошибка: ${t}`),
      ...failed.map((t) => `запрос не удался: ${t}`),
      ...bad.map((t) => `ответ с ошибкой: ${t}`),
    ]
    total += hits.length
    console.log(`${hits.length ? '✗' : '✓'} ${width}px ${name}${hits.length ? ` — ${hits.length}` : ''}`)
    for (const h of hits) console.log(`    ${h}`)
  }
}

ws.close(); chrome.kill()
rmSync(prof, { recursive: true, force: true })
if (total > 0) { console.error(`\nЗамечаний: ${total}`); process.exit(1) }
console.log(`\nВсе экраны чисты (${THEME}, ширины ${WIDTHS.join(', ')})`)
