import { Info, LockKeyhole, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { buttonStyles } from '../components/ui/buttonStyles';
import { PageContainer } from '../components/ui/PageContainer';

/**
 * Sign-in surface only.
 *
 * Firebase Authentication is the intended provider, but no project or credentials
 * exist, so the form is presentational: fields are labelled and the submit is
 * disabled with an explanation. No credential is captured or stored.
 */
export function SignInPage() {
  return (
    <PageContainer size="narrow" className="py-8 sm:py-12">
      <div className="mx-auto max-w-md space-y-5">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Sign in to SaveShop</h1>
          <p className="text-sm text-ink-muted">
            Accounts keep your wishlist and price alerts in sync across web and mobile.
          </p>
          <Badge tone="warning">Authentication not implemented</Badge>
        </div>

        <form
          className="space-y-4 rounded-card border border-line bg-surface p-5 shadow-soft sm:p-6"
          onSubmit={(event) => event.preventDefault()}
          aria-describedby="auth-note"
        >
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-ink">
              Email
            </label>
            <div className="flex h-11 items-center gap-2 rounded-full border border-line bg-background-alt px-4 focus-within:ring-2 focus-within:ring-brand/30">
              <Mail aria-hidden="true" className="size-4 text-ink-subtle" />
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                disabled
                className="h-full w-full bg-transparent text-sm text-ink placeholder:text-ink-subtle focus:outline-none disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-sm font-medium text-ink">
              Password
            </label>
            <div className="flex h-11 items-center gap-2 rounded-full border border-line bg-background-alt px-4">
              <LockKeyhole aria-hidden="true" className="size-4 text-ink-subtle" />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Your password"
                disabled
                className="h-full w-full bg-transparent text-sm text-ink placeholder:text-ink-subtle focus:outline-none disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <Button type="submit" block disabled>
            Sign in
          </Button>

          <button
            type="button"
            disabled
            className={buttonStyles({ variant: 'secondary', block: true })}
          >
            Continue with Google
          </button>

          <p id="auth-note" className="flex items-start gap-2 text-xs text-ink-subtle">
            <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            Sign-in is deliberately disabled: Firebase Authentication is the intended provider but
            no project or credentials exist yet, and this build captures no credentials at all.
          </p>
        </form>

        <p className="text-center text-sm text-ink-muted">
          Prefer to keep browsing?{' '}
          <Link to="/search" className="font-medium text-brand-dark underline dark:text-brand">
            Compare products without an account
          </Link>
        </p>
      </div>
    </PageContainer>
  );
}
