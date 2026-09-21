import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pill } from '@/ui/Pill'
import { NumberField, parseNumber } from '@/ui/NumberField'
import { Icon } from '@/ui/Icon'
import { tap } from '@/ui/haptic'
import { useToast } from '@/ui/Toast'
import { humanDay, plural } from '@/domain/dates'
import type { Exercise } from '@/domain/gym'
import type { WorkoutSet } from '@/domain/types'
import { addSet, deleteSet, exerciseLog, groupByDate, restoreSet, restSeconds } from '@/db/workouts'
import { restLeft, shouldBuzz } from './rest'
import s from './WorkoutLog.module.css'

/** Подход словами: «60 кг × 8» или «15 повторов» для упражнений без веса */
function setText(x: WorkoutSet): string {
  return x.weightKg > 0
    ? `${x.weightKg} кг × ${x.reps}`
    : `${x.reps} ${plural(x.reps, 'повтор', 'повтора', 'повторов')}`
}

/**
 * Журнал подходов под карточкой упражнения и таймер отдыха.
 *
 * Тренировка не увеличивает норму калорий намеренно: расход по формулам
 * даёт ошибку в разы, и «заработанные» калории только сбивают дефицит.
 * Журнал — про прогресс в весах, а не про еду.
 */
export function WorkoutLog({ exercise }: { exercise: Exercise }) {
  const log = useLiveQuery(() => exerciseLog(exercise.id), [exercise.id])
  const sets = log?.sets ?? []
  // Рекорд приходит из того же запроса, но по всем подходам, а не по показанным
  const best = log?.best ?? null
  const last = sets[0]
  const toast = useToast()
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [left, setLeft] = useState<number | null>(null)
  const timer = useRef(0)
  const total = restSeconds(exercise.rest)

  useEffect(() => () => clearInterval(timer.current), [])

  function stopRest() {
    clearInterval(timer.current)
    setLeft(null)
  }

  function startRest() {
    clearInterval(timer.current)
    const endsAt = Date.now() + total * 1000
    setLeft(total)
    // Интервал только сверяется с часами (см. rest.ts), поэтому может тикать
    // чаще секунды: одинаковое число React не перерисовывает, а после
    // разблокировки экрана верная цифра появляется сразу, а не через секунду
    timer.current = window.setInterval(() => {
      const now = Date.now()
      const v = restLeft(endsAt, now)
      if (v > 0) { setLeft(v); return }
      clearInterval(timer.current)
      if (shouldBuzz(endsAt, now)) tap([30, 40, 30])
      setLeft(null)
    }, 250)
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

  async function remove(x: WorkoutSet) {
    await deleteSet(x.id)
    tap()
    // Удаление без подтверждения, зато с откатом — как у записей дневника:
    // подход возвращается с тем же id и временем, а с ним и рекорд
    toast({
      text: `Подход удалён: ${setText(x)}`,
      action: { label: 'Отменить', onClick: () => restoreSet(x) },
    })
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
        <button className={`${s.rest} ${s.restOn} pressable num`} onClick={stopRest}>
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
                {/* Крестик — видимый знак того, что касание удаляет: без него
                    фишка читалась как подпись, и подход пропадал случайно */}
                {d.sets.map((x) => (
                  <button
                    key={x.id} className={`${s.set} num pressable`}
                    aria-label={`Удалить подход ${setText(x)}`}
                    onClick={() => void remove(x)}
                  >
                    {x.weightKg > 0 ? `${x.weightKg}×` : ''}{x.reps}
                    <Icon name="close" size={12} className={s.setX} />
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
