import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectPlatform } from './useInstall'

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
