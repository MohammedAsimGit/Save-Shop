import type { ThemeColors } from './index';
import { useAppTheme } from './ThemeProvider';

/**
 * Builds a StyleSheet from the active palette.
 *
 * StyleSheet.create cannot read React context, so each component passes a small
 * factory. Recomputing on render is cheap and guarantees a theme switch takes
 * effect immediately, without a global cache to invalidate.
 */
export function useStyles<T>(factory: (colors: ThemeColors) => T): T {
  const { colors } = useAppTheme();
  return factory(colors);
}
