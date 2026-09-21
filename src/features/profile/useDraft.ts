import { useCallback, useEffect, useRef, useState } from 'react'

type Values = Record<string, string | number | boolean>

export function sameValues<T extends Values>(a: T, b: T): boolean {
  return (Object.keys(a) as (keyof T)[]).every((k) => a[k] === b[k])
}

/**
 * Что станет с черновиком, когда сохранённые значения поменялись.
 *
 * Нетронутая форма идёт за сохранённым: пересчитали норму от нового веса —
 * поля показывают новую норму. Тронутая остаётся как есть: человек что-то
 * набирает, и чужое обновление профиля не должно стирать набранное.
 */
export function followSaved<T extends Values>(draft: T, prevSaved: T, nextSaved: T): T {
  return sameValues(draft, prevSaved) ? nextSaved : draft
}

/**
 * Черновик формы поверх сохранённых значений.
 *
 * Раньше поля перезаписывались при любом новом объекте профиля, а профиль
 * меняют и соседние действия: смена темы, запись веса, цель. Набрал
 * калории, переключил тему — и набранное молча откатилось.
 */
export function useDraft<T extends Values>(saved: T) {
  const [draft, setDraft] = useState(saved)
  const base = useRef(saved)

  // Сравниваем по содержимому: объект профиля из базы каждый раз новый
  const key = JSON.stringify(saved)
  useEffect(() => {
    const prev = base.current
    if (sameValues(prev, saved)) return
    base.current = saved
    setDraft((d) => followSaved(d, prev, saved))
    // saved в зависимостях не нужен: он полностью описан ключом
  }, [key])

  const set = useCallback(<K extends keyof T>(k: K, v: T[K]) => {
    setDraft((d) => ({ ...d, [k]: v }))
  }, [])

  /** Вернуть поля к сохранённому — открыть форму заново или отменить правку */
  const reset = useCallback(() => setDraft(base.current), [])

  return { draft, set, reset, replace: setDraft, dirty: !sameValues(draft, saved) }
}
