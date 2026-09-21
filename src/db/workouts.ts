import type { WorkoutSet } from '@/domain/types'
import { dayKey } from '@/domain/dates'
import { db } from './db'
import { newId } from './ids'

/** Записать подход: вес и повторы. Нули не пишем — пустой подход ничего не значит */
export async function addSet(exerciseId: string, weightKg: number, reps: number, date = dayKey()): Promise<WorkoutSet> {
  const set: WorkoutSet = {
    id: newId('s'), date, exerciseId,
    weightKg: Math.max(0, Math.round(weightKg * 2) / 2),
    reps: Math.max(1, Math.round(reps)),
    createdAt: Date.now(),
  }
  await db.sets.put(set)
  return set
}

export async function deleteSet(id: string): Promise<void> {
  await db.sets.delete(id)
}

/** «Отменить» после удаления: подход возвращается с тем же id, датой и временем */
export async function restoreSet(set: WorkoutSet): Promise<void> {
  await db.sets.put(set)
}

/** Последние подходы упражнения, новые сверху */
export async function setsForExercise(exerciseId: string, limit = 30): Promise<WorkoutSet[]> {
  return (await exerciseLog(exerciseId, limit)).sets
}

/**
 * Журнал упражнения: последние подходы для списка и рекорд за всё время.
 *
 * Рекорд считается по всем подходам, а не по показанным: иначе через
 * восемь тренировок лучший старый подход выпадал из выборки, и «рекорд»
 * тихо уменьшался, хотя его никто не бил. Запрос один — подходы
 * упражнения всё равно читаются целиком, чтобы отсортировать их по времени.
 */
export async function exerciseLog(
  exerciseId: string, limit = 30,
): Promise<{ sets: WorkoutSet[]; best: WorkoutSet | null }> {
  const rows = await db.sets.where('exerciseId').equals(exerciseId).toArray()
  return {
    sets: rows.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit),
    best: bestSet(rows),
  }
}

/** Подходы, сгруппированные по дате: сегодняшняя тренировка отдельно от прошлых */
export function groupByDate(sets: WorkoutSet[]): { date: string; sets: WorkoutSet[] }[] {
  const map = new Map<string, WorkoutSet[]>()
  for (const s of sets) {
    const list = map.get(s.date)
    if (list) list.push(s)
    else map.set(s.date, [s])
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => ({ date, sets: list.sort((a, b) => a.createdAt - b.createdAt) }))
}

/** Лучший подход по весу — ориентир на следующую тренировку */
export function bestSet(sets: WorkoutSet[]): WorkoutSet | null {
  return sets.reduce<WorkoutSet | null>(
    (best, s) => (!best || s.weightKg > best.weightKg || (s.weightKg === best.weightKg && s.reps > best.reps)) ? s : best,
    null,
  )
}

/** Секунды отдыха из строки вроде «60–90 секунд» или «2–3 минуты»: берём верхнюю границу */
export function restSeconds(text: string): number {
  const nums = text.match(/\d+/g)?.map(Number) ?? []
  if (nums.length === 0) return 90
  const n = Math.max(...nums)
  return /мин/.test(text) ? n * 60 : n
}

// --- Избранное: продукты, блюда каталога, упражнения ---

export type FavoriteKind = 'food' | 'recipe' | 'exercise'

const key = (kind: FavoriteKind, id: string) => `${kind}:${id}`

export async function isFavorite(kind: FavoriteKind, id: string): Promise<boolean> {
  return (await db.favorites.get(key(kind, id))) !== undefined
}

/** Чтение и запись — одной транзакцией, как у воды и счётчиков: два быстрых
    касания звезды иначе оба видели «нет» и оба ставили отметку */
export async function toggleFavorite(kind: FavoriteKind, id: string): Promise<boolean> {
  const k = key(kind, id)
  return db.transaction('rw', db.favorites, async () => {
    if (await db.favorites.get(k)) {
      await db.favorites.delete(k)
      return false
    }
    await db.favorites.put({ key: k, createdAt: Date.now() })
    return true
  })
}

/** Id избранного одного вида, недавние сверху */
export async function favoriteIds(kind: FavoriteKind): Promise<string[]> {
  const rows = await db.favorites.where('key').startsWith(`${kind}:`).reverse().sortBy('createdAt')
  return rows.map((r) => r.key.slice(kind.length + 1))
}
