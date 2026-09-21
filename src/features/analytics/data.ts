import type { Entry, Nutrients, Profile, WaterRecord, WeightRecord } from '@/domain/types'
import { dayKey, lastDays, weekdayIndex } from '@/domain/dates'
import { entryNutrients, isMacroBlind, sumEntries, ZERO, add } from '@/domain/nutrition'
import { MEAL_LABELS } from '@/domain/nutrition'
import { bestStreak, currentStreak, verdict, type DayStat } from '@/domain/streaks'
import { db } from '@/db/db'
import { entriesForRange } from '@/db/entries'
import { waterForRange, weightHistory, weightsForRange } from '@/db/tracking'
import { FORECAST_POINTS, goalForecast, type GoalForecast } from '@/domain/weight'

export interface DayPoint extends DayStat {
  nutrients: Nutrients
  /** В дне нет записей с неизвестным составом — только такие дни идут в средние БЖУ */
  macrosKnown: boolean
}

export async function buildDays(profile: Profile, count: number): Promise<DayPoint[]> {
  const days = lastDays(count)
  const entries = await entriesForRange(days[0]!, days[days.length - 1]!)
  return daysFromEntries(profile, days, entries)
}

/** Точки графика по уже прочитанным записям: одна выборка на весь отчёт */
export function daysFromEntries(profile: Profile, days: string[], entries: Entry[]): DayPoint[] {
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
  return habitsFromEntries(await entriesForRange(range[0]!, range[range.length - 1]!))
}

export function habitsFromEntries(entries: Entry[]): Habits {
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

export interface Streaks {
  /** Дней подряд до сегодняшнего включительно */
  current: number
  /** Самая длинная серия за всё время */
  best: number
}

/**
 * Серии по датам, в которые дневник вёлся, — за всю историю, а не за
 * выбранный период. Раньше они считались по точкам графика, и на «Неделе»
 * серия не бывала длиннее семи дней: переключение на «Месяц» превращало
 * «7 дней подряд» в «12», хотя текущая серия от периода не зависит.
 */
export function diaryStreaks(dates: string[], today: string = dayKey()): Streaks {
  const stats: DayStat[] = dates.map((date) => ({ date, kcal: 0, target: 0, logged: true }))
  return { current: currentStreak(stats, today), best: bestStreak(stats) }
}

/**
 * Все даты, где есть хоть одна запись, по возрастанию. Читается только индекс.
 *
 * Не uniqueKeys(): он открывает курсор с направлением nextunique, а Safari
 * на iPhone такой курсор не открывает — «UnknownError: Unable to open
 * cursor», на пустом дневнике всегда (Dexie #1052, idb #71). Сразу после
 * анкеты записей ещё нет, и «Сегодня» падало первым же экраном: серия на
 * главной считается отсюда. Обычный курсор по тому же индексу Safari
 * открывает, а повторы идут подряд — индекс отсортирован.
 */
export async function loggedDates(): Promise<string[]> {
  const dates = (await db.entries.orderBy('date').keys()) as string[]
  return dates.filter((d, i) => i === 0 || d !== dates[i - 1])
}

/** Серии дневника за всю историю — для отчётов и сводки на главной */
export async function buildStreaks(today: string = dayKey()): Promise<Streaks> {
  return diaryStreaks(await loggedDates(), today)
}

/**
 * С какого дня дневник ведётся: день создания профиля или первая запись,
 * если она раньше (записи могли прийти из резервной копии).
 */
export function diaryStart(profile: Profile, firstLogged: string | undefined): string | null {
  const created = Number.isFinite(profile.createdAt) ? dayKey(new Date(profile.createdAt)) : null
  if (!created) return firstLogged ?? null
  return firstLogged && firstLogged < created ? firstLogged : created
}

/**
 * Пропущенные дни периода. Не в счёт дни до начала дневника — пропустить
 * день, когда дневника ещё не было, нельзя, — и сегодняшний: до вечера ещё
 * есть время поесть, и серия его тоже не считает обрывом.
 */
export function missedDays(points: DayStat[], since: string | null, today: string = dayKey()): number {
  return points.filter((p) => !p.logged && p.date < today && (since === null || p.date >= since)).length
}

/** Всё, что показывает экран отчётов */
export interface Report {
  /** Период, за который собран отчёт: пока грузится новый, на экране старый целиком */
  days: number
  points: DayPoint[]
  habits: Habits
  weights: WeightRecord[]
  water: WaterRecord[]
  streaks: Streaks
  missed: number
  /**
   * Прогноз «до цели» — по последним взвешиваниям вообще, а не по точкам
   * периода: иначе отчёты расходились бы с «Сегодня» и профилем
   */
  forecast: GoalForecast | null
}

/**
 * Отчёт одним запросом — для useLiveQuery: Dexie следит за всеми таблицами,
 * которые здесь читаются, и пересобирает отчёт при любой записи в них.
 * Поэтому еда, добавленная кнопкой «+» прямо с экрана отчётов, сразу
 * попадает в график, средние и итог.
 */
export async function buildReport(profile: Profile, count: number): Promise<Report> {
  const days = lastDays(count)
  const from = days[0]!
  const today = days[days.length - 1]!
  const [entries, dates, weights, water, recent] = await Promise.all([
    entriesForRange(from, today),
    loggedDates(),
    // По датам, а не по числу записей: раньше «неделя» показывала семь
    // последних взвешиваний, даже если они разбросаны по полугоду
    weightsForRange(from, today),
    waterForRange(from, today),
    weightHistory(FORECAST_POINTS),
  ])
  const points = daysFromEntries(profile, days, entries)
  return {
    days: count,
    points,
    habits: habitsFromEntries(entries),
    weights,
    water,
    streaks: diaryStreaks(dates, today),
    missed: missedDays(points, diaryStart(profile, dates[0]), today),
    forecast: profile.targetWeightKg ? goalForecast(recent, profile.targetWeightKg, profile) : null,
  }
}

export const todayKey = dayKey
