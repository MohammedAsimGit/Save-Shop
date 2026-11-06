import { Bell, House, Search, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';

/**
 * Mobile bottom navigation.
 *
 * Only rendered below the `md` breakpoint; the desktop header carries the same
 * destinations in <DesktopNavigation>. Icons are paired with labels so the bar is
 * usable without icon literacy.
 */
const items = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/search', label: 'Search', icon: Search, end: false },
  { to: '/tracking', label: 'Tracking', icon: Bell, end: false },
  { to: '/profile', label: 'Profile', icon: User, end: false },
] as const;

export function BottomNavigation() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-2 pb-safe">
        {items.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                  isActive ? 'text-brand-dark dark:text-brand' : 'text-ink-subtle hover:text-ink'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${
                      isActive ? 'bg-brand-soft' : ''
                    }`}
                  >
                    <Icon
                      aria-hidden="true"
                      className="size-5"
                      strokeWidth={isActive ? 2.4 : 1.9}
                    />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
