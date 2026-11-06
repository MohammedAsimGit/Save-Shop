import { Bell, CreditCard, Monitor, Moon, ShieldCheck, Sun, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge } from '../components/ui/Badge';
import { buttonStyles } from '../components/ui/buttonStyles';
import { PageContainer } from '../components/ui/PageContainer';
import { useTheme, type ThemePreference } from '../theme/themeContext';

const appearanceOptions: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

/**
 * Profile screen.
 *
 * No account exists in this build, so the page is explicit about being signed
 * out. Theme preference is real and persists; subscriptions and notifications are
 * shown as disabled rows rather than fake toggles.
 */
export function ProfilePage() {
  const { preference, setPreference } = useTheme();

  return (
    <PageContainer size="narrow" className="space-y-5 py-6 sm:py-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Profile</h1>

      <section className="flex items-center gap-4 rounded-card border border-line bg-surface p-5 shadow-soft">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-surface-muted text-ink-subtle">
          <UserRound aria-hidden="true" className="size-7" strokeWidth={1.7} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-base font-semibold text-ink">Guest</p>
            <Badge tone="neutral">Not signed in</Badge>
          </div>
          <p className="mt-0.5 text-sm text-ink-muted">
            Sign in to keep a wishlist and price alerts in sync across devices.
          </p>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link to="/signin" className={buttonStyles({ size: 'md' })}>
          Sign in
        </Link>
        <Link to="/premium" className={buttonStyles({ variant: 'secondary', size: 'md' })}>
          View premium
        </Link>
      </div>

      <section
        aria-labelledby="appearance-heading"
        className="rounded-card border border-line bg-surface p-5"
      >
        <h2 id="appearance-heading" className="text-sm font-semibold text-ink">
          Appearance
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Applies to this browser immediately and is remembered next time.
        </p>
        <div
          role="group"
          aria-labelledby="appearance-heading"
          className="mt-3 grid grid-cols-3 gap-2 rounded-full bg-surface-muted p-1"
        >
          {appearanceOptions.map(({ value, label, icon: Icon }) => {
            const active = preference === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => setPreference(value)}
                className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                  active ? 'bg-surface text-ink shadow-soft' : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Icon aria-hidden="true" className="size-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      </section>

      <section
        aria-labelledby="account-heading"
        className="overflow-hidden rounded-card border border-line bg-surface"
      >
        <h2 id="account-heading" className="px-5 pt-4 text-sm font-semibold text-ink">
          Account
        </h2>
        <ul className="mt-2 divide-y divide-line">
          {[
            {
              icon: CreditCard,
              title: 'Subscription',
              detail: 'Free plan',
              note: 'Billing is not implemented',
            },
            {
              icon: Bell,
              title: 'Notifications',
              detail: 'Off',
              note: 'Delivery channel undecided',
            },
            {
              icon: ShieldCheck,
              title: 'Privacy',
              detail: 'No personal data stored',
              note: 'No account, no tracking cookies',
            },
          ].map(({ icon: Icon, title, detail, note }) => (
            <li key={title} className="flex items-center gap-3 px-5 py-3.5">
              <Icon aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{title}</p>
                <p className="text-xs text-ink-subtle">{note}</p>
              </div>
              <span className="text-xs font-medium text-ink-muted">{detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <button
        type="button"
        disabled
        title="There is no session to end in this build"
        className={buttonStyles({ variant: 'secondary', block: true })}
      >
        Sign out
      </button>
    </PageContainer>
  );
}
