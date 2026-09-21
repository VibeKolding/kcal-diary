import type { Entry, Meal, Nutrients, Per100 } from './types'

export const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack']

export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекус',
}

export const ZERO: Nutrients = { kcal: 0, protein: 0, fat: 0, carbs: 0 }

/** Пищевая ценность порции: значения на 100 г, приведённые к фактическому весу */
export function scale(per100: Per100, grams: number): Nutrients {
  const k = grams / 100
  return {
    kcal: per100.kcal * k,
    protein: per100.protein * k,
    fat: per100.fat * k,
    carbs: per100.carbs * k,
  }
}

export function add(a: Nutrients, b: Nutrients): Nutrients {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    fat: a.fat + b.fat,
    carbs: a.carbs + b.carbs,
  }
}

export function entryNutrients(entry: Entry): Nutrients {
  // Записи без состава в базе быть не должно, но она могла приехать из
  // копии, снятой до проверки импорта. Нули лучше белого экрана.
  if (!entry.per100) return ZERO
  return scale(entry.per100, entry.grams)
}

/**
 * Запись, у которой состав неизвестен: быстрая запись с одними калориями.
 *
 * Флаг noMacros появился позже самой быстрой записи, поэтому у записей,
 * сделанных раньше, его нет. Их выдаёт отсутствие ссылки на продукт при
 * нулевом составе: у всего остального в дневнике ссылка есть.
 */
export function isMacroBlind(entry: Entry): boolean {
  // Без состава вовсе (испорченная запись, см. entryNutrients) — тем более неизвестен
  if (entry.noMacros || !entry.per100) return true
  const { kcal, protein, fat, carbs } = entry.per100
  return !entry.refId && kcal > 0 && protein === 0 && fat === 0 && carbs === 0
}

export function sumEntries(entries: Entry[]): Nutrients {
  return entries.reduce((acc, e) => add(acc, entryNutrients(e)), ZERO)
}

export function sumByMeal(entries: Entry[]): Record<Meal, Nutrients> {
  const out = {
    breakfast: ZERO,
    lunch: ZERO,
    dinner: ZERO,
    snack: ZERO,
  } as Record<Meal, Nutrients>
  for (const e of entries) {
    // Приём не из списка бывает только в испорченных данных. Такую запись
    // пропускаем: иначе add() читает поля у undefined и падает весь экран.
    // В итог дня (sumEntries) она при этом попадает.
    if (!MEALS.includes(e.meal)) continue
    out[e.meal] = add(out[e.meal], entryNutrients(e))
  }
  return out
}

/** Калорийность, восстановленная из БЖУ. Нужна для проверки данных из Open Food Facts. */
export function kcalFromMacros(n: Omit<Nutrients, 'kcal'>): number {
  return n.protein * 4 + n.fat * 9 + n.carbs * 4
}

export function round(n: number, digits = 0): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

export function roundNutrients(n: Nutrients): Nutrients {
  return {
    kcal: Math.round(n.kcal),
    protein: round(n.protein, 1),
    fat: round(n.fat, 1),
    carbs: round(n.carbs, 1),
  }
}

/** Коридор попадания в норму. Один на всё приложение: и ккал, и БЖУ, и оценка дня. */
export const TOLERANCE = 0.1

export type DeviationKind = 'over' | 'under' | 'onTarget' | 'none'

export interface Deviation {
  kind: DeviationKind
  /** На сколько отклонились. Всегда положительное: знак несёт kind. */
  amount: number
}

/**
 * Отклонение факта от нормы. Внутри коридора ±10 % это «в норме», а не промах:
 * тот же допуск, что у оценки дня в streaks.ts — взвешивание еды всегда приблизительно.
 * Норма не задана — сравнивать не с чем, отклонения нет.
 */
export function deviation(value: number, target: number, tolerance = TOLERANCE): Deviation {
  if (!(target > 0)) return { kind: 'none', amount: 0 }
  const amount = Math.round(Math.abs(value - target))
  if (value < target * (1 - tolerance)) return { kind: 'under', amount }
  if (value > target * (1 + tolerance)) return { kind: 'over', amount }
  return { kind: 'onTarget', amount }
}
