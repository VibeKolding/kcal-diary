import type { Nutrients } from '@/domain/types'
import type { DayVerdict } from '@/domain/streaks'
import { Delta } from '@/ui/Delta'
import { humanDay, weekdayShort } from '@/domain/dates'
import s from './Stats.module.css'

/** Одна точка графика «Калории по дням». БЖУ нужны подсказке, а не столбцу */
export interface ChartDay {
  date: string
  label: string
  kcal: number
  target: number
  nutrients: Nutrients
  macrosKnown: boolean
  logged: boolean
  verdict: DayVerdict
}

interface Props {
  active?: boolean
  payload?: { payload: ChartDay }[]
  targets: Nutrients
}

const MACROS = [
  { key: 'protein', label: 'Белки', color: 'var(--protein)' },
  { key: 'fat', label: 'Жиры', color: 'var(--fat)' },
  { key: 'carbs', label: 'Углеводы', color: 'var(--carbs)' },
] as const

/**
 * Подсказка столбца. Отвечает на вопрос, который сам график задаёт, но не
 * закрывает: насколько мимо нормы и за счёт чего именно.
 */
export function DayTooltip({ active, payload, targets }: Props) {
  const day = payload?.[0]?.payload
  if (!active || !day) return null

  return (
    <div className={s.tip}>
      <div className={s.tipHead}>
        {humanDay(day.date)} <span className={s.tipWeekday}>{weekdayShort(day.date)}</span>
      </div>

      {!day.logged ? (
        <div className={s.tipEmpty}>Нет записей</div>
      ) : (
        <>
          <div className={s.tipMain}>
            <span className="num">{day.kcal} ккал</span>
            <Delta value={day.kcal} target={day.target} mode="number" />
          </div>

          <div className={s.tipRows}>
            {MACROS.map((m) => (
              <div key={m.key} className={s.tipRow}>
                <i className={s.tipDot} style={{ background: m.color }} />
                <span className={s.tipLabel}>{m.label}</span>
                <span className={`${s.tipValue} num`}>{Math.round(day.nutrients[m.key])} г</span>
                {day.macrosKnown && <Delta value={day.nutrients[m.key]} target={targets[m.key]} mode="number" />}
              </div>
            ))}
          </div>

          {/* Та же честность, что и в средних БЖУ: состав занижен, значит и
              отклонение от нормы считать не из чего — капсулы не показываем */}
          {!day.macrosKnown && (
            <div className={s.tipNote}>Быстрые записи — состав неполный</div>
          )}
        </>
      )}
    </div>
  )
}
