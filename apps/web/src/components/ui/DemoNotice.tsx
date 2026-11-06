import { FlaskConical } from 'lucide-react';

import { DEMO_DATA_NOTICE } from '../../data/demoCatalog';

/**
 * Disclosure that must accompany every surface showing catalogue data.
 *
 * The product requires that no invented price is ever mistaken for a live one, so
 * this is a component rather than a one-off paragraph: it can be dropped into a
 * page and cannot silently drift out of date.
 */
export function DemoNotice({ compact = false }: { readonly compact?: boolean }) {
  return (
    <p
      className={`flex items-start gap-2 rounded-tile border border-dashed border-line-strong/70 bg-surface-muted/70 px-3 py-2 text-xs text-ink-muted ${
        compact ? '' : 'sm:text-[13px]'
      }`}
    >
      <FlaskConical aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>{DEMO_DATA_NOTICE}</span>
    </p>
  );
}
