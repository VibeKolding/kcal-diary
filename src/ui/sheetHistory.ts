/**
 * Системное «назад» закрывает выдвижную панель, а не уводит с экрана.
 *
 * Каждая открытая панель держит в истории браузера запись с тем же адресом.
 * «Назад» снимает верхнюю запись, по popstate закрывается верхняя панель,
 * а роутер никуда не переходит: запись копирует его состояние (key, idx),
 * и для него это тот же экран.
 *
 * Записи не привязаны к конкретным панелям — сверяется только их число с
 * числом открытых панелей. Поэтому переход «Добавить еду» → «Сколько
 * съели», где одна панель уходит, а другая приходит в том же кадре, историю
 * не трогает вовсе: панелей как была одна, так и осталась.
 *
 * Расхождение сводится отложенно. Лишние записи снимаются через
 * SHRINK_DELAY_MS: следующая панель может прийти чуть позже (карточка блюда
 * грузится лениво), а цикл «снять запись — сразу добавить новую» без
 * свежего касания Chrome наказывает: помечает запись под ней пропускаемой,
 * и «назад» проскакивает экран целиком.
 */

export interface HistoryLike {
  readonly state: unknown
  pushState(data: unknown, unused: string): void
  go(delta: number): void
  scrollRestoration: ScrollRestoration
}

export interface Clock {
  set(fn: () => void, ms: number): number
  clear(id: number): void
  now(): number
}

export interface HistorySync {
  /** Сколько панелей открыто сейчас */
  setOpen(count: number): void
  /** Обработчик popstate */
  onPop(): void
}

/** Столько же, сколько панель уезжает вниз */
export const SHRINK_DELAY_MS = 220
/** Если popstate от нашего же go() так и не пришёл — перестать его ждать */
export const POP_TIMEOUT_MS = 1000

const KEY = 'kcalSheet'

function asObject(state: unknown): Record<string, unknown> {
  return typeof state === 'object' && state !== null ? state as Record<string, unknown> : {}
}

/**
 * @param onBack вызывается на системное «назад»: закрыть все панели, кроме
 *   нижних `keep`. Панель закрывает её родитель, поэтому здесь только просьба.
 * @param session метка загрузки страницы. Записи, оставшиеся от прошлой
 *   загрузки (перезагрузили с открытой панелью), чужие: их панелей уже нет.
 */
export function createHistorySync(
  h: HistoryLike,
  clock: Clock,
  onBack: (keep: number) => void,
  session: string = Math.random().toString(36).slice(2),
): HistorySync {
  let want = 0
  // Сколько наших записей лежит над базовой, насколько нам известно
  let depth = 0
  // Ждём popstate от собственного go(): его нельзя принять за «назад»
  let pending = false
  let pendingTimer = 0
  let timer = 0
  let timerAt = 0
  let savedMode: ScrollRestoration | null = null

  const depthOf = (state: unknown): number => {
    const mark = asObject(state)[KEY]
    if (typeof mark !== 'object' || mark === null) return 0
    const { s, n } = mark as { s?: unknown; n?: unknown }
    return s === session && typeof n === 'number' ? n : 0
  }

  /** Ранний срок побеждает: сверка идемпотентна, лишний прогон безвреден */
  function schedule(ms: number) {
    const at = clock.now() + ms
    if (timer !== 0) {
      if (timerAt <= at) return
      clock.clear(timer)
    }
    timerAt = at
    timer = clock.set(reconcile, ms)
  }

  function reconcile() {
    timer = 0
    if (pending) return
    // История могла смениться без нас: роутер положил экран поверх записи
    // панели, страницу перезагрузили на нашей записи
    depth = depthOf(h.state)
    if (want > depth) {
      // Возврат на базовую запись не должен двигать страницу: пока панель
      // была открыта, человек мог прокрутить её сразу после закрытия.
      // Режим хранится в самой записи, поэтому ставится до первой нашей.
      if (depth === 0) {
        savedMode ??= h.scrollRestoration
        h.scrollRestoration = 'manual'
      }
      try {
        while (depth < want) {
          h.pushState({ ...asObject(h.state), [KEY]: { s: session, n: depth + 1 } }, '')
          depth += 1
        }
      } catch {
        // Safari ограничивает частоту pushState. Без записи «назад» просто
        // уведёт с экрана, как раньше; следующая сверка перечитает историю.
      }
    } else if (want < depth) {
      pending = true
      pendingTimer = clock.set(() => { pending = false; schedule(0) }, POP_TIMEOUT_MS)
      h.go(want - depth)
    }
  }

  return {
    setOpen(count) {
      const grew = count > want
      want = count
      schedule(grew ? 0 : SHRINK_DELAY_MS)
    },
    onPop() {
      const n = depthOf(h.state)
      depth = n
      if (n === 0 && savedMode !== null) {
        h.scrollRestoration = savedMode
        savedMode = null
      }
      if (pending) {
        pending = false
        clock.clear(pendingTimer)
        schedule(0)
        return
      }
      if (n < want) {
        // Системное «назад». Родитель закроет панель на следующей отрисовке,
        // поэтому сверка отложена: иначе мы вернули бы только что снятую запись.
        onBack(n)
        schedule(SHRINK_DELAY_MS)
      } else if (n > want) {
        // «Вперёд» на запись уже закрытой панели — вернуться обратно
        schedule(0)
      }
    },
  }
}
