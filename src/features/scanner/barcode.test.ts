import { describe, expect, it } from 'vitest'
import { gtinCheckOk, isProductBarcode, upcEToUpcA } from './barcode'

describe('товарный штрихкод', () => {
  it('принимает коды с верной контрольной цифрой', () => {
    expect(isProductBarcode('4006381333931')).toBe(true) // EAN-13
    expect(isProductBarcode('4607001771807', 'ean_13')).toBe(true)
    expect(isProductBarcode('96385074', 'ean_8')).toBe(true)
    expect(isProductBarcode('036000291452', 'upc_a')).toBe(true)
    expect(isProductBarcode('04252614', 'upc_e')).toBe(true)
  })

  it('отбрасывает неточно прочитанный код', () => {
    expect(isProductBarcode('4006381333932')).toBe(false)
    expect(isProductBarcode('96385075')).toBe(false)
    expect(gtinCheckOk('036000291453')).toBe(false)
  })

  it('не выпускает наружу содержимое QR и прочий текст', () => {
    // Всё это сканер способен прочитать рядом с упаковкой
    expect(isProductBarcode('WIFI:S:HomeNet;T:WPA;P:MySecretPass123;;')).toBe(false)
    expect(isProductBarcode('https://shop.example/loyalty?card=1234-5678&pin=0000')).toBe(false)
    expect(isProductBarcode('ST00012|Name=ООО Ромашка|PersonalAcc=40702810')).toBe(false)
    expect(isProductBarcode('')).toBe(false)
  })

  it('не принимает цифры неподходящей длины и чужие форматы', () => {
    expect(isProductBarcode('1234567')).toBe(false)
    expect(isProductBarcode('12345678901234')).toBe(false)
    // Номер карты или телефона в Code 128 — тоже цифры, но не товар
    expect(isProductBarcode('4006381333931', 'code_128')).toBe(false)
    expect(isProductBarcode('4006381333931', 'qr_code')).toBe(false)
    expect(isProductBarcode(' 4006381333931')).toBe(false)
  })

  it('восемь цифр без формата проверяет и как EAN-8, и как UPC-E', () => {
    expect(isProductBarcode('96385074')).toBe(true)
    expect(isProductBarcode('04252614')).toBe(true)
    // Со своим форматом — только своим правилом
    expect(isProductBarcode('04252614', 'ean_8')).toBe(false)
    expect(isProductBarcode('96385074', 'upc_e')).toBe(false)
  })
})

describe('разворачивание UPC-E', () => {
  it('восстанавливает полный UPC-A по шестой цифре', () => {
    expect(upcEToUpcA('04252614')).toBe('042100005264')
    expect(upcEToUpcA('01234505')).toBe('012000003455')
    expect(upcEToUpcA('01234531')).toBe('012300000451')
    expect(upcEToUpcA('01234543')).toBe('012340000053')
    expect(upcEToUpcA('01234558')).toBe('012345000058')
  })

  it('отказывает кодам, которые не бывают UPC-E', () => {
    expect(upcEToUpcA('24252614')).toBeNull()
    expect(upcEToUpcA('0425261')).toBeNull()
  })
})
