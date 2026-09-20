import { Suspense, lazy, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Sheet } from '@/ui/Sheet'
import { Chip, ChipRow } from '@/ui/Chip'
import { Pill } from '@/ui/Pill'
import { FoodIcon, CATEGORY_LABELS } from '@/ui/FoodIcon'
import { MEAL_LABELS, MEALS } from '@/domain/nutrition'
import type { Food, FoodCategory, Meal, Profile } from '@/domain/types'
import type { CatalogRecipe } from '@/db/catalog'
import { recentFoods, searchFoods, createFood, frequentFoods } from '@/db/foods'
import { addFoodEntry, addRecipeEntry, addQuickEntry } from '@/db/entries'
import { tap } from '@/ui/haptic'
import { favoriteIds } from '@/db/workouts'
import { db } from '@/db/db'
import { PortionSheet } from './PortionSheet'
import { Scanner } from '@/features/scanner/Scanner'
import { RecipeList, recipeAsFood, type PickedRecipe } from '@/features/recipes/Recipes'
import { Empty } from '@/ui/Empty'
import { Icon } from '@/ui/Icon'
import { TextField } from '@/ui/TextField'
import { NumberField, parseNumber } from '@/ui/NumberField'
import { useLast } from '@/ui/useLast'
import s from './AddFood.module.css'

/*
 * Каталог блюд грузится лениво: вместе с ним приезжают рисованные обложки
 * и сам файл рецептов, а панель добавления открывается на каждом запуске.
 * Держать это в первом чанке значило бы замедлить старт ради вкладки,
 * в которую заходят не всегда.
 */
const CatalogBrowser = lazy(() =>
  import('@/features/recipes/Catalog').then((m) => ({ default: m.CatalogBrowser })))
const RecipeSheet = lazy(() =>
  import('@/features/recipes/Catalog').then((m) => ({ default: m.RecipeSheet })))

type Tab = 'search' | 'scan' | 'manual' | 'recipes'
/** Внутри вкладки «Рецепты»: свои собранные блюда или вшитый каталог */
type DishSource = 'mine' | 'catalog'

interface Props {
  open: boolean
  meal: Meal
  date: string
  profile: Profile
  onClose: () => void
}

