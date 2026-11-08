import { PackageSearch } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { CanonicalProduct } from '@smart-shopping/shared';

import { Badge } from './Badge';

/**
 * A canonical product the search page knows about but has no sample price for.
 *
 * This happens for catalogue records that did not come from the demo catalogue. It
 * must not borrow a price from a similar product, so it says plainly that no price
 * has been stored yet.
 */
export function CatalogueOnlyCard({ product }: { readonly product: CanonicalProduct }) {
  return (
    <article className="relative flex h-full flex-col gap-2 rounded-card border border-line bg-surface p-4 shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <Badge tone="outline">Catalogue</Badge>
        {product.isSample && <Badge tone="neutral">Demo</Badge>}
      </div>

      <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-subtle uppercase">
        {product.brand}
      </p>

      <h3 className="line-clamp-2 text-[15px] leading-snug font-semibold text-ink">
        <Link to={`/product/${product.id}`} className="after:absolute after:inset-0">
          {product.name}
        </Link>
      </h3>

      <p className="text-xs text-ink-muted capitalize">{product.category}</p>

      <p className="mt-auto flex items-center gap-1.5 pt-2 text-xs text-ink-subtle">
        <PackageSearch aria-hidden="true" className="size-3.5" />
        No stored sample price yet
      </p>
    </article>
  );
}
