/*
 * Тема ставится до первой отрисовки, иначе при запуске мигает чужим цветом:
 * атрибут в index.html один на всех, а выбор у каждого свой.
 *
 * Отдельным файлом, а не встроенным скриптом: CSP запрещает inline, и
 * ослаблять её ради трёх строк неразумно. Файл крошечный, лежит в предкэше
 * и выполняется синхронно до разбора тела страницы.
 *
 * По умолчанию светлая. Системная тема намеренно не спрашивается: у первого
 * запуска должно быть одно, предсказуемое лицо, а переключатель — в профиле.
 */
(function () {
  var t = 'light'
  try {
    var saved = localStorage.getItem('kcal-theme')
    if (saved === 'dark' || saved === 'light') t = saved
  } catch (e) { /* приватный режим запрещает хранилище */ }
  document.documentElement.dataset.theme = t
  var meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', t === 'dark' ? '#0B0B0C' : '#EAE6F6')
})()
