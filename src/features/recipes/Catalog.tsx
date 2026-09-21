import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Glass } from '@/ui/Glass'
import { Pill } from '@/ui/Pill'
import { Chip, ChipRow } from '@/ui/Chip'
import { Sheet } from '@/ui/Sheet'
import { useLast } from '@/ui/useLast'
import { tap } from '@/ui/haptic'
import { Empty } from '@/ui/Empty'
import { Skeleton } from '@/ui/Skeleton'
import { Icon } from '@/ui/Icon'
import { StarButton } from '@/ui/StarButton'
import { favoriteIds } from '@/db/workouts'
import { useLiveQuery } from 'dexie-react-hooks'
import { DishArt } from '@/ui/DishArt'
import { MEAL_LABELS, MEALS, scale } from '@/domain/nutrition'
import { dayKey } from '@/domain/dates'
import type { Meal, Profile } from '@/domain/types'
import { addCatalogEntry } from '@/db/entries'
import {
  GOAL_TABS, RECIPE_MEALS, dishTokens, isBowl, loadCatalog,
  portionGrams, portionKcal,
  type CatalogRecipe, type RecipeGoal, type RecipeMeal,
} from '@/db/catalog'
import s from './Catalog.module.css'

/**
 * Фильтры каталога на время просмотра блюда.
 *
 * Карточка закрывает панель добавления, а закрытая панель размонтирует
 * каталог вместе с его состоянием: без этого запаса человек возвращался бы
 * к цели из профиля, к завтракам и к началу списка. Запас пишется только
 * при открытии блюда и забирается первым же показом каталога, поэтому новый
 * заход в «Добавить еду» по-прежнему начинается с цели пользователя.
 */
let resume: { goal: RecipeGoal; meal: RecipeMeal; onlyFav: boolean; openedId: string } | null = null

/**
 * Каталог блюд внутри экрана добавления еды.
 *
 * Открытое блюдо держит РОДИТЕЛЬ, а не этот компонент. Карточка рецепта —
 * тоже выдвижная панель, а сам каталог уже лежит внутри панели добавления:
 * без вынесенного наружу состояния вторая панель открылась бы поверх первой.
 * В приложении принято, что вторая закрывает первую.
 */
