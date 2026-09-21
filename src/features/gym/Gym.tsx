import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Glass } from '@/ui/Glass'
import { Sheet } from '@/ui/Sheet'
import { MuscleArt } from '@/ui/MuscleArt'
import { Icon } from '@/ui/Icon'
import {
  GROUP_TITLE, MUSCLE_GROUPS, SEX_TITLE, exercisePhoto, exerciseSex, groupArt,
  groupPhoto, pickExercises, withShots,
  type Exercise, type MuscleGroup,
} from '@/domain/gym'
import { plural } from '@/domain/dates'
import type { Profile, Sex } from '@/domain/types'
import { EXERCISES } from './exercises'
import { SHOTS } from './shots'
import { WorkoutLog } from './WorkoutLog'
import { StarButton } from '@/ui/StarButton'
import { favoriteIds } from '@/db/workouts'
import { useLiveQuery } from 'dexie-react-hooks'
import s from './Gym.module.css'

const GROUP_IDS = new Set<string>(MUSCLE_GROUPS.map((g) => g.id))
const SEXES: Sex[] = ['female', 'male']

/**
 * Метка перехода на шаг вглубь раздела. По ней кнопка «назад» узнаёт, что
 * предыдущая запись истории — родительский шаг, и возвращается по истории,
 * а не кладёт родителя в неё ещё раз.
 */
const DOWN = { gymDown: true }

/** Что раздел показывает: только упражнения, для которых есть снимок */
const CATALOG = withShots(EXERCISES, SHOTS)

/**
 * Раздел «Зал»: группа мышц → пол → упражнения.
 *
 * Шаги разведены по адресам, а не по состоянию внутри одного экрана:
 * тогда системная кнопка «назад» на телефоне возвращает на шаг назад,
 * а не выбрасывает из раздела целиком.
 */
export function Gym({ profile }: { profile: Profile }) {
  return (
    <Routes>
      <Route index element={<GroupsScreen profile={profile} />} />
      <Route path=":group" element={<SexScreen profile={profile} />} />
      <Route path=":group/:sex" element={<ExercisesScreen />} />
      <Route path="*" element={<Navigate to="/gym" replace />} />
    </Routes>
  )
}

// ------------------------------ Шаг 1: группы ------------------------------

