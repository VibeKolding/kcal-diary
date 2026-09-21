import type { Sex } from './types'

/** Шесть групп мышц — верхний уровень раздела «Зал» */
export type MuscleGroup =
  | 'chest' | 'biceps' | 'triceps' | 'back' | 'shoulders' | 'legs'

/**
 * Кому упражнение адресовано.
 *
 * Мышцы у мужчин и женщин одни и те же, и выдумывать «женский жим» было бы
 * враньём. Разделение честное и узкое: часть движений попадает только в один
 * список, потому что под типичные запросы они нужны разной группе, а
 * подходы с повторами у общих движений отличаются — это поле `sets`.
 */
export type Audience = 'both' | Sex

export interface Exercise {
  id: string
  group: MuscleGroup
  title: string
  audience: Audience
  /** Что нужно из инвентаря. «Своё тело» означает, что не нужно ничего. */
  equipment: string
  /** На какой участок группы приходится нагрузка */
  focus: string
  /**
   * Подходы и повторы отдельно для каждого пола.
   *
   * Разница не в физиологии мышцы, а в типичной цели: под набор объёма
   * работают в более низком диапазоне повторов и с большим отдыхом, под
   * тонус и выносливость — в более высоком.
   */
  sets: Record<Sex, string>
  rest: string
  steps: string[]
  mistakes: string[]
}

export interface GroupInfo {
  id: MuscleGroup
  title: string
  /** Что это за мышца простыми словами — видно на карточке группы */
  hint: string
}

export const MUSCLE_GROUPS: GroupInfo[] = [
  { id: 'chest', title: 'Грудь', hint: 'жимы и разведения' },
  { id: 'biceps', title: 'Бицепс', hint: 'сгибания рук' },
  { id: 'triceps', title: 'Трицепс', hint: 'разгибания рук' },
  { id: 'back', title: 'Спина', hint: 'тяги и подтягивания' },
  { id: 'shoulders', title: 'Плечи', hint: 'жимы и махи' },
  { id: 'legs', title: 'Ноги', hint: 'приседания и выпады' },
]

export const GROUP_TITLE: Record<MuscleGroup, string> =
  Object.fromEntries(MUSCLE_GROUPS.map((g) => [g.id, g.title])) as Record<MuscleGroup, string>

export const SEX_TITLE: Record<Sex, string> = {
  female: 'Для женщин',
  male: 'Для мужчин',
}

/** Путь к фотографии карточки выбора пола. Файла может не быть — тогда рисунок. */
export function groupPhoto(group: MuscleGroup, sex: Sex): string {
  return `/images/gym/${group}-${sex}.webp`
}

/**
 * Анатомическая карта группы на экране выбора. Одна на группу, без деления
 * по полу: карта говорит, какая мышца, а не кто её тренирует.
 */
export function groupArt(group: MuscleGroup): string {
  return `/images/gym/art/${group}.webp`
}

/**
 * Снимок упражнения: диптих 1200×800, две фазы движения в одном кадре.
 *
 * Отдельный файл на каждый пол, потому что на предыдущем экране пол уже
 * выбран: показать там человека другого пола значило бы отменить выбор,
 * который только что сделали. У адресного упражнения существует один файл
 * из двух, и второй никогда не запрашивается — `pickExercises` не покажет
 * это упражнение чужому полу.
 *
 * Какие файлы есть на самом деле, знает `SHOTS` в разделе «Зал»: без
 * снимка упражнение в списке не показывается вовсе (см. `withShots`).
 */
export function exercisePhoto(id: string, sex: Sex): string {
  return `/images/gym/ex/${id}-${sex}.webp`
}

/** Упражнения группы для выбранного пола: общие плюс адресные */
export function pickExercises(all: Exercise[], group: MuscleGroup, sex: Sex): Exercise[] {
  return all.filter((e) => e.group === group && (e.audience === 'both' || e.audience === sex))
}

/**
 * В чьём списке лежит упражнение.
 *
 * «Избранное» показывает движения обоих полов: звезда стоит на упражнении, а
 * не на разделе, и запретить мужчине отметить подъём таза было бы странно.
 * Но само упражнение живёт только в том списке, который оставил
 * `pickExercises`, и у адресного движения этот список ровно один. Поэтому
 * пол считается по упражнению, а профиль спрашивают лишь тогда, когда
 * движение подходит обоим. Иначе переход приводит в список, где упражнения
 * нет, и карточка не раскрывается — без ошибки, просто ничего не происходит.
 */
export function exerciseSex(exercise: Pick<Exercise, 'audience'>, preferred: Sex): Sex {
  return exercise.audience === 'both' ? preferred : exercise.audience
}

/**
 * Справочник, урезанный до упражнений, для которых есть снимок.
 *
 * Упражнение без фотографии в списке не показывается совсем: карточка без
 * снимка среди карточек со снимками читается как недоделка. Описания при
 * этом не удаляются — упражнение возвращается само, как только появится
 * его файл. Общее упражнение, снятое только для одного пола, остаётся в
 * списке этого пола и сужает `audience` до него: иначе `exerciseSex` повёл
 * бы из «Избранного» в список, где упражнения нет.
 *
 * `shots` — имена файлов без расширения: `<id>-<пол>`.
 */
export function withShots(all: Exercise[], shots: ReadonlySet<string>): Exercise[] {
  return all.flatMap((e) => {
    const sexes = (e.audience === 'both' ? (['female', 'male'] as Sex[]) : [e.audience])
      .filter((sex) => shots.has(`${e.id}-${sex}`))
    const [first, second] = sexes
    if (!first) return []
    const audience: Audience = second ? 'both' : first
    return [{ ...e, audience }]
  })
}
