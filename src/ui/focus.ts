/**
 * Фокус с клавиатуры и скринридера: ловушка внутри панели и возврат
 * туда, откуда её открыли, — даже если того места уже нет.
 */

/** Всё, до чего доходит Tab */
const TABBABLE = [
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/** Сколько следить, не исчезнет ли место возврата фокуса */
const GUARD_MS = 1500

const focusQuietly = (el: HTMLElement) => el.focus({ preventScroll: true })

export function tabbables(box: ParentNode): HTMLElement[] {
  return Array.from(box.querySelectorAll<HTMLElement>(TABBABLE))
    .filter((el) => !el.closest('[inert]') && el.getClientRects().length > 0)
}

/**
 * Куда перевести фокус по Tab, чтобы он не вышел из панели; null — пусть
 * браузер сделает обычный шаг. `inside` — фокус на ком-то внутри панели,
 * а не на ней самой: сразу после открытия он стоит на контейнере, и
 * Shift+Tab оттуда раньше уводил на body.
 */
export function tabStep<T>(list: readonly T[], active: T | null, inside: boolean, back: boolean): T | null {
  const first = list[0]
  const last = list[list.length - 1]
  if (first === undefined || last === undefined) return null
  if (back) return !inside || active === first ? last : null
  return !inside || active === last ? first : null
}

export function trapTab(e: KeyboardEvent, box: HTMLElement): void {
  const list = tabbables(box)
  if (list.length === 0) {
    e.preventDefault()
    focusQuietly(box)
    return
  }
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const inside = !!active && active !== box && box.contains(active)
  const next = tabStep(list, active, inside, e.shiftKey)
  if (next) {
    e.preventDefault()
    focusQuietly(next)
  }
}

/** Предки элемента до body — запоминаются, пока он ещё в документе */
export function ancestry(el: Element | null): Element[] {
  const out: Element[] = []
  for (let p = el?.parentElement ?? null; p && p !== document.body; p = p.parentElement) out.push(p)
  return out
}

/** Тосту — откуда к нему пришёл фокус, чтобы вернуть его, когда тост уйдёт */
const cameFrom = new WeakMap<Element, readonly Element[]>()

/**
 * Место для фокуса вместо исчезнувшего. По порядку: действие тоста (после
 * удаления это «Отменить» — ради него удаление и обходится без
 * подтверждения), первое доступное рядом с исчезнувшим элементом,
 * заголовок экрана, первое доступное на экране.
 */
export function rescueFocus(trail: readonly Element[], viaToast = true): void {
  if (viaToast) {
    const action = document.querySelector<HTMLElement>('[data-toast-action]')
    if (action) {
      cameFrom.set(action, trail)
      focusQuietly(action)
      return
    }
  }
  const root = document.getElementById('root')
  const near = trail.find((el) => el.isConnected && el !== root && !el.closest('[inert]'))
  const target = (near && tabbables(near)[0]) ?? screenHeading(root) ?? (root && tabbables(root)[0])
  if (target) focusQuietly(target)
}

function screenHeading(root: HTMLElement | null): HTMLElement | null {
  const h = root?.querySelector<HTMLElement>('h1') ?? null
  // Заголовок не кнопка: без tabindex фокус на нём не встанет
  if (h && !h.hasAttribute('tabindex')) h.tabIndex = -1
  return h
}

/** Тост уходит, а фокус на его кнопке: вернуть туда, откуда фокус пришёл */
export function leaveToast(action: Element | null, from: HTMLElement | null): void {
  if (from && from.isConnected && !from.closest('[inert]')) {
    focusQuietly(from)
    return
  }
  rescueFocus((action && cameFrom.get(action)) ?? [], false)
}

/**
 * Фокус вернулся на opener, но тот может исчезнуть чуть позже: строка
 * удалённой записи пропадает, когда база пришлёт новый список, — уже после
 * закрытия панели. Тогда фокус падает на body, и человек с клавиатуры
 * оказывается в начале страницы, а «Отменить» — в двадцати Tab от него.
 */
export function guardFocus(target: HTMLElement, trail: readonly Element[]): void {
  if (typeof MutationObserver === 'undefined') return
  let timer = 0
  const observer = new MutationObserver(() => {
    if (target.isConnected) return
    observer.disconnect()
    clearTimeout(timer)
    const active = document.activeElement
    if (!active || active === document.body) rescueFocus(trail)
  })
  observer.observe(document.body, { childList: true, subtree: true })
  timer = window.setTimeout(() => observer.disconnect(), GUARD_MS)
}