export function CatalogBrowser({ profile, onOpen }: {
  profile: Profile
  onOpen: (recipe: CatalogRecipe) => void
}) {
  // Читается при первом рендере, а стирается в эффекте: в StrictMode
  // инициализатор вызывается дважды, и второй вызов не должен найти пустоту
  const [back] = useState(() => resume)
  useEffect(() => { resume = null }, [])

  // Каталог открывается на цели пользователя: чаще всего именно она ему и нужна
  const [goal, setGoal] = useState<RecipeGoal>(back?.goal ?? profile.goal)
  const [meal, setMeal] = useState<RecipeMeal>(back?.meal ?? currentMeal())
  const [all, setAll] = useState<CatalogRecipe[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [onlyFav, setOnlyFav] = useState(back?.onlyFav ?? false)
  const favIds = useLiveQuery(() => favoriteIds('recipe'), []) ?? []
  const openedRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    loadCatalog()
      .then((rows) => { setAll(rows); setLoaded(true) })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Не удалось загрузить рецепты'))
  }, [])

  // После возврата из карточки список стоит на том блюде, которое смотрели,
  // и фокус там же — клавиатура не начинает обход панели заново
  useEffect(() => {
    if (!loaded || !openedRef.current) return
    openedRef.current.scrollIntoView({ block: 'center' })
    openedRef.current.focus({ preventScroll: true })
  }, [loaded])

  function openDish(recipe: CatalogRecipe) {
    resume = { goal, meal, onlyFav, openedId: recipe.id }
    onOpen(recipe)
  }

  // Избранное — поверх фильтров: звёздочку ставят, чтобы не искать заново
  const shown = useMemo(
    () => onlyFav
      ? all.filter((r) => favIds.includes(r.id))
      : all.filter((r) => r.goal === goal && r.meal === meal),
    [all, goal, meal, onlyFav, favIds],
  )

  const goalInfo = GOAL_TABS.find((g) => g.value === goal)!

  return (
    <div className={s.browser}>
      <p className={s.goalHint}>{goalInfo.hint}</p>

      <ChipRow>
        {GOAL_TABS.map((g) => (
          <Chip key={g.value} active={goal === g.value} onClick={() => setGoal(g.value)}>
            {g.title}
          </Chip>
        ))}
      </ChipRow>

      <ChipRow>
        {favIds.length > 0 && (
          <Chip active={onlyFav} onClick={() => setOnlyFav((v) => !v)}>
            <Icon name="star" size={12} className={s.chipStar} /> Избранное
          </Chip>
        )}
        {RECIPE_MEALS.map((m) => (
          <Chip key={m.value} active={!onlyFav && meal === m.value} onClick={() => { setOnlyFav(false); setMeal(m.value) }}>
            {m.title}
          </Chip>
        ))}
      </ChipRow>

      {error && (
        <Glass><Empty glyph="recipe" title="Каталог не загрузился" text={error} /></Glass>
      )}

      {!error && !loaded && (
        <div className={s.list} aria-busy="true">
          <Skeleton height={128} /><Skeleton height={128} /><Skeleton height={128} />
        </div>
      )}

      {!error && loaded && shown.length === 0 && (
        <Glass><Empty glyph="recipe" title="Здесь пока пусто" text="Попробуйте другую цель или приём пищи." /></Glass>
      )}

      <div className={s.list}>
        {shown.map((r, i) => (
          <Glass key={r.id} padding="none" className="rise-in" style={{ '--i': i } as CSSProperties}>
            <button
              ref={r.id === back?.openedId ? openedRef : undefined}
              className={`${s.card} pressable`} onClick={() => openDish(r)}
            >
              <span className={s.cover}>
                <DishArt
                  tokens={dishTokens(r)} bowl={isBowl(r)}
                  hue={hueFor(r.id)} height={86} variant="thumb"
                  photo={r.photo}
                />
              </span>
              <span className={s.body}>
                <span className={s.name}>{r.title}</span>
                <span className={s.meta}>
                  <span className="num">{r.minutes} мин</span>
                  <i className={s.dot} />
                  <span className="num">порция {portionGrams(r)} г</span>
                </span>

              </span>
              <span className={s.kcal}>
                <span className={`${s.kcalValue} num`}>{portionKcal(r)}</span>
                <span className={s.kcalLabel}>ккал</span>
              </span>
            </button>
          </Glass>
        ))}
      </div>

    </div>
  )
}

/**
 * Оттенок фона обложки. Считается из идентификатора, поэтому у рецепта
 * он всегда один и тот же, а соседние карточки в списке не сливаются.
 */
function hueFor(id: string): number {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360
  return (h * 47) % 360
}

/** Какой приём пищи открыть по умолчанию — зависит от времени суток */
function currentMeal(now = new Date()): RecipeMeal {
  const h = now.getHours()
  if (h < 11) return 'breakfast'
  if (h < 16) return 'lunch'
  return 'dinner'
}

/**
 * Карточка блюда с записью в дневник.
 *
 * Приём пищи и дата приходят снаружи: панель открывается из экрана добавления,
 * где пользователь их уже выбрал, и переспрашивать второй раз незачем. Без
 * них панель берёт приём из самого рецепта и сегодняшний день.
 */
