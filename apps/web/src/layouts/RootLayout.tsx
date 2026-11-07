import { Moon, ShoppingBag, Sun, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { BottomNavigation } from '../components/ui/BottomNavigation';
import { buttonStyles } from '../components/ui/buttonStyles';
import { DesktopNavigation } from '../components/ui/DesktopNavigation';
import { IconButton } from '../components/ui/IconButton';
import { SearchBar } from '../components/ui/SearchBar';
import { useTheme } from '../theme/themeContext';

/**
 * Application shell.
 *
 * One header serves every route: brand, desktop navigation, a header search that
 * hands the query to the results page, the theme switch and the account entry
 * point. Below `md` the navigation moves to the sticky bottom bar.
 */
export function RootLayout() {
  const { resolved, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [headerQuery, setHeaderQuery] = useState('');

  // Keep the header field in step with a query typed on the results page.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setHeaderQuery(location.pathname === '/search' ? (params.get('q') ?? '') : '');
  }, [location.pathname, location.search]);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:shadow-card"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-line/80 bg-background/85 backdrop-blur-lg">
        <div className="mx-auto flex h-16 w-full max-w-[1180px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="grid size-9 place-items-center rounded-xl bg-brand text-on-brand shadow-soft"
            >
              <ShoppingBag className="size-4.5" strokeWidth={2.2} />
            </span>
            <span className="text-[15px] font-bold tracking-tight">
              Save<span className="text-brand-dark dark:text-brand">Shop</span>
            </span>
          </Link>

          <div className="mx-2 hidden flex-1 justify-center lg:flex">
            <SearchBar
              id="header-search"
              ariaLabel="Header product search"
              size="compact"
              value={headerQuery}
              onValueChange={setHeaderQuery}
              onSubmit={(value) =>
                navigate(value ? `/search?q=${encodeURIComponent(value)}` : '/search')
              }
              placeholder="Search products across marketplaces"
              className="max-w-md"
            />
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <DesktopNavigation />
            <IconButton
              label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              variant="ghost"
              onClick={toggle}
            >
              {resolved === 'dark' ? (
                <Sun aria-hidden="true" className="size-4.5" />
              ) : (
                <Moon aria-hidden="true" className="size-4.5" />
              )}
            </IconButton>
            <Link
              to="/signin"
              className={buttonStyles({
                variant: 'secondary',
                size: 'sm',
                className: 'hidden sm:inline-flex',
              })}
            >
              <User aria-hidden="true" className="size-4" />
              Sign in
            </Link>
            <Link
              to="/profile"
              aria-label="Your profile"
              className="grid size-9 place-items-center rounded-full bg-surface-muted text-ink-muted sm:hidden"
            >
              <User aria-hidden="true" className="size-4.5" />
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1 pb-24 md:pb-0">
        <Outlet />
      </main>

      <footer className="mt-8 hidden border-t border-line bg-background-alt/60 md:block">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-2 px-6 py-8 text-xs text-ink-muted lg:px-8">
          <p className="font-semibold text-ink">
            SaveShop - price intelligence across marketplaces
          </p>
          <p>
            Sprint 2 preview. Prices come from the comparison API and every enabled source is
            labelled demo data; marketplace integrations, accounts, advertising and billing are not
            implemented.
          </p>
          <p className="text-ink-subtle">
            No outbound affiliate links exist yet, so deal buttons are intentionally inert.
          </p>
        </div>
      </footer>

      <BottomNavigation />
    </div>
  );
}
