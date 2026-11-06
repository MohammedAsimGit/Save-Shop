import { ArrowRight, TrendingDown } from 'lucide-react';
import { Link } from 'react-router-dom';

import { buttonStyles } from './buttonStyles';

/**
 * House promotional banner (not a paid placement - advertising arrives later and
 * must be visually distinct from organic content when it does).
 *
 * Decorative shapes are pure CSS so the banner costs no image requests.
 */
export function PromotionalBanner({
  eyebrow = 'Save smarter',
  title,
  description,
  ctaLabel = 'Browse offers',
  to = '/search?sort=discount',
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly description: string;
  readonly ctaLabel?: string;
  readonly to?: string;
}) {
  return (
    <section
      aria-labelledby="promo-title"
      className="relative isolate overflow-hidden rounded-[26px] bg-gradient-to-br from-brand to-emerald-700 p-6 text-white shadow-card sm:p-8 dark:from-green-700 dark:to-emerald-900"
    >
      <span
        aria-hidden="true"
        className="absolute -top-16 -right-10 size-52 rounded-full bg-white/12 blur-0"
      />
      <span
        aria-hidden="true"
        className="absolute -right-24 -bottom-20 size-64 rounded-full bg-black/10"
      />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-lg space-y-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold tracking-[0.12em] uppercase">
            <TrendingDown aria-hidden="true" className="size-3.5" />
            {eyebrow}
          </span>
          <h2
            id="promo-title"
            className="text-2xl leading-tight font-bold tracking-tight sm:text-3xl"
          >
            {title}
          </h2>
          <p className="text-sm text-white/85 sm:text-[15px]">{description}</p>
        </div>

        <Link
          to={to}
          className={buttonStyles({
            variant: 'secondary',
            size: 'lg',
            className: 'shrink-0 border-transparent bg-white text-emerald-900 hover:bg-white/90',
          })}
        >
          {ctaLabel}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </section>
  );
}
