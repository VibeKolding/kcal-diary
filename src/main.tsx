import '@fontsource-variable/manrope'
import '@fontsource-variable/golos-text'
import './styles/tokens.css'
import './styles/base.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from './app/theme'
import { ToastProvider } from './ui/Toast'
import { Backdrop } from './app/Backdrop'
import { App } from './app/App'
import { ErrorBoundary } from './app/ErrorBoundary'
// Слушатель beforeinstallprompt должен встать до события Chrome, а оно
// приходит ещё на заставке. Модуль и так в первом чанке через профиль;
// импорт страхует на случай, если профиль когда-нибудь станет ленивым
import './features/install/useInstall'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <Backdrop />
      <ToastProvider>
        <BrowserRouter>
          {/* Последний рубеж: без него любая ошибка отрисовки вне экранов —
              заставка, панель добавления, онбординг — оставляла белый фон */}
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
)
