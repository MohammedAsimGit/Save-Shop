import { StatusBadge, type StatusTone } from '../components/StatusBadge';
import { useApiHealth, type ApiHealthState } from '../hooks/useApiHealth';
import { webEnv } from '../lib/env';

/**
 * Sprint 0 placeholder.
 *
 * It deliberately shows no products or prices: there is no marketplace
 * integration yet, and fabricated data here would misrepresent the project.
 * The API status card performs a real request so the web <-> API wiring is
 * verifiable in the browser.
 */
export function HomePage() {
  const { state, retry } = useApiHealth();

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <StatusBadge tone="ok" label="Sprint 0 - foundation" />
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          The platform skeleton is running
        </h1>
        <p className="max-w-2xl text-ink-muted">
          This shell exists to prove the foundation: React + TypeScript + Vite + Tailwind on the
          web, an Express API in front of MongoDB, and shared TypeScript contracts between them.
          Product search and price comparison belong to later sprints.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-card border border-border-subtle bg-surface p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Backend API</h2>
            <StatusBadge tone={stateTone(state)} label={stateLabel(state)} />
          </div>

          <p className="mb-3 text-sm text-ink-muted">{stateDescription(state)}</p>

          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Base URL</dt>
              <dd className="truncate font-mono text-xs">{webEnv.apiBaseUrl}</dd>
            </div>

            {state.status === 'ready' && (
              <>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">Service version</dt>
                  <dd className="font-mono text-xs">{state.health.version}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">Database</dt>
                  <dd className="font-mono text-xs">
                    {state.health.checks.database.status}
                    {state.health.checks.database.latencyMs !== undefined
                      ? ` (${state.health.checks.database.latencyMs} ms)`
                      : ''}
                  </dd>
                </div>
              </>
            )}
          </dl>

          {state.status === 'error' && (
            <div className="mt-3 rounded-lg bg-status-error/5 p-3 text-sm text-status-error">
              <p>{state.message}</p>
              {state.isNetworkError && (
                <p className="mt-1 text-ink-muted">
                  Start the API with <code className="font-mono">npm run dev:api</code> from the
                  repository root.
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={retry}
            className="mt-4 rounded-full border border-border-subtle px-4 py-1.5 text-sm font-medium hover:bg-surface-muted"
          >
            Re-check
          </button>
        </article>

        <article className="rounded-card border border-border-subtle bg-surface p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">What is intentionally absent</h2>
          <ul className="space-y-2 text-sm text-ink-muted">
            <li>No marketplace integrations, and no marketplace credentials exist.</li>
            <li>No product catalogue, listings or price history.</li>
            <li>No accounts, subscriptions, ads or affiliate tracking.</li>
            <li>No prices are fabricated anywhere in this build.</li>
          </ul>
        </article>
      </section>

      <section className="rounded-card border border-border-subtle bg-brand-soft p-5">
        <h2 className="mb-1 text-lg font-semibold">Next up - Sprint 1</h2>
        <p className="text-sm text-ink-muted">
          Product search and comparison will be built against authorised data sources only. See{' '}
          <code className="font-mono text-xs">docs/MARKETPLACE_INTEGRATIONS.md</code> for the
          integration prerequisites that must be resolved first.
        </p>
      </section>
    </div>
  );
}

function stateTone(state: ApiHealthState): StatusTone {
  if (state.status === 'loading') return 'neutral';
  if (state.status === 'error') return 'error';
  return state.health.status === 'ok' ? 'ok' : 'warn';
}

function stateLabel(state: ApiHealthState): string {
  if (state.status === 'loading') return 'Checking...';
  if (state.status === 'error') return 'Unreachable';
  // "degraded" means the API is serving but a configured dependency is not reachable.
  return state.health.status === 'ok' ? 'Healthy' : 'Degraded';
}

function stateDescription(state: ApiHealthState): string {
  if (state.status === 'loading') return 'Calling the health endpoint...';
  if (state.status === 'error') return 'The web app could not read API health.';
  if (state.health.status === 'ok') {
    return 'The health endpoint answered and its payload matched the shared contract.';
  }
  return 'The API is serving, but it reported a dependency problem. See the database column.';
}
