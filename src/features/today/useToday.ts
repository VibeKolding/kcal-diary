import { useEffect, useState } from 'react'
import { dayKey } from '@/domain/dates'

/**
 * Сегодняшний день, который сам меняется в полночь.
 *
 * Приложение с домашнего экрана не перезагружается неделями: вечером его
 * свернули, утром развернули — и тот же экран. Пока день вычислялся один
 * раз при показе, утром «Сегодня» оставалось вчерашним, и завтрак с водой
 * уходили во вчера. Поэтому день пересчитывается дважды: таймером к
 * ближайшей полуночи и при каждом возвращении приложения на экран — в фоне
 * браузер таймеры усыпляет, и одному таймеру верить нельзя.
 */
export function useToday(): string {
  const [today, setToday] = useState(dayKey)

  useEffect(() => {
    let timer = 0
    const check = () => {
      // Одинаковую строку React сравнит и лишний раз не перерисует
      setToday(dayKey())
      clearTimeout(timer)
      timer = window.setTimeout(check, msToNextDay(new Date()))
    }
    const onVisible = () => { if (document.visibilityState === 'visible') check() }

    timer = window.setTimeout(check, msToNextDay(new Date()))
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', check)
    // Возврат из кэша страниц (bfcache) не присылает ни visibilitychange, ни focus
    window.addEventListener('pageshow', check)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
      window.removeEventListener('pageshow', check)
    }
  }, [])

  return today
}

/**
 * Сколько ждать до следующих суток по местному времени. С запасом в
 * полсекунды: таймер, сработавший ровно в 23:59:59.999, увидел бы старый
 * день и завёл себя ещё на миллисекунду.
 */
export function msToNextDay(now: Date): number {
  // new Date(г, м, д + 1) — полночь по местному времени, переход на летнее
  // время и конец месяца конструктор учитывает сам
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return next.getTime() - now.getTime() + 500
}

/*
 * День, открытый на экране «Сегодня».
 *
 * «+» в таб-баре живёт вне экрана и раньше всегда писал в сегодня, даже
 * когда человек листал вчерашний день и добавлял забытый ужин. Экран
 * сообщает сюда свой день, а таб-бар читает его в момент нажатия. Хранится
 * в модуле, а не в состоянии приложения: перерисовывать всё приложение на
 * каждое перелистывание дня незачем, значение нужно только по нажатию.
 */
let viewed: string | null = null

/** День для новой записи: открытый на «Сегодня» или сегодняшний, если экран закрыт */
export function viewedDay(): string {
  return viewed ?? dayKey()
}

/** Экран «Сегодня» сообщает свой день; null — экран закрыт */
export function setViewedDay(day: string | null): void {
  viewed = day
}
