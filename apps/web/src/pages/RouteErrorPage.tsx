import { AlertTriangle } from 'lucide-react';
import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom';

import { buttonStyles } from '../components/ui/buttonStyles';
import { PageContainer } from '../components/ui/PageContainer';

/** Router-level failure surface: a bad route or a render error inside a route. */
export function RouteErrorPage() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unexpected routing error';

  return (
    <PageContainer size="narrow" className="py-16">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-danger/10 text-danger">
          <AlertTriangle aria-hidden="true" className="size-6" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">This page could not be displayed</h1>
        <p className="max-w-md text-sm text-ink-muted">
          Something failed while rendering this route. Reloading usually helps.
        </p>
        <pre className="max-w-full overflow-x-auto rounded-tile border border-line bg-surface p-3 text-xs text-ink-subtle">
          {message}
        </pre>
        <Link to="/" className={buttonStyles({ size: 'md' })}>
          Back home
        </Link>
      </div>
    </PageContainer>
  );
}
