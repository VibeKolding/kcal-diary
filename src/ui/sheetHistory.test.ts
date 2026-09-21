import { describe, expect, it } from 'vitest'
import { createHistorySync, POP_TIMEOUT_MS, SHRINK_DELAY_MS, type Clock, type HistoryLike } from './sheetHistory'

/** Часы, которые двигает тест */
function fakeClock() {
  let now = 0
  let seq = 0
  const timers = new Map<number, { at: number; fn: () => void }>()
  const clock: Clock = {
    set: (fn, ms) => { seq += 1; timers.set(seq, { at: now + ms, fn }); return seq },
    clear: (id) => { timers.delete(id) },
    now: () => now,
  }
  const advance = (ms: number) => {
    const end = now + ms
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      timers.delete(due[0])
      now = due[1].at
      due[1].fn()
    }
    now = end
  }
  return { clock, advance }
}

/**
 * История как в браузере: pushState обрезает «вперёд», go() доезжает не
 * сразу, а popstate приходит отдельной задачей. scrollRestoration хранится
 * в каждой записи и наследуется новой.
 */
function fakeHistory(first: unknown = { idx: 0, key: 'base' }) {
  const entries: { state: unknown; mode: ScrollRestoration }[] = [{ state: first, mode: 'auto' }]
  let index = 0
  const queue: number[] = []
  let listener = () => {}
  const h: HistoryLike & { pushes: number; gos: number } = {
    pushes: 0,
    gos: 0,
    get state() { return entries[index]!.state },
    get scrollRestoration() { return entries[index]!.mode },
    set scrollRestoration(mode) { entries[index]!.mode = mode },
    pushState(state) {
      h.pushes += 1
      entries.splice(index + 1)
      entries.push({ state, mode: entries[index]!.mode })
      index += 1
    },
    go(delta) { h.gos += 1; queue.push(delta) },
  }
  return {
    h,
    listen: (fn: () => void) => { listener = fn },
    /** Браузер доезжает до записи и присылает popstate */
    deliver() {
      for (const delta of queue.splice(0)) {
        index = Math.max(0, Math.min(entries.length - 1, index + delta))
        listener()
      }
    },
    /** Системная кнопка «назад» */
    back() { index -= 1; listener() },
    forward() { index += 1; listener() },
    /** Роутер кладёт свой экран */
    routerPush(state: unknown) { entries.splice(index + 1); entries.push({ state, mode: entries[index]!.mode }); index += 1 },
    get index() { return index },
    get length() { return entries.length },
    modeAt: (i: number) => entries[i]!.mode,
  }
}

function setup() {
  const { clock, advance } = fakeClock()
  const hist = fakeHistory()
  const closed: number[] = []
  let open = 0
  const sync = createHistorySync(hist.h, clock, (keep) => { closed.push(keep) }, 'S')
  hist.listen(sync.onPop)
  const setOpen = (n: number) => { open = n; sync.setOpen(n) }
  // Родитель послушно закрывает панели, которые попросили закрыть
  const obeyBack = () => {
    const keep = closed.shift()
    if (keep !== undefined && keep < open) setOpen(keep)
  }
  return { hist, advance, setOpen, closed, obeyBack }
}

