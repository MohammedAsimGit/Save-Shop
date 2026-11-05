import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

/**
 * Catches render-time errors so a broken component cannot leave the user with a
 * blank page. Route-level load failures are handled by the router's errorElement.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Sprint 0 has no error-reporting service; log locally so the failure is not silent.
    console.error('Unhandled UI error', error, info.componentStack);
  }

  private readonly handleReload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    const { error } = this.state;

    if (!error) return this.props.children;

    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-6">
        <h1 className="text-2xl font-bold text-ink">Something went wrong</h1>
        <p className="text-ink-muted">
          The interface hit an unexpected error. Reloading usually fixes it.
        </p>
        <pre className="overflow-x-auto rounded-card border border-border-subtle bg-surface p-4 text-xs text-ink-muted">
          {error.message}
        </pre>
        <button
          type="button"
          onClick={this.handleReload}
          className="self-start rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-soft"
        >
          Reload page
        </button>
      </main>
    );
  }
}
