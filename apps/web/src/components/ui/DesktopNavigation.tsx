import { NavLink } from 'react-router-dom';

/** Desktop header navigation. Mirrors the mobile bottom bar exactly. */
const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/search', label: 'Compare', end: false },
  { to: '/tracking', label: 'Tracking', end: false },
  { to: '/premium', label: 'Premium', end: false },
  { to: '/profile', label: 'Profile', end: false },
] as const;

export function DesktopNavigation() {
  return (
    <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
      {links.map(({ to, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-brand-soft text-brand-dark dark:text-brand'
                : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
            }`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
