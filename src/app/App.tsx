import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Meal } from '@/domain/types'
import { dayKey } from '@/domain/dates'
import { getProfile } from '@/db/profile'
import { seedFoods } from '@/db/seed'
import { Onboarding } from '@/features/profile/Onboarding'
import { Today } from '@/features/today/Today'
import { AddFood } from '@/features/add-food/AddFood'
import { ProfileScreen } from '@/features/profile/ProfileScreen'

// Recharts весит больше всего остального кода вместе взятого, а нужен только
// на этих двух экранах — держим его вне первого чанка.
const Stats = lazy(() => import('@/features/analytics/Stats').then((m) => ({ default: m.Stats })))
// Справочник упражнений — это несколько десятков килобайт текста, который
// нужен только внутри раздела. В первом чанке ему делать нечего.
const Gym = lazy(() => import('@/features/gym/Gym').then((m) => ({ default: m.Gym })))
import { TabBar } from './TabBar'
import { Splash } from './Splash'
import { Spinner } from '@/ui/Spinner'
import { OfflineBar } from './OfflineBar'
import { UpdateBar } from './UpdateBar'
import { useAppUpdate } from './useAppUpdate'
import { ErrorBoundary } from './ErrorBoundary'
import { Crash } from './Crash'
import { describeError } from './errors'
import { ensurePersistentStorage } from '@/db/persist'
import { useReminders } from '@/features/reminders/useReminders'
import { addWater } from '@/db/tracking'
import { useToast } from '@/ui/Toast'
import { viewedDay } from '@/features/today/useToday'
import s from './App.module.css'

