import type { Nutrients, Profile } from '@/domain/types'
import { ageFrom, birthDateFromAge } from '@/domain/targets'
import { parseNumber } from '@/ui/NumberField'

/*
 * Проверка ручной нормы — чистые функции без React, чтобы их держали тесты.
 *
 * Пределы ловят опечатки, а не спорят с человеком: «5» вместо «1500»,
 * лишний ноль, стёртое поле. Раньше такое сохранялось молча, и с первого
 * же дня любая еда показывалась «перебором», а отчёты теряли смысл.
 * Нижняя граница 800 ккал, а не выше: авторасчёт для невысокой пожилой
 * женщины сам опускается почти до неё, и предел выше формулы запретил бы
 * человеку повторить её же результат. Всё, что ниже базового обмена,
 * не запрещается, а сопровождается предупреждением.
 */
export const KCAL_RANGE = { min: 800, max: 6000 }

const RANGES = {
  kcal: { ...KCAL_RANGE, error: 'От 800 до 6000 ккал' },
  protein: { min: 0, max: 500, error: 'От 0 до 500 г' },
  fat: { min: 0, max: 300, error: 'От 0 до 300 г' },
  carbs: { min: 0, max: 1000, error: 'От 0 до 1000 г' },
  water: { min: 500, max: 6000, error: 'От 500 до 6000 мл' },
  glass: { min: 50, max: 1000, error: 'От 50 до 1000 мл' },
} as const

/** Сколько калорий дают одни белки и жиры, если это больше самой нормы.
    Тогда на углеводы ничего не остаётся, и норма противоречит сама себе. */
export function macrosOverKcal(t: Nutrients): number | null {
  const fixed = t.protein * 4 + t.fat * 9
  return fixed > t.kcal ? Math.round(fixed) : null
}

/** Значения карточки «Норма на день» в профиле */
export interface NormValues {
  kcal: number
  protein: number
  fat: number
  carbs: number
  water: number
  glass: number
}

export type NormForm = Record<keyof NormValues, string>

export function normValuesFrom(p: Pick<Profile, 'targets' | 'waterGoalMl' | 'glassMl'>): NormValues {
  return { ...p.targets, water: p.waterGoalMl, glass: p.glassMl ?? 250 }
}

export function normFormFrom(v: NormValues): NormForm {
  return {
    kcal: String(v.kcal), protein: String(v.protein), fat: String(v.fat),
    carbs: String(v.carbs), water: String(v.water), glass: String(v.glass),
  }
}

export interface NormCheck {
  errors: Partial<Record<keyof NormValues, string>>
  /** Калории или БЖУ поменяли, и их надо сохранить как ручную норму */
  targetsChanged: boolean
  /** Поменяли воду или стакан — это не норма еды и авторасчёт не выключает */
  waterChanged: boolean
  /** Итог формы, если в ней нет ошибок */
  values: NormValues | null
  /** Белки и жиры сами дают больше калорий, чем норма */
  overKcal: number | null
  /** Калории ниже базового обмена */
  belowBmr: boolean
}

const TARGET_KEYS = ['kcal', 'protein', 'fat', 'carbs'] as const
const WATER_KEYS = ['water', 'glass'] as const

/**
 * Проверка формы нормы.
 *
 * Проверяются только поля, которые правили. Сохранённое значение могло
 * прийти из авторасчёта или из старой версии и выйти за пределы — это не
 * повод не дать сохранить соседнее поле.
 */
export function checkNormForm(form: NormForm, saved: NormValues, bmr?: number | null): NormCheck {
  const errors: NormCheck['errors'] = {}
  const values = { ...saved }
  const changed = new Set<keyof NormValues>()

  for (const key of [...TARGET_KEYS, ...WATER_KEYS]) {
    const n = parseNumber(form[key])
    if (n === saved[key]) continue
    changed.add(key)
    const range = RANGES[key]
    if (n === null) errors[key] = 'Впишите число'
    else if (n < range.min || n > range.max) errors[key] = range.error
    else values[key] = Math.round(n)
  }

  const ok = Object.keys(errors).length === 0
  const targetsChanged = TARGET_KEYS.some((k) => changed.has(k))
  const targets = { kcal: values.kcal, protein: values.protein, fat: values.fat, carbs: values.carbs }
  return {
    errors,
    targetsChanged,
    waterChanged: WATER_KEYS.some((k) => changed.has(k)),
    values: ok ? values : null,
    // Только о том, что человек вписал сам: нетронутую норму из старой
    // версии поправит «Вернуть авторасчёт», а не совет поднять калории
    overKcal: ok && targetsChanged ? macrosOverKcal(targets) : null,
    belowBmr: ok && changed.has('kcal') && bmr != null && values.kcal < bmr,
  }
}

/**
 * Дата рождения после правки анкеты.
 *
 * Анкета спрашивает возраст, а хранит дату, собранную из него. Если
 * пересобирать её при каждом сохранении, годовщина переезжает на день
 * сохранения: поменяли в сентябре активность — и в октябре возраст уже
 * не прибавится, норма на год застынет. Поэтому дата переписывается,
 * только когда поменяли сам возраст.
 */
export function birthDateAfterEdit(current: string, age: number, now = new Date()): string {
  return ageFrom(current, now) === age ? current : birthDateFromAge(age, now)
}
