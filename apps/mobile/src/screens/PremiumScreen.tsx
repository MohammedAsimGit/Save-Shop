import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check, X } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '../components/Button';
import type { RootStackParamList } from '../navigation/types';
import { fontSizes, radii, spacing, type ThemeColors } from '../theme';
import { useAppTheme } from '../theme/ThemeProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'Premium'>;

const included = [
  'No sponsored placements in results',
  'Price history beyond the free window',
  'Unlimited tracked products',
];

/** Premium marketing only: no plan, price or billing provider has been decided. */
export function PremiumScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const styles = buildStyles(colors);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.intro}>
        <Text style={styles.eyebrow}>PREMIUM</Text>
        <Text style={styles.heading}>Comparison without the adverts</Text>
        <Text style={styles.lede}>
          SaveShop stays free because search results can carry clearly labelled sponsored
          placements. Premium removes them and deepens price history.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Free</Text>
          <Text style={styles.cardBadge}>CURRENT PLAN</Text>
        </View>
        <View style={styles.row}>
          <Check size={14} color={colors.primary} />
          <Text style={styles.rowText}>Compare across marketplaces</Text>
        </View>
        <View style={styles.row}>
          <Check size={14} color={colors.primary} />
          <Text style={styles.rowText}>Up to 5 tracked products</Text>
        </View>
        <View style={styles.row}>
          <X size={14} color={colors.textSubtle} />
          <Text style={styles.rowMuted}>Sponsored placements may appear</Text>
        </View>
      </View>

      <View style={[styles.card, styles.cardHighlight]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Premium</Text>
          <Text style={[styles.cardBadge, styles.cardBadgePlanned]}>PLANNED</Text>
        </View>
        <Text style={styles.price}>Pricing to be announced</Text>
        {included.map((item) => (
          <View key={item} style={styles.row}>
            <Check size={14} color={colors.primary} />
            <Text style={styles.rowText}>{item}</Text>
          </View>
        ))}
        <Button label="Billing not implemented" disabled block onPress={() => undefined} />
      </View>

      <Text style={styles.note}>
        This screen is a product surface, not a checkout. Entitlements, pricing and the payment
        provider are undecided, and sponsored placements are not implemented, so nothing here is an
        advertisement.
      </Text>

      <Button label="Back" variant="secondary" block onPress={() => navigation.goBack()} />
    </ScrollView>
  );
}

const buildStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
    intro: { gap: 6 },
    eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: colors.primary },
    heading: { fontSize: fontSizes.xxl, fontWeight: '800', color: colors.text, lineHeight: 32 },
    lede: { fontSize: fontSizes.sm, color: colors.textMuted, lineHeight: 20 },
    card: {
      gap: spacing.sm,
      padding: spacing.lg,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    cardHighlight: { borderColor: colors.primary },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardTitle: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.text },
    cardBadge: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.8,
      color: colors.textMuted,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radii.pill,
      backgroundColor: colors.surfaceMuted,
    },
    cardBadgePlanned: { backgroundColor: colors.primarySoft, color: colors.primary },
    price: { fontSize: fontSizes.lg, fontWeight: '800', color: colors.text },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 2 },
    rowText: { flex: 1, fontSize: fontSizes.sm, color: colors.text, lineHeight: 19 },
    rowMuted: { flex: 1, fontSize: fontSizes.sm, color: colors.textSubtle, lineHeight: 19 },
    note: { fontSize: 11, color: colors.textSubtle, lineHeight: 17 },
  });
