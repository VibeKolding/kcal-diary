import { useCallback, useEffect, useState } from 'react'
import { Glass } from '@/ui/Glass'
import { Pill } from '@/ui/Pill'
import { FoodIcon } from '@/ui/FoodIcon'
import type { Food, Recipe } from '@/domain/types'
import {
  computeRecipe, deleteRecipe, listRecipes, saveRecipe, type RecipeNutrition,
} from '@/db/recipes'
import { searchFoods } from '@/db/foods'
import { Empty } from '@/ui/Empty'
import { Icon } from '@/ui/Icon'
import { TextField } from '@/ui/TextField'
import { NumberField } from '@/ui/NumberField'
import s from './Recipes.module.css'

export interface PickedRecipe {
  recipe: Recipe
  nutrition: RecipeNutrition
}

/** Список сохранённых рецептов + переход в конструктор */
export function RecipeList({ onPick }: { onPick: (r: PickedRecipe) => void }) {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [nutrition, setNutrition] = useState<Record<string, RecipeNutrition>>({})
  const [building, setBuilding] = useState(false)

  const reload = useCallback(async () => {
    const rows = await listRecipes()
    setRecipes(rows)
    const map: Record<string, RecipeNutrition> = {}
    for (const r of rows) map[r.id] = await computeRecipe(r)
    setNutrition(map)
  }, [])

  useEffect(() => { void reload() }, [reload])

  if (building) {
    return (
      <RecipeBuilder
        onDone={async () => { setBuilding(false); await reload() }}
        onCancel={() => setBuilding(false)}
      />
    )
  }

  return (
    <div className={s.wrap}>
      {recipes.length === 0 ? (
        <Empty
          glyph="recipe"
          title="Своих рецептов пока нет"
          text="Рецепт — это своё блюдо из нескольких продуктов. Соберите его один раз, и дальше добавляйте порцию в один тап."
        />
      ) : (
        <div className={s.list}>
          {recipes.map((r) => {
            const n = nutrition[r.id]
            return (
              <div key={r.id} className={s.row}>
                <FoodIcon category="dish" size={38} />
                <button
                  className={s.rowBody}
                  style={{ textAlign: 'left' }}
                  onClick={() => n && onPick({ recipe: r, nutrition: n })}
                >
                  <div className={s.rowName}>{r.name}</div>
                  <div className={`${s.rowMeta} num`}>
                    {r.portions} порц. по {Math.round(n?.portionGrams ?? 0)} г
                    {n && n.missing > 0 ? ' · часть продуктов удалена' : ''}
                  </div>
                </button>
                <span className={`${s.rowKcal} num`}>{Math.round(n?.per100.kcal ?? 0)}</span>
                <button
                  className={s.del}
                  aria-label={`Удалить рецепт ${r.name}`}
                  onClick={() => void deleteRecipe(r.id).then(reload)}
                ><Icon name="close" size={14} /></button>
              </div>
            )
          })}
        </div>
      )}

      <Pill block variant={recipes.length === 0 ? 'primary' : 'ghost'} onClick={() => setBuilding(true)}>
        Собрать рецепт
      </Pill>
    </div>
  )
}

interface Item { food: Food; grams: number }

