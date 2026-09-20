import { describe, expect, it } from 'vitest'
import {
  MUSCLE_GROUPS, arrowPath, exercisePhoto, exerciseSex, groupPhoto, pickExercises,
  type Motion, type MuscleGroup,
} from '@/domain/gym'
import type { Sex } from '@/domain/types'
import { EXERCISES } from './exercises'

const SEXES: Sex[] = ['female', 'male']
const GROUPS = MUSCLE_GROUPS.map((g) => g.id)

describe('справочник упражнений', () => {
  it('идентификаторы не повторяются', () => {
    const ids = EXERCISES.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('все упражнения лежат в известных группах', () => {
    const known = new Set<string>(GROUPS)
    for (const e of EXERCISES) expect(known.has(e.group)).toBe(true)
  })

  it('в каждой группе у каждого пола есть что показать', () => {
    for (const group of GROUPS) {
      for (const sex of SEXES) {
        const list = pickExercises(EXERCISES, group, sex)
        expect(list.length, `${group}/${sex}`).toBeGreaterThanOrEqual(4)
      }
    }
  })

  /*
   * Главная проверка раздела. Прочерк в подходах ставится у упражнения,
   * адресованного одному полу, и если при этом забыть сузить audience,
   * второй пол увидит карточку с «—» вместо подходов. Глазами это ловится
   * только если открыть все двенадцать списков подряд.
   */
  it('в показанном списке нет прочерков вместо подходов', () => {
    for (const group of GROUPS) {
      for (const sex of SEXES) {
        for (const e of pickExercises(EXERCISES, group, sex)) {
          expect(e.sets[sex], `${e.id} / ${sex}`).not.toBe('—')
          expect(e.sets[sex].length, `${e.id} / ${sex}`).toBeGreaterThan(3)
        }
      }
    }
  })

  it('адресное упражнение не попадает к другому полу', () => {
    for (const e of EXERCISES) {
      if (e.audience === 'both') continue
      const other: Sex = e.audience === 'female' ? 'male' : 'female'
      const list = pickExercises(EXERCISES, e.group, other)
      expect(list.map((x) => x.id)).not.toContain(e.id)
    }
  })

  it('у каждого упражнения есть техника и ошибки', () => {
    for (const e of EXERCISES) {
      expect(e.steps.length, e.id).toBeGreaterThanOrEqual(3)
      expect(e.mistakes.length, e.id).toBeGreaterThanOrEqual(2)
      expect(e.title.trim().length, e.id).toBeGreaterThan(2)
      expect(e.equipment.trim().length, e.id).toBeGreaterThan(2)
      expect(e.focus.trim().length, e.id).toBeGreaterThan(4)
      expect(e.rest.trim().length, e.id).toBeGreaterThan(2)
    }
  })

  it('путь к фотографии совпадает с именем файла в папке', () => {
    expect(groupPhoto('chest', 'female')).toBe('/images/gym/chest-female.webp')
    expect(groupPhoto('legs', 'male')).toBe('/images/gym/legs-male.webp')
  })

  it('каждой группе нужна пара снимков, и все пути различны', () => {
    const paths = GROUPS.flatMap((g: MuscleGroup) => SEXES.map((s) => groupPhoto(g, s)))
    expect(paths).toHaveLength(12)
    expect(new Set(paths).size).toBe(12)
  })

  /*
   * «Избранное» на главной раздела показывает упражнения обоих полов, а
   * открывает их переходом в список. Пока пол брался из профиля, мужчина мог
   * отметить женское упражнение и нажать на него — попадал в мужской список,
   * где искомого нет, и карточка молча не раскрывалась. Проверяется прямое
   * обещание перехода: в списке, куда он ведёт, упражнение обязано быть.
   */
  it('переход из «Избранного» ведёт в список, где упражнение есть', () => {
    for (const e of EXERCISES) {
      for (const preferred of SEXES) {
        const list = pickExercises(EXERCISES, e.group, exerciseSex(e, preferred))
        expect(list.map((x) => x.id), `${e.id} / профиль ${preferred}`).toContain(e.id)
      }
    }
  })

  it('пол берётся из профиля только там, где упражнение подходит обоим', () => {
    for (const e of EXERCISES) {
      for (const preferred of SEXES) {
        const got = exerciseSex(e, preferred)
        expect(got, e.id).toBe(e.audience === 'both' ? preferred : e.audience)
      }
    }
  })

  it('путь к снимку упражнения собирается из идентификатора и пола', () => {
    expect(exercisePhoto('chest-pushup', 'male'))
      .toBe('/images/gym/ex/chest-pushup-male.webp')
    expect(exercisePhoto('legs-hip-thrust', 'female'))
      .toBe('/images/gym/ex/legs-hip-thrust-female.webp')
  })

  /*
   * Сколько снимков нужно на самом деле. Упражнений 41, но общие показаны
   * обоим полам и требуют двух файлов, а адресные — одного: выходит 69.
   * Число записано явно, потому что от него зависит предел кэша снимков в
   * vite.config.ts. Упал этот тест — загляните и туда.
   */
  it('снимков нужно 69, и все пути различны', () => {
    const paths = GROUPS.flatMap((g: MuscleGroup) => SEXES.flatMap(
      (sex) => pickExercises(EXERCISES, g, sex).map((e) => exercisePhoto(e.id, sex)),
    ))
    expect(paths).toHaveLength(69)
    expect(new Set(paths).size).toBe(69)
  })
})

/*
 * Стрелка направления рисуется приложением поверх снимка, а не входит в
 * картинку. Значит её обещания — направление и привязка к шву диптиха —
 * проверяются здесь, а не глазами: компонент протестировать нечем, тесты
 * идут в окружении node.
 */
describe('стрелка направления движения', () => {
  const ALL: Motion[] = ['up', 'down', 'left', 'right']

  /** Все координаты пути: из «M x y», «L x y», «H x», «V y» */
  function coords(d: string): { xs: number[]; ys: number[] } {
    const xs: number[] = []
    const ys: number[] = []
    for (const m of d.matchAll(/([MLHV]) (\d+)(?: (\d+))?/g)) {
      if (m[1] === 'H') xs.push(Number(m[2]))
      else if (m[1] === 'V') ys.push(Number(m[2]))
      else { xs.push(Number(m[2])); ys.push(Number(m[3])) }
    }
    return { xs, ys }
  }

  it('у каждого упражнения указано направление движения', () => {
    const known = new Set<string>(ALL)
    for (const e of EXERCISES) expect(known.has(e.motion), e.id).toBe(true)
  })

  /*
   * Списать направление у соседа при заполнении сорока одного объекта —
   * самая лёгкая из возможных ошибок, а одинаковая стрелка на всём разделе
   * выглядит как работающая функция.
   */
  it('направления не выродились в одно', () => {
    expect(new Set(EXERCISES.map((e) => e.motion)).size).toBeGreaterThanOrEqual(3)
  })

  it('вертикальная стрелка стоит на шве диптиха', () => {
    for (const m of ['up', 'down'] as Motion[]) {
      const { xs } = coords(arrowPath(m))
      expect(Math.min(...xs), m).toBeLessThan(150)
      expect(Math.max(...xs), m).toBeGreaterThan(150)
      expect((Math.min(...xs) + Math.max(...xs)) / 2, m).toBe(150)
    }
  })

  it('горизонтальная стрелка пересекает шов', () => {
    for (const m of ['left', 'right'] as Motion[]) {
      const { xs } = coords(arrowPath(m))
      expect(Math.min(...xs), m).toBeLessThan(150)
      expect(Math.max(...xs), m).toBeGreaterThan(150)
    }
  })

  it('стрелки разных направлений действительно разные', () => {
    expect(new Set(ALL.map(arrowPath)).size).toBe(4)
  })

  it('стрелка не вылезает за кадр', () => {
    for (const m of ALL) {
      const { xs, ys } = coords(arrowPath(m))
      expect(Math.min(...xs, ...ys), m).toBeGreaterThanOrEqual(0)
      expect(Math.max(...xs), m).toBeLessThanOrEqual(300)
      expect(Math.max(...ys), m).toBeLessThanOrEqual(200)
    }
  })
})