export function AddFood({ open, meal, date, profile, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('search')
  const [activeMeal, setActiveMeal] = useState<Meal>(meal)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Food[]>([])
  const [frequent, setFrequent] = useState<Food[]>([])
  const [favorites, setFavorites] = useState<Food[]>([])
  const [quick, setQuick] = useState('')
  // Состав быстрой записи. Свёрнут по умолчанию: блок нужен ровно тогда,
  // когда состав неизвестен, и три лишних поля убили бы его смысл.
  const [quickOpen, setQuickOpen] = useState(false)
  const [qp, setQp] = useState('')
  const [qf, setQf] = useState('')
  const [qc, setQc] = useState('')

  // Калории можно не вводить, если указан состав: 4/9/4 — те же цифры,
  // по которым считает форма продукта ниже
  const num = (v: string) => Math.max(0, parseNumber(v) ?? 0)
  const quickKcal = num(quick) > 0
    ? num(quick)
    : Math.round(num(qp) * 4 + num(qf) * 9 + num(qc) * 4)
  const [picked, setPicked] = useState<Food | null>(null)
  // Рецепт держим отдельно: в дневник он должен лечь ссылкой на рецепт,
  // а не на продукт, иначе аналитика посчитает его обычной едой
  const [pickedRecipe, setPickedRecipe] = useState<PickedRecipe | null>(null)
  const [dishSource, setDishSource] = useState<DishSource>('mine')
  // Открытое блюдо каталога закрывает панель добавления: две выдвижные
  // панели одновременно на экране в приложении не появляются
  const [openedDish, setOpenedDish] = useState<CatalogRecipe | null>(null)
  const dishSeen = useLast(openedDish)

  useEffect(() => { setActiveMeal(meal) }, [meal])
  useEffect(() => {
    if (open) {
      setTab('search'); setQuery(''); setDishSource('mine'); setOpenedDish(null); setQuick('')
      setQuickOpen(false); setQp(''); setQf(''); setQc('')
      // Частое: то, что добавляли чаще всего. Функция была, кнопки — нет.
      void frequentFoods(8).then(setFrequent)
      void favoriteIds('food')
        .then((ids) => db.foods.bulkGet(ids))
        .then((rows) => setFavorites(rows.filter((f): f is Food => !!f)))
    }
  }, [open])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const rows = query.trim().length >= 2
        ? await searchFoods(query)
        : await recentFoods(30)
      if (!cancelled) setResults(rows)
    }
    const t = setTimeout(run, 120)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query, open, picked])

  const isSearching = query.trim().length >= 2

  return (
    <>
      <Sheet open={open && !picked && !openedDish} title="Добавить еду" onClose={onClose}>
        <div className={s.wrap}>
          <ChipRow>
            {MEALS.map((m) => (
              <Chip key={m} active={activeMeal === m} onClick={() => setActiveMeal(m)}>
                {MEAL_LABELS[m]}
              </Chip>
            ))}
          </ChipRow>

          <ChipRow>
            <Chip active={tab === 'search'} onClick={() => setTab('search')}>Поиск</Chip>
            <Chip active={tab === 'scan'} onClick={() => setTab('scan')}>Штрихкод</Chip>
            <Chip active={tab === 'manual'} onClick={() => setTab('manual')}>Вручную</Chip>
            <Chip active={tab === 'recipes'} onClick={() => setTab('recipes')}>Рецепты</Chip>
          </ChipRow>

          {tab === 'search' && (
            <>
              <label className={s.search}>
                <Icon name="search" size={18} />
                <input
                  className={s.searchInput}
                  placeholder="Что вы съели?"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoComplete="off"
                />
                {query && (
                  <button className="pressable" onClick={() => setQuery('')} aria-label="Очистить"><Icon name="close" size={16} /></button>
                )}
              </label>

              {!isSearching && favorites.length > 0 && (
                <>
                  <div className={s.sectionLabel}>Избранное</div>
                  <ChipRow>
                    {favorites.map((f) => (
                      <Chip key={f.id} onClick={() => setPicked(f)}>
                        <Icon name="star" size={12} className={s.chipStar} /> {f.name}
                      </Chip>
                    ))}
                  </ChipRow>
                </>
              )}

              {!isSearching && frequent.length > 0 && (
                <>
                  <div className={s.sectionLabel}>Частое</div>
                  <ChipRow>
                    {frequent.map((f) => (
                      <Chip key={f.id} onClick={() => setPicked(f)}>{f.name}</Chip>
                    ))}
                  </ChipRow>
                </>
              )}

              <div className={s.sectionLabel}>
                {isSearching ? 'Найдено' : 'Недавнее'}
              </div>

              {results.length === 0 ? (
                <Empty
                  glyph={isSearching ? 'search' : 'plate'}
                  title={isSearching ? 'Ничего не нашлось' : 'Здесь появится ваша еда'}
                  text={isSearching
                    ? 'Заведите продукт вручную — он сохранится и в следующий раз найдётся сразу.'
                    : 'То, что вы записываете чаще всего, будет под рукой без поиска.'}
                  action={(
                    <Pill size="sm" variant="ghost" onClick={() => setTab('manual')}>
                      Ввести вручную
                    </Pill>
                  )}
                />
              ) : (
                <div className={s.list}>
                  {results.map((f, i) => (
                    <button
                      key={f.id} className={`${s.row} pressable rise-in`}
                      style={{ '--i': i } as CSSProperties}
                      onClick={() => setPicked(f)}
                    >
                      <FoodIcon category={f.category} size={38} />
                      <span className={s.rowBody}>
                        <div className={s.rowName}>{f.name}</div>
                        <div className={`${s.rowMeta} num`}>
                          {f.brand ? `${f.brand} · ` : ''}
                          Б {f.per100.protein} · Ж {f.per100.fat} · У {f.per100.carbs}
                        </div>
                      </span>
                      <span className={`${s.rowKcal} num`}>{f.per100.kcal}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'scan' && (
            <Scanner
              onFound={(food) => setPicked(food)}
              onManual={() => setTab('manual')}
            />
          )}

          {tab === 'manual' && (
            <div className={s.quick}>
              <div className={s.field}>
                <span className={s.label}>Быстро, без продукта</span>
                <div className={s.quickRow}>
                  <NumberField
                    size="md" placeholder={String(quickKcal || 150)} unit="ккал"
                    value={quick} onChange={setQuick}
                  />
                  <Pill
                    disabled={quickKcal <= 0}
                    onClick={async () => {
                      await addQuickEntry(quickKcal, activeMeal, date, {
                        protein: num(qp), fat: num(qf), carbs: num(qc),
                      })
                      tap()
                      setQuick(''); setQp(''); setQf(''); setQc(''); setQuickOpen(false)
                      onClose()
                    }}
                  >Записать</Pill>
                </div>

                {quickOpen ? (
                  <div className={s.triple}>
                    <NumberField size="md" compact decimal placeholder="Б, г" value={qp} onChange={setQp} />
                    <NumberField size="md" compact decimal placeholder="Ж, г" value={qf} onChange={setQf} />
                    <NumberField size="md" compact decimal placeholder="У, г" value={qc} onChange={setQc} />
                  </div>
                ) : (
                  <button type="button" className={`${s.addMacros} pressable`} onClick={() => setQuickOpen(true)}>
                    + Указать БЖУ
                  </button>
                )}

                <p className={s.hint}>
                  {quickOpen
                    ? 'Если калории не знаете — оставьте поле пустым, они посчитаются из состава.'
                    : 'Перекус, о котором лень думать. Без состава такой день не попадёт в средние БЖУ в отчётах.'}
                </p>
              </div>
            </div>
          )}

          {tab === 'manual' && (
            <ManualForm onCreated={(food) => setPicked(food)} />
          )}

          {tab === 'recipes' && (
            <>
              <ChipRow>
                <Chip active={dishSource === 'mine'} onClick={() => setDishSource('mine')}>
                  Мои
                </Chip>
                <Chip active={dishSource === 'catalog'} onClick={() => setDishSource('catalog')}>
                  Каталог
                </Chip>
              </ChipRow>

              {dishSource === 'mine' ? (
                <RecipeList
                  onPick={(r) => { setPickedRecipe(r); setPicked(recipeAsFood(r)) }}
                />
              ) : (
                <Suspense fallback={<p className={s.hint}>Загружаем каталог…</p>}>
                  <CatalogBrowser profile={profile} onOpen={setOpenedDish} />
                </Suspense>
              )}
            </>
          )}
        </div>
      </Sheet>

      <PortionSheet
        food={picked}
        onClose={() => { setPicked(null); setPickedRecipe(null) }}
        onConfirm={async (food, grams) => {
          if (pickedRecipe) {
            await addRecipeEntry(pickedRecipe.recipe, food.per100, grams, activeMeal, date)
          } else {
            await addFoodEntry(food, grams, activeMeal, date)
          }
          setPicked(null)
          setPickedRecipe(null)
          onClose()
        }}
      />

      {dishSeen && (
        <Suspense fallback={null}>
          <RecipeSheet
            recipe={openedDish}
            defaultMeal={activeMeal}
            date={date}
            onClose={() => setOpenedDish(null)}
            onAdded={() => { setOpenedDish(null); onClose() }}
          />
        </Suspense>
      )}
    </>
  )
}

const CATEGORIES = Object.keys(CATEGORY_LABELS) as FoodCategory[]

function ManualForm({ onCreated }: { onCreated: (food: Food) => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<FoodCategory>('dish')
  const [kcal, setKcal] = useState('')
  const [protein, setProtein] = useState('')
  const [fat, setFat] = useState('')
  const [carbs, setCarbs] = useState('')

  const num = (v: string) => Math.max(0, Number(v.replace(',', '.')) || 0)

  // Если калорийность не указана — считаем её из БЖУ, это частый случай
  const derivedKcal = useMemo(
    () => Math.round(num(protein) * 4 + num(fat) * 9 + num(carbs) * 4),
    [protein, fat, carbs],
  )

  const valid = name.trim().length >= 2 && (num(kcal) > 0 || derivedKcal > 0)

  async function submit() {
    const food = await createFood({
      name,
      category,
      per100: {
        kcal: num(kcal) > 0 ? num(kcal) : derivedKcal,
        protein: num(protein),
        fat: num(fat),
        carbs: num(carbs),
      },
    })
    onCreated(food)
  }

  return (
    <div className={s.form}>
      <TextField
        label="Название" value={name} onChange={setName}
        placeholder="Например, бабушкин пирог"
      />

      <div className={s.field}>
        <span className={s.label}>Категория</span>
        <ChipRow>
          {CATEGORIES.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
              {CATEGORY_LABELS[c]}
            </Chip>
          ))}
        </ChipRow>
      </div>

      <div className={s.field}>
        <span className={s.label}>На 100 граммов</span>
        <div className={s.quad}>
          <NumberField decimal size="md" placeholder="Ккал" value={kcal} onChange={setKcal} />
          <NumberField decimal size="md" placeholder="Белки" value={protein} onChange={setProtein} />
          <NumberField decimal size="md" placeholder="Жиры" value={fat} onChange={setFat} />
          <NumberField decimal size="md" placeholder="Углеводы" value={carbs} onChange={setCarbs} />
        </div>
      </div>

      {!kcal && derivedKcal > 0 && (
        <p className={s.hint}>Калорийность посчитана из БЖУ: {derivedKcal} ккал на 100 г.</p>
      )}

      <Pill block disabled={!valid} onClick={submit}>Сохранить продукт</Pill>
    </div>
  )
}

