import { useId, type ReactNode } from 'react'
import { useCountUp } from './useCountUp'
import s from './Ring.module.css'

interface Props {
  /** 0..1, может быть больше 1 при переборе нормы */
  progress: number
  size?: number
  stroke?: number
  children?: ReactNode
}

/**
 * Кольцо прогресса — главный герой экрана «Сегодня».
 * Занимает место, которое в референсах держала фуд-фотография.
 */
export function Ring({ progress, size = 220, stroke = 14, children }: Props) {
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const clamped = Math.min(Math.max(progress, 0), 1)
  const offset = circumference * (1 - clamped)
  const over = progress > 1
  // Два кольца на одной странице делили бы один id градиента — и второе
  // красилось бы в цвет первого
  const uid = useId()
  const goldId = `ring-gold-${uid}`
  const overId = `ring-over-${uid}`

  return (
    <div className={s.wrap} style={{ width: size, height: size }}>
      <svg className={s.svg} width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id={goldId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--ring-1)" />
            <stop offset="100%" stopColor="var(--ring-2)" />
          </linearGradient>
          <linearGradient id={overId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--ring-1)" />
            <stop offset="100%" stopColor="var(--danger)" />
          </linearGradient>
        </defs>
        <circle
          className={s.track}
          cx={size / 2} cy={size / 2} r={r}
          fill="none" strokeWidth={stroke}
        />
        <circle
          className={`${s.value} ${over ? s.over : ''}`}
          cx={size / 2} cy={size / 2} r={r}
          fill="none" strokeWidth={stroke}
          stroke={`url(#${over ? overId : goldId})`}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className={s.center}>{children}</div>
    </div>
  )
}

/** Число в кольце. Если передано число — докручивается до нового значения */
Ring.Big = function RingBig({ children }: { children: ReactNode }) {
  const isNumber = typeof children === 'number'
  const shown = useCountUp(isNumber ? children : 0)
  return <div className={`${s.big} num`}>{isNumber ? Math.round(shown) : children}</div>
}

Ring.Caption = function RingCaption({ children }: { children: ReactNode }) {
  return <div className={s.caption}>{children}</div>
}
