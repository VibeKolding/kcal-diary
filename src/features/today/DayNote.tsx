import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getNote, putNote } from '@/db/tracking'
import { TextField } from '@/ui/TextField'
import { Icon } from '@/ui/Icon'
import { tap } from '@/ui/haptic'
import { useToast } from '@/ui/Toast'
import { saveErrorText } from './saveError'
import s from './Today.module.css'

/** Пауза в наборе, после которой заметка пишется сама */
const AUTOSAVE_MS = 800

/**
 * Заметка к дню: хранится отдельно от записей и пишется сама.
 *
 * Раньше её сохраняла только маленькая галочка, и текст, набранный без
 * неё, молча пропадал при смене дня или вкладки. Теперь заметка пишется
 * при потере фокуса, после короткой паузы в наборе, при сворачивании
 * приложения и при уходе с дня; галочка осталась для тех, кто привык
 * подтверждать. Экран монтирует заметку с key по дате, поэтому уход с
 * дня — это размонтирование, и черновик пишется в тот день, где набран.
 */
export function DayNote({ date }: { date: string }) {
  const saved = useLiveQuery(() => getNote(date), [date])
  // null — поле не трогали, показывается то, что в базе. После правки
  // черновик остаётся на экране: иначе запись в базу обрезала бы пробел,
  // который человек только что набрал между словами
  const [draft, setDraft] = useState<string | null>(null)
  const [opened, setOpened] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const focusOnOpen = useRef(false)
  const toast = useToast()

  const text = draft ?? saved ?? ''
  // putNote пишет обрезанный текст — с ним и сравниваем
  const dirty = draft !== null && draft.trim() !== (saved ?? '')

  // Запись всегда видит свежий черновик: её зовут и таймер, и уход со
  // страницы, и размонтирование, заведённые на прошлых отрисовках
  const flush = useRef(() => {})
  flush.current = () => {
    if (!dirty || draft === null) return
    putNote(date, draft).catch((e: unknown) => toast({ text: saveErrorText(e) }))
  }

  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(() => flush.current(), AUTOSAVE_MS)
    return () => clearTimeout(t)
  }, [draft, dirty])

  // Свернули приложение или ушли с дня — пишем, не дожидаясь паузы
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flush.current() }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      flush.current()
    }
  }, [])

  // Раскрыли поле касанием — курсор сразу в нём. Синхронно, в том же
  // жесте: iPhone открывает клавиатуру только на фокус из касания
  useLayoutEffect(() => {
    if (!opened || !focusOnOpen.current) return
    focusOnOpen.current = false
    wrap.current?.querySelector('input')?.focus()
  }, [opened])

  const show = opened || text.length > 0

  return (
    <div
      ref={wrap}
      className={s.noteBlock}
      // onBlur в React всплывает: уход фокуса из поля ловится здесь,
      // без отдельного пропа у TextField
      onBlur={() => flush.current()}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || !(e.target instanceof HTMLInputElement)) return
        flush.current()
        e.target.blur()
      }}
    >
      {show ? (
        <TextField
          label="Заметка к дню" value={text}
          onChange={(v) => { setDraft(v); setOpened(true) }}
          placeholder="День рождения, болел, застолье…"
          trailing={dirty ? (
            <button
              type="button"
              className={`${s.noteSave} pressable`}
              aria-label="Сохранить заметку"
              onClick={() => { flush.current(); tap() }}
            >
              <Icon name="check" size={16} strokeWidth={2.2} />
            </button>
          ) : undefined}
        />
      ) : (
        <button
          type="button"
          className={`${s.addLine} pressable`}
          onClick={() => { focusOnOpen.current = true; setOpened(true) }}
        >
          <Icon name="plus" size={14} strokeWidth={2.2} /> Заметка к дню
        </button>
      )}
    </div>
  )
}
