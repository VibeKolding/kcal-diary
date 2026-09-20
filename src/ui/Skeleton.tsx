import s from './Skeleton.module.css'

/**
 * Заглушка на время загрузки — стеклянная плашка с пробегающим бликом.
 * Ставится на место того, что появится, чтобы экран не прыгал.
 */
export function Skeleton({ height = 96, radius }: { height?: number; radius?: string }) {
  return (
    <div
      className={s.skeleton}
      style={{ height, borderRadius: radius }}
      aria-hidden="true"
    />
  )
}
