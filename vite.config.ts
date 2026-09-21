import { fileURLToPath, URL } from 'node:url'
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { SECURITY_HEADERS } from './src/app/securityHeaders'

/*
 * Заголовки безопасности живут в src/app/securityHeaders.ts. Для боевых
 * хостингов они продублированы в netlify.toml, vercel.json и
 * public/_headers (копии сверяет тест), а здесь — чтобы локальное превью
 * вело себя так же и нарушения находились до выкладки.
 */

/**
 * В public/ лежат README и промты для картинок: они нужны в репозитории
 * рядом с файлами, которые описывают, но на сайте им делать нечего. Vite
 * копирует public/ целиком, поэтому после сборки .md убираются из выдачи.
 * Туда же .DS_Store — Finder кладёт их в папки сам, а при выкладке
 * локальной папки dist (Netlify Drop) они уезжали бы на сайт.
 */
function dropRepoFiles(): Plugin {
  let outDir = ''
  const drop = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) drop(path)
      else if (entry.name === '.DS_Store' || /\.md$/i.test(entry.name)) rmSync(path)
    }
  }
  return {
    name: 'kcal:drop-repo-files',
    apply: 'build',
    enforce: 'post',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir) },
    // writeBundle, а не closeBundle: public/ к этому моменту уже скопирован,
    // а воркер (VitePWA, closeBundle) ещё не собран и не видит лишнего
    writeBundle() { if (existsSync(outDir)) drop(outDir) },
  }
}

/**
 * Лицензии сторонних библиотек, уехавших в сборку. Часть из них (Dexie,
 * Fuse.js — Apache-2.0) требует прикладывать свой текст к каждой копии, а
 * выложенный сайт — это копия. Список берётся из графа модулей самой
 * сборки: в файл попадает ровно то, что получает человек, и при смене
 * зависимостей ничего не нужно помнить.
 */
function thirdPartyLicenses(): Plugin {
  const NOTICE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt))?$/i
  return {
    name: 'kcal:third-party-licenses',
    apply: 'build',
    generateBundle() {
      const dirs = new Set<string>()
      for (const id of this.getModuleIds()) {
        // Последний node_modules в пути — сам пакет, а не тот, кто его
        // притащил. \0 в начале — служебные обёртки над CommonJS того же пакета
        const path = id.replace(/^\0/, '').replace(/\?.*$/, '')
        const m = /^(.*[\\/]node_modules[\\/](?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/.exec(path)
        if (m) dirs.add(m[1]!)
      }
      const blocks = [...dirs]
        .map((dir) => {
          const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
            name: string, version: string, license?: string
          }
          const texts = readdirSync(dir)
            .filter((f) => NOTICE_FILE.test(f))
            .sort()
            .map((f) => readFileSync(join(dir, f), 'utf8').trim())
          return { meta, texts }
        })
        .sort((a, b) => a.meta.name.localeCompare(b.meta.name))
        .map(({ meta, texts }) => [
          `==== ${meta.name} ${meta.version} — ${meta.license ?? 'лицензия не указана'} ====`,
          texts.length ? texts.join('\n\n') : '(пакет не приложил текст лицензии)',
        ].join('\n\n'))
      const head = [
        'Дневник калорий — сторонние компоненты',
        'Third-party components shipped with this app',
        '',
        'Сам дневник распространяется на условиях файла LICENSE его автора.',
        'Компоненты ниже принадлежат своим авторам и остаются под своими лицензиями.',
      ].join('\n')
      this.emitFile({
        type: 'asset',
        fileName: 'third-party-licenses.txt',
        // BOM: хостинг может отдать .txt без charset, и кириллица поедет
        source: '\uFEFF' + [head, ...blocks].join('\n\n\n') + '\n',
      })
    },
  }
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
    dropRepoFiles(),
    thirdPartyLicenses(),
    VitePWA({
      registerType: 'prompt',
      // Регистрирует сам useAppUpdate (src/app/swUpdate.ts) — иначе
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
        description: 'Личный дневник питания. Работает без интернета, дневник хранится только на устройстве.',
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
        // .txt — лицензии сторонних библиотек: ссылка на них есть в профиле,
        // и офлайн она не должна вести в никуда
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,json,webp,txt}'],
        // Снимки упражнений в предкэш не попадают: их почти семьдесят, и
        // при установке они утроили бы вес приложения ради картинок, до
        // которых большинство не дойдёт. Они кэшируются по факту открытия.
        // sw-*.js подключаются в сам воркер (importScripts ниже), и браузер
        // хранит их вместе с ним — в предкэше они лишние.
        // og.jpg — картинка превью ссылки: её читают боты мессенджеров,
        // приложению она не нужна, и в установке она лишний вес
        globIgnores: ['**/images/gym/ex/**', 'sw-*.js', 'og.jpg'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: '/index.html',
        // Переход по ссылке на файл — тоже навигация, и без исключения
        // воркер отвечал бы на неё страницей приложения вместо текста
        navigateFallbackDenylist: [/\.txt$/],
        // Нажатие на напоминание открывает дневник. generateSW своих
        // обработчиков уведомлений не пишет, а без notificationclick
        // нажатие на уведомление из воркера ничего не делало.
        importScripts: ['sw-notifications.js'],
        // Open Food Facts — единственный внешний адрес. Только сеть, без кэша:
        // офлайн-ветка живёт в коде и читает локальную базу.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/world\.openfoodfacts\.org\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            // Снимок упражнения: один раз посмотрели — дальше доступен офлайн.
            // StaleWhileRevalidate, а не CacheFirst: адрес снимка постоянный,
            // и перегенерированный файл под тем же именем CacheFirst не
            // показал бы до полугода. Здесь из кэша отдаётся сразу, а свежая
            // копия подтягивается в фоне и видна со следующего открытия.
            urlPattern: /\/images\/gym\/ex\/.*\.webp$/i,
            handler: 'StaleWhileRevalidate',
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
              // приходит успешным ответом. Без фильтра эта заглушка легла бы
              // в кэш под именем снимка — а фоновое обновление вдобавок
              // затёрло бы ею настоящий кадр, если файл убрали с сервера.
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
