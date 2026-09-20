import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'


// Заголовки безопасности. Продублированы в netlify.toml, vercel.json и
// public/_headers для боевых хостингов, а здесь — чтобы локальное превью
// вело себя так же и нарушения находились до выкладки.
const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    // data: нужен для шрифта: мелкие подмножества Manrope вшиваются
    // прямо в CSS. Шрифт в data-URI выполнить нельзя, риска нет.
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    // Единственный внешний адрес во всём приложении — база штрихкодов
    "connect-src 'self' https://world.openfoodfacts.org",
    "worker-src 'self'",
    "manifest-src 'self'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy':
    'camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
}

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as {
  version: string
  author: string
}

export default defineConfig({
  // Версия и автор берутся из package.json, чтобы не расходились с ним
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_AUTHOR__: JSON.stringify(pkg.author),
  },
  server: { headers: SECURITY_HEADERS },
  preview: { headers: SECURITY_HEADERS },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      // Регистрирует хук useAppUpdate через virtual:pwa-register — иначе
      // воркер регистрировался бы дважды.
      injectRegister: false,
      // includeAssets не нужен для того, что уже покрыто globPatterns ниже:
      // иначе файл попадает в предкэш дважды и занимает вдвое больше места.
      includeAssets: [],
      manifest: {
        id: '/',
        name: 'Дневник калорий',
        short_name: 'Калории',
        categories: ['health', 'food', 'lifestyle'],
        display_override: ['standalone', 'minimal-ui'],
        shortcuts: [
          {
            name: 'Добавить еду', short_name: 'Еда', url: '/?add=1',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Стакан воды', short_name: 'Вода', url: '/?water=1',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
        ],
        description: 'Личный дневник питания. Работает без интернета, данные не покидают устройство.',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        // Цвета светлой темы: она основная, и экран запуска установленного
        // приложения должен совпадать с тем, что откроется следом
        background_color: '#EAE6F6',
        theme_color: '#EAE6F6',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Отдельная запись, а не purpose: 'any maskable' на одном файле:
          // при совмещении Android обрезает обычную иконку и съедает края знака.
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512', type: 'image/png', purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Весь шелл, шрифты и вшитая база продуктов кладутся в кэш при установке.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,json,webp}'],
        // Снимки упражнений в предкэш не попадают: их четыре десятка, и
        // при установке они утроили бы вес приложения ради картинок, до
        // которых большинство не дойдёт. Они кэшируются по факту открытия.
        globIgnores: ['**/images/gym/ex/**'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: '/index.html',
        // Open Food Facts — единственный внешний адрес. Только сеть, без кэша:
        // офлайн-ветка живёт в коде и читает локальную базу.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/world\.openfoodfacts\.org\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            // Снимок упражнения: один раз посмотрели — дальше доступен офлайн
            urlPattern: /\/images\/gym\/ex\/.*\.webp$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gym-shots',
              // Снимков 69 — по одному на пару «упражнение × пол». Предел
              // должен быть заметно выше: на шестидесяти самые ранние начали
              // бы вытесняться ровно у того, кто раздел и смотрит.
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 60 * 60 * 24 * 180,
                purgeOnQuotaError: true,
              },
              // Фильтр по типу ответа — не перестраховка, а условие работы.
              // Хостинг отдаёт index.html с кодом 200 на любой ненайденный
              // путь (см. public/_redirects), то есть отсутствующий снимок
              // приходит успешным ответом. Без фильтра CacheFirst положил бы
              // эту заглушку в кэш под именем снимка и полгода отдавал её
              // оттуда — файл, добавленный позже, не появился бы никогда.
              cacheableResponse: {
                statuses: [200],
                headers: { 'Content-Type': 'image/webp' },
              },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Dexie нужен реальный IndexedDB — в тестах его подменяет fake-indexeddb
    globals: false,
  },
})
