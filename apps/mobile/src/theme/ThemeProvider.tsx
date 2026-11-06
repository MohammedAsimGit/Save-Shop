import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { themes, type ThemeColors, type ThemeName } from './index';

/**
 * Theme context for the mobile app.
 *
 * `system` follows the OS appearance. There is no AsyncStorage dependency in this
 * sprint, so a manual choice lasts for the session only - stated in the UI rather
 * than hidden.
 */

export type ThemePreference = ThemeName | 'system';

interface AppThemeContextValue {
  readonly preference: ThemePreference;
  readonly name: ThemeName;
  readonly isDark: boolean;
  readonly colors: ThemeColors;
  readonly setPreference: (preference: ThemePreference) => void;
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { readonly children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>('system');

  const name: ThemeName =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo<AppThemeContextValue>(
    () => ({
      preference,
      name,
      isDark: name === 'dark',
      colors: themes[name],
      setPreference,
    }),
    [preference, name],
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme(): AppThemeContextValue {
  const value = useContext(AppThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside <AppThemeProvider>');
  return value;
}
