import { LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import type { AdminProfile } from '@smart-shopping/shared';

import { adminLogin } from '../../services/admin.service';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

/**
 * Administrator sign-in.
 *
 * The gate is presentation only: the API re-verifies the token and reloads the
 * stored role on every request, so hiding or revealing this form cannot grant
 * catalogue privileges.
 */
export function AdminLoginForm({
  onSignedIn,
  reason,
}: {
  readonly onSignedIn: (profile: AdminProfile) => void;
  readonly reason?: string;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const session = await adminLogin({ email, password });
      setPassword('');
      onSignedIn(session.admin);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="space-y-2 text-center">
        <Badge tone="brand" icon={<ShieldCheck aria-hidden="true" className="size-3" />}>
          Staff only
        </Badge>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Catalogue administration</h1>
        <p className="text-sm text-ink-muted">
          Review unresolved product identity matches, accept or reject candidates, and keep an
          auditable record of every decision.
        </p>
      </div>

      {reason && (
        <p
          role="status"
          className="rounded-tile border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
        >
          {reason}
        </p>
      )}

      <form
        className="space-y-4 rounded-card border border-line bg-surface p-5 shadow-soft sm:p-6"
        onSubmit={(event) => void handleSubmit(event)}
        aria-describedby="admin-auth-note"
      >
        <div className="space-y-1.5">
          <label htmlFor="admin-email" className="block text-sm font-medium text-ink">
            Administrator email
          </label>
          <div className="flex h-11 items-center gap-2 rounded-full border border-line bg-background-alt px-4 focus-within:ring-2 focus-within:ring-brand/30">
            <Mail aria-hidden="true" className="size-4 text-ink-subtle" />
            <input
              id="admin-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ops@example.com"
              className="h-full w-full bg-transparent text-sm text-ink placeholder:text-ink-subtle focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="admin-password" className="block text-sm font-medium text-ink">
            Password
          </label>
          <div className="flex h-11 items-center gap-2 rounded-full border border-line bg-background-alt px-4 focus-within:ring-2 focus-within:ring-brand/30">
            <LockKeyhole aria-hidden="true" className="size-4 text-ink-subtle" />
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your password"
              className="h-full w-full bg-transparent text-sm text-ink placeholder:text-ink-subtle focus:outline-none"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}

        <Button type="submit" block disabled={submitting || email === '' || password === ''}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>

        <p id="admin-auth-note" className="text-xs text-ink-subtle">
          Accounts are created only by the deployment operator with the provisioning CLI. Sign-in
          requires an administrator account stored on the server; there is no client-side role check
          that can be bypassed to gain access.
        </p>
      </form>
    </div>
  );
}
