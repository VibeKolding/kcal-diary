import type { Entry, Nutrients, Profile } from '@/domain/types'
import { dayKey, lastDays, weekdayIndex } from '@/domain/dates'
import { entryNutrients, isMacroBlind, sumEntries, ZERO, add } from '@/domain/nutrition'
import { MEAL_LABELS } from '@/domain/nutrition'
import { verdict, type DayStat } from '@/domain/streaks'
import { entriesForRange } from '@/db/entries'

export interface DayPoint extends DayStat {
  nutrients: Nutrients
  /** В дне нет записей с неизвестным составом — только такие дни идут в средние БЖУ */
  macrosKnown: boolean
}

export async function buildDays(profile: Profile, count: number): Promise<DayPoint[]> {
  const days = lastDays(count)
  const from = days[0]!
  const to = days[days.length - 1]!
  const entries = await entriesForRange(from, to)

  const byDate = new Map<string, Entry[]>()
  for (const e of entries) {
    const list = byDate.get(e.date)
    if (list) list.push(e)
    else byDate.set(e.date, [e])
  }

  return days.map((date) => {
    const rows = byDate.get(date) ?? []
    const nutrients = sumEntries(rows)
    return {
      date,
      kcal: Math.round(nutrients.kcal),
      target: profile.targets.kcal,
      logged: rows.length > 0,
      nutrients,
      macrosKnown: rows.length > 0 && !rows.some(isMacroBlind),
    }
  })
}

export interface Habits {
  topFoods: { title: string; count: number; kcal: number }[]
  heaviestMeal: { meal: string; kcal: number } | null
  worstWeekday: { label: string; kcal: number } | null
}

const WEEKDAY_NAMES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']

/** Анализ привычек: где на самом деле набираются калории */
export async function buildHabits(days: number): Promise<Habits> {
  const range = lastDays(days)
  const entries = await entriesForRange(range[0]!, range[range.length - 1]!)

  const foods = new Map<string, { count: number; kcal: number }>()
  const meals = new Map<string, number>()
  const weekdays = new Map<number, { kcal: number; days: Set<string> }>()

  for (const e of entries) {
    const n = entryNutrients(e)

    const f = foods.get(e.title) ?? { count: 0, kcal: 0 }
    foods.set(e.title, { count: f.count + 1, kcal: f.kcal + n.kcal })

    meals.set(e.meal, (meals.get(e.meal) ?? 0) + n.kcal)

    const wd = weekdayIndex(e.date)
    const w = weekdays.get(wd) ?? { kcal: 0, days: new Set<string>() }
    w.kcal += n.kcal
    w.days.add(e.date)
    weekdays.set(wd, w)
  }

  const topFoods = [...foods.entries()]
    .map(([title, v]) => ({ title, count: v.count, kcal: Math.round(v.kcal) }))
    .sort((a, b) => b.count - a.count || b.kcal - a.kcal)
    .slice(0, 5)

  const heaviest = [...meals.entries()].sort((a, b) => b[1] - a[1])[0]
  const heaviestMeal = heaviest
    ? { meal: MEAL_LABELS[heaviest[0] as keyof typeof MEAL_LABELS], kcal: Math.round(heaviest[1]) }
    : null

  // Сравниваем средние по дню недели, а не суммы: иначе побеждает день,
  // который просто чаще попадал в период
  const worst = [...weekdays.entries()]
    .map(([wd, v]) => ({ wd, avg: v.kcal / v.days.size }))
    .sort((a, b) => b.avg - a.avg)[0]
  const worstWeekday = worst
    ? { label: WEEKDAY_NAMES[worst.wd]!, kcal: Math.round(worst.avg) }
    : null

  return { topFoods, heaviestMeal, worstWeekday }
}

export interface MacroAverage {
  macros: Nutrients
  /** Сколько дней пошло в расчёт */
  days: number
  /** Сколько дней пропущено из-за записей без состава */
  skipped: number
}

/**
 * Средние БЖУ за период — только по дням, где состав известен целиком.
 *
 * День с быстрой записью пропускается, а не складывается с нулями: его
 * калории учтены, а белки нет, и такое среднее занижает результат тем
 * сильнее, чем чаще пользуешься быстрой записью. Сколько дней пропущено,
 * видно в карточке — иначе цифра выглядела бы средней по всему периоду.
 */
export function averageMacros(points: DayPoint[]): MacroAverage {
  const logged = points.filter((p) => p.logged)
  const usable = logged.filter((p) => p.macrosKnown)
  const skipped = logged.length - usable.length
  if (usable.length === 0) return { macros: ZERO, days: 0, skipped }
  const total = usable.reduce((acc, p) => add(acc, p.nutrients), ZERO)
  return {
    macros: {
      kcal: total.kcal / usable.length,
      protein: total.protein / usable.length,
      fat: total.fat / usable.length,
      carbs: total.carbs / usable.length,
    },
    days: usable.length,
    skipped,
  }
}

export interface Balance {
  value: number
  target: number
}

export interface PeriodTotals {
  /** Дней в периоде всего */
  total: number
  /** Дней с записями — только они идут в баланс калорий */
  days: number
  kcal: Balance
  /** Дней, где состав известен: по ним считаются БЖУ */
  macroDays: number
  /** Дней с записями, но с неизвестным составом */
  macroSkipped: number
  protein: Balance
  fat: Balance
  carbs: Balance
  /** Разброс внутри периода: ровная неделя и качели дают один итог */
  over: number
  under: number
  onTarget: number
}

/**
 * Итог за период: сколько съедено против суммы норм.
 *
 * Считается по дням с записями, а не по всем дням периода: сравнивать еду за
 * четыре дня с недельной нормой бессмысленно. БЖУ идут отдельным счётом — в
 * днях с быстрыми записями состав неизвестен, и такой день занижал бы сумму.
 */
export function periodTotals(points: DayPoint[], targets: Nutrients): PeriodTotals {
  const logged = points.filter((p) => p.logged)
  const usable = logged.filter((p) => p.macrosKnown)
  const macros = usable.reduce((acc, p) => add(acc, p.nutrients), ZERO)
  let over = 0
  let under = 0
  let onTarget = 0
  for (const p of logged) {
    const v = verdict(p)
    if (v === 'over') over += 1
    else if (v === 'under') under += 1
    else if (v === 'onTarget') onTarget += 1
  }
  return {
    total: points.length,
    days: logged.length,
    kcal: {
      value: Math.round(logged.reduce((sum, p) => sum + p.kcal, 0)),
      target: logged.reduce((sum, p) => sum + p.target, 0),
    },
    macroDays: usable.length,
    macroSkipped: logged.length - usable.length,
    protein: { value: Math.round(macros.protein), target: targets.protein * usable.length },
    fat: { value: Math.round(macros.fat), target: targets.fat * usable.length },
    carbs: { value: Math.round(macros.carbs), target: targets.carbs * usable.length },
    over,
    under,
    onTarget,
  }
}

export const todayKey = dayKey
