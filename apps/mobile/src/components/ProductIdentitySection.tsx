import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useProductIdentity } from '../hooks/useProductIdentity';
import { fontSizes, radii, spacing, type ThemeColors } from '../theme';
import { useAppTheme } from '../theme/ThemeProvider';

/**
 * Canonical product identity on the mobile product screen.
 *
 * The catalogue - not the marketplace listing - decides what the product is. This
 * block reports the identity and how many marketplace listings were accepted as the
 * same item; unresolved listings are described as unresolved, never as compared.
 */
export function ProductIdentitySection({ productId }: { readonly productId: string }) {
  const { colors } = useAppTheme();
  const styles = buildStyles(colors);
  const { state } = useProductIdentity(productId);

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Product identity</Text>

      {state.status === 'loading' && (
        <View style={styles.row}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.body}>Loading catalogue identity…</Text>
        </View>
      )}

      {state.status === 'error' && (
        <Text style={styles.body}>
          Identity is unavailable right now
          {state.isNetworkError ? ' (the API is unreachable)' : ''}. The comparison above is
          unaffected.
        </Text>
      )}

      {state.status === 'ready' && (
        <>
          <Text style={styles.brand}>
            {state.identity.product.brand} · {state.identity.product.category}
            {state.identity.product.isSample ? ' · demo record' : ''}
          </Text>

          <Text style={styles.body}>
            Catalogue id: {state.identity.product.id}
            {'\n'}
            {state.identity.product.gtin
              ? `GTIN ${state.identity.product.gtin}`
              : state.identity.product.mpn
                ? `MPN ${state.identity.product.mpn}`
                : state.identity.product.model
                  ? `Model ${state.identity.product.model}`
                  : 'No GTIN, MPN or model recorded'}
          </Text>

          <Text style={styles.meta}>
            {state.identity.listingSummary.resolved} resolved listing(s) ·{' '}
            {state.identity.listingSummary.unresolved} unresolved
          </Text>

          {state.identity.listingSummary.unresolved > 0 && (
            <Text style={styles.body}>
              Unresolved listings are not compared until a human reviews the match.
            </Text>
          )}

          <Text style={styles.meta}>
            Match confidence is a deterministic strength score from documented rules, not a
            probability.
          </Text>
        </>
      )}
    </View>
  );
}

const buildStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      gap: spacing.sm,
      padding: spacing.lg,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    heading: { fontSize: fontSizes.md, fontWeight: '700', color: colors.text },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    brand: {
      fontSize: fontSizes.xs,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    body: { fontSize: fontSizes.sm, color: colors.textMuted, lineHeight: 20 },
    meta: { fontSize: fontSizes.xs, color: colors.textSubtle },
  });