function RecipeBuilder({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [yieldGrams, setYieldGrams] = useState('')
  const [portions, setPortions] = useState('4')

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Food[]>([])
  const [nutrition, setNutrition] = useState<RecipeNutrition | null>(null)

  useEffect(() => {
    let cancelled = false
    if (query.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      const rows = await searchFoods(query, 8)
      if (!cancelled) setResults(rows)
    }, 150)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query])

  const rawGrams = items.reduce((sum, i) => sum + i.grams, 0)
  const effectiveYield = Number(yieldGrams) || rawGrams

  useEffect(() => {
    void (async () => {
      if (items.length === 0) { setNutrition(null); return }
      // Продукты уже лежат в базе, поэтому считаем через общий расчёт,
      // чтобы конструктор и сохранённый рецепт не разошлись в цифрах
      setNutrition(await computeRecipe({
        name,
        items: items.map((i) => ({ foodId: i.food.id, grams: i.grams })),
        yieldGrams: effectiveYield,
        portions: Number(portions) || 1,
      }))
    })()
  }, [items, effectiveYield, portions, name])

  const valid = name.trim().length >= 2 && items.length > 0 && effectiveYield > 0

  async function submit() {
    await saveRecipe({
      name,
      items: items.map((i) => ({ foodId: i.food.id, grams: i.grams })),
      yieldGrams: effectiveYield,
      portions: Number(portions) || 1,
    })
    onDone()
  }

  return (
    <div className={s.form}>
      <TextField label="Название блюда" value={name} onChange={setName} placeholder="Плов по-домашнему" />

      <div className={s.field}>
        <span className={s.label}>Ингредиенты</span>
        {items.length > 0 && (
          <div className={s.ingredients}>
            {items.map((i) => (
              <div key={i.food.id} className={s.ing}>
                <FoodIcon category={i.food.category} size={34} />
                <span className={s.ingBody}>
                  <div className={s.ingName}>{i.food.name}</div>
                </span>
                <input
                  className={s.ingGrams} inputMode="numeric" value={i.grams}
                  aria-label={`Граммы: ${i.food.name}`}
                  onChange={(e) => {
                    const g = Math.max(0, Number(e.target.value) || 0)
                    setItems((prev) => prev.map((p) => p.food.id === i.food.id ? { ...p, grams: g } : p))
                  }}
                />
                <button
                  className={s.del} aria-label={`Убрать ${i.food.name}`}
                  onClick={() => setItems((prev) => prev.filter((p) => p.food.id !== i.food.id))}
                ><Icon name="close" size={14} /></button>
              </div>
            ))}
          </div>
        )}

        <TextField value={query} onChange={setQuery} placeholder="Добавить продукт" inputMode="search" />
        {results.length > 0 && (
          <div className={s.list}>
            {results.map((f) => (
              <button
                key={f.id} className={`${s.row} pressable`}
                onClick={() => {
                  setItems((prev) => prev.some((p) => p.food.id === f.id)
                    ? prev
                    : [...prev, { food: f, grams: 100 }])
                  setQuery('')
                }}
              >
                <FoodIcon category={f.category} size={34} />
                <span className={s.rowBody}>
                  <div className={s.rowName}>{f.name}</div>
                </span>
                <span className={`${s.rowKcal} num`}>{f.per100.kcal}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={s.pair}>
        <NumberField label="Вес готового, г" size="md" placeholder={String(rawGrams || '')}
          value={yieldGrams} onChange={setYieldGrams} />
        <NumberField label="Порций" size="md" value={portions} onChange={setPortions} />
      </div>

      <p className={s.hint}>
        Сырые продукты весят {rawGrams} г. Если блюдо ужарилось или уварилось,
        впишите вес готового — калории от этого не исчезают, а становятся
        плотнее на каждые 100 г.
      </p>

      {nutrition && (
        <Glass flat>
          <div className={s.summary}>
            <div className={`${s.cell} ${s.kcalCell}`}>
              <div className={`${s.cellValue} num`}>{Math.round(nutrition.per100.kcal)}</div>
              <div className={s.cellLabel}>ккал/100 г</div>
            </div>
            <div className={s.cell}>
              <div className={`${s.cellValue} num`}>{nutrition.per100.protein.toFixed(1)}</div>
              <div className={s.cellLabel}>белки</div>
            </div>
            <div className={s.cell}>
              <div className={`${s.cellValue} num`}>{nutrition.per100.fat.toFixed(1)}</div>
              <div className={s.cellLabel}>жиры</div>
            </div>
            <div className={s.cell}>
              <div className={`${s.cellValue} num`}>{nutrition.per100.carbs.toFixed(1)}</div>
              <div className={s.cellLabel}>углеводы</div>
            </div>
          </div>
        </Glass>
      )}

      {nutrition && (
        <p className={s.hint}>
          Порция {Math.round(nutrition.portionGrams)} г ·{' '}
          {Math.round(nutrition.per100.kcal * nutrition.portionGrams / 100)} ккал
        </p>
      )}

      <div style={{ display: 'flex', gap: 'var(--s3)' }}>
        <Pill variant="ghost" onClick={onCancel}>Отмена</Pill>
        <Pill block disabled={!valid} onClick={submit}>Сохранить рецепт</Pill>
      </div>
    </div>
  )
}

/** Рецепт как «виртуальный продукт» — чтобы переиспользовать лист выбора порции */
export function recipeAsFood(picked: PickedRecipe): Food {
  const { recipe, nutrition } = picked
  return {
    id: recipe.id,
    name: recipe.name,
    per100: {
      kcal: Math.round(nutrition.per100.kcal),
      protein: Math.round(nutrition.per100.protein * 10) / 10,
      fat: Math.round(nutrition.per100.fat * 10) / 10,
      carbs: Math.round(nutrition.per100.carbs * 10) / 10,
    },
    servings: [
      { name: 'порция', grams: Math.round(nutrition.portionGrams) },
      { name: '100 г', grams: 100 },
      { name: 'всё блюдо', grams: Math.round(recipe.yieldGrams) },
    ],
    category: 'dish',
    source: 'user',
    usageCount: 0,
    lastUsedAt: 0,
  }
}
