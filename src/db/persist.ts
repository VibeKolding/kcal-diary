/**
 * Долговечность хранилища на устройстве.
 *
 * Данные лежат в IndexedDB, и по умолчанию браузер считает их расходным
 * материалом: при нехватке места система вправе вычистить их вместе с
 * кэшем сайтов. Команда `persist()` меняет пометку — «это не кэш, это
 * данные человека». Окон она не показывает и от человека ничего не
 * требует, решение принимает браузер.
 */
import { getMeta, setMeta, META } from './db'

/**
 * Просим, только когда приложение вынесено на домашний экран.
 *
 * Две причины. Первая: именно в этом виде браузер почти всегда соглашается —
 * иконка на экране и есть тот знак доверия, которого он ждёт. Вторая важнее:
 * часть браузеров на этот запрос показывает разрешение, а во вкладке это
 * выглядело бы как окно на пустом месте. Установленному приложению его не
 * показывает никто.
 */
function isInstalled(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches === true
    || (window.navigator as { standalone?: boolean }).standalone === true
}

export type PersistState = 'granted' | 'denied' | 'unsupported' | 'skipped'

/**
 * Один вызов при запуске. Возвращает состояние, чтобы профиль мог честно
 * сказать, защищено хранилище или нет.
 */
export async function ensurePersistentStorage(): Promise<PersistState> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
  if (!storage?.persist || !storage.persisted) return 'unsupported'

  if (await storage.persisted()) {
    await setMeta(META.storagePersisted, true)
    return 'granted'
  }
  if (!isInstalled()) return 'skipped'

  // Промах здесь не должен ронять запуск: без пометки приложение работает
  // ровно так же, просто с прежним риском.
  let ok = false
  try {
    ok = await storage.persist()
  } catch {
    return 'unsupported'
  }
  await setMeta(META.storagePersisted, ok)
  return ok ? 'granted' : 'denied'
}

/** Что браузер думает о хранилище прямо сейчас — для экрана профиля */
export async function persistState(): Promise<PersistState> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
  if (!storage?.persisted) return 'unsupported'
  if (await storage.persisted()) return 'granted'
  return isInstalled() ? 'denied' : 'skipped'
}

export interface SpaceReport {
  /** Занято приложением, байт */
  used: number
  /** Сколько браузер готов дать всего, байт */
  quota: number
  /** Свободно в пределах выделенного, байт */
  free: number
  /** Места в обрез: меньше 50 МБ или занято больше 90 % */
  tight: boolean
}

/**
 * Свободное место. Нужно, чтобы предупредить заранее, а не после того,
 * как система начала чистить: к тому моменту предупреждать уже поздно.
 */
export async function spaceReport(): Promise<SpaceReport | null> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
  if (!storage?.estimate) return null
  let used = 0
  let quota = 0
  try {
    const e = await storage.estimate()
    used = e.usage ?? 0
    quota = e.quota ?? 0
  } catch {
    return null
  }
  if (!quota) return null
  const free = Math.max(0, quota - used)
  return { used, quota, free, tight: free < 50 * 1024 * 1024 || used / quota > 0.9 }
}

/** Пометка из прошлого запуска — на случай, если браузер отвечает не сразу */
export async function lastKnownPersisted(): Promise<boolean> {
  return getMeta<boolean>(META.storagePersisted, false)
}
