import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

/** Rendered by the router when navigation or a route render fails. */
export function RouteErrorPage() {
  const error = useRouteError();

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unexpected routing error';

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-3 px-6">
      <h1 className="text-2xl font-bold">Navigation failed</h1>
      <p className="break-words text-ink-muted">{message}</p>
      <a
        href="/"
        className="self-start rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-soft"
      >
        Back to overview
      </a>
    </main>
  );
}
