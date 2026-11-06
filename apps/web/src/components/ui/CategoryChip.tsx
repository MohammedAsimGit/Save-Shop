import { Link } from 'react-router-dom';

import type { Category } from '../../data/demoCatalog';
import { resolveIcon } from './icons';

/** Icon tile for a category: tinted, rounded, no imagery dependency. */
export function CategoryIcon({
  category,
  active = false,
  size = 'md',
}: {
  readonly category: Category;
  readonly active?: boolean;
  readonly size?: 'sm' | 'md';
}) {
  const Icon = resolveIcon(category.icon);
  return (
    <span
      aria-hidden="true"
      className={`grid place-items-center rounded-full transition-colors ${
        size === 'sm' ? 'size-10' : 'size-12'
      } ${
        active
          ? 'bg-brand text-on-brand'
          : 'bg-surface-muted text-brand-dark group-hover:bg-brand-soft dark:text-brand'
      }`}
    >
      <Icon className={size === 'sm' ? 'size-4.5' : 'size-5'} strokeWidth={1.8} />
    </span>
  );
}

/** Horizontal category rail item. Links to a filtered search, never a dead end. */
export function CategoryChip({
  category,
  active = false,
}: {
  readonly category: Category;
  readonly active?: boolean;
}) {
  return (
    <Link
      to={`/search?category=${category.id}`}
      aria-current={active ? 'page' : undefined}
      className={`group flex min-w-[76px] flex-col items-center gap-2 rounded-tile px-2 py-2 text-center transition-colors ${
        active ? 'bg-brand-soft' : 'hover:bg-surface-muted'
      }`}
    >
      <CategoryIcon category={category} active={active} />
      <span
        className={`text-xs font-medium ${active ? 'text-brand-dark dark:text-brand' : 'text-ink-muted'}`}
      >
        {category.label}
      </span>
    </Link>
  );
}
