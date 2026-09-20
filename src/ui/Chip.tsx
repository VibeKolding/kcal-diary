import type { ReactNode } from 'react'
import s from './Chip.module.css'

export function Chip({
  children, active, onClick,
}: { children: ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button className={`${s.chip} ${active ? s.active : ''}`} onClick={onClick}>
      {children}
    </button>
  )
}

export function ChipRow({ children, center }: { children: ReactNode; center?: boolean }) {
  return <div className={`${s.row} ${center ? s.rowCenter : ''}`}>{children}</div>
}
