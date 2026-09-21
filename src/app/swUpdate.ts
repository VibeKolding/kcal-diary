/**
 * Слежка за новой версией приложения — без библиотечной обёртки.
 *
 * Раньше регистрацию делал useRegisterSW из vite-plugin-pwa. Он вешает
 * в каждом окне, узнавшем о новой версии, «сменился воркер → перезагрузить
 * страницу» — не глядя, кто попросил обновиться. Два окна дневника: второе
 * на заставке ставит обновление, а первое молча перезагружается и теряет
 * набранное в панели или шаг онбординга. Здесь перезагружается только то
 * окно, которое само попросило обновиться; остальные узнают, что работают
 * на старом коде, и предлагают перезагрузку сами.
 *
 * Воркер собирает generateSW в режиме prompt: новая версия встаёт
 * в ожидание и включается сообщением SKIP_WAITING — тем же, что посылает
 * workbox-window.
 */

/**
 * none — всё свежее; ready — новая версия ждёт, можно ставить;
 * elsewhere — её уже поставило другое окно, а это работает на старом коде
 */
export type UpdateState = 'none' | 'ready' | 'elsewhere'

export interface Updater {
  /** Поставить ожидающую версию. Перезагрузится только это окно */
  apply(): void
  /** Спросить сервер, не вышло ли новой версии */
  check(): void
  stop(): void
}

interface Handlers {
  onState: (s: UpdateState) => void
  reload: () => void
}

export function watchUpdates(
  container: ServiceWorkerContainer,
  scriptUrl: string,
  { onState, reload }: Handlers,
): Updater {
  let reg: ServiceWorkerRegistration | null = null
  let stopped = false
  // Новую версию попросило именно это окно — только его и перезагружаем
  let requested = false
  // Смена контроллера у страницы, которой никто не управлял, — это первая
  // установка, а не обновление: код на странице и так свежий
  let controlled = container.controller !== null

  const set = (s: UpdateState) => { if (!stopped) onState(s) }

  // Новая версия «готова», когда встала в ожидание. Без контроллера
  // ждать нечего: это первая установка, и страница уже на свежем коде.
  const follow = (w: ServiceWorker) => {
    const onChange = () => {
      if (w.state === 'installed' && container.controller) set('ready')
      if (w.state !== 'installing') w.removeEventListener('statechange', onChange)
    }
    w.addEventListener('statechange', onChange)
  }
  const onFound = () => { if (reg?.installing) follow(reg.installing) }

  const onControllerChange = () => {
    if (stopped) return
    if (!controlled) { controlled = true; return }
    if (requested) reload()
    else set('elsewhere')
  }
  container.addEventListener('controllerchange', onControllerChange)

  container.register(scriptUrl).then((r) => {
    if (stopped) return
    reg = r
    if (r.waiting && container.controller) set('ready')
    if (r.installing) follow(r.installing)
    r.addEventListener('updatefound', onFound)
  }).catch(() => {
    // Без воркера дневник работает, просто без офлайна: приватное окно,
    // запрет в настройках. Мешать человеку этим незачем.
  })

  return {
    apply() {
      const waiting = reg?.waiting
      // Ожидающей версии нет — её уже включило другое окно; осталось
      // перезагрузить это
      if (!waiting) { reload(); return }
      requested = true
      waiting.postMessage({ type: 'SKIP_WAITING' })
    },
    check() {
      // update() падает без сети — это не новость и не ошибка
      reg?.update().catch(() => {})
    },
    stop() {
      stopped = true
      container.removeEventListener('controllerchange', onControllerChange)
      reg?.removeEventListener('updatefound', onFound)
    },
  }
}
