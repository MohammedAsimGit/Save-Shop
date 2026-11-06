/**
 * Skeletons that mirror real card geometry, so the layout does not jump when
 * content arrives. `aria-busy` lives on the container that owns the region.
 */
export function SkeletonBlock({ className = '' }: { readonly className?: string }) {
  return (
    <div aria-hidden="true" className={`animate-pulse rounded-xl bg-surface-muted ${className}`} />
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <SkeletonBlock className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-2 p-4">
        <SkeletonBlock className="h-3 w-16" />
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonBlock className="h-4 w-2/3" />
        <SkeletonBlock className="h-6 w-24" />
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 4 }: { readonly count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <ProductCardSkeleton key={index} />
      ))}
    </div>
  );
}
