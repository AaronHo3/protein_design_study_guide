import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/** Last-resort screen: explains that saved data and local note drafts are safe. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface details for debugging in the browser console only.
    console.error('Study Planner crashed', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="flex min-h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="max-w-md text-sm text-muted">
          The page hit an unexpected error. Data that was already saved is safe, and unsaved note text is kept in this
          browser and will be restored when you reopen the note.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg"
        >
          Reload
        </button>
        <pre className="max-w-lg overflow-auto text-left text-[12px] text-faint">{this.state.error.message}</pre>
      </main>
    )
  }
}
