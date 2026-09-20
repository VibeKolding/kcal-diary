import { useRef } from 'react'

/**
 * Последнее непустое значение. Нужно панелям: родитель обнуляет данные
 * в момент закрытия, а панель ещё 220 мс уезжает вниз и должна показывать
 * то же содержимое, что и секунду назад.
 */
export function useLast<T>(value: T | null | undefined): T | null {
  const ref = useRef<T | null>(null)
  if (value !== null && value !== undefined) ref.current = value
  return ref.current
}
