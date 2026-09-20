import { useEffect, useState, type CSSProperties } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Glass } from '@/ui/Glass'
import { Ring } from '@/ui/Ring'
import { Bar } from '@/ui/Bar'
import { Pill } from '@/ui/Pill'
import { FoodIcon } from '@/ui/FoodIcon'
import { MealIcon } from '@/ui/MealIcon'
import { MEALS, MEAL_LABELS, sumByMeal, sumEntries, entryNutrients } from '@/domain/nutrition'
import { dayKey, humanDay, shiftDay, weekdayShort } from '@/domain/dates'
import type { Entry, Meal, Profile } from '@/domain/types'
import { entriesForDay, copyDay } from '@/db/entries'
import { getWater, addWater, latestWeight, getNote, putNote } from '@/db/tracking'
import { humanWeeks, weeksToTarget } from '@/domain/weight'
import { buildDays } from '@/features/analytics/data'
import { currentStreak, verdict } from '@/domain/streaks'
import { TextField } from '@/ui/TextField'
import { tap } from '@/ui/haptic'
import { useToast } from '@/ui/Toast'
import { Icon } from '@/ui/Icon'
import { backupIsStale, exportBackup } from '@/features/backup/backup'
import { EntrySheet } from './EntrySheet'
import s from './Today.module.css'

interface Props {
  profile: Profile
  onAdd: (meal: Meal, date: string) => void
}

