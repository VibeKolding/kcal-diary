import type { Goal, WeightRecord } from './types'
import { parseDay, plural } from './dates'

const DAY_MS = 86_400_000

/**
 * Скорость изменения веса, кг в неделю, по линейной регрессии.
 *
 * Не «последний минус первый»: один тяжёлый ужин перед взвешиванием
 * иначе выглядел бы как набор килограмма за день. Прямая через все точки
 * такие выбросы сглаживает. Нужны хотя бы две точки и три дня между ними.
 */
export function weeklyTrend(records: WeightRecord[]): number | null {
  if (records.length < 2) return null
  const t0 = parseDay(records[0]!.date).getTime()
  const xs = records.map((r) => (parseDay(r.date).getTime() - t0) / DAY_MS)
  const ys = records.map((r) => r.kg)
  const span = xs[xs.length - 1]! - xs[0]!
  if (span < 3) return null
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my)
    den += (xs[i]! - mx) ** 2
  }
  if (den === 0) return null
  return (num / den) * 7
}

/** Скользящее среднее по окну в днях — сглаженная линия для графика */
export function movingAverage(records: WeightRecord[], windowDays = 7): (WeightRecord & { avg: number })[] {
  return records.map((r, i) => {
    const t = parseDay(r.date).getTime()
    const inWindow = records
      .slice(0, i + 1)
      .filter((p) => t - parseDay(p.date).getTime() < windowDays * DAY_MS)
    const avg = inWindow.reduce((a, p) => a + p.kg, 0) / inWindow.length
    return { ...r, avg: Math.round(avg * 10) / 10 }
  })
}

/**
 * Сколько недель до цели при заданном темпе. null — если темп нулевой
 * или ведёт в другую сторону: тогда честнее ничего не обещать.
 */
export function weeksToTarget(currentKg: number, targetKg: number, kgPerWeek: number): number | null {
  const gap = targetKg - currentKg
  if (Math.abs(gap) < 0.05) return 0
  if (kgPerWeek === 0 || Math.sign(gap) !== Math.sign(kgPerWeek)) return null
  return Math.ceil(Math.abs(gap / kgPerWeek))
}

/**
 * Дальше двух лет прогноз не показывается числом. Почти нулевой тренд
 * (вес стоит) давал «≈ 460 месяцев» — формально верно, по сути бессмыслица.
 */
export const MAX_FORECAST_WEEKS = 104

/** «≈ 3 недели» / «≈ 2 месяца» — люди не считают дни на десятки недель вперёд */
export function humanWeeks(weeks: number): string {
  if (weeks <= 0) return 'вы у цели'
  if (weeks > MAX_FORECAST_WEEKS) return 'больше двух лет'
  if (weeks < 9) return `≈ ${weeks} ${plural(weeks, 'неделя', 'недели', 'недель')}`
  const months = Math.round(weeks / 4.35)
  return `≈ ${months} ${plural(months, 'месяц', 'месяца', 'месяцев')}`
}

/** Темп из анкеты со знаком: минус — снижение, плюс — набор */
export function planRate(goal: Goal, ratePerWeek: number): number {
  if (goal === 'lose') return -ratePerWeek
  if (goal === 'gain') return ratePerWeek
  return 0
}

/** Сколько последних взвешиваний идёт в тренд для прогноза */
export const FORECAST_POINTS = 10

export interface GoalForecast {
  /** Последний записанный вес */
  currentKg: number
  /** Сколько осталось до цели, кг, со знаком: минус — сбросить */
  gapKg: number
  /** Недель до цели; 0 — уже у цели, null — темп не ведёт к цели */
  weeks: number | null
  /** Темп, по которому считали, кг/нед со знаком */
  rate: number
  /** Откуда темп: тренд взвешиваний или план из анкеты */
  basis: 'trend' | 'plan'
}

/**
 * Прогноз «до цели» — один на всё приложение.
 *
 * Раньше «Сегодня» считал его по плану из анкеты, профиль — по тренду
 * последних взвешиваний, а отчёты — по тренду внутри выбранного периода,
 * и три экрана одновременно показывали три разных срока. Правило одно:
 * тренд последних FORECAST_POINTS взвешиваний, а если по ним тренда ещё нет
 * (мало точек или они слишком близко) — темп из анкеты.
 *
 * history — взвешивания по возрастанию даты, лучше всего weightHistory().
 * null — взвешиваний нет, считать не от чего.
 */
export function goalForecast(
  history: WeightRecord[],
  targetKg: number,
  plan: { goal: Goal; ratePerWeek: number },
): GoalForecast | null {
  const latest = history[history.length - 1]
  if (!latest) return null
  const trend = weeklyTrend(history.slice(-FORECAST_POINTS))
  const rate = trend ?? planRate(plan.goal, plan.ratePerWeek)
  return {
    currentKg: latest.kg,
    gapKg: targetKg - latest.kg,
    weeks: weeksToTarget(latest.kg, targetKg, rate),
    rate,
    basis: trend === null ? 'plan' : 'trend',
  }
}
