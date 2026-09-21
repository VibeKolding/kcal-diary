/**
 * Заголовки безопасности — единственный источник правды.
 *
 * Отсюда их берёт vite.config.ts для dev-сервера и локального превью, чтобы
 * нарушения находились до выкладки. Хостинги читают свои копии: Netlify и
 * Cloudflare Pages — public/_headers, Netlify из Git — ещё и netlify.toml,
 * Vercel — vercel.json. Копии сверяет securityHeaders.test.ts: они уже
 * расходились — _headers запрещал гироскоп, остальные нет, и наклон знака
 * на заставке работал на Vercel и в превью, но не на Cloudflare.
 */

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    // data: нужен для шрифта: мелкие подмножества Manrope вшиваются
    // прямо в CSS. Шрифт в data-URI выполнить нельзя, риска нет.
    "font-src 'self' data:",
    "media-src 'self' blob:",
    // Единственный внешний адрес во всём приложении — база штрихкодов
    "connect-src 'self' https://world.openfoodfacts.org",
    "worker-src 'self'",
    "manifest-src 'self'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  // Камера — для штрихкода. Акселерометр, гироскоп и магнитометр — для
  // наклона знака на заставке (useTilt слушает deviceorientation, а тот
  // без них не приходит). Всё только самому приложению, не встроенным
  // страницам; остальное железо запрещено.
  'Permissions-Policy': [
    'camera=(self)',
    'accelerometer=(self)',
    'gyroscope=(self)',
    'magnetometer=(self)',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
  ].join(', '),
}

/**
 * Только для боевых хостингов. Локальное превью идёт по http, и HSTS там
 * браузер всё равно проигнорирует.
 */
export const HOSTING_ONLY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
}
