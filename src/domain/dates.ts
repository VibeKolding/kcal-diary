/** Ключ дня в формате YYYY-MM-DD по локальному времени, без сдвига в UTC */
export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
}

export function shiftDay(key: string, days: number): string {
  const d = parseDay(key)
  d.setDate(d.getDate() + days)
  return dayKey(d)
}

/** Последние n дней, включая текущий, по возрастанию */
export function lastDays(n: number, from: string = dayKey()): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) out.push(shiftDay(from, -i))
  return out
}

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

export function weekdayShort(key: string): string {
  return WEEKDAYS[parseDay(key).getDay()]!
}

/** «Сегодня», «Вчера» или «7 сентября» */
export function humanDay(key: string, today: string = dayKey()): string {
  if (key === today) return 'Сегодня'
  if (key === shiftDay(today, -1)) return 'Вчера'
  if (key === shiftDay(today, 1)) return 'Завтра'
  const d = parseDay(key)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** Понедельник — первый день недели */
export function weekdayIndex(key: string): number {
  return (parseDay(key).getDay() + 6) % 7
}

/**
 * Русское склонение после числа: 1 день, 2 дня, 5 дней.
 * Отдельная функция, потому что «дней» в интерфейсе встречается в трёх
 * падежах, и каждый раз писать тернарник — верный способ ошибиться.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(n) % 100
  if (mod100 >= 11 && mod100 <= 14) return many
  const mod10 = mod100 % 10
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}
