import type { DayNote, WaterRecord, WeightRecord } from '@/domain/types'
import { dayKey } from '@/domain/dates'
import { db } from './db'

// --- Вода ---

export async function getWater(date = dayKey()): Promise<number> {
  return (await db.water.get(date))?.ml ?? 0
}

/**
 * Чтение и запись — одной транзакцией. Иначе два быстрых нажатия «+250»
 * (или ярлык воды во второй вкладке) читали одно и то же значение, и
 * второй стакан затирал первый.
 */
export async function addWater(ml: number, date = dayKey()): Promise<number> {
  return db.transaction('rw', db.water, async () => {
    const current = (await db.water.get(date))?.ml ?? 0
    const next = Math.max(0, current + ml)
    await db.water.put({ date, ml: next })
    return next
  })
}

export async function waterForRange(from: string, to: string): Promise<WaterRecord[]> {
  return db.water.where('date').between(from, to, true, true).toArray()
}

// --- Вес ---

/** Запись дня сливается с существующей: вес утром, обхваты вечером — одна строка */
export async function putWeight(record: WeightRecord): Promise<void> {
  await db.transaction('rw', db.weights, async () => {
    const prev = await db.weights.get(record.date)
    await db.weights.put({ ...prev, ...record })
  })
}

export async function latestWeight(): Promise<WeightRecord | undefined> {
  return (await db.weights.orderBy('date').reverse().limit(1).toArray())[0]
}

export async function weightHistory(limit = 180): Promise<WeightRecord[]> {
  const rows = await db.weights.orderBy('date').reverse().limit(limit).toArray()
  return rows.reverse()
}

/** Взвешивания за отрезок дат, по возрастанию даты */
export async function weightsForRange(from: string, to: string): Promise<WeightRecord[]> {
  return db.weights.where('date').between(from, to, true, true).sortBy('date')
}

// --- Заметка к дню ---

export async function getNote(date: string): Promise<string> {
  return (await db.notes.get(date))?.text ?? ''
}

export async function putNote(date: string, text: string): Promise<void> {
  const t = text.trim()
  if (t) await db.notes.put({ date, text: t } satisfies DayNote)
  else await db.notes.delete(date)
}

/*
 * Тренировки из интерфейса убраны, но таблица activity намеренно осталась
 * в схеме и в резервной копии: без неё копии, снятые раньше, перестали бы
 * читаться, а удаление таблицы потребовало бы миграции схемы ради пустоты.
 */
