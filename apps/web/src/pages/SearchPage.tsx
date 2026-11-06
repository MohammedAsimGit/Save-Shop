import { SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Badge } from '../components/ui/Badge';
import { buttonStyles } from '../components/ui/buttonStyles';
import { CategoryChip } from '../components/ui/CategoryChip';
import { DemoNotice } from '../components/ui/DemoNotice';
import { EmptyState } from '../components/ui/EmptyState';
import { PageContainer } from '../components/ui/PageContainer';
import { ProductCard } from '../components/ui/ProductCard';
import { SearchBar } from '../components/ui/SearchBar';
import {
  categories,
  filterProducts,
  marketplaces,
  searchProducts,
  sortOptions,
  type CategoryId,
  type SortKey,
} from '../data/demoCatalog';

/**
 * Results page.
 *
 * Query, category, marketplace, stock and sort all live in the URL, so filters
 * survive a reload and a link reproduces exactly what someone else saw.
 */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState(params.get('q') ?? '');

  const query = params.get('q') ?? '';
  const category = (params.get('category') as CategoryId | null) ?? 'all';
  const marketplace = params.get('marketplace') ?? 'all';
  const sort = (params.get('sort') as SortKey | null) ?? 'relevance';
  const inStockOnly = params.get('inStock') === '1';

  const results = useMemo(() => {
    const matched = searchProducts(query);
    return filterProducts(matched, { query, category, sort, inStockOnly, marketplace });
  }, [query, category, sort, inStockOnly, marketplace]);

  const update = (next: Record<string, string | null>) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === '') merged.delete(key);
      else merged.set(key, value);
    }
    setParams(merged, { replace: true });
  };

  const submitSearch = (value: string) => {
    setDraft(value);
    update({ q: value.trim() === '' ? null : value.trim() });
  };

  const activeFilters = [
    category !== 'all'
      ? { key: 'category', label: categories.find((c) => c.id === category)?.label }
      : null,
    marketplace !== 'all'
      ? { key: 'marketplace', label: marketplaces.find((m) => m.id === marketplace)?.name }
      : null,
    inStockOnly ? { key: 'inStock', label: 'In stock only' } : null,
  ].filter((entry): entry is { key: string; label: string | undefined } => entry !== null);

  return (
    <PageContainer className="space-y-5 py-6 sm:py-8">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {query ? `Results for "${query}"` : 'Compare products'}
        </h1>
        <SearchBar
          id="results-search"
          size="compact"
          value={draft}
          onValueChange={setDraft}
          onSubmit={submitSearch}
          className="max-w-2xl"
        />
      </div>

      <div className="no-scrollbar -mx-4 flex items-start gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <Link
          to="/search"
          className={`flex min-w-[76px] flex-col items-center gap-2 rounded-tile px-2 py-2 text-xs font-medium ${
            category === 'all' ? 'bg-brand-soft text-brand-dark dark:text-brand' : 'text-ink-muted'
          }`}
        >
          <span
            className={`grid size-12 place-items-center rounded-full ${
              category === 'all' ? 'bg-brand text-on-brand' : 'bg-surface-muted'
            }`}
          >
            <SlidersHorizontal aria-hidden="true" className="size-5" strokeWidth={1.8} />
          </span>
          All
        </Link>
        {categories.map((entry) => (
          <CategoryChip key={entry.id} category={entry} active={category === entry.id} />
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ink">
            {results.length} {results.length === 1 ? 'product' : 'products'}
          </span>
          <Badge tone="neutral">Sample data</Badge>
          {activeFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => update({ [filter.key]: null })}
              className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-dark dark:text-brand"
            >
              {filter.label}
              <X aria-hidden="true" className="size-3" />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={inStockOnly}
            onClick={() => update({ inStock: inStockOnly ? null : '1' })}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              inStockOnly
                ? 'border-brand bg-brand-soft text-brand-dark dark:text-brand'
                : 'border-line text-ink-muted hover:border-line-strong'
            }`}
          >
            In stock only
          </button>

          <label className="sr-only" htmlFor="sort">
            Sort results
          </label>
          <select
            id="sort"
            value={sort}
            onChange={(event) =>
              update({ sort: event.target.value === 'relevance' ? null : event.target.value })
            }
            className="h-9 rounded-full border border-line bg-background-alt px-3 text-xs font-medium text-ink focus:outline-none"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {results.length === 0 ? (
        <EmptyState
          title="No products match those filters"
          description="Nothing in the sample catalogue matches this combination. Try a different term, or clear the filters to see everything."
          action={
            <Link to="/search" className={buttonStyles({ variant: 'primary', size: 'sm' })}>
              Clear filters
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {results.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      <DemoNotice />
    </PageContainer>
  );
}
