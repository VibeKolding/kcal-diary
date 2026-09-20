import type { ReactNode } from 'react'
import s from './Pill.module.css'

interface Props {
  children: ReactNode
  variant?: 'primary' | 'ghost' | 'quiet'
  size?: 'md' | 'sm'
  block?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
  onClick?: () => void
}

export function Pill({
  children, variant = 'primary', size = 'md', block, disabled, type = 'button', className, onClick,
}: Props) {
  const cls = [
    s.pill, s[variant], size === 'sm' && s.sm, block && s.block, className,
  ].filter(Boolean).join(' ')

  return (
    <button type={type} className={cls} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}
