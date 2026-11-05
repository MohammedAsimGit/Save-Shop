import { Link, Outlet } from 'react-router-dom';

/** Application shell: header, routed content, footer. */
export function RootLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border-subtle bg-surface/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span
              aria-hidden="true"
              className="grid size-8 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-soft"
            >
              SS
            </span>
            <span>Smart Shopping</span>
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-4 text-sm text-ink-muted">
            <Link to="/" className="hover:text-ink">
              Overview
            </Link>
            <span
              aria-disabled="true"
              title="Product search arrives in Sprint 1"
              className="cursor-not-allowed opacity-50"
            >
              Search
            </span>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <Outlet />
      </main>

      <footer className="border-t border-border-subtle px-4 py-6 text-xs text-ink-muted sm:px-6">
        <div className="mx-auto w-full max-w-5xl">
          Sprint 0 - project foundation. No marketplace data, prices or accounts are implemented.
        </div>
      </footer>
    </div>
  );
}
