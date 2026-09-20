import { useId, type ReactNode } from 'react'
import s from './TextField.module.css'

export interface TextFieldProps {
  /** Подпись капителью над полем. Без неё поле подписывается placeholder'ом */
  label?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  unit?: string
  inputMode?: 'text' | 'numeric' | 'decimal' | 'search'
  error?: string | null
  /** lg — крупные цифры анкеты, md — обычный текст */
  size?: 'md' | 'lg'
  autoComplete?: string
  /** Пришедший снаружи узел справа от текста, например кнопка очистки */
  trailing?: ReactNode
  type?: 'text' | 'time'
  /** Узкое поле в строке настроек, а не на всю ширину */
  compact?: boolean
}

/**
 * Текстовое поле. Одно на всё приложение: раньше его копии жили в четырёх
 * модулях с чуть разными высотами и размерами шрифта.
 */
export function TextField({
  label, value, onChange, placeholder, unit, inputMode, error, size = 'md',
  autoComplete = 'off', trailing, type = 'text', compact,
}: TextFieldProps) {
  const id = useId()

  return (
    <div className={`${s.field} ${compact ? s.compact : ''}`}>
      {label && <label className={s.label} htmlFor={id}>{label}</label>}
      <div className={`${s.box} ${error ? s.invalid : ''}`}>
        <input
          id={id}
          className={`${s.input} ${size === 'lg' ? s.lg : ''}`}
          type={type}
          inputMode={inputMode}
          autoComplete={autoComplete}
          enterKeyHint="next"
          placeholder={placeholder}
          aria-label={label ? undefined : placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {unit && <span className={s.unit}>{unit}</span>}
        {trailing}
      </div>
      {error && <span id={`${id}-error`} className={s.error}>{error}</span>}
    </div>
  )
}
