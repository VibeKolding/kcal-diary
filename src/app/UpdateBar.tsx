import { Icon } from '@/ui/Icon'
import type { AppUpdate } from './useAppUpdate'
import s from './UpdateBar.module.css'

/**
 * Предложение обновиться. Висит, пока его не примут или не скроют:
 * в отличие от тоста, его не вытеснит следующее сообщение.
 */
export function UpdateBar({ update }: { update: AppUpdate }) {
  if (update.state === 'none') return null
  const elsewhere = update.state === 'elsewhere'
  return (
    <div className={s.bar} role="status" aria-live="polite">
      <span className={s.text}>
        {elsewhere ? 'Обновилось в другом окне' : 'Доступна новая версия'}
      </span>
      <button type="button" className={`${s.action} pressable`} onClick={update.apply}>
        {elsewhere ? 'Перезагрузить' : 'Обновить'}
      </button>
      <button type="button" className={`${s.close} pressable`} onClick={update.dismiss} aria-label="Скрыть">
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}
