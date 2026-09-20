export type Sex = 'male' | 'female'
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type Goal = 'lose' | 'keep' | 'gain'
export type Theme = 'dark' | 'light'

/** Коэффициенты физической активности для формулы TDEE */
export type Activity = 'sedentary' | 'light' | 'moderate' | 'high' | 'athlete'

export interface Nutrients {
  kcal: number
  protein: number
  fat: number
  carbs: number
}

/** Пищевая ценность на 100 г продукта */
export type Per100 = Nutrients

export interface Serving {
  name: string
  grams: number
}

export interface Profile {
  id: 1
  sex: Sex
  birthDate: string // YYYY-MM-DD
  heightCm: number
  activity: Activity
  goal: Goal
  /** Желаемый темп изменения веса, кг в неделю. Для 'keep' — 0. */
  ratePerWeek: number
  targets: Nutrients
  /** true — норму задали руками, авторасчёт её больше не трогает */
  targetsManual: boolean
  theme: Theme
  waterGoalMl: number
  /** Объём одного нажатия «+» у воды. Нет — значит 250 мл */
  glassMl?: number
  /** Целевой вес: от него считаются «до цели» и прогноз в отчётах */
  targetWeightKg?: number
  createdAt: number
}

export interface Food {
  id: string
  name: string
  brand?: string
  barcode?: string
  per100: Per100
  servings: Serving[]
  category: FoodCategory
  source: 'builtin' | 'off' | 'user'
  usageCount: number
  lastUsedAt: number
}

export type FoodCategory =
  | 'meat' | 'fish' | 'dairy' | 'egg' | 'grain' | 'bread'
  | 'vegetable' | 'fruit' | 'nut' | 'sweet' | 'drink'
  | 'oil' | 'sauce' | 'dish' | 'other'

export interface Recipe {
  id: string
  name: string
  items: { foodId: string; grams: number }[]
  /** Вес готового блюда. Меньше суммы ингредиентов из-за ужарки/уварки. */
  yieldGrams: number
  portions: number
  createdAt: number
  /** Как у продукта: чтобы рецепт всплывал в «Недавнем» и сортировался по частоте */
  usageCount?: number
  lastUsedAt?: number
}

/**
 * Запись дневника хранит СНИМОК пищевой ценности, а не ссылку на продукт.
 * Иначе правка продукта задним числом молча переписала бы всю историю.
 */
export interface Entry {
  id: string
  date: string // YYYY-MM-DD
  meal: Meal
  title: string
  category: FoodCategory
  grams: number
  per100: Per100
  refId?: string
  refType?: 'food' | 'recipe'
  /**
   * Быстрая запись, где указали только калории. Состав неизвестен, а не
   * равен нулю: такие дни нельзя складывать в средние БЖУ, иначе отчёт
   * занижает белки тем сильнее, чем чаще пользуешься быстрой записью.
   */
  noMacros?: true
  createdAt: number
}

export interface WeightRecord {
  date: string
  kg: number
  waist?: number
  chest?: number
  hips?: number
}

export interface WaterRecord {
  date: string
  ml: number
}

/** Заметка к дню: «день рождения», «болел» — объясняет выбросы в отчётах */
export interface DayNote {
  date: string
  text: string
}

/** Один подход в журнале тренировок */
export interface WorkoutSet {
  id: string
  date: string
  exerciseId: string
  weightKg: number
  reps: number
  createdAt: number
}

export interface ActivityRecord {
  id: string
  date: string
  name: string
  minutes: number
  kcal: number
}