export function Today({ profile, onAdd }: Props) {
  const today = dayKey()
  const [date, setDate] = useState(today)
  const [editing, setEditing] = useState<Entry | null>(null)
  const toast = useToast()

  // Один приём вчерашнего дня — copyDay давно это умел, а кнопки не было
  async function repeatYesterday(meal: Meal) {
    const n = await copyDay(shiftDay(date, -1), date, meal)
    if (n === 0) toast({ text: `Вчера ${MEAL_LABELS[meal].toLowerCase()} был пустым` })
    else tap()
  }

  const entries = useLiveQuery(() => entriesForDay(date), [date]) ?? []
  const water = useLiveQuery(() => getWater(date), [date]) ?? 0
  const weight = useLiveQuery(() => latestWeight(), [])
  const glass = profile.glassMl ?? 250

  // Сводка недели — одна строка, чтобы не ходить в отчёты каждый день
  const [week, setWeek] = useState<{ hit: number; logged: number; streak: number } | null>(null)
  useEffect(() => {
    void buildDays(profile, 7).then((pts) => setWeek({
      hit: pts.filter((p) => verdict(p) === 'onTarget').length,
      logged: pts.filter((p) => p.logged).length,
      streak: currentStreak(pts),
    }))
  }, [profile, entries.length])

  // Заметка к дню: хранится отдельно и пишется при потере фокуса
  const savedNote = useLiveQuery(() => getNote(date), [date]) ?? ''
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  useEffect(() => { setNote(savedNote); setNoteOpen(savedNote.length > 0) }, [savedNote, date])

  const rate = profile.goal === 'lose' ? -profile.ratePerWeek : profile.goal === 'gain' ? profile.ratePerWeek : 0
  const toGoal = weight && profile.targetWeightKg
    ? { kg: profile.targetWeightKg - weight.kg, weeks: weeksToTarget(weight.kg, profile.targetWeightKg, rate) }
    : null
  const total = sumEntries(entries)
  const byMeal = sumByMeal(entries)

  const target = profile.targets.kcal
  const left = Math.round(target - total.kcal)
  const progress = target > 0 ? total.kcal / target : 0
  const over = left < 0

  return (
    <div className={s.screen}>
      {/* Стрелки по краям, дата по центру — как в заголовке календаря.
          Центрировать иначе нельзя: две кнопки с одной стороны перекосили бы ось. */}
      <header className={s.head}>
        <button className={`${s.iconBtn} pressable`} onClick={() => setDate(shiftDay(date, -1))} aria-label="Предыдущий день">
          <Icon name="chevron-left" size={16} />
        </button>
        <div className={s.headCenter}>
          <div className={s.day}>{humanDay(date, today)}</div>
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

      <Glass accent padding="lg" className={`${s.heroCard} rise-in`}>
        <div className={s.hero}>
          {/* Кольцо приподнято над карточкой — герой выходит за границу,
              как тарелка в референсе */}
          <div className={s.ringWrap}>
            <Ring progress={progress} size={218}>
              <Ring.Big>{Math.abs(left)}</Ring.Big>
              <Ring.Caption>{over ? 'ККАЛ СВЕРХ НОРМЫ' : 'ККАЛ ОСТАЛОСЬ'}</Ring.Caption>
            </Ring>
          </div>

          <div className={s.heroSub}>
            <span className="num">{Math.round(total.kcal)} съедено</span>
            <span className={s.dot} />
            <span className="num">{profile.targets.kcal} норма</span>
          </div>

          {over && (
            <span className={s.overBadge}>
              <Icon name="warn" size={14} /> Перебор нормы
            </span>
          )}

          {(toGoal || week) && (
            <div className={`${s.strip} num`}>
              {toGoal && Math.abs(toGoal.kg) >= 0.05 && (
                <span>
                  до цели {Math.abs(toGoal.kg).toFixed(1)} кг
                  {toGoal.weeks !== null && toGoal.weeks > 0 && ` · ${humanWeeks(toGoal.weeks)}`}
                </span>
              )}
              {toGoal && Math.abs(toGoal.kg) < 0.05 && <span>вы у цели</span>}
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
            <Pill size="sm" variant="ghost" onClick={() => { tap(); void addWater(-glass, date) }}>−</Pill>
            <Pill size="sm" variant="ghost" onClick={() => { tap(); void addWater(glass, date) }}>+{glass}</Pill>
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
              <div className={s.mealEmpty}>
                <span className={s.emptyText}>Пока пусто</span>
                <span className={s.mealActions}>
                  <Pill size="sm" variant="quiet" onClick={() => void repeatYesterday(meal)}>Как вчера</Pill>
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
                        onClick={() => setEditing(e)}
                      >
                        <FoodIcon
                          category={e.category} size={38}
                          fill={profile.targets.kcal > 0 ? n.kcal / profile.targets.kcal : 0}
                        />
                        <span className={s.entryBody}>
                          <div className={s.entryName}>{e.title}</div>
                          <div className={`${s.entryMeta} num`}>
                            {Math.round(e.grams)} г · Б {n.protein.toFixed(1)} · Ж {n.fat.toFixed(1)} · У {n.carbs.toFixed(1)}
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

      <div className={s.noteBlock}>
        {noteOpen ? (
          <TextField
            label="Заметка к дню" value={note} onChange={setNote}
            placeholder="День рождения, болел, застолье…"
            trailing={note !== savedNote ? (
              <button className={`${s.noteSave} pressable`} onClick={() => { void putNote(date, note); tap() }}>
                <Icon name="check" size={16} strokeWidth={2.2} />
              </button>
            ) : undefined}
          />
        ) : (
          <button className={`${s.addLine} pressable`} onClick={() => setNoteOpen(true)}>
            <Icon name="plus" size={14} strokeWidth={2.2} /> Заметка к дню
          </button>
        )}
      </div>

      {entries.length === 0 && (
        <div className={s.quickRow}>
          <Pill
            size="sm" variant="ghost"
            onClick={() => void copyDay(shiftDay(date, -1), date)}
          >
            Скопировать вчерашний день
          </Pill>
        </div>
      )}

      <BackupNudge />

      <EntrySheet entry={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

/**
 * Напоминание о копии там, где человек находится.
 *
 * Копию можно было сделать и раньше — кнопка лежит в профиле. Но чтобы до
 * неё дойти, нужно вспомнить, что она существует, и уйти с экрана, на
 * котором ты только что записал ужин. Поэтому строка появляется прямо
 * здесь и делает копию одним нажатием.
 *
 * Показывается, только когда копии нет больше недели, и исчезает сразу
 * после нажатия: постоянная плашка «сделайте копию» перестаёт читаться
 * на третий день.
 */
function BackupNudge() {
  const [show, setShow] = useState(false)
  const [done, setDone] = useState(false)
  const toast = useToast()

  useEffect(() => { void backupIsStale().then(setShow) }, [])
  if (!show || done) return null

  return (
    <div className={s.nudge}>
      <span className={s.nudgeText}>
        Дневник хранится только на этом телефоне. Копии нет больше недели.
      </span>
      <Pill
        size="sm"
        onClick={async () => {
          await exportBackup()
          setDone(true)
          toast({ text: 'Копия сохранена в загрузки' })
        }}
      >
        Сохранить
      </Pill>
    </div>
  )
}
