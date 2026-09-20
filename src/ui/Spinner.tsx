import s from './Spinner.module.css'

/** Один индикатор ожидания на всё приложение — раньше их было два разных */
export function Spinner({ size = 26 }: { size?: number }) {
  return (
    <span
      className={s.spinner}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Загрузка"
    />
  )
}
