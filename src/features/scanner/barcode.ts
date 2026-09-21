/**
 * Какие коды можно отправлять в базу продуктов.
 *
 * Камера видит не только штрихкод товара: рядом на упаковке и на столе
 * бывают QR с паролем от Wi-Fi, ссылкой с токеном или платёжными
 * реквизитами. Наружу уходит только номер товара — EAN-13, EAN-8, UPC-A
 * или UPC-E, и только с верной контрольной цифрой. Она же отсекает неточно
 * прочитанный код: лучше дождаться следующего кадра, чем искать в базе
 * чужой товар.
 */

/** Форматы товарных штрихкодов — названия как у BarcodeDetector */
export type ProductFormat = 'ean_13' | 'ean_8' | 'upc_a' | 'upc_e'

export const PRODUCT_FORMATS: readonly ProductFormat[] = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

/**
 * Годится ли код для запроса в базу.
 *
 * Формат необязателен: без него код проверяется по длине. Восемь цифр —
 * это и EAN-8, и UPC-E, а контрольная цифра у них считается по-разному,
 * поэтому без формата подходит любая из двух.
 */
export function isProductBarcode(code: string, format?: string): boolean {
  if (format !== undefined && !(PRODUCT_FORMATS as readonly string[]).includes(format)) return false
  if (!/^\d+$/.test(code)) return false
  if (code.length === 13 || code.length === 12) return gtinCheckOk(code)
  if (code.length !== 8) return false
  if (format === 'ean_8') return gtinCheckOk(code)
  if (format === 'upc_e') return upcECheckOk(code)
  return gtinCheckOk(code) || upcECheckOk(code)
}

/**
 * Контрольная цифра EAN-13, EAN-8 и UPC-A: веса 3 и 1 чередуются справа
 * налево, начиная с цифры перед контрольной.
 */
export function gtinCheckOk(code: string): boolean {
  const digits = [...code].map(Number)
  const check = digits.pop()
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

/**
 * UPC-E — это сжатый UPC-A: нули из середины убраны по правилу, которое
 * задаёт шестая цифра. Контрольная цифра у него от полного UPC-A, поэтому
 * проверить её можно только после разворачивания.
 */
export function upcEToUpcA(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null
  const mid = code.slice(1, 7)
  const last = mid.charAt(5)
  const body = last <= '2' ? mid.slice(0, 2) + last + '0000' + mid.slice(2, 5)
    : last === '3' ? mid.slice(0, 3) + '00000' + mid.slice(3, 5)
    : last === '4' ? mid.slice(0, 4) + '00000' + mid.charAt(4)
    : mid.slice(0, 5) + '0000' + last
  return code.charAt(0) + body + code.charAt(7)
}

function upcECheckOk(code: string): boolean {
  const full = upcEToUpcA(code)
  return full !== null && gtinCheckOk(full)
}
