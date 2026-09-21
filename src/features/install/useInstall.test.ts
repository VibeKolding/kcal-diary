import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInstallStore, detectPlatform } from './useInstall'

function fakeBrowser(ua: string, opts: { touch?: number; standalone?: boolean } = {}) {
  vi.stubGlobal('navigator', {
    userAgent: ua,
    maxTouchPoints: opts.touch ?? 0,
    standalone: opts.standalone,
  })
  vi.stubGlobal('window', {
    navigator: { standalone: opts.standalone },
    matchMedia: () => ({ matches: false }),
  })
}

afterEach(() => vi.unstubAllGlobals())

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120'
const ANDROID = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile'

describe('определение платформы', () => {
  it('узнаёт iPhone', () => {
    fakeBrowser(IPHONE)
    expect(detectPlatform()).toBe('ios')
  })

  /**
   * iPadOS 13+ представляется как Mac — отличить его можно только
   * по наличию тача. Без этой проверки владельцы iPad увидят
   * инструкцию для настольного браузера и не смогут установить приложение.
   */
  it('узнаёт iPad, который притворяется маком', () => {
    fakeBrowser(IPAD, { touch: 5 })
    expect(detectPlatform()).toBe('ios')
  })

  it('не путает настоящий Mac с iPad', () => {
    fakeBrowser(MAC, { touch: 0 })
    expect(detectPlatform()).toBe('desktop')
  })

  it('узнаёт Android', () => {
    fakeBrowser(ANDROID)
    expect(detectPlatform()).toBe('android-chrome')
  })

  it('видит, что приложение уже установлено', () => {
    fakeBrowser(IPHONE, { standalone: true })
    expect(detectPlatform()).toBe('installed')
  })
})

/** Поддельное событие Chrome: обычное Event с prompt() и userChoice */
function promptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const e = new Event('beforeinstallprompt', { cancelable: true })
  const prompt = vi.fn(async () => {})
  Object.assign(e, { prompt, userChoice: Promise.resolve({ outcome }) })
  return { e, prompt }
}

describe('отложенное предложение установки', () => {
  /**
   * Главное, ради чего хранилище существует: Chrome присылает событие на
   * заставке, когда карточки установки ещё нет. Оно не должно пропасть.
   */
  it('помнит событие, пришедшее до того, как кто-то подписался', () => {
    const target = new EventTarget()
    const store = createInstallStore(target)
    const { e } = promptEvent()
    target.dispatchEvent(e)

    expect(e.defaultPrevented).toBe(true)
    expect(store.getSnapshot().canPrompt).toBe(true)
  })

  it('сообщает подписчикам о новом событии и не меняет снимок без причины', () => {
    const target = new EventTarget()
    const store = createInstallStore(target)
    const before = store.getSnapshot()
    expect(store.getSnapshot()).toBe(before)

    const listener = vi.fn()
    store.subscribe(listener)
    target.dispatchEvent(promptEvent().e)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot()).not.toBe(before)
  })

  it('вызывает prompt() один раз, даже если нажать дважды', async () => {
    const target = new EventTarget()
    const store = createInstallStore(target)
    const { e, prompt } = promptEvent('dismissed')
    target.dispatchEvent(e)

    const [first, second] = await Promise.all([store.install(), store.install()])
    expect(first).toBe('dismissed')
    expect(second).toBe('unavailable')
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().canPrompt).toBe(false)
  })

  it('если Chrome отказал показать окно, кнопка возвращается', async () => {
    const target = new EventTarget()
    const store = createInstallStore(target)
    const { e, prompt } = promptEvent()
    prompt.mockRejectedValueOnce(new DOMException('нужно касание', 'NotAllowedError'))
    target.dispatchEvent(e)

    expect(await store.install()).toBe('unavailable')
    expect(store.getSnapshot().canPrompt).toBe(true)
    expect(await store.install()).toBe('accepted')
    expect(prompt).toHaveBeenCalledTimes(2)
  })

  it('без события установка недоступна', async () => {
    const store = createInstallStore(new EventTarget())
    expect(await store.install()).toBe('unavailable')
  })

  it('после установки кнопка пропадает, а карточка знает об установке', () => {
    const target = new EventTarget()
    const store = createInstallStore(target)
    target.dispatchEvent(promptEvent().e)
    target.dispatchEvent(new Event('appinstalled'))

    expect(store.getSnapshot()).toEqual({ canPrompt: false, installed: true })
  })
})
