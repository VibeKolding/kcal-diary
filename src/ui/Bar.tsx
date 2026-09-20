import { Delta } from './Delta'
import s from './Bar.module.css'

interface Props {
  label: string
  value: number
  target: number
  unit?: string
  color: string
}

/** Тонкая полоса прогресса под кольцом — для белков, жиров, углеводов и воды */
export function Bar({ label, value, target, unit = 'г', color }: Props) {
  const pct = target > 0 ? Math.min(value / target, 1) * 100 : 0
  return (
    <div className={s.row}>
      <div className={s.head}>
        <span className={s.label}>{label}</span>
        <span className={s.right}>
          <span className={`${s.value} num`}>
            {Math.round(value)}<span> / {Math.round(target)} {unit}</span>
          </span>
          {/* Разницу считаем за человека: «208 / 82 г» само по себе ни о чём
              не говорит. Полосу не трогаем — она упирается в край. */}
          <Delta value={value} target={target} />
        </span>
      </div>
      <div className={s.track}>
        <div className={s.fill} style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}
