import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useToast } from '@/ui/Toast'

/**
 * Новая версия приложения.
 *
 * Сервис-воркер зарегистрирован в режиме prompt: новая сборка встаёт
 * в ожидание и не подменяет открытую страницу. Без этого хука никто
 * не слушал onNeedRefresh, и обновление приезжало только после того,
 * как пользователь закрывал все вкладки — то есть никогда.
 *
 * Пока на экране заставка, терять нечего — новая версия ставится сразу,
 * страница перезагружается. Иначе тост с «Обновить» показывался бы за
 * заставкой, и половина обновлений проходила мимо.
 */
export function useAppUpdate(startup: boolean): void {
  const toast = useToast()
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW()

  useEffect(() => {
    if (!needRefresh) return
    if (startup) { void updateServiceWorker(true); return }
    toast({
      text: 'Доступна новая версия',
      action: { label: 'Обновить', onClick: () => updateServiceWorker(true) },
      duration: 60_000,
    })
  }, [needRefresh, startup, toast, updateServiceWorker])
}
