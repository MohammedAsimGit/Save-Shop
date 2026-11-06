import { Check, Info, Sparkles, X } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge } from '../components/ui/Badge';
import { buttonStyles } from '../components/ui/buttonStyles';
import { PageContainer } from '../components/ui/PageContainer';

/**
 * Premium marketing surface.
 *
 * The business model is decided (subscription removes ads) but the price, the
 * entitlements and the billing provider are not, so nothing here is a working
 * purchase flow: the CTA is disabled and the copy says why.
 */
export function PremiumPage() {
  const included = [
    'No sponsored placements in search results',
    'Price history beyond the free window',
    'Unlimited tracked products',
    'Priority alerts when a target price is hit',
  ];

  const free = [
    'Compare prices across marketplaces',
    'Basic price history',
    'Up to 5 tracked products',
  ];

  return (
    <PageContainer className="space-y-6 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl space-y-3 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-brand-dark uppercase dark:text-brand">
          <Sparkles aria-hidden="true" className="size-3.5" />
          Premium
        </span>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Comparison without the adverts
        </h1>
        <p className="text-[15px] text-ink-muted">
          SaveShop stays free because search results can carry clearly labelled sponsored
          placements. Premium removes them and deepens price history.
        </p>
      </div>

      <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
        <section className="rounded-card border border-line bg-surface p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Free</h2>
            <Badge tone="neutral">Current plan</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-muted">Everything you need to compare today.</p>
          <ul className="mt-4 space-y-2">
            {free.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-ink-muted">
                <Check
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-brand-dark dark:text-brand"
                />
                {item}
              </li>
            ))}
            <li className="flex items-start gap-2 text-sm text-ink-subtle">
              <X aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              Sponsored placements can appear in results
            </li>
          </ul>
        </section>

        <section className="relative overflow-hidden rounded-card border border-brand/40 bg-surface p-6 shadow-card">
          <div className="absolute inset-x-0 top-0 h-1 bg-brand" />
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Premium</h2>
            <Badge tone="brand">Planned</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-muted">Ad-free comparison with deeper history.</p>

          <p className="mt-4 text-3xl font-bold tracking-tight">Pricing to be announced</p>
          <p className="text-xs text-ink-subtle">No price has been set, so none is shown.</p>

          <ul className="mt-4 space-y-2">
            {included.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-ink">
                <Check
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-brand-dark dark:text-brand"
                />
                {item}
              </li>
            ))}
          </ul>

          <button
            type="button"
            disabled
            className={buttonStyles({ block: true, className: 'mt-5' })}
          >
            Billing not implemented
          </button>
        </section>
      </div>

      <div className="mx-auto flex max-w-2xl items-start gap-2 rounded-card border border-dashed border-line-strong/70 bg-surface-muted/60 p-4 text-sm text-ink-muted">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p>
          This page is a product surface, not a checkout. Entitlements, pricing and the payment
          provider are undecided, and no subscription can be purchased today. Sponsored placements
          are also not implemented, so nothing on this site is currently an advertisement.{' '}
          <Link to="/search" className="font-medium text-brand-dark underline dark:text-brand">
            Compare products
          </Link>
          .
        </p>
      </div>
    </PageContainer>
  );
}
