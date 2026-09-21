import type { ReactNode } from 'react'
import s from './Chip.module.css'

/**
 * Чип. С `active` это переключатель — выбранный приём пищи, вкладка,
 * порция, — и выбор сообщается скринридеру через aria-pressed, а не
 * только цветом. Без `active` это обычная кнопка, например продукт из
 * «частого»: у неё нет состояния, и aria-pressed ей не нужен.
 */
export function Chip({
  children, active, onClick,
}: { children: ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      className={`${s.chip} ${active ? s.active : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function ChipRow({ children, center }: { children: ReactNode; center?: boolean }) {
  return <div className={`${s.row} ${center ? s.rowCenter : ''}`}>{children}</div>
}
