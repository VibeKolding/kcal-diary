import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Crash } from './Crash'

interface Props {
  children: ReactNode
  /** Смена ключа снимает ошибку: например, переход на другой экран */
  resetKey?: unknown
  /** Что показать вместо упавшего. По умолчанию — экран Crash */
  fallback?: (error: unknown) => ReactNode
}

interface State { error: unknown; failed: boolean }

/**
 * Без этого любая ошибка отрисовки — битая запись из восстановленной
 * копии, недогруженный ленивый чанк после выкладки — размонтировала всё
 * дерево React: пропадал даже таб-бар, оставался пустой фон. В
 * установленном приложении без адресной строки выхода не было вовсе.
 *
 * Классом, потому что ловить ошибки отрисовки умеют только классы.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, failed: false }

  static getDerivedStateFromError(error: unknown): State {
    return { error, failed: true }
  }

  override componentDidCatch(_error: unknown, info: ErrorInfo): void {
    // Саму ошибку React пишет в консоль сам, и в сборке тоже. Добавляем
    // место в дереве: в сборке без него не понять, какой экран упал.
    // На экран идёт объяснение по-русски (errors.ts).
    console.error('Место ошибки в дереве:', info.componentStack)
  }

  override componentDidUpdate(prev: Props): void {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null, failed: false })
    }
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children
    const { fallback } = this.props
    return fallback ? fallback(this.state.error) : <Crash error={this.state.error} />
  }
}
