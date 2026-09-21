import { useCallback, useRef, useState } from 'react'
import { useToast } from '@/ui/Toast'
import { saveErrorText } from './saveError'

/**
 * Запись по нажатию: один раз, даже если нажали дважды, и с тостом при сбое.
 *
 * Двойное касание «Добавить в дневник» записывало еду дважды: пока шла
 * запись, кнопка оставалась живой, а уезжающая панель ещё 220 мс ловила
 * касания. Флаг в ref отсекает второй вызов сразу, в том же кадре, а
 * pending гасит кнопку — и уезжающая панель уносит её уже погашенной.
 *
 * Флаг снимается и после сбоя: панель остаётся открытой, и повторить
 * можно тут же.
 */
export function useSave() {
  const toast = useToast()
  const busy = useRef(false)
  const [pending, setPending] = useState(false)

  const run = useCallback(async (write: () => Promise<unknown>) => {
    if (busy.current) return
    busy.current = true
    setPending(true)
    try {
      await write()
    } catch (e) {
      toast({ text: saveErrorText(e) })
    } finally {
      busy.current = false
      setPending(false)
    }
  }, [toast])

  return { pending, run }
}
