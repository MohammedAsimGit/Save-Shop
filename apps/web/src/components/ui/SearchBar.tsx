import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

/**
 * Product search input.
 *
 * Controlled from the URL on the search page, so a shared link reproduces the
 * same query. Two visual weights: `hero` for the home screen, `compact` for the
 * results page and the desktop header.
 */
export function SearchBar({
  value,
  onValueChange,
  onSubmit,
  placeholder = 'Search products, brands or categories',
  size = 'hero',
  autoFocus = false,
  id = 'product-search',
  ariaLabel = 'Product search',
  className = '',
}: {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly onSubmit?: (value: string) => void;
  readonly placeholder?: string;
  readonly size?: 'hero' | 'compact';
  readonly autoFocus?: boolean;
  readonly id?: string;
  /** Distinguishes the header search landmark from the page search landmark. */
  readonly ariaLabel?: string;
  readonly className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit?.(value);
  };

  const hero = size === 'hero';

  return (
    <form
      role="search"
      aria-label={ariaLabel}
      onSubmit={handleSubmit}
      className={`group relative flex items-center rounded-full bg-surface transition-shadow ${
        hero ? 'h-14 px-5 shadow-card' : 'h-11 px-4 shadow-soft'
      } ${isFocused ? 'ring-2 ring-brand/40' : 'ring-1 ring-line'} ${className}`}
    >
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <Search aria-hidden="true" className="mr-3 size-5 shrink-0 text-ink-subtle" />
      <input
        ref={inputRef}
        id={id}
        type="search"
        inputMode="search"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onValueChange(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className={`h-full w-full bg-transparent text-ink placeholder:text-ink-subtle focus:outline-none ${
          hero ? 'text-[15px]' : 'text-sm'
        } [&::-webkit-search-cancel-button]:appearance-none`}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onValueChange('');
            inputRef.current?.focus();
          }}
          className="ml-2 grid size-7 shrink-0 place-items-center rounded-full text-ink-subtle hover:bg-surface-muted hover:text-ink"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </form>
  );
}
