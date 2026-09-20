import type { Meal, Per100 } from '@/domain/types'

export type RecipeGoal = 'lose' | 'keep' | 'gain'
export type RecipeMeal = Extract<Meal, 'breakfast' | 'lunch' | 'dinner'>

export interface CatalogRecipe {
  id: string
  title: string
  goal: RecipeGoal
  meal: RecipeMeal
  minutes: number
  yieldGrams: number
  rawGrams: number
  portions: number
  per100: Per100
  items: { n: string; g: number }[]
  steps: string[]
  tip: string
  /**
   * Фотография блюда, если она есть. Сейчас каталог целиком рисованный.
   * credit пуст у собственных снимков; source заполняется только у чужих —
   * по нему видно, что фото требует указания авторства.
   */
  photo?: { src: string; credit: string; source?: string }
}

export const GOAL_TABS: { value: RecipeGoal; title: string; hint: string }[] = [
  { value: 'lose', title: 'Похудение', hint: 'больше белка, меньше калорий' },
  { value: 'keep', title: 'Удержание', hint: 'сбалансированные блюда' },
  { value: 'gain', title: 'Набор массы', hint: 'плотные калорийные порции' },
]

export const RECIPE_MEALS: { value: RecipeMeal; title: string }[] = [
  { value: 'breakfast', title: 'Завтраки' },
  { value: 'lunch', title: 'Обеды' },
  { value: 'dinner', title: 'Ужины' },
]

let cache: CatalogRecipe[] | null = null

/**
 * Каталог лежит отдельным файлом и попадает в офлайн-кэш вместе с приложением.
 * В IndexedDB он не переносится: это неизменяемый справочник, а не данные
 * пользователя, и дублировать его в резервной копии незачем.
 */
export async function loadCatalog(): Promise<CatalogRecipe[]> {
  if (cache) return cache
  const res = await fetch('/data/recipes.json')
  if (!res.ok) throw new Error(`Не удалось загрузить рецепты: ${res.status}`)
  const doc = (await res.json()) as { version: number; items: CatalogRecipe[] }
  cache = doc.items
  return cache
}

/**
 * Что рисовать на обложке рецепта.
 *
 * Набор выводится из состава, а не задаётся руками: тогда картинка не может
 * разойтись с рецептом, и новое блюдо получает обложку само по себе.
 */
export type DishToken =
  | 'chicken' | 'meat' | 'fish' | 'egg' | 'grain' | 'pasta' | 'bread'
  | 'dairy' | 'cheese' | 'tomato' | 'cucumber' | 'greens' | 'broccoli'
  | 'potato' | 'carrot' | 'avocado' | 'banana' | 'berry' | 'nut' | 'honey'

/**
 * Порядок важен: побеждает первое подошедшее правило. В названии продукта
 * может прятаться слово из чужого правила («Яйцо куриное», «Печенье»), и
 * тогда решает, кто стоит выше. Таблица вынесена наружу, чтобы тест мог
 * пройтись по ней и поймать новую ловушку до того, как она доедет до
 * обложки.
 */
export const TOKEN_BY_PRODUCT: [RegExp, DishToken][] = [
  // Яйцо стоит выше курицы не по вкусу, а потому что «Яйцо куриное варёное»
  // содержит слово «куриное»: при обратном порядке правило курицы забирало
  // его себе, и на тринадцати обложках — в омлетах, яичнице и сырниках —
  // вместо яйца рисовалась куриная ножка.
  [/яйцо|яичн/i, 'egg'],
  [/куриц|курин|индейк|бедро|голень/i, 'chicken'],
  // «печень(?!е)» — иначе правило срабатывает на «Печенье овсяное», и
  // овсяное печенье выходит куском мяса.
  [/говядин|свинин|фарш говяж|котлет|бекон|ветчин|сосиск|колбас|печень(?!е)/i, 'meat'],
  // «сельд(?!ерей)» — иначе сельдерей опознаётся как сельдь.
  [/лосос|сёмг|треск|минтай|хек|тунец|креветк|скумбри|сельд(?!ерей)|икра|краб/i, 'fish'],
  [/гречк|рис |рис$|булгур|киноа|овсян|хлопь|манная|мюсли|перловк|пшено|кускус|отруби/i, 'grain'],
  [/макарон/i, 'pasta'],
  [/хлеб|батон|лаваш|хлебц|сухар/i, 'bread'],
  [/творог|творожн|йогурт|кефир|сметан|молоко|сливки|ряженк/i, 'dairy'],
  [/сыр |сыр$|брынз|пармезан|моцарелл|плавлен/i, 'cheese'],
  [/помидор|томатн/i, 'tomato'],
  [/огурец/i, 'cucumber'],
  [/салат|шпинат|укроп|петрушк|зелёный лук|сельдерей/i, 'greens'],
  [/брокколи|капуст|цветная/i, 'broccoli'],
  [/картофел|пюре/i, 'potato'],
  [/морковь|тыкв|свёкл|перец|кабачок|баклажан|лук репчат|чеснок|шампиньон/i, 'carrot'],
  [/авокадо/i, 'avocado'],
  [/банан/i, 'banana'],
  [/яблоко|клубник|черник|малин|груш|ягод|изюм|курага|чернослив|финик/i, 'berry'],
  [/орех|миндал|кешью|арахис|фисташк|семечк|чиа|фундук/i, 'nut'],
  [/мёд|сахар|варенье|шоколад|сгущ/i, 'honey'],
]

export function tokenFor(product: string): DishToken | null {
  for (const [re, token] of TOKEN_BY_PRODUCT) {
    if (re.test(product)) return token
  }
  return null
}

/** Три главных составляющих блюда — по весу в составе */
export function dishTokens(recipe: CatalogRecipe, limit = 3): DishToken[] {
  const weight = new Map<DishToken, number>()
  for (const item of recipe.items) {
    const token = tokenFor(item.n)
    if (!token) continue
    weight.set(token, (weight.get(token) ?? 0) + item.g)
  }
  return [...weight.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([t]) => t)
}

/** Суп и каша подаются в миске, остальное — на тарелке */
export function isBowl(recipe: CatalogRecipe): boolean {
  return /суп|борщ|каш|овсянк|мюсли|творог|йогурт|плов/i.test(recipe.title)
}

export function portionKcal(recipe: CatalogRecipe): number {
  return Math.round((recipe.per100.kcal * recipe.yieldGrams) / 100 / recipe.portions)
}

export function portionGrams(recipe: CatalogRecipe): number {
  return Math.round(recipe.yieldGrams / recipe.portions)
}
