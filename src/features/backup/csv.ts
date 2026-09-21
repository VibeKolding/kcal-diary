import { db } from '@/db/db'
import { dayKey } from '@/domain/dates'
import { entryNutrients, isMacroBlind, MEAL_LABELS, MEALS } from '@/domain/nutrition'
import type { Entry } from '@/domain/types'
import { saveFile, type SaveOutcome } from './share'

/**
 * Текстовая ячейка.
 *
 * Текст, который начинается с = + - @ (или с табуляции и возврата каретки),
 * Excel и LibreOffice исполняют как формулу — даже в кавычках. Названия
 * приходят и из Open Food Facts, где карточку правит кто угодно, поэтому
 * такой ячейке спереди ставится апостроф: таблица покажет текст как есть.
 * Кавычки — по RFC 4180: при «;», кавычке, переводе строки или \r.
 */
export function csvText(value: string): string {
  const s = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Число с запятой: русский Excel читает «7.5» как дату «7 мая» */
export function csvNumber(n: number, digits = 0): string {
  return n.toFixed(digits).replace('.', ',')
}

const MEAL_ORDER = new Map(MEALS.map((m, i) => [m, i]))

/** По дате, внутри дня — по приёмам пищи, внутри приёма — по времени записи */
export function sortForCsv(entries: Entry[]): Entry[] {
  const order = (e: Entry) => MEAL_ORDER.get(e.meal) ?? MEALS.length
  return [...entries].sort((a, b) =>
    (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
    || order(a) - order(b)
    || a.createdAt - b.createdAt)
}

const HEAD = ['Дата', 'Приём', 'Блюдо', 'Граммы', 'Ккал', 'Белки', 'Жиры', 'Углеводы']

/**
 * Дневник таблицей — для врача или тренера. Разделитель «;» и дробная
 * запятая, как ждёт русский Excel; BOM в начале, чтобы он же не сломал
 * кириллицу.
 */
export function csvFrom(entries: Entry[]): string {
  const lines = sortForCsv(entries).map((e) => {
    const n = entryNutrients(e)
    // Состав быстрой записи неизвестен, а не равен нулю: пустые ячейки,
    // иначе в таблице выйдет «0 г белка» там, где данных просто нет
    const macros = isMacroBlind(e)
      ? ['', '', '']
      : [csvNumber(n.protein, 1), csvNumber(n.fat, 1), csvNumber(n.carbs, 1)]
    return [
      csvText(e.date), csvText(MEAL_LABELS[e.meal] ?? String(e.meal)), csvText(e.title),
      csvNumber(e.grams), csvNumber(n.kcal), ...macros,
    ].join(';')
  })
  return '﻿' + [HEAD.join(';'), ...lines].join('\r\n')
}

export async function buildCsv(): Promise<string> {
  return csvFrom(await db.entries.toArray())
}

/** Имя по местной дате: ночью по UTC у Москвы ещё вчерашнее число */
export function csvFileName(now = new Date()): string {
  return `дневник-калорий-${dayKey(now)}.csv`
}

export async function exportCsv(): Promise<SaveOutcome> {
  const file = new File([await buildCsv()], csvFileName(), { type: 'text/csv;charset=utf-8' })
  return saveFile(file, 'Дневник калорий — таблица')
}
