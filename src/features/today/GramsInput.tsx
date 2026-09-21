import { useId } from 'react'
import { cleanGrams, gramsError, parseGrams } from './grams'
import s from './EntrySheet.module.css'

interface Props {
  /** Черновик поля — строка, а не число (см. grams.ts) */
  value: string
  onChange: (draft: string) => void
}

/**
 * Граммы порции: крупное поле и ползунок под ним. Одно на панели порции
 * и правки записи — раньше это были две копии с одной и той же ошибкой.
 *
 * type="text" вместо type="number", как у NumberField: числовое поле
 * съедает запятую и крутит значение колесом мыши.
 */
export function GramsInput({ value, onChange }: Props) {
  const id = useId()
  const grams = parseGrams(value)
  const error = gramsError(value)

  return (
    <div>
      <div className={s.gramsRow}>
        <input
          className={s.gramsInput}
          type="text" inputMode="decimal" enterKeyHint="done" autoComplete="off"
          value={value}
          onChange={(e) => onChange(cleanGrams(e.target.value))}
          // «Готово» на клавиатуре только прячет её: записывает кнопка панели,
          // иначе запись уходила бы раньше, чем человек взглянул на калории
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          aria-label="Граммов в порции"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <span className={s.unit}>граммов</span>
      </div>
      {error && <p id={`${id}-error`} className={s.gramsError}>{error}</p>}
      <input
        className={s.slider}
        type="range" min={5} max={600} step={5}
        value={Math.min(grams ?? 0, 600)}
        onChange={(e) => onChange(e.target.value)}
        // Ползунок выше своей полосы на 22 px — отступ сверху меньше на их
        // половину, и полоса стоит там же, где стояла
        style={{ marginTop: 'var(--s1)' }}
        aria-label="Вес порции"
      />
    </div>
  )
}
