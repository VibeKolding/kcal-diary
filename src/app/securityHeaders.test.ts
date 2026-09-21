import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HOSTING_ONLY_HEADERS, SECURITY_HEADERS } from './securityHeaders'

/*
 * Копии заголовков для хостингов обязаны совпадать с источником правды.
 * Они уже расходились: public/_headers запрещал гироскоп и акселерометр,
 * остальные — нет, и наклон знака на заставке работал в превью и на
 * Vercel, но не на Netlify Drop и Cloudflare Pages. Глазами такое не
 * ловится: превью отдаёт заголовки из vite.config.ts, а не из копий.
 */

const expected = { ...SECURITY_HEADERS, ...HOSTING_ONLY_HEADERS }
const read = (path: string) => readFileSync(path, 'utf8')

/** Заголовки блока «/*» из public/_headers (формат Netlify и Cloudflare) */
function fromHeadersFile(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  let inBlock = false
  for (const line of text.split('\n')) {
    if (!line.startsWith(' ') && line.trim() !== '' && !line.startsWith('#')) {
      inBlock = line.trim() === '/*'
      continue
    }
    const m = /^\s+([A-Za-z-]+):\s*(.+)$/.exec(line)
    if (inBlock && m?.[1] && m[2] && !line.trim().startsWith('#')) out[m[1]] = m[2].trim()
  }
  return out
}

/** Заголовки блока for = "/*" из netlify.toml */
function fromNetlifyToml(text: string): Record<string, string> {
  const block = text.split('[[headers]]').find((b) => /for\s*=\s*"\/\*"/.test(b)) ?? ''
  // Только то, что под [headers.values]: строка for = … — адрес, а не заголовок
  const values = block.split('[headers.values]')[1] ?? ''
  const out: Record<string, string> = {}
  for (const m of values.matchAll(/^\s+([A-Za-z-]+)\s*=\s*"(.*)"\s*$/gm)) {
    if (m[1] && m[2] !== undefined) out[m[1]] = m[2]
  }
  return out
}

/** Заголовки правила source = "/(.*)" из vercel.json */
function fromVercelJson(text: string): Record<string, string> {
  const doc = JSON.parse(text) as { headers: { source: string; headers: { key: string; value: string }[] }[] }
  const rule = doc.headers.find((h) => h.source === '/(.*)')
  return Object.fromEntries((rule?.headers ?? []).map((h) => [h.key, h.value]))
}

describe('заголовки безопасности', () => {
  it('public/_headers совпадает с src/app/securityHeaders.ts', () => {
    expect(fromHeadersFile(read('public/_headers'))).toEqual(expected)
  })

  it('netlify.toml совпадает с src/app/securityHeaders.ts', () => {
    expect(fromNetlifyToml(read('netlify.toml'))).toEqual(expected)
  })

  it('vercel.json совпадает с src/app/securityHeaders.ts', () => {
    expect(fromVercelJson(read('vercel.json'))).toEqual(expected)
  })

  it('датчики наклона разрешены приложению: без них заставка не слышит гироскоп', () => {
    const policy = SECURITY_HEADERS['Permissions-Policy'] ?? ''
    for (const feature of ['accelerometer', 'gyroscope', 'camera']) {
      expect(policy).toContain(`${feature}=(self)`)
    }
  })
})
