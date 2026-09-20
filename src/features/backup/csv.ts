import { db } from '@/db/db'
import { entryNutrients, MEAL_LABELS } from '@/domain/nutrition'

function cell(v: string | number): string {
  const s = String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Дневник таблицей — для врача или тренера. Разделитель «;», как ждёт
 * русский Excel; BOM в начале, чтобы он же не сломал кириллицу.
 */
export async function buildCsv(): Promise<string> {
  const rows = await db.entries.orderBy('date').toArray()
  const head = ['Дата', 'Приём', 'Блюдо', 'Граммы', 'Ккал', 'Белки', 'Жиры', 'Углеводы']
  const lines = rows.map((e) => {
    const n = entryNutrients(e)
    return [
      e.date, MEAL_LABELS[e.meal], e.title, Math.round(e.grams),
      Math.round(n.kcal), n.protein.toFixed(1), n.fat.toFixed(1), n.carbs.toFixed(1),
    ].map(cell).join(';')
  })
  return '﻿' + [head.join(';'), ...lines].join('\n')
}

export async function exportCsv(): Promise<void> {
  const blob = new Blob([await buildCsv()], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `дневник-калорий-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