export function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const [ready, setReady] = useState(false)
  const [fatal, setFatal] = useState<{ error: unknown } | null>(null)
  // Заставка держится минимум столько, сколько длится её анимация: иначе
  // на быстром устройстве она мигнёт и исчезнет, а это хуже её отсутствия.
  const [minTimePassed, setMinTimePassed] = useState(false)
  const [splash, setSplash] = useState<'showing' | 'leaving' | 'gone'>('showing')
  // /?splash=1 держит заставку до касания — чтобы разглядеть эмблему,
  // а не ловить её за секунду (для снимков и проверки на телефоне).
  const [hold, setHold] = useState(() => new URLSearchParams(location.search).has('splash'))

  // Приём не задан у «+» в таб-баре и у ярлыка: тогда панель выберет его
  // по времени суток (mealForTime), а не молча отправит всё в перекус
  const [adding, setAdding] = useState<{ meal?: Meal; date: string } | null>(null)

  const update = useAppUpdate(splash === 'showing')

  // useLiveQuery следит за профилем: после онбординга экран сменится сам
  const profile = useLiveQuery(() => getProfile(), [])
  useReminders(profile)

  /*
   * Ярлыки с домашнего экрана: /?add=1 открывает добавление, /?water=1
   * записывает стакан. Параметр стирается, чтобы не сработать при обновлении.
   *
   * Разбираются только после заставки. Пока она на экране, может прийти
   * новая версия с перезагрузкой — и стёртый заранее параметр пропал бы
   * вместе с намерением: ярлык «Добавить еду» открывал обычный экран.
   * Заодно тост «Вода: …» больше не прячется за заставкой.
   *
   * Такой адрес может открыть и чужая ссылка, поэтому запись воды видна
   * тостом с «Отменить», а ключ перехода не даёт записать стакан дважды
   * за один переход, сколько бы раз ни прогнался эффект.
   */
  const handledIntent = useRef<string | null>(null)
  useEffect(() => {
    if (!profile || splash !== 'gone') return
    const params = new URLSearchParams(location.search)
    const add = params.has('add')
    const water = params.has('water')
    if (!add && !water) return
    if (handledIntent.current === location.key) return
    handledIntent.current = location.key
    navigate('/', { replace: true })
    if (add) setAdding({ date: dayKey() })
    if (water) {
      const glass = profile.glassMl ?? 250
      const date = dayKey()
      void addWater(glass, date).then((ml) => toast({
        text: `Вода: ${ml} мл сегодня`,
        action: { label: 'Отменить', onClick: async () => { await addWater(-glass, date) } },
      }))
    }
  }, [profile, splash, location.search, location.key, navigate, toast])

  useEffect(() => {
    // 2.4 с — это длительность самой заставки, а не запас: знак 0–0.9,
    // название 0.82–1.24, строка 0.98–1.4, подпись 1.18–1.6, свет по
    // подписи 1.68–2.4. Уйти раньше — оборвать последний шаг.
    const t = setTimeout(() => setMinTimePassed(true), 2400)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    seedFoods()
      .catch((error: unknown) => {
        // Подробности — в консоль; на экран идёт объяснение по-русски (errors.ts)
        console.error(error)
        setFatal({ error })
      })
      .finally(() => setReady(true))
  }, [])

  /*
   * Просим браузер держать хранилище постоянным. Делается один раз при
   * запуске, молча и без окон: человек ничего не нажимает и ничего не
   * видит. Промах не важен — без пометки приложение работает так же,
   * просто с прежним риском, что система вычистит данные при нехватке
   * места. Поэтому запуск на этот вызов не смотрит и его не ждёт.
   */
  useEffect(() => { void ensurePersistentStorage() }, [])

  const loading = !ready || profile === undefined

  // Гасить заставку начинаем только перед самым уходом. Если включить
  // затухание в момент готовности данных, она досидит остаток времени
  // уже прозрачной — то есть покажет пустой экран.
  useEffect(() => {
    if (loading || !minTimePassed || hold) return
    setSplash((prev) => (prev === 'showing' ? 'leaving' : prev))
  }, [loading, minTimePassed, hold])

  // Отдельный эффект: если завести таймер там же, где меняется splash,
  // его собственная очистка отменит таймер при следующем же прогоне —
  // и заставка останется на экране навсегда.
  useEffect(() => {
    if (splash !== 'leaving') return
    const t = setTimeout(() => setSplash('gone'), 340)
    return () => clearTimeout(t)
  }, [splash])

  const openAdd = useCallback((meal: Meal | undefined, date: string) => {
    setAdding({ meal, date })
  }, [])

  /*
   * Страховка для записей, которые не ловят свою ошибку сами. Экраны
   * «Сегодня» и добавления еды показывают тост на каждый сбой, но если
   * место на телефоне кончилось посреди записи где-то ещё, человек должен
   * узнать об этом словами, а не по кнопке, которая «не работает».
   */
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      if (describeError(e.reason).kind === 'quota') {
        toast({ text: 'Не удалось сохранить: на устройстве не хватает места.' })
      }
    }
    window.addEventListener('unhandledrejection', onRejection)
    return () => window.removeEventListener('unhandledrejection', onRejection)
  }, [toast])

  if (fatal) return <Crash error={fatal.error} />

  if (splash !== 'gone') {
    return (
      <Splash
        leaving={splash === 'leaving'}
        hold={hold}
        onDismiss={() => { setHold(false); navigate('/', { replace: true }) }}
      />
    )
  }

  if (!profile) {
    return <Onboarding onDone={() => navigate('/')} />
  }

  return (
    <>
      <div className={s.status}>
        <UpdateBar update={update} />
        <OfflineBar />
      </div>

      {/* Ошибка одного экрана не должна уносить всё приложение: таб-бар
          остаётся, а переход на другой раздел снимает ошибку */}
      <ErrorBoundary resetKey={location.pathname}>
        <Suspense fallback={<div className={s.boot}><Spinner /></div>}>
          <Routes>
            <Route path="/" element={<Today profile={profile} onAdd={openAdd} />} />
            <Route path="/gym/*" element={<Gym profile={profile} />} />
            <Route path="/stats" element={<Stats profile={profile} />} />
            <Route path="/profile" element={<ProfileScreen profile={profile} />} />
            {/* Старая закладка или опечатка вела на пустой фон с одной
                нижней панелью — теперь на главный экран */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>

      {/* «+» пишет в день, открытый на «Сегодня»: листали вчера — во вчера.
          Если экран закрыт, viewedDay() отдаёт сегодняшний день */}
      <TabBar onAdd={() => openAdd(undefined, viewedDay())} />

      <AddFood
        open={adding !== null}
        meal={adding?.meal}
        date={adding?.date ?? dayKey()}
        profile={profile}
        onClose={() => setAdding(null)}
      />
    </>
  )
}
