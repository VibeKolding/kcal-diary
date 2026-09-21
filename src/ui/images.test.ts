import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MUSCLE_GROUPS, groupArt, groupPhoto, pickExercises } from '@/domain/gym'
import { EXERCISES } from '@/features/gym/exercises'
import { SHOTS } from '@/features/gym/shots'
import type { Sex } from '@/domain/types'

const ROOT = 'public/images'
const SHOT_DIR = 'public/images/gym/ex'
const SEXES: Sex[] = ['female', 'male']

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.(webp|png|jpe?g|svg)$/i.test(name) ? [full] : []
  })
}

describe('картинки приложения', () => {
  const files = walk(ROOT)

  /*
   * Два одинаковых файла под разными именами — это всегда ошибка раскладки:
   * кто-то скопировал обложку вместо того, чтобы сгенерировать вторую, и на
   * двух экранах оказался один и тот же кадр. Глазами это ловится, только
   * если открыть оба экрана подряд.
   *
   * Иконки приложения намеренно похожи между собой — это один знак в разных
   * размерах, — но байт в байт они не совпадают, поэтому исключений нет.
   */
  it('среди файлов нет одинаковых', () => {
    const byHash = new Map<string, string[]>()
    for (const f of files) {
      const h = createHash('sha256').update(readFileSync(f)).digest('hex')
      byHash.set(h, [...(byHash.get(h) ?? []), f])
    }
    const dupes = [...byHash.values()].filter((v) => v.length > 1)
    expect(dupes, dupes.map((v) => v.join(' = ')).join('; ')).toEqual([])
  })

  /*
   * Промах по имени файла не роняет экран: карточка молча показывает
   * силуэт. Поэтому опечатку видно, только если открыть все двенадцать
   * карточек подряд и заметить, что одна отличается от остальных.
   */
  it('у каждой группы мышц есть обе обложки и карта', () => {
    for (const g of MUSCLE_GROUPS) {
      expect(existsSync(join('public', groupArt(g.id))), `карта ${g.id}`).toBe(true)
      for (const sex of SEXES) {
        expect(existsSync(join('public', groupPhoto(g.id, sex))), `обложка ${g.id}/${sex}`).toBe(true)
      }
    }
  })
})

/**
 * Ширина и высота из заголовка webp: после «RIFF….VP8 » размеры лежат на
 * фиксированных местах, по четырнадцать бит каждый. Библиотеку ради двух
 * чисел в проект тащить незачем.
 */
function webpSize(file: string): [number, number] {
  const b = readFileSync(file)
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]
}

describe('снимки упражнений', () => {
  const laid = readdirSync(SHOT_DIR).filter((f) => /\.(webp|png|jpe?g)$/i.test(f))

  /*
   * Имя файла — единственная связь снимка с упражнением, и промах в нём
   * ничего не ломает: карточка молча остаётся без картинки, а папка при
   * этом выглядит заполненной. Поэтому каждое положенное сюда имя
   * сверяется со справочником: и сам идентификатор, и пол, которому это
   * упражнение вообще показывают.
   */
  it('каждый файл отвечает упражнению из справочника', () => {
    const known = new Set(MUSCLE_GROUPS.flatMap((g) => SEXES.flatMap(
      (sex) => pickExercises(EXERCISES, g.id, sex).map((e) => `${e.id}-${sex}.webp`),
    )))
    for (const f of laid) expect(known.has(f), f).toBe(true)
  })

  /*
   * Рамка снимка в приложении — 3:2. Кадр другой пропорции object-fit
   * обрежет по краям, и крайняя поза одной из половин уйдёт за рамку.
   */
  it('кадр везде 1200 × 800', () => {
    for (const f of laid) {
      expect(webpSize(join(SHOT_DIR, f)), f).toEqual([1200, 800])
    }
  })

  /*
   * Приложение показывает только упражнения из списка SHOTS, а список
   * пишет скрипт раскладки. Файл, положенный в папку руками, без списка
   * не появился бы нигде; строка списка без файла дала бы упражнение с
   * пустой рамкой. Лечится одной командой: python3 scripts/add-shots.py --sync
   */
  it('список снимков в приложении совпадает с папкой', () => {
    const inFolder = laid.filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)).sort()
    expect([...SHOTS].sort()).toEqual(inFolder)
  })
})
