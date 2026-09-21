/*
 * Нажатие на напоминание. Подключается в воркер через workbox.importScripts
 * (vite.config.ts): generateSW своих обработчиков уведомлений не пишет,
 * и без этого нажатие на «Дневник за сегодня пуст» в шторке ничего не
 * открывало — приходилось искать иконку приложения.
 *
 * Открытое окно дневника выводим вперёд как есть, не перезагружая: в нём
 * может быть недописанная запись. Окна нет — открываем главный экран.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    // matchAll отдаёт только окна этого сайта; видимое — первым кандидатом
    const own = windows.find((w) => w.visibilityState === 'visible') ?? windows[0]
    if (own) {
      try {
        await own.focus()
        return
      } catch {
        // Браузер не дал вывести окно вперёд — откроем новое
      }
    }
    await self.clients.openWindow(self.registration.scope)
  })())
})
