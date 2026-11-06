import { ArrowRight, BadgeCheck, BellRing, Layers, Sparkles, TrendingDown } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { CategoryChip } from '../components/ui/CategoryChip';
import { DemoNotice } from '../components/ui/DemoNotice';
import { MarketplaceCard } from '../components/ui/MarketplaceCard';
import { PageContainer } from '../components/ui/PageContainer';
import { ProductCard } from '../components/ui/ProductCard';
import { PromotionalBanner } from '../components/ui/PromotionalBanner';
import { SearchBar } from '../components/ui/SearchBar';
import { SectionHeader } from '../components/ui/SectionHeader';
import { buttonStyles } from '../components/ui/buttonStyles';
import {
  categories,
  demoProducts,
  lowestOffer,
  marketplaces,
  rankedOffers,
} from '../data/demoCatalog';
import { formatMoney } from '../lib/format';

const trending = ['Headphones', 'iPhone', 'Running shoes', 'Smartwatch'];

/**
 * Landing page: search first, then discovery rails, then proof of how the
 * product works. All catalogue content is demo data and labelled as such.
 */
export function HomePage() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const featured = [...demoProducts]
    .sort((a, b) =>
      (lowestOffer(a)?.discountPercent ?? 0) < (lowestOffer(b)?.discountPercent ?? 0) ? 1 : -1,
    )
    .slice(0, 4);

  return (
    <div className="pb-10">
      <div className="bg-grid">
        <PageContainer className="py-8 sm:py-12 lg:py-16">
          <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-10">
            <div className="space-y-5 lg:col-span-7">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-brand-dark uppercase dark:text-brand">
                <Sparkles aria-hidden="true" className="size-3.5" />
                One product, every marketplace
              </span>

              <h1 className="text-[32px] leading-[1.1] font-bold tracking-tight sm:text-4xl lg:text-5xl">
                Find the real price
                <span className="block text-brand-dark dark:text-brand">before you check out</span>
              </h1>

              <p className="max-w-xl text-[15px] text-ink-muted sm:text-base">
                Search once and see the same product side by side across marketplaces, with the
                lowest verified price highlighted and every price carrying the time it was observed.
              </p>

              <div className="max-w-xl space-y-3">
                <SearchBar
                  id="home-search"
                  value={query}
                  onValueChange={setQuery}
                  onSubmit={(value) =>
                    navigate(value ? `/search?q=${encodeURIComponent(value)}` : '/search')
                  }
                />
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-ink-subtle">Try</span>
                  {trending.map((term) => (
                    <Link
                      key={term}
                      to={`/search?q=${encodeURIComponent(term)}`}
                      className="rounded-full border border-line bg-surface px-3 py-1 font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                    >
                      {term}
                    </Link>
                  ))}
                </div>
              </div>

              <dl className="flex flex-wrap gap-x-8 gap-y-3 pt-1 text-sm">
                {[
                  {
                    icon: Layers,
                    value: `${marketplaces.length}`,
                    label: 'marketplaces in the model',
                  },
                  { icon: BadgeCheck, value: 'Verified', label: 'price source on every row' },
                  { icon: BellRing, value: 'Alerts', label: 'when a price drops' },
                ].map(({ icon: Icon, value, label }) => (
                  <div key={label} className="flex items-center gap-2">
                    <Icon aria-hidden="true" className="size-4 text-brand-dark dark:text-brand" />
                    <dt className="font-semibold text-ink">{value}</dt>
                    <dd className="text-ink-muted">{label}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="lg:col-span-5">
              <HeroComparisonPreview />
            </div>
          </div>
        </PageContainer>
      </div>

      <PageContainer className="space-y-8 pt-6 sm:space-y-10 sm:pt-8">
        <PromotionalBanner
          title="Same product, up to 30% difference"
          description="Marketplace prices drift apart constantly. SaveShop lines up the offers so the gap is obvious in a single glance."
        />

        <section aria-labelledby="categories-heading" className="space-y-3">
          <SectionHeader
            id="categories-heading"
            title="Browse categories"
            action={
              <Link
                to="/search"
                className="inline-flex items-center gap-1 text-sm font-medium text-brand-dark hover:underline dark:text-brand"
              >
                All products
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            }
          />
          <div className="no-scrollbar -mx-1 flex items-start gap-1 overflow-x-auto px-1 pb-1 sm:gap-2">
            {categories.map((category) => (
              <CategoryChip key={category.id} category={category} />
            ))}
          </div>
        </section>

        <section aria-labelledby="marketplaces-heading" className="space-y-3">
          <SectionHeader
            id="marketplaces-heading"
            title="Marketplaces"
            description="Coverage follows authorised access - a marketplace appears only once we can read its catalogue or prices legitimately."
          />
          <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
            {marketplaces.map((marketplace) => {
              const available = demoProducts.filter((product) =>
                product.offers.some(
                  (offer) => offer.marketplaceId === marketplace.id && offer.inStock,
                ),
              );
              const cheapest = available.reduce<number | null>((min, product) => {
                const price = lowestOffer(product)?.price.amountMinor;
                if (price === undefined) return min;
                return min === null || price < min ? price : min;
              }, null);

              return (
                <MarketplaceCard
                  key={marketplace.id}
                  marketplace={marketplace}
                  productCount={available.length}
                  lowestPriceLabel={
                    cheapest === null
                      ? undefined
                      : formatMoney({ amountMinor: cheapest, currency: 'INR' })
                  }
                />
              );
            })}
          </div>
        </section>

        <section aria-labelledby="offers-heading" className="space-y-3">
          <SectionHeader
            id="offers-heading"
            title="Biggest demo savings"
            description="Ordered by the gap between list price and the cheapest in-stock offer."
            action={
              <Link
                to="/search?sort=discount"
                className="inline-flex items-center gap-1 text-sm font-medium text-brand-dark hover:underline dark:text-brand"
              >
                See all
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            }
          />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          <DemoNotice />
        </section>

        <section aria-labelledby="how-heading" className="space-y-3">
          <SectionHeader
            id="how-heading"
            title="How SaveShop works"
            description="Three steps, and the last one is deliberately conservative about stale prices."
          />
          <ol className="grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: TrendingDown,
                title: '1. Search once',
                body: 'Enter a product name. Matching runs across the marketplaces we are allowed to read.',
              },
              {
                icon: Layers,
                title: '2. Compare honestly',
                body: 'Offers are ranked by price, with stock state and the time each price was observed.',
              },
              {
                icon: BellRing,
                title: '3. Act or wait',
                body: 'Follow the cheapest verified offer, or track the product and get told when it drops.',
              },
            ].map(({ icon: Icon, title, body }) => (
              <li
                key={title}
                className="rounded-card border border-line bg-surface p-5 shadow-soft"
              >
                <span className="mb-3 grid size-10 place-items-center rounded-full bg-brand-soft text-brand-dark dark:text-brand">
                  <Icon aria-hidden="true" className="size-5" strokeWidth={1.9} />
                </span>
                <h3 className="text-sm font-semibold text-ink">{title}</h3>
                <p className="mt-1 text-sm text-ink-muted">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-card border border-line bg-background-alt p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-ink">Why some things are missing</h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-muted">
            SaveShop only shows what it can verify. Until a marketplace grants API or written
            permission, its prices are absent rather than estimated - and accounts, ads and billing
            are interface-only in this sprint.
          </p>
          <Link
            to="/tracking"
            className={buttonStyles({ variant: 'secondary', size: 'sm', className: 'mt-3' })}
          >
            See system status
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </section>
      </PageContainer>
    </div>
  );
}

/**
 * Decorative "at a glance" card used beside the hero copy on large screens.
 * It previews the comparison pattern using the first demo product.
 */
function HeroComparisonPreview() {
  const product = demoProducts[0];
  if (!product) return null;

  const offers = rankedOffers(product)
    .filter((offer) => offer.inStock)
    .slice(0, 3);

  return (
    <div className="relative mx-auto max-w-sm lg:max-w-none">
      <div className="absolute -inset-3 -z-10 rounded-[32px] bg-brand/10 blur-2xl" />
      <div className="animate-rise rounded-[28px] border border-line bg-surface p-5 shadow-float">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-subtle uppercase">
              Preview
            </p>
            <p className="mt-1 line-clamp-2 text-sm font-semibold text-ink">{product.title}</p>
          </div>
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-ink-subtle uppercase">
            Demo
          </span>
        </div>

        <ul className="space-y-2">
          {offers.map((offer, index) => {
            const marketplace = marketplaces.find((entry) => entry.id === offer.marketplaceId);
            return (
              <li
                key={offer.marketplaceId}
                className={`flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5 ${
                  index === 0 ? 'bg-brand-soft' : 'bg-surface-muted/60'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="grid size-7 place-items-center rounded-lg text-[11px] font-bold text-white"
                    style={{ backgroundColor: marketplace?.accent }}
                  >
                    {marketplace?.short}
                  </span>
                  <span className="truncate text-xs font-medium text-ink">{marketplace?.name}</span>
                </span>
                <span className="flex items-center gap-2">
                  {index === 0 && (
                    <span className="rounded-full bg-brand px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-on-brand uppercase">
                      Lowest
                    </span>
                  )}
                  <span
                    className={`tabular text-sm font-bold ${
                      index === 0 ? 'text-brand-dark dark:text-brand' : 'text-ink'
                    }`}
                  >
                    {formatMoney(offer.price)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>

        <p className="mt-4 text-[11px] text-ink-subtle">
          Prices shown are invented sample values, not live marketplace data.
        </p>
      </div>
    </div>
  );
}
