import { cleanNumberInput, parseNumber } from '@/ui/NumberField'

/** Порция меньше грамма — опечатка, больше трёх килограммов — тоже */
export const GRAMS_MIN = 1
export const GRAMS_MAX = 3000

/*
 * Поле граммов в панелях порции и правки записи.
 *
 * Здесь та же ловушка, что и у NumberField: пока поле держало число,
 * стёртое значение превращалось в «1», и набор 250 давал 1250 г. Поэтому
 * поле хранит строку-черновик, а в число она разбирается только тогда,
 * когда нужна: для сетки калорий и при записи.
 */

/** Очистка ввода: цифры и одна запятая или точка */
export function cleanGrams(raw: string): string {
  return cleanNumberInput(raw, true)
}

/**
 * Черновик в граммы. null — записывать нечего: поле пустое или число вне
 * 1…3000. Кнопка записи при этом гаснет, а не подрезает число молча:
 * 5000 вместо 500 — опечатка, и «исправленные» 3000 г ничем не лучше.
 */
export function parseGrams(draft: string): number | null {
  const n = parseNumber(cleanGrams(draft))
  if (n === null || n < GRAMS_MIN || n > GRAMS_MAX) return null
  // Десятые грамма — предел точности кухонных весов
  return Math.round(n * 10) / 10
}

/** Граммы в черновик: без хвоста «.0» и без плавающих остатков */
export function gramsDraft(grams: number): string {
  return String(Math.round(grams * 10) / 10)
}

/** Подсказка под полем, когда набранное нельзя записать. Пустое поле — не ошибка */
export function gramsError(draft: string): string | null {
  if (cleanGrams(draft) === '' || parseGrams(draft) !== null) return null
  return `От ${GRAMS_MIN} до ${GRAMS_MAX} граммов`
}
