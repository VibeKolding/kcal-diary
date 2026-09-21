import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Crash } from './Crash'

interface Props {
  children: ReactNode
  /** Смена ключа снимает ошибку: например, переход на другой экран */
  resetKey?: unknown
  /** Что показать вместо упавшего. По умолчанию — экран Crash */
  fallback?: (error: unknown) => ReactNode
}

interface State { error: unknown; failed: boolean; componentStack: string | null }

/**
 * Без этого любая ошибка отрисовки — битая запись из восстановленной
 * копии, недогруженный ленивый чанк после выкладки — размонтировала всё
 * дерево React: пропадал даже таб-бар, оставался пустой фон. В
 * установленном приложении без адресной строки выхода не было вовсе.
 *
 * Классом, потому что ловить ошибки отрисовки умеют только классы.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, failed: false, componentStack: null }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error, failed: true }
  }

  override componentDidCatch(_error: unknown, info: ErrorInfo): void {
    // Саму ошибку React пишет в консоль сам, и в сборке тоже. Добавляем
    // место в дереве: в сборке без него не понять, какой экран упал.
    // На экран идёт объяснение по-русски (errors.ts).
    console.error('Место ошибки в дереве:', info.componentStack)
    // И на экран — в коде ошибки: консоль телефона человек не пришлёт
    this.setState({ componentStack: info.componentStack ?? null })
  }

  override componentDidUpdate(prev: Props): void {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null, failed: false, componentStack: null })
    }
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children
    const { fallback } = this.props
    const { error, componentStack } = this.state
    return fallback ? fallback(error) : <Crash error={error} componentStack={componentStack} />
  }
}