describe('системное «назад» и панели', () => {
  it('открытая панель кладёт одну запись с тем же состоянием роутера', () => {
    const { hist, advance, setOpen } = setup()
    setOpen(1)
    advance(0)
    expect(hist.length).toBe(2)
    expect(hist.h.state).toMatchObject({ idx: 0, key: 'base' })
  })

  it('«назад» закрывает панель, а не уводит с экрана', () => {
    const { hist, advance, setOpen, closed, obeyBack } = setup()
    setOpen(1)
    advance(0)
    hist.back()
    expect(closed).toEqual([0])
    obeyBack()
    advance(SHRINK_DELAY_MS)
    // Запись уже снята самим «назад» — второй раз назад не идём
    expect(hist.h.gos).toBe(0)
    expect(hist.index).toBe(0)
  })

  it('закрытие крестиком снимает свою запись', () => {
    const { hist, advance, setOpen, closed } = setup()
    setOpen(1)
    advance(0)
    setOpen(0)
    advance(SHRINK_DELAY_MS)
    expect(hist.h.gos).toBe(1)
    hist.deliver()
    expect(hist.index).toBe(0)
    // Собственный popstate — не «назад»: закрывать нечего
    expect(closed).toEqual([])
    advance(1000)
    expect(hist.h.gos).toBe(1)
  })

  it('смена панели в одном кадре не трогает историю — в любом порядке', () => {
    for (const order of ['close-first', 'open-first'] as const) {
      const { hist, advance, setOpen } = setup()
      setOpen(1)
      advance(0)
      const pushes = hist.h.pushes
      if (order === 'close-first') { setOpen(0); setOpen(1) } else { setOpen(2); setOpen(1) }
      advance(1000)
      expect(hist.h.pushes).toBe(pushes)
      expect(hist.h.gos).toBe(0)
      expect(hist.length).toBe(2)
    }
  })

  it('ленивая панель, пришедшая чуть позже, тоже не трогает историю', () => {
    const { hist, advance, setOpen } = setup()
    setOpen(1)
    advance(0)
    setOpen(0)
    advance(40)
    setOpen(1)
    advance(1000)
    expect(hist.h.gos).toBe(0)
    expect(hist.h.pushes).toBe(1)
  })

  it('панель поверх панели: «назад» закрывает только верхнюю', () => {
    const { hist, advance, setOpen, closed, obeyBack } = setup()
    setOpen(1)
    advance(0)
    setOpen(2)
    advance(0)
    expect(hist.length).toBe(3)
    hist.back()
    expect(closed).toEqual([1])
    obeyBack()
    advance(SHRINK_DELAY_MS)
    expect(hist.index).toBe(1)
    hist.back()
    expect(closed).toEqual([0])
  })

  it('родитель не закрыл панель по «назад» — запись возвращается', () => {
    const { hist, advance, setOpen } = setup()
    setOpen(1)
    advance(0)
    hist.back()
    advance(SHRINK_DELAY_MS)
    expect(hist.index).toBe(1)
    expect(hist.length).toBe(2)
  })

  it('роутер положил экран поверх панели: крестик не уводит назад с нового экрана', () => {
    const { hist, advance, setOpen } = setup()
    setOpen(1)
    advance(0)
    hist.routerPush({ idx: 1, key: 'stats' })
    setOpen(0)
    advance(SHRINK_DELAY_MS)
    expect(hist.h.gos).toBe(0)
    expect(hist.h.state).toMatchObject({ key: 'stats' })
  })

  it('записи прошлой загрузки страницы считаются чужими', () => {
    const { clock, advance } = fakeClock()
    const hist = fakeHistory({ idx: 0, key: 'base', kcalSheet: { s: 'old', n: 1 } })
    const closed: number[] = []
    const sync = createHistorySync(hist.h, clock, (keep) => { closed.push(keep) }, 'new')
    hist.listen(sync.onPop)
    sync.setOpen(1)
    advance(0)
    hist.back()
    // Под нашей записью — чужая: «назад» закрывает панель
    expect(closed).toEqual([0])
  })

  it('«вперёд» на запись закрытой панели возвращает обратно', () => {
    const { hist, advance, setOpen, closed, obeyBack } = setup()
    setOpen(1)
    advance(0)
    hist.back()
    obeyBack()
    advance(SHRINK_DELAY_MS)
    hist.forward()
    advance(0)
    expect(hist.h.gos).toBe(1)
    hist.deliver()
    expect(hist.index).toBe(0)
    expect(closed).toEqual([])
  })

  it('если popstate от своего go() не пришёл, сверка не застревает', () => {
    const { hist, advance, setOpen } = setup()
    setOpen(1)
    advance(0)
    setOpen(0)
    advance(SHRINK_DELAY_MS)
    expect(hist.h.gos).toBe(1)
    // Браузер отменил переход: мы всё ещё на своей записи
    advance(POP_TIMEOUT_MS)
    expect(hist.h.gos).toBe(2)
  })

  it('возврат на базовую запись не прокручивает страницу, и режим возвращается', () => {
    const { hist, advance, setOpen } = setup()
    setOpen(1)
    advance(0)
    // Режим записи экрана ручной, пока над ней лежит панель
    expect(hist.modeAt(0)).toBe('manual')
    setOpen(0)
    advance(SHRINK_DELAY_MS)
    hist.deliver()
    expect(hist.modeAt(0)).toBe('auto')
  })
})
