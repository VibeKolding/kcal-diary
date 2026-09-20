import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MUSCLE_GROUPS, groupArt, groupPhoto } from '@/domain/gym'
import type { Sex } from '@/domain/types'

const ROOT = 'public/images'
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
