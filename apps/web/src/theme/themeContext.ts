import { createContext, useContext } from 'react';

/**
 * Theme context and the hook that reads it.
 *
 * Kept apart from <ThemeProvider> so the provider file exports a component only
 * (React fast refresh requirement), and so consumers never import the provider
 * just to read the theme.
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeContextValue {
  readonly preference: ThemePreference;
  readonly resolved: ResolvedTheme;
  readonly setPreference: (preference: ThemePreference) => void;
  readonly toggle: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
}
