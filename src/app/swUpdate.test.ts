import { describe, expect, it, vi } from 'vitest'
import { watchUpdates, type UpdateState } from './swUpdate'

/*
 * Поддельные воркер, регистрация и navigator.serviceWorker. Браузера в
 * тестах нет, а проверять надо именно порядок событий: кто перезагружается
 * и когда. Всё, чего модуль касается, — события и пара полей.
 */
class FakeWorker extends EventTarget {
  state: ServiceWorkerState = 'installing'
  sent: unknown[] = []
  postMessage(m: unknown) { this.sent.push(m) }
  to(state: ServiceWorkerState) {
    this.state = state
    this.dispatchEvent(new Event('statechange'))
  }
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null
  waiting: FakeWorker | null = null
  updates = 0
  async update() { this.updates++ }
}

class FakeContainer extends EventTarget {
  controller: object | null
  reg = new FakeRegistration()
  constructor(controlled: boolean) {
    super()
    this.controller = controlled ? {} : null
  }
  async register() { return this.reg }
  /** Другое окно (или это) включило новую версию */
  switchController() {
    this.controller = {}
    this.dispatchEvent(new Event('controllerchange'))
  }
}

function setup(container: FakeContainer) {
  const states: UpdateState[] = []
  const reload = vi.fn()
  const u = watchUpdates(container as unknown as ServiceWorkerContainer, '/sw.js', {
    onState: (s) => states.push(s),
    reload,
  })
  return { u, states, reload }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('watchUpdates', () => {
  it('ожидающая с прошлого раза версия видна сразу', async () => {
    const c = new FakeContainer(true)
    c.reg.waiting = new FakeWorker()
    const { states } = setup(c)
    await tick()
    expect(states).toEqual(['ready'])
  })

  it('новая версия, найденная при открытом приложении, тоже объявляется', async () => {
    const c = new FakeContainer(true)
    const { states } = setup(c)
    await tick()
    const w = new FakeWorker()
    c.reg.installing = w
    c.reg.dispatchEvent(new Event('updatefound'))
    w.to('installed')
    expect(states).toEqual(['ready'])
  })

  it('первая установка — не обновление: предлагать нечего', async () => {
    const c = new FakeContainer(false)
    const w = new FakeWorker()
    c.reg.installing = w
    const { states, reload } = setup(c)
    await tick()
    w.to('installed')
    c.switchController()
    expect(states).toEqual([])
    expect(reload).not.toHaveBeenCalled()
  })

  it('«Обновить» включает ожидающую версию и перезагружает только это окно', async () => {
    const c = new FakeContainer(true)
    const w = new FakeWorker()
    c.reg.waiting = w
    const { u, reload } = setup(c)
    await tick()
    u.apply()
    expect(w.sent).toEqual([{ type: 'SKIP_WAITING' }])
    expect(reload).not.toHaveBeenCalled()
    c.switchController()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('обновление из другого окна не перезагружает это, а предлагает', async () => {
    const c = new FakeContainer(true)
    c.reg.waiting = new FakeWorker()
    const { states, reload } = setup(c)
    await tick()
    c.switchController()
    expect(reload).not.toHaveBeenCalled()
    expect(states).toEqual(['ready', 'elsewhere'])
  })

  it('если версию уже включили, «Обновить» просто перезагружает', async () => {
    const c = new FakeContainer(true)
    const { u, reload } = setup(c)
    await tick()
    u.apply()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('проверка обновлений спрашивает сервер через регистрацию', async () => {
    const c = new FakeContainer(true)
    const { u } = setup(c)
    await tick()
    u.check()
    expect(c.reg.updates).toBe(1)
  })

  it('после stop молчит', async () => {
    const c = new FakeContainer(true)
    const { u, states, reload } = setup(c)
    await tick()
    u.stop()
    c.switchController()
    expect(states).toEqual([])
    expect(reload).not.toHaveBeenCalled()
  })
})
