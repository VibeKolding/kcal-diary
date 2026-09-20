import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
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
import { useAppUpdate } from './useAppUpdate'
import { ensurePersistentStorage } from '@/db/persist'
import { useReminders } from '@/features/reminders/useReminders'
import { addWater } from '@/db/tracking'
import { useToast } from '@/ui/Toast'
import s from './App.module.css'

export function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const [ready, setReady] = useState(false)
  const [fatal, setFatal] = useState<string | null>(null)
  // Заставка держится минимум столько, сколько длится её анимация: иначе
  // на быстром устройстве она мигнёт и исчезнет, а это хуже её отсутствия.
  const [minTimePassed, setMinTimePassed] = useState(false)
  const [splash, setSplash] = useState<'showing' | 'leaving' | 'gone'>('showing')
  // /?splash=1 держит заставку до касания — чтобы разглядеть эмблему,
  // а не ловить её за секунду (для снимков и проверки на телефоне).
  const [hold, setHold] = useState(() => new URLSearchParams(location.search).has('splash'))

  const [adding, setAdding] = useState<{ meal: Meal; date: string } | null>(null)

  useAppUpdate(splash === 'showing')

  // useLiveQuery следит за профилем: после онбординга экран сменится сам
  const profile = useLiveQuery(() => getProfile(), [])
  useReminders(profile)

  // Ярлыки с домашнего экрана: /?add=1 открывает добавление, /?water=1
  // записывает стакан. Параметр стирается, чтобы не сработать при обновлении.
  useEffect(() => {
    if (!profile) return
    const params = new URLSearchParams(location.search)
    if (params.has('add')) setAdding({ meal: 'snack', date: dayKey() })
    if (params.has('water')) {
      void addWater(profile.glassMl ?? 250).then((ml) => toast({ text: `Вода: ${ml} мл сегодня` }))
    }
    if (params.has('add') || params.has('water')) navigate('/', { replace: true })
  }, [profile, location.search, navigate, toast])

  useEffect(() => {
    // 2.4 с — это длительность самой заставки, а не запас: знак 0–0.9,
    // название 0.82–1.24, строка 0.98–1.4, подпись 1.18–1.6, свет по
    // подписи 1.68–2.4. Уйти раньше — оборвать последний шаг.
    const t = setTimeout(() => setMinTimePassed(true), 2400)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    seedFoods()
      .catch((e: unknown) => {
        setFatal(e instanceof Error ? e.message : 'Не удалось подготовить базу продуктов')
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

  const openAdd = useCallback((meal: Meal, date: string) => {
    setAdding({ meal, date })
  }, [])

  if (fatal) {
    return (
      <div className={s.boot}>
        <p className={s.fatal}>{fatal}</p>
      </div>
    )
  }

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
      <Suspense fallback={<div className={s.boot}><Spinner /></div>}>
        <Routes>
          <Route path="/" element={<Today profile={profile} onAdd={openAdd} />} />
          <Route path="/gym/*" element={<Gym profile={profile} />} />
          <Route path="/stats" element={<Stats profile={profile} />} />
          <Route path="/profile" element={<ProfileScreen profile={profile} />} />
        </Routes>
      </Suspense>

      <OfflineBar />
      <TabBar onAdd={() => openAdd('snack', dayKey())} />

      <AddFood
        open={adding !== null}
        meal={adding?.meal ?? 'snack'}
        date={adding?.date ?? dayKey()}
        profile={profile}
        onClose={() => setAdding(null)}
      />
    </>
  )
}
