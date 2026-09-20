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

/**
 * Планировщик. Веб-приложение без сервера не умеет будить себя из ниоткуда,
 * поэтому таймеры живут, пока дневник открыт или свёрнут. Возвращает
 * функцию остановки.
 */
export function schedule(settings: ReminderSettings, waterGoalMl: number): () => void {
  if (!settings.enabled || Notification.permission !== 'granted') return () => {}
  const timers: number[] = []
  const arm = (kind: Kind, when: number, again: () => number) => {
    const delay = Math.max(1000, when - Date.now())
    timers.push(window.setTimeout(async () => {
      const msg = await buildMessage(kind, waterGoalMl)
      if (msg) await notify(msg[0], msg[1], `kcal-${kind}`)
      arm(kind, again(), again)
    }, delay))
  }
  if (settings.mealAt) arm('meal', nextAt(settings.mealAt), () => nextAt(settings.mealAt))
  if (settings.weighAt) arm('weigh', nextAt(settings.weighAt), () => nextAt(settings.weighAt))
  if (settings.waterEveryH > 0) {
    arm('water', nextWaterAt(settings.waterEveryH), () => nextWaterAt(settings.waterEveryH))
  }
  return () => timers.forEach((t) => clearTimeout(t))
}
