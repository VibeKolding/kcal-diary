import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Glass } from '@/ui/Glass'
import { Ring } from '@/ui/Ring'
import { Bar } from '@/ui/Bar'
import { Pill } from '@/ui/Pill'
import { FoodIcon } from '@/ui/FoodIcon'
import { MealIcon } from '@/ui/MealIcon'
import { MEALS, MEAL_LABELS, sumByMeal, sumEntries, entryNutrients, isMacroBlind } from '@/domain/nutrition'
import { humanDay, shiftDay, weekdayShort } from '@/domain/dates'
import type { Entry, Meal, Profile } from '@/domain/types'
import { entriesForDay, copyDay } from '@/db/entries'
import { getWater, addWater, weightHistory } from '@/db/tracking'
import { getMeta } from '@/db/db'
import { FORECAST_POINTS, goalForecast, humanWeeks } from '@/domain/weight'
import { buildDays, buildStreaks } from '@/features/analytics/data'
import { verdict } from '@/domain/streaks'
import { tap } from '@/ui/haptic'
import { useToast } from '@/ui/Toast'
import { Icon } from '@/ui/Icon'
import { EntrySheet } from './EntrySheet'
import { DayNote } from './DayNote'
import { BackupNudge, StorageNotice } from './DataSafety'
import { STORAGE_NOTICE_SEEN } from './safetyText'
import { saveErrorText } from './saveError'
import { setViewedDay, useToday } from './useToday'
import { useSave } from './useSave'
import s from './Today.module.css'

interface Props {
  profile: Profile
  onAdd: (meal: Meal, date: string) => void
}

/** Сколько после копирования касание считается вторым касанием той же кнопки */
const GHOST_TAP_MS = 400

