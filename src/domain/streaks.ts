import { dayKey, shiftDay } from './dates'
import { TOLERANCE } from './nutrition'

export interface DayStat {
  date: string
  kcal: number
  target: number
  logged: boolean
}

export type DayVerdict = 'empty' | 'under' | 'onTarget' | 'over'

/**
 * Оценка дня относительно нормы. Коридор ±10 % считается попаданием:
 * требовать точного числа бессмысленно, взвешивание еды всегда приблизительно.
 *
 * Пустой — только день без записей. День, где записана одна вода (0 ккал),
 * — это день с записями: он продлевает серию и входит в «за N дней», поэтому
 * и в оценке он недобор, а не пустота. Раньше разбивка «сверх · ниже · в
 * коридоре» теряла такой день и в сумме не сходилась с числом дней.
 */
export function verdict(stat: DayStat, tolerance = TOLERANCE): DayVerdict {
  if (!stat.logged) return 'empty'
  const low = stat.target * (1 - tolerance)
  const high = stat.target * (1 + tolerance)
  if (stat.kcal < low) return 'under'
  if (stat.kcal > high) return 'over'
  return 'onTarget'
}

/**
 * Длина текущей серии дней подряд, где дневник вёлся.
 * Сегодняшний день не обрывает серию, пока он пуст: до вечера ещё есть время поесть.
 */
export function currentStreak(stats: DayStat[], today: string = dayKey()): number {
  const byDate = new Map(stats.map((s) => [s.date, s]))
  let streak = 0
  let cursor = today

  if (!byDate.get(today)?.logged) cursor = shiftDay(today, -1)

  while (byDate.get(cursor)?.logged) {
    streak += 1
    cursor = shiftDay(cursor, -1)
  }
  return streak
}

export function bestStreak(stats: DayStat[]): number {
  const sorted = [...stats].sort((a, b) => a.date.localeCompare(b.date))
  let best = 0
  let run = 0
  let prev: string | null = null

  for (const s of sorted) {
    if (!s.logged) {
      run = 0
      prev = s.date
      continue
    }
    run = prev !== null && shiftDay(prev, 1) === s.date ? run + 1 : 1
    best = Math.max(best, run)
    prev = s.date
  }
  return best
}

/** Доля дней, попавших в коридор нормы, среди дней с записями */
export function accuracy(stats: DayStat[], tolerance = TOLERANCE): number {
  const logged = stats.filter((s) => s.logged)
  if (logged.length === 0) return 0
  const hits = logged.filter((s) => verdict(s, tolerance) === 'onTarget').length
  return hits / logged.length
}

/** Среднее за день по дням с записями — тем же, что и в итоге периода */
export function averageKcal(stats: DayStat[]): number {
  const logged = stats.filter((s) => s.logged)
  if (logged.length === 0) return 0
  return logged.reduce((sum, s) => sum + s.kcal, 0) / logged.length
}
