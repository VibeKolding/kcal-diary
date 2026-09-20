import { useLiveQuery } from 'dexie-react-hooks'
import { Icon } from './Icon'
import { tap } from './haptic'
import { isFavorite, toggleFavorite, type FavoriteKind } from '@/db/workouts'
import s from './StarButton.module.css'

/** Звёздочка «в избранное» — одна на продукты, блюда и упражнения */
export function StarButton({ kind, id }: { kind: FavoriteKind; id: string }) {
  const on = useLiveQuery(() => isFavorite(kind, id), [kind, id]) ?? false
  return (
    <button
      className={`${s.star} ${on ? s.on : ''} pressable`}
      aria-pressed={on}
      aria-label={on ? 'Убрать из избранного' : 'В избранное'}
      onClick={() => { tap(); void toggleFavorite(kind, id) }}
    >
      <Icon name="star" size={16} />
    </button>
  )
}
