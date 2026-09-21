import { describe, expect, it } from 'vitest'
import {
  MUSCLE_GROUPS, exercisePhoto, exerciseSex, groupPhoto, pickExercises, withShots,
  type Exercise, type MuscleGroup,
} from '@/domain/gym'
import type { Sex } from '@/domain/types'
import { EXERCISES } from './exercises'
import { SHOTS } from './shots'

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
 * Раздел показывает не весь справочник, а только то, для чего есть снимок.
 * Компонент протестировать нечем — тесты идут в окружении node, — поэтому
 * всё, что обещает фильтр, проверяется на нём самом.
 */
describe('упражнения без снимка не показываются', () => {
  const SHOWN = withShots(EXERCISES, SHOTS)
  const ex = (audience: Exercise['audience']): Exercise => ({
    ...EXERCISES[0]!, id: 'probe', audience,
  })

  it('общее упражнение со снимком для одного пола остаётся только у него', () => {
    expect(withShots([ex('both')], new Set(['probe-male']))[0]?.audience).toBe('male')
    expect(withShots([ex('both')], new Set(['probe-female']))[0]?.audience).toBe('female')
    expect(withShots([ex('both')], new Set(['probe-male', 'probe-female']))[0]?.audience).toBe('both')
  })

  it('упражнение без единого снимка пропадает целиком', () => {
    expect(withShots([ex('both')], new Set())).toEqual([])
    expect(withShots([ex('female')], new Set(['probe-male']))).toEqual([])
  })

  it('в показанном списке у каждого упражнения есть свой файл', () => {
    for (const group of GROUPS) {
      for (const sex of SEXES) {
        for (const e of pickExercises(SHOWN, group, sex)) {
          expect(SHOTS.has(`${e.id}-${sex}`), `${e.id} / ${sex}`).toBe(true)
        }
      }
    }
  })

  /*
   * Прячется только то, что без снимка: всё, что снято, обязано дойти до
   * экрана. Иначе фильтр мог бы молча выбросить готовую фотографию.
   */
  it('каждый снимок из папки виден в своём списке', () => {
    for (const shot of SHOTS) {
      const sex: Sex = shot.endsWith('-female') ? 'female' : 'male'
      const id = shot.slice(0, -(sex.length + 1))
      const e = EXERCISES.find((x) => x.id === id)
      expect(e, shot).toBeDefined()
      expect(pickExercises(SHOWN, e!.group, sex).map((x) => x.id), shot).toContain(id)
    }
  })

  /* Пустой список — это экран «0 упражнений» за выбором пола */
  it('в каждой группе у каждого пола есть хотя бы одно упражнение', () => {
    for (const group of GROUPS) {
      for (const sex of SEXES) {
        expect(pickExercises(SHOWN, group, sex).length, `${group}/${sex}`).toBeGreaterThan(0)
      }
    }
  })

  /*
   * Та же ловушка, что с «Избранным» раньше: звезда могла остаться на
   * упражнении, которое после фильтра живёт только в списке одного пола.
   */
  it('переход из «Избранного» ведёт в список, где упражнение показано', () => {
    for (const e of SHOWN) {
      for (const preferred of SEXES) {
        const list = pickExercises(SHOWN, e.group, exerciseSex(e, preferred))
        expect(list.map((x) => x.id), `${e.id} / профиль ${preferred}`).toContain(e.id)
      }
    }
  })
})
