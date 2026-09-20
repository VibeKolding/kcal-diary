import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pill } from '@/ui/Pill'
import { NumberField, parseNumber } from '@/ui/NumberField'
import { Icon } from '@/ui/Icon'
import { tap } from '@/ui/haptic'
import { humanDay } from '@/domain/dates'
import type { Exercise } from '@/domain/gym'
import { addSet, bestSet, deleteSet, groupByDate, restSeconds, setsForExercise } from '@/db/workouts'
import s from './WorkoutLog.module.css'

/**
 * Журнал подходов под карточкой упражнения и таймер отдыха.
 *
 * Тренировка не увеличивает норму калорий намеренно: расход по формулам
 * даёт ошибку в разы, и «заработанные» калории только сбивают дефицит.
 * Журнал — про прогресс в весах, а не про еду.
 */
export function WorkoutLog({ exercise }: { exercise: Exercise }) {
  const sets = useLiveQuery(() => setsForExercise(exercise.id), [exercise.id]) ?? []
  const best = bestSet(sets)
  const last = sets[0]
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [left, setLeft] = useState<number | null>(null)
  const timer = useRef(0)
  const total = restSeconds(exercise.rest)

  useEffect(() => () => clearInterval(timer.current), [])

  function startRest() {
    clearInterval(timer.current)
    setLeft(total)
    timer.current = window.setInterval(() => {
      setLeft((v) => {
        if (v === null || v <= 1) {
          clearInterval(timer.current)
          tap([30, 40, 30])
          return null
        }
        return v - 1
      })
    }, 1000)
  }

  const w = parseNumber(weight) ?? last?.weightKg ?? 0
  const r = parseNumber(reps) ?? last?.reps ?? 0
  const canSave = r > 0

  async function save() {
    if (!canSave) return
    await addSet(exercise.id, w, r)
    tap()
    startRest()
  }

  const days = groupByDate(sets)

  return (
    <section className={s.log}>
      <div className={s.head}>
        <h3 className={s.title}>Журнал</h3>
        {best && (
          <span className={`${s.best} num`}>
            рекорд {best.weightKg > 0 ? `${best.weightKg} кг × ` : ''}{best.reps}
          </span>
        )}
      </div>

      <div className={s.form}>
        <NumberField label="Вес" unit="кг" decimal size="md" value={weight} onChange={setWeight}
          placeholder={last ? String(last.weightKg) : '0'} />
        <NumberField label="Повторы" size="md" value={reps} onChange={setReps}
          placeholder={last ? String(last.reps) : '10'} />
        <Pill className={s.saveBtn} disabled={!canSave} onClick={save}>
          <Icon name="plus" size={16} strokeWidth={2.2} /> Подход
        </Pill>
      </div>

      {left !== null ? (
        <button className={`${s.rest} ${s.restOn} pressable num`} onClick={() => { clearInterval(timer.current); setLeft(null) }}>
          <Icon name="timer" size={16} /> отдых {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
          <span className={s.restBar} style={{ width: `${(left / total) * 100}%` }} />
        </button>
      ) : (
        <button className={`${s.rest} pressable`} onClick={startRest}>
          <Icon name="timer" size={16} /> отдых {exercise.rest}
        </button>
      )}

      {days.length > 0 && (
        <div className={s.days}>
          {days.slice(0, 5).map((d) => (
            <div key={d.date} className={s.day}>
              <span className={s.dayName}>{humanDay(d.date)}</span>
              <span className={s.daySets}>
                {d.sets.map((x) => (
                  <button
                    key={x.id} className={`${s.set} num pressable`}
                    aria-label={`Удалить подход ${x.weightKg} кг × ${x.reps}`}
                    onClick={() => void deleteSet(x.id)}
                  >
                    {x.weightKg > 0 ? `${x.weightKg}×` : ''}{x.reps}
                  </button>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