export function Today({ profile, onAdd }: Props) {
  const today = useToday()
  const [date, setDate] = useState(today)
  // Полночь без перезагрузки: кто смотрел на «Сегодня», переезжает на
  // новый день вместе с ним, а кто листал прошлое — остаётся, где был.
  // Состояние меняется прямо при отрисовке, чтобы шапка ни на кадр не
  // показала «Вчера» вместо «Сегодня»
  const [seenToday, setSeenToday] = useState(today)
  if (seenToday !== today) {
    setSeenToday(today)
    if (date === seenToday) setDate(today)
  }
  const [editing, setEditing] = useState<Entry | null>(null)
  const toast = useToast()
  const copy = useSave()
  const copiedAt = useRef(0)

  // «+» в таб-баре пишет в тот день, который открыт здесь
  useEffect(() => {
    setViewedDay(date)
    return () => setViewedDay(null)
  }, [date])

  // Один приём или весь вчерашний день. Второе касание двойного не должно
  // копировать всё ещё раз — ни пока идёт запись, ни пока новые строки
  // не успели встать на место кнопки
  function copyYesterday(meal?: Meal) {
    if (Date.now() - copiedAt.current < GHOST_TAP_MS) return
    void copy.run(async () => {
      const n = await copyDay(shiftDay(date, -1), date, meal)
      if (n === 0) {
        toast({ text: meal ? `Вчера ${MEAL_LABELS[meal].toLowerCase()} был пустым` : 'Вчера записей не было' })
        return
      }
      copiedAt.current = Date.now()
      tap()
    })
  }

  // undefined — ещё грузится, и это не то же самое, что пустой день: иначе
  // кольцо на миг показывало бы всю норму и докручивало её вниз, а приёмы
  // мелькали бы «Пока пусто». При смене дня здесь остаётся прошлый день,
  // пока не придёт новый, — число докручивается от прежнего значения
  const loadedEntries = useLiveQuery(() => entriesForDay(date), [date])
  const loaded = loadedEntries !== undefined
  const entries = loadedEntries ?? []
  const water = useLiveQuery(() => getWater(date), [date]) ?? 0
  // Прогноз «до цели» — тот же, что в профиле и отчётах (goalForecast):
  // тренд последних взвешиваний, а без него — темп из анкеты
  const weights = useLiveQuery(() => weightHistory(FORECAST_POINTS), [])
  const glass = profile.glassMl ?? 250
  const noticeSeen = useLiveQuery(() => getMeta<boolean>(STORAGE_NOTICE_SEEN, false), [])

  // Сводка недели — одна строка, чтобы не ходить в отчёты каждый день.
  // Живой запрос: правка граммов меняет калории, но не число записей, и
  // зависимость от длины списка её не замечала. Серия — за всю историю,
  // а не за семь дней окна
  const week = useLiveQuery(async () => {
    const [pts, streaks] = await Promise.all([buildDays(profile, 7), buildStreaks(today)])
    return { hit: pts.filter((p) => verdict(p) === 'onTarget').length, streak: streaks.current }
  }, [profile, today])

  function changeWater(ml: number) {
    addWater(ml, date).then(() => tap(), (e: unknown) => toast({ text: saveErrorText(e) }))
  }

  const toGoal = weights && profile.targetWeightKg
    ? goalForecast(weights, profile.targetWeightKg, profile)
    : null
  const total = sumEntries(entries)
  const byMeal = sumByMeal(entries)

  const target = profile.targets.kcal
  const left = Math.round(target - total.kcal)
  const progress = target > 0 ? total.kcal / target : 0
  const over = left < 0
  // Число на кольце точное, а тревожная плашка — только за коридором ±10 %:
  // 2050 из 2000 сводка недели и отчёты считают днём в норме
  const overCorridor = verdict({ date, kcal: total.kcal, target, logged: entries.length > 0 }) === 'over'

  return (
    <div className={s.screen}>
      {/* Стрелки по краям, дата по центру — как в заголовке календаря.
          Центрировать иначе нельзя: две кнопки с одной стороны перекосили бы ось. */}
      <header className={s.head}>
        <button className={`${s.iconBtn} pressable`} onClick={() => setDate(shiftDay(date, -1))} aria-label="Предыдущий день">
          <Icon name="chevron-left" size={16} />
        </button>
        <div className={s.headCenter}>
          <h1 className={s.day}>{humanDay(date, today)}</h1>
          <div className={s.daySub}>
            {weekdayShort(date)} · {date.split('-').reverse().slice(0, 2).join('.')}
          </div>
        </div>
        <button
          className={`${s.iconBtn} pressable`}
          onClick={() => setDate(shiftDay(date, 1))}
          disabled={date >= today}
          aria-label="Следующий день"
        >
          <Icon name="chevron-right" size={16} />
        </button>
      </header>

      {/* Сразу после анкеты — пока человек не нажмёт «Понятно» */}
      {noticeSeen === false && <StorageNotice />}

      <Glass accent padding="lg" className={`${s.heroCard} rise-in`}>
        <div className={s.hero}>
          {/* Кольцо приподнято над карточкой — герой выходит за границу,
              как тарелка в референсе */}
          <div className={s.ringWrap}>
            <Ring progress={progress} size={218}>
              {/* Число появляется, когда день прочитан, и сразу настоящим:
                  key пересоздаёт его, и докрутка начинается с первого значения */}
              <Ring.Big key={loaded ? 'value' : 'wait'}>{loaded ? Math.abs(left) : '\u00a0'}</Ring.Big>
              <Ring.Caption>{over ? 'ККАЛ СВЕРХ НОРМЫ' : 'ККАЛ ОСТАЛОСЬ'}</Ring.Caption>
            </Ring>
          </div>

          <div className={s.heroSub}>
            <span className="num">{Math.round(total.kcal)} съедено</span>
            <span className={s.dot} />
            <span className="num">{profile.targets.kcal} норма</span>
          </div>

          {overCorridor && (
            <span className={s.overBadge}>
              <Icon name="warn" size={14} /> Перебор нормы
            </span>
          )}

          {(toGoal || week) && (
            <div className={`${s.strip} num`}>
              {toGoal && Math.abs(toGoal.gapKg) >= 0.05 && (
                <span>
                  до цели {Math.abs(toGoal.gapKg).toFixed(1)} кг
                  {toGoal.weeks !== null && toGoal.weeks > 0 && ` · ${humanWeeks(toGoal.weeks)}`}
                </span>
              )}
              {toGoal && Math.abs(toGoal.gapKg) < 0.05 && <span>вы у цели</span>}
              {week && <span>неделя {week.hit}/7 в норме · серия {week.streak}</span>}
            </div>
          )}

          <div className={s.bars}>
            <Bar label="Белки" value={total.protein} target={profile.targets.protein} color="var(--protein)" />
            <Bar label="Жиры" value={total.fat} target={profile.targets.fat} color="var(--fat)" />
            <Bar label="Углеводы" value={total.carbs} target={profile.targets.carbs} color="var(--carbs)" />
          </div>
        </div>
      </Glass>

      <Glass className="rise-in" style={{ '--i': 1 } as CSSProperties}>
        <div className={s.water}>
          <FoodIcon
            category="drink" size={40}
            progress={profile.waterGoalMl > 0 ? water / profile.waterGoalMl : 0}
            fill={profile.waterGoalMl > 0 ? water / profile.waterGoalMl : 0}
          />
          <div className={s.waterInfo}>
            <div className={s.waterTitle}>Вода</div>
            <div className={`${s.waterValue} num`}>
              {water} / {profile.waterGoalMl} мл
            </div>
          </div>
          <div className={s.waterBtns}>
            {/* На кнопках только «−» и «+250»: подпись для скринридера говорит, о чём речь */}
            <Pill size="sm" variant="ghost" disabled={water <= 0} onClick={() => changeWater(-glass)}>
              <span aria-hidden="true">−</span>
              <span className="sr-only">Убрать {glass} мл воды</span>
            </Pill>
            <Pill size="sm" variant="ghost" onClick={() => changeWater(glass)}>
              <span aria-hidden="true">+{glass}</span>
              <span className="sr-only">Добавить {glass} мл воды</span>
            </Pill>
          </div>
        </div>
      </Glass>

      {MEALS.map((meal, mi) => {
        const mealEntries = entries.filter((e) => e.meal === meal)
        const sum = byMeal[meal]
        return (
          <Glass key={meal} className="rise-in" style={{ '--i': mi + 2 } as CSSProperties}>
            <div className={s.mealHead}>
              {/* Значок и слово — одна группа: .mealHead выравнивает по базовой
                  линии текста, и значок на этой оси уехал бы вниз */}
              <span className={s.mealName} style={{ '--i': mi } as CSSProperties}>
                <MealIcon meal={meal} size={30} />
                <span className={s.mealTitle}>{MEAL_LABELS[meal]}</span>
              </span>
              <span className={`${s.mealKcal} num`}>{Math.round(sum.kcal)} ккал</span>
            </div>

            {mealEntries.length === 0 ? (
              // Пока день грузится, строка занимает своё место невидимой:
              // пустой день не прыгает, а полный не мигает «Пока пусто»
              <div className={`${s.mealEmpty} ${loaded ? '' : s.pending}`}>
                <span className={s.emptyText}>Пока пусто</span>
                <span className={s.mealActions}>
                  <Pill size="sm" variant="quiet" onClick={() => copyYesterday(meal)}>
                    Как вчера
                  </Pill>
                  <Pill size="sm" variant="ghost" onClick={() => onAdd(meal, date)}>Добавить</Pill>
                </span>
              </div>
            ) : (
              <>
                <div className={s.entries}>
                  {mealEntries.map((e, i) => {
                    const n = entryNutrients(e)
                    return (
                      <button
                        key={e.id} className={`${s.entry} pressable rise-in`}
                        style={{ '--i': i } as CSSProperties}
                        onClick={() => {
                          // Второе касание нетерпеливого двойного по «Как вчера»
                          // попадает в строку, выросшую на месте кнопки
                          if (Date.now() - copiedAt.current < GHOST_TAP_MS) return
                          setEditing(e)
                        }}
                      >
                        <FoodIcon
                          category={e.category} size={38}
                          fill={profile.targets.kcal > 0 ? n.kcal / profile.targets.kcal : 0}
                        />
                        <span className={s.entryBody}>
                          <div className={s.entryName}>{e.title}</div>
                          <div className={`${s.entryMeta} num`}>
                            {/* Быстрая запись без состава знает одни калории:
                                «Б 0.0 · Ж 0.0 · У 0.0» выдавало бы неизвестное за ноль */}
                            {isMacroBlind(e)
                              ? (e.refId ? `${Math.round(e.grams)} г · состав неизвестен` : 'состав неизвестен')
                              : `${Math.round(e.grams)} г · Б ${n.protein.toFixed(1)} · Ж ${n.fat.toFixed(1)} · У ${n.carbs.toFixed(1)}`}
                          </div>
                        </span>
                        <span className={`${s.entryKcal} num`}>{Math.round(n.kcal)}</span>
                      </button>
                    )
                  })}
                </div>
                <button className={`${s.addLine} pressable`} onClick={() => onAdd(meal, date)}>
                  <Icon name="plus" size={14} strokeWidth={2.2} /> Добавить ещё
                </button>
              </>
            )}
          </Glass>
        )
      })}

      {/* key по дате: уход с дня сохраняет черновик заметки именно этого дня */}
      <DayNote key={date} date={date} />

      {loaded && entries.length === 0 && (
        <div className={s.quickRow}>
          <Pill size="sm" variant="ghost" onClick={() => copyYesterday()}>
            Скопировать вчерашний день
          </Pill>
        </div>
      )}

      {noticeSeen === true && <BackupNudge />}

      <EntrySheet entry={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
