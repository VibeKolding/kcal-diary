import { db, getMeta, setMeta, META } from '@/db/db'
import { dayKey } from '@/domain/dates'
import { entriesForDay } from '@/db/entries'
import { getWater } from '@/db/tracking'

export interface ReminderSettings {
  enabled: boolean
  /** Проверить, записан ли день, в это время. '' — выключено */
  mealAt: string
  /** Напоминать о воде каждые N часов с 9 до 21. 0 — выключено */
  waterEveryH: number
  /** Утреннее взвешивание. '' — выключено */
  weighAt: string
}

export const DEFAULT_REMINDERS: ReminderSettings = {
  enabled: false,
  mealAt: '20:00',
  waterEveryH: 2,
  weighAt: '08:00',
}

export async function getReminders(): Promise<ReminderSettings> {
  const saved = await getMeta<Partial<ReminderSettings>>(META.reminders, {})
  return { ...DEFAULT_REMINDERS, ...saved }
}

export async function saveReminders(s: ReminderSettings): Promise<void> {
  await setMeta(META.reminders, s)
}

export function notificationsSupported(): boolean {
  return typeof Notification !== 'undefined' && 'serviceWorker' in navigator
}

export async function askPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied'
  if (Notification.permission !== 'default') return Notification.permission
  return Notification.requestPermission()
}

/** Показать через воркер, если он есть: такое уведомление живёт в шторке, а не в вкладке */
async function notify(title: string, body: string, tag: string): Promise<void> {
  if (Notification.permission !== 'granted') return
  const opts: NotificationOptions = { body, tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' }
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification(title, opts)
  } catch {
    new Notification(title, opts)
  }
}

type Kind = 'meal' | 'water' | 'weigh'

/**
 * Что сказать — и надо ли вообще. Напоминание молчит, если дело уже сделано:
 * ужин записан, вода выпита, вес есть. Иначе это не помощь, а шум.
 */
export async function buildMessage(kind: Kind, waterGoalMl: number): Promise<[string, string] | null> {
  const today = dayKey()
  if (kind === 'meal') {
    const rows = await entriesForDay(today)
    if (rows.length > 0) return null
    return ['Дневник за сегодня пуст', 'Запишите, что ели, — пара минут, и день не потеряется']
  }
  if (kind === 'water') {
    const ml = await getWater(today)
    if (ml >= waterGoalMl) return null
    return ['Стакан воды', `Сегодня ${ml} из ${waterGoalMl} мл`]
  }
  const w = await db.weights.get(today)
  if (w?.kg) return null
  return ['Утреннее взвешивание', 'До еды и после ванной — так цифры сравнимы день ко дню']
}

/** Ближайший момент по «ЧЧ:ММ» — сегодня, если ещё не прошло, иначе завтра */
export function nextAt(hhmm: string, now = new Date()): number {
  const [h, m] = hhmm.split(':').map(Number)
  const t = new Date(now)
  t.setHours(h ?? 0, m ?? 0, 0, 0)
  if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1)
  return t.getTime()
}

/** Ближайший час, кратный шагу, в окне 9–21 */
export function nextWaterAt(everyH: number, now = new Date()): number {
  const t = new Date(now)
  t.setMinutes(0, 0, 0)
  for (let i = 0; i < 48; i++) {
    t.setHours(t.getHours() + 1)
    const h = t.getHours()
    if (h >= 9 && h <= 21 && (h - 9) % everyH === 0) return t.getTime()
  }
  return t.getTime()
}

/** Опоздание, после которого напоминание уже не к месту, мс */
export const LATE_MS = 15 * 60 * 1000

/**
 * Опоздал ли таймер. Пока телефон спит или вкладка заморожена, таймеры
 * стоят, и просроченный срабатывает в момент возврата: «Дневник за сегодня
 * пуст» в восемь утра — про новый, только начавшийся день, а стакан воды —
 * посреди ночи. Такое напоминание пропускается, следующее встаёт по плану.
 * Смена дня — тоже опоздание: напоминание о вчерашнем дне сегодня ни к чему.
 */
export function isLate(when: number, now: number = Date.now()): boolean {
  return now - when > LATE_MS || dayKey(new Date(when)) !== dayKey(new Date(now))
}

/**
 * Длинное ожидание режется на отрезки. Таймер на восемь часов вперёд
 * отсчитывает время работы устройства, а не часы: сон ноутбука или
 * заморозка вкладки сдвигают его на всю длину сна. Отрезок в пять минут
 * сверяется с часами, и срок не уплывает.
 */
export const STEP_MS = 5 * 60 * 1000

export function nextWait(when: number, now: number = Date.now()): number {
  return Math.min(STEP_MS, Math.max(0, when - now))
}

/**
 * Планировщик. Веб-приложение без сервера не умеет будить себя из ниоткуда:
 * таймеры идут, пока страница жива, а свёрнутую вкладку телефон вскоре
 * замораживает. Пропущенное за это время не догоняется (см. isLate).
 * Возвращает функцию остановки.
 */
export function schedule(settings: ReminderSettings, waterGoalMl: number): () => void {
  if (!settings.enabled || Notification.permission !== 'granted') return () => {}
  // Один текущий таймер на вид напоминания: и отрезки ожидания, и
  // перевзвод после срабатывания заменяют его, а не копятся
  const timers = new Map<Kind, number>()
  // Остановка ставит флаг, а не только чистит таймеры: срабатывание могло
  // уже ждать buildMessage, и без флага оно перевзвело бы цепочку со
  // старыми настройками уже после «Выключить»
  let stopped = false

  const arm = (kind: Kind, when: number, next: () => number) => {
    if (stopped) return
    const wait = nextWait(when)
    timers.set(kind, window.setTimeout(async () => {
      if (stopped) return
      if (Date.now() < when) { arm(kind, when, next); return }
      if (!isLate(when)) {
        const msg = await buildMessage(kind, waterGoalMl)
        if (stopped) return
        if (msg) await notify(msg[0], msg[1], `kcal-${kind}`)
      }
      arm(kind, next(), next)
    }, wait))
  }

  const start = (kind: Kind, next: () => number) => arm(kind, next(), next)
  if (settings.mealAt) start('meal', () => nextAt(settings.mealAt))
  if (settings.weighAt) start('weigh', () => nextAt(settings.weighAt))
  if (settings.waterEveryH > 0) start('water', () => nextWaterAt(settings.waterEveryH))

  return () => {
    stopped = true
    timers.forEach((t) => clearTimeout(t))
    timers.clear()
  }
}