function GroupsScreen({ profile }: { profile: Profile }) {
  const navigate = useNavigate()
  const favIds = useLiveQuery(() => favoriteIds('exercise'), []) ?? []
  const favs = favIds.map((id) => CATALOG.find((e) => e.id === id)).filter((e): e is Exercise => !!e)

  return (
    <div className={s.screen}>
      <div className={s.head}>
        <h1 className={s.title}>Зал</h1>
        <p className={s.hint}>
          Выберите группу мышц. Дальше — техника, подходы и частые ошибки.
        </p>
      </div>

      {favs.length > 0 && (
        <div className={s.favBlock}>
          <span className={s.favTitle}>Избранное</span>
          <div className={s.favList}>
            {favs.map((e) => (
              <button
                key={e.id} className={`${s.favItem} pressable`}
                onClick={() => navigate(`/gym/${e.group}/${exerciseSex(e, profile.sex)}?open=${e.id}`)}
              >
                <Icon name="star" size={14} className={s.favStar} />
                <span className={s.favName}>{e.title}</span>
                <span className={s.favGroup}>{GROUP_TITLE[e.group]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={s.groups}>
        {MUSCLE_GROUPS.map((g, i) => (
          <Glass key={g.id} padding="none" className="rise-in" style={{ '--i': i } as CSSProperties}>
            <button className={`${s.groupCard} pressable`} onClick={() => navigate(`/gym/${g.id}`, { state: DOWN })}>
              <span className={s.groupArt}>
                <GroupArt group={g.id} sex={profile.sex} />
              </span>
              <span className={s.groupName}>{g.title}</span>
              <span className={s.groupHint}>{g.hint}</span>
            </button>
          </Glass>
        ))}
      </div>
    </div>
  )
}

// ------------------------------ Шаг 2: пол ------------------------------

function SexScreen({ profile }: { profile: Profile }) {
  const navigate = useNavigate()
  const { group } = useParams()
  if (!group || !GROUP_IDS.has(group)) return <Navigate to="/gym" replace />
  const g = group as MuscleGroup

  return (
    <div className={s.screen}>
      <Back to="/gym" label="Зал" />

      <div className={s.head}>
        <h1 className={s.title}>{GROUP_TITLE[g]}</h1>
        <p className={s.hint}>
          Упражнения одни и те же, но подобраны и расписаны по-разному.
        </p>
      </div>

      <div className={s.sexes}>
        {SEXES.map((sex, i) => (
          <Glass key={sex} padding="none" className="rise-in" style={{ '--i': i } as CSSProperties}>
            <button className={`${s.sexCard} pressable`} onClick={() => navigate(`/gym/${g}/${sex}`, { state: DOWN })}>
              <span className={s.sexCover}>
                <Cover group={g} sex={sex} />
              </span>
              <span className={s.sexRow}>
                <span className={s.sexName}>{SEX_TITLE[sex]}</span>
                {profile.sex === sex && <span className={s.yours}>ваш профиль</span>}
              </span>
            </button>
          </Glass>
        ))}
      </div>
    </div>
  )
}

/**
 * Значок группы на экране выбора: анатомическая карта, а если её нет —
 * рисованный силуэт. Карта и обложки следующего экрана намеренно разного
 * рода: здесь мышца без зала и снаряда, там человек в движении.
 */
function GroupArt({ group, sex }: { group: MuscleGroup; sex: Sex }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <MuscleArt group={group} sex={sex} height={92} />
  return (
    <img
      className={s.groupArtImg}
      src={groupArt(group)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

/**
 * Обложка карточки пола: фотография, а если её нет — рисунок.
 *
 * Файл может отсутствовать, и это нормальное состояние, а не ошибка:
 * снимки добавляются отдельно от кода. Поэтому промах по картинке молча
 * переключает карточку на силуэт вместо того, чтобы оставить пустое место.
 */
function Cover({ group, sex }: { group: MuscleGroup; sex: Sex }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span className={s.coverArt}>
        <MuscleArt group={group} sex={sex} height={120} />
      </span>
    )
  }
  return (
    <img
      className={s.coverImg}
      src={groupPhoto(group, sex)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

// ------------------------------ Шаг 3: упражнения ------------------------------

function ExercisesScreen() {
  const { group, sex } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const favIds = useLiveQuery(() => favoriteIds('exercise'), []) ?? []
  const [opened, setOpened] = useState<Exercise | null>(null)
  // Постоянная ссылка, а не стрелка в разметке: шторка перезапускает свой
  // эффект при смене onClose и заново забирает фокус. Звезда меняет
  // избранное, экран перерисовывается — и фокус улетал с только что нажатой
  // звезды в начало шторки, так что снять её тем же Enter было нельзя.
  const close = useCallback(() => setOpened(null), [])

  const valid = group && GROUP_IDS.has(group) && (sex === 'male' || sex === 'female')
  // Избранные поднимаются наверх, остальной порядок — как в справочнике
  const list = useMemo(() => {
    const rows = valid ? pickExercises(CATALOG, group as MuscleGroup, sex as Sex) : []
    const fav = new Set(favIds)
    return [...rows.filter((e) => fav.has(e.id)), ...rows.filter((e) => !fav.has(e.id))]
  }, [valid, group, sex, favIds])

  // Переход из «Избранного» на главной: ?open=<id> сразу раскрывает карточку
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('open')
    if (!id) return
    const e = list.find((x) => x.id === id)
    if (e) setOpened(e)
    navigate(location.pathname, { replace: true })
  }, [location.search, location.pathname, list, navigate])

  if (!valid) return <Navigate to="/gym" replace />
  const g = group as MuscleGroup
  const x = sex as Sex

  return (
    <div className={s.screen}>
      <Back to={`/gym/${g}`} label={GROUP_TITLE[g]} />

      <div className={s.head}>
        <h1 className={s.title}>{GROUP_TITLE[g]}</h1>
        <p className={s.hint}>
          {SEX_TITLE[x]} · {list.length} {plural(list.length, 'упражнение', 'упражнения', 'упражнений')}
        </p>
      </div>

      <div className={s.list}>
        {list.map((e, i) => (
          <Glass key={e.id} padding="none" className="rise-in" style={{ '--i': i } as CSSProperties}>
            <button className={`${s.card} pressable`} onClick={() => setOpened(e)}>
              <span className={s.cardBody}>
                <span className={s.cardName}>
                  {favIds.includes(e.id) && <Icon name="star" size={12} className={s.favStar} />}
                  {e.title}
                </span>
                <span className={s.cardFocus}>{e.focus}</span>
                <span className={s.cardMeta}>{e.equipment}</span>
              </span>
              <span className={s.cardSets}>{e.sets[x]}</span>
            </button>
          </Glass>
        ))}
      </div>

      <p className={s.note}>
        Подходы и повторы — ориентир для начала. Техника важнее веса:
        если движение не получается держать чисто, вес нужно снизить.
      </p>

      <Sheet
        open={opened !== null} title={opened?.title} onClose={close}
        actions={opened ? (
          <span className={s.sheetActions}>
            <StarButton kind="exercise" id={opened.id} />
            <button className={`${s.closeBtn} pressable`} onClick={close} aria-label="Закрыть">
              <Icon name="close" size={16} />
            </button>
          </span>
        ) : undefined}
      >
        {opened && <Detail exercise={opened} sex={x} />}
      </Sheet>
    </div>
  )
}

/**
 * Снимок упражнения над описанием: диптих из двух фаз движения. Раздел
 * показывает только упражнения со снимком, но файл всё равно может не
 * загрузиться — например, без сети, пока его нет в кэше. Тогда блок просто
 * не появляется: пустая рамка хуже, чем её отсутствие.
 */
function ExerciseShot({ id, sex }: { id: string; sex: Sex }) {
  const [gone, setGone] = useState(false)
  const img = useRef<HTMLImageElement>(null)

  /*
   * Ошибка загрузки бывает раньше, чем React успевает повесить onError, и
   * тогда событие не приходит вовсе. Поэтому после монтирования состояние
   * спрашивается у самой картинки: naturalWidth === 0 при complete значит,
   * что файл не пришёл.
   */
  useEffect(() => {
    const el = img.current
    if (el?.complete && el.naturalWidth === 0) setGone(true)
  }, [])

  if (gone) return null
  return (
    <div className={s.shot} aria-hidden="true">
      <img
        ref={img}
        className={s.shotImg}
        src={exercisePhoto(id, sex)}
        alt=""
        /* lazy здесь вредит: шторка приезжает снизу через transform, то есть
           в момент монтирования картинка формально за экраном и загрузка
           откладывается до конца анимации. Картинка ровно одна и она на
           экране — откладывать нечего. */
        decoding="async"
        onError={() => setGone(true)}
      />
    </div>
  )
}

function Detail({ exercise, sex }: { exercise: Exercise; sex: Sex }) {
  return (
    <div className={s.detail}>
      {/* key не косметика: без него React переиспользовал бы состояние
          загрузки при подмене упражнения в открытой шторке, и неудача
          прежней картинки спрятала бы новую. */}
      <ExerciseShot key={`${exercise.id}-${sex}`} id={exercise.id} sex={sex} />

      <div className={s.facts}>
        <Fact label="Подходы" value={exercise.sets[sex]} />
        <Fact label="Отдых" value={exercise.rest} />
        <Fact label="Инвентарь" value={exercise.equipment} />
      </div>

      <p className={s.focusLine}>{exercise.focus}</p>

      <h3 className={s.subhead}>Как делать</h3>
      <ol className={s.steps}>
        {exercise.steps.map((step, i) => <li key={i}>{step}</li>)}
      </ol>

      <h3 className={s.subhead}>Частые ошибки</h3>
      <ul className={s.mistakes}>
        {exercise.mistakes.map((m, i) => <li key={i}>{m}</li>)}
      </ul>

      <WorkoutLog exercise={exercise} />
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className={s.fact}>
      <span className={s.factLabel}>{label}</span>
      <span className={s.factValue}>{value}</span>
    </div>
  )
}

/**
 * «Назад» внутри раздела не добавляет шаг в историю. Раньше она делала
 * обычный переход на родителя, и следом системная «назад» возвращала
 * вперёд, в только что покинутый экран. Если сюда пришли с родителя, это
 * просто шаг назад по истории; если по прямой ссылке или из «Избранного» —
 * родитель подменяет текущий адрес.
 */
function Back({ to, label }: { to: string; label: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const fromParent = (location.state as typeof DOWN | null)?.gymDown === true
  return (
    <button
      className={s.back}
      onClick={() => (fromParent ? navigate(-1) : navigate(to, { replace: true }))}
    >
      <Icon name="chevron-left" size={16} />
      {label}
    </button>
  )
}
