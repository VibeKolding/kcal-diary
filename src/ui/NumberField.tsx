import { TextField, type TextFieldProps } from './TextField'

interface Props extends Omit<TextFieldProps, 'inputMode' | 'onChange' | 'size'> {
  onChange: (value: string) => void
  decimal?: boolean
  size?: 'md' | 'lg'
}

/**
 * Числовое поле.
 *
 * Хранит строку, а не число. Привязка прямо к числу ломает ввод: стоит стереть
 * значение, как Number('') превращает его в 0, поле показывает «0», и дальше
 * набрать своё значение уже нельзя. Поэтому здесь состояние строковое,
 * а разбор в число происходит отдельно.
 *
 * type="text" вместо type="number" осознанно: числовое поле молча съедает
 * запятую, крутит значение колесом мыши и по-разному ведёт себя в браузерах.
 */
export function NumberField({ onChange, decimal, size = 'lg', ...rest }: Props) {
  return (
    <TextField
      {...rest}
      size={size}
      inputMode={decimal ? 'decimal' : 'numeric'}
      onChange={(v) => onChange(cleanNumberInput(v, decimal))}
    />
  )
}

/**
 * Очистка ввода: остаются цифры и один разделитель дробной части.
 * Запятая приводится к точке — на русской раскладке её набирают чаще.
 */
export function cleanNumberInput(raw: string, decimal = false): string {
  return raw
    .replace(',', '.')
    .replace(decimal ? /[^\d.]/g : /[^\d]/g, '')
    .replace(/(\..*)\./g, '$1')
}

/** Разбор поля в число: пустая строка и мусор дают null, а не 0 */
export function parseNumber(value: string): number | null {
  if (value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
