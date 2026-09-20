import type { CSSProperties, ReactNode } from 'react'
import s from './Glass.module.css'

interface Props {
  children: ReactNode
  /** Золотая рамка и более плотное стекло — для главного блока экрана */
  accent?: boolean
  padding?: 'none' | 'md' | 'lg'
  flat?: boolean
  className?: string
  style?: CSSProperties
  onClick?: () => void
}

export function Glass({
  children, accent, padding = 'md', flat, className, style, onClick,
}: Props) {
  const cls = [
    s.glass,
    accent && s.accent,
    padding === 'md' && s.pad,
    padding === 'lg' && s.padLg,
    flat && s.flat,
    className,
  ].filter(Boolean).join(' ')

  // Карточка с действием — настоящая кнопка: отклик на нажатие, фокус
  // с клавиатуры и роль для скринридера приходят бесплатно
  if (onClick) {
    return (
      <button type="button" className={`${cls} pressable`} style={style} onClick={onClick}>
        {children}
      </button>
    )
  }

  return (
    <div className={cls} style={style}>
      {children}
    </div>
  )
}
