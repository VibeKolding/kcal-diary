import { useOnline } from './useOnline'
import s from './OfflineBar.module.css'

/**
 * Тихая полоска под верхним краем, пока нет сети. Дневник работает
 * целиком офлайн, так что это не ошибка — просто штрихкоды подождут.
 */
export function OfflineBar() {
  const online = useOnline()
  if (online) return null
  return (
    <div className={s.bar} role="status" aria-live="polite">
      Нет сети · дневник работает, штрихкоды подождут
    </div>
  )
}