export function RecipeSheet({ recipe, defaultMeal, date, onClose, onAdded }: {
  recipe: CatalogRecipe | null
  defaultMeal?: Meal
  date?: string
  onClose: () => void
  onAdded?: () => void
}) {
  const [grams, setGrams] = useState(100)
  const [meal, setMeal] = useState<Meal>('lunch')
  const [saved, setSaved] = useState(false)
  // Пауза, чтобы увидеть «Записано», перед закрытием. Панель живёт дольше
  // одного блюда, и таймер не должен дотянуться до следующего открытия
  const closeTimer = useRef(0)
  const current = useRef(recipe)

  useEffect(() => {
    current.current = recipe
    clearTimeout(closeTimer.current)
    if (!recipe) return
    setGrams(portionGrams(recipe))
    setMeal(defaultMeal ?? recipe.meal)
    setSaved(false)
  }, [recipe, defaultMeal])

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  // Стабильная ссылка: панель заново навешивает фокус и inert при каждой
  // смене onClose, и выбор порции не должен выдёргивать фокус из чипа
  const close = useCallback(() => {
    clearTimeout(closeTimer.current)
    onClose()
  }, [onClose])

  const shown = useLast(recipe)
  if (!shown) return null

  const n = scale(shown.per100, grams)

  async function add() {
    if (!shown) return
    await addCatalogEntry(shown, grams, meal, date ?? dayKey())
    tap()
    // Пока шла запись, карточку могли закрыть — тогда закрывать уже нечего
    if (current.current !== shown) return
    setSaved(true)
    closeTimer.current = window.setTimeout(() => {
      // Блюдо записано, и панель добавления уходит целиком: следующий
      // заход в каталог начинается с цели пользователя, а не с этого блюда
      resume = null
      ;(onAdded ?? onClose)()
    }, 550)
  }

  return (
    <Sheet
      open={recipe !== null} title="Рецепт" onClose={close}
      actions={(
        <span className={s.sheetActions}>
          <StarButton kind="recipe" id={shown.id} />
          <button className={`${s.closeBtn} pressable`} onClick={close} aria-label="Закрыть">
            <Icon name="close" size={16} />
          </button>
        </span>
      )}
    >
      <div className={s.sheet}>
        <DishArt
          tokens={dishTokens(shown)} bowl={isBowl(shown)}
          hue={hueFor(shown.id)} height={168}
          photo={shown.photo}
        />

        <div className={s.sheetHead}>
          <div>
            <div className={s.sheetTitle}>{shown.title}</div>
            <div className={s.meta}>
              <span className="num">{shown.minutes} мин</span>
              <i className={s.dot} />
              <span className="num">выход {shown.yieldGrams} г</span>
            </div>
          </div>
        </div>

        <Glass flat>
          <div className={s.macros}>
            <div className={`${s.cell} ${s.kcalCell}`}>
              <div className={`${s.cellValue} num`}>{Math.round(n.kcal)}</div>
              <div className={s.cellLabel}>ккал</div>
            </div>
            <div className={s.cell}>
              <div className={`${s.cellValue} num`}>{n.protein.toFixed(1)}</div>
              <div className={s.cellLabel}>белки</div>
            </div>
            <div className={s.cell}>
              <div className={`${s.cellValue} num`}>{n.fat.toFixed(1)}</div>
              <div className={s.cellLabel}>жиры</div>
            </div>
            <div className={s.cell}>
              <div className={`${s.cellValue} num`}>{n.carbs.toFixed(1)}</div>
              <div className={s.cellLabel}>углеводы</div>
            </div>
          </div>
        </Glass>

        <div className={s.section}>
          <span className={s.sectionTitle}>Состав на {shown.yieldGrams} г готового</span>
          <div>
            {shown.items.map((it) => (
              <div key={it.n} className={s.ing}>
                <span className={s.ingName}>{it.n}</span>
                <span className={`${s.ingGrams} num`}>{it.g} г</span>
              </div>
            ))}
          </div>
        </div>

        <div className={s.section}>
          <span className={s.sectionTitle}>Приготовление</span>
          <div className={s.steps}>
            {shown.steps.map((step, i) => (
              <div key={step} className={s.step}>
                <span className={`${s.stepNum} num`}>{i + 1}</span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={s.tip}>
          <span className={s.tipIcon}><Icon name="bulb" size={16} /></span>
          <span>{shown.tip}</span>
        </div>

        <div className={s.section}>
          <span className={s.sectionTitle}>Записать в дневник</span>
          <ChipRow>
            {MEALS.map((m) => (
              <Chip key={m} active={meal === m} onClick={() => setMeal(m)}>
                {MEAL_LABELS[m]}
              </Chip>
            ))}
          </ChipRow>
          <ChipRow>
            <Chip active={grams === portionGrams(shown)} onClick={() => setGrams(portionGrams(shown))}>
              порция {portionGrams(shown)} г
            </Chip>
            <Chip active={grams === Math.round(portionGrams(shown) / 2)}
              onClick={() => setGrams(Math.round(portionGrams(shown) / 2))}>
              половина
            </Chip>
            <Chip active={grams === shown.yieldGrams} onClick={() => setGrams(shown.yieldGrams)}>
              всё блюдо
            </Chip>
          </ChipRow>
        </div>

        <Pill block disabled={saved} onClick={add}>
          {saved ? 'Записано' : `Добавить ${Math.round(n.kcal)} ккал`}
        </Pill>
      </div>
    </Sheet>
  )
}

