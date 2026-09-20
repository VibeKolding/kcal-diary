import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import s from './Empty.module.css'

interface Props {
  /** Одна короткая фраза о том, что здесь будет */
  title: string
  /** Что сделать, чтобы здесь что-то появилось */
  text?: string
  glyph?: IconName
  /** Обычно одна Pill — действие, которое ведёт из пустоты */
  action?: ReactNode
}

/**
 * Пустое состояние. Одно на все экраны: раньше их было пять с разными
 * отступами и размерами, и пустота везде выглядела по-своему.
 */
export function Empty({ title, text, glyph = 'plate', action }: Props) {
  return (
    <div className={s.empty}>
      <span className={s.glyph}><Icon name={glyph} size={22} /></span>
      <p className={s.title}>{title}</p>
      {text && <p className={s.text}>{text}</p>}
      {action && <div className={s.action}>{action}</div>}
    </div>
  )
}
