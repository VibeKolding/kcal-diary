import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getReminders, schedule } from './reminders'
import type { Profile } from '@/domain/types'

/** Держит таймеры напоминаний, пока приложение открыто */
export function useReminders(profile: Profile | null | undefined): void {
  const settings = useLiveQuery(() => getReminders(), [])
  useEffect(() => {
    if (!settings || !profile || typeof Notification === 'undefined') return
    return schedule(settings, profile.waterGoalMl)
  }, [settings, profile])
}
