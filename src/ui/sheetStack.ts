import { createHistorySync } from './sheetHistory'

/**
 * Общий учёт открытых панелей.
 *
 * Прокрутку страницы и inert на #root держит не каждая панель сама по
 * себе, а этот счётчик: блокировка ставится при первой открытой панели и
 * снимается при закрытии последней. Раньше каждая панель запоминала
 * «прежний» overflow и возвращала его при закрытии. При переходе
 * «Добавить еду» → «Сколько съели» вторая панель открывалась, пока первая
 * ещё держала блокировку, запоминала 'hidden' и потом его же и
 * «возвращала» — после первой записи еды не прокручивался ни один экран.
 * Счётчику порядок открытия и закрытия безразличен.
 */

export interface SheetStack<T> {
  open(item: T): void
  /** Повторное закрытие ничего не делает — очистка эффекта может прийти дважды */
  close(item: T): void
  top(): T | undefined
  items(): readonly T[]
}

export interface StackEnv {
  /** Заблокировать страницу; возвращает снятие блокировки */
  lock(): () => void
  /** Сколько панелей открыто после изменения */
  onCount?(count: number): void
}

export function createSheetStack<T>(env: StackEnv): SheetStack<T> {
  const items: T[] = []
  let release: (() => void) | null = null
  return {
    open(item) {
      if (items.includes(item)) return
      items.push(item)
      release ??= env.lock()
      env.onCount?.(items.length)
    },
    close(item) {
      const i = items.indexOf(item)
      if (i < 0) return
      items.splice(i, 1)
      if (items.length === 0 && release) {
        release()
        release = null
      }
      env.onCount?.(items.length)
    },
    top: () => items[items.length - 1],
    items: () => items,
  }
}

interface LockBody { style: { overflow: string } }
interface LockRoot {
  hasAttribute(name: string): boolean
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
}

/** Страница под панелью не прокручивается и недоступна фокусу и скринридеру */
export function lockPage(body: LockBody, root: LockRoot | null): () => void {
  const overflow = body.style.overflow
  const wasInert = root?.hasAttribute('inert') ?? false
  body.style.overflow = 'hidden'
  root?.setAttribute('inert', '')
  return () => {
    body.style.overflow = overflow
    if (!wasInert) root?.removeAttribute('inert')
  }
}

/** Открытая панель, как её видят соседи */
export interface SheetItem {
  /** Контейнер панели */
  el: HTMLElement | null
  /** Откуда открыли: туда вернётся фокус */
  opener: HTMLElement | null
  /** Предки opener на момент открытия — запас, если он сам исчезнет */
  trail: readonly Element[]
  /** Попросить родителя закрыть панель */
  close(): void
}

let shared: SheetStack<SheetItem> | null = null

/** Один учёт на приложение: панели не знают друг о друге */
export function sheetStack(): SheetStack<SheetItem> {
  if (shared) return shared
  let setOpen: ((count: number) => void) | null = null
  const stack = createSheetStack<SheetItem>({
    lock: () => lockPage(document.body, document.getElementById('root')),
    onCount: (count) => setOpen?.(count),
  })
  const sync = createHistorySync(
    window.history,
    {
      set: (fn, ms) => window.setTimeout(fn, ms),
      clear: (id) => window.clearTimeout(id),
      now: () => performance.now(),
    },
    // Сверху вниз: верхняя панель уходит первой
    (keep) => { for (const item of stack.items().slice(keep).reverse()) item.close() },
  )
  setOpen = sync.setOpen
  window.addEventListener('popstate', sync.onPop)
  shared = stack
  return stack
}
