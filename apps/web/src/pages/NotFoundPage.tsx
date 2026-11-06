import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';

import { buttonStyles } from '../components/ui/buttonStyles';
import { PageContainer } from '../components/ui/PageContainer';

export function NotFoundPage() {
  return (
    <PageContainer size="narrow" className="py-16">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-surface-muted text-ink-subtle">
          <Compass aria-hidden="true" className="size-6" />
        </span>
        <p className="font-mono text-sm text-ink-subtle">404</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">This page does not exist</h1>
        <p className="max-w-md text-sm text-ink-muted">
          The link may be outdated, or the product is no longer in the sample catalogue.
        </p>
        <div className="flex gap-2">
          <Link to="/" className={buttonStyles({ size: 'md' })}>
            Back home
          </Link>
          <Link to="/search" className={buttonStyles({ variant: 'secondary', size: 'md' })}>
            Compare products
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}
