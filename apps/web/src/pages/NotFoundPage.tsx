import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-sm text-ink-muted">404</p>
      <h1 className="text-2xl font-bold">This page does not exist</h1>
      <p className="text-ink-muted">
        The link may be outdated. Only the foundation pages exist during Sprint 0.
      </p>
      <Link
        to="/"
        className="self-start rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-soft"
      >
        Back to overview
      </Link>
    </div>
  );
}
