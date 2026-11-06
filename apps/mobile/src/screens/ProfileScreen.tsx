import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ChevronRight,
  CreditCard,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  UserRound,
} from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { RootStackParamList, TabParamList } from '../navigation/types';
import { fontSizes, radii, spacing, type ThemeColors } from '../theme';
import { useAppTheme, type ThemePreference } from '../theme/ThemeProvider';

type Props = BottomTabScreenProps<TabParamList, 'Profile'>;

const appearance: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

/** Guest profile: appearance is real, account rows are explicitly unimplemented. */
export function ProfileScreen(_props: Props) {
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { preference, setPreference, colors } = useAppTheme();
  const styles = buildStyles(colors);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.heading}>Profile</Text>

      <View style={styles.identity}>
        <View style={styles.avatar}>
          <UserRound size={24} color={colors.textMuted} />
        </View>
        <View style={styles.identityCopy}>
          <View style={styles.identityRow}>
            <Text style={styles.name}>Guest</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>NOT SIGNED IN</Text>
            </View>
          </View>
          <Text style={styles.identityBody}>
            Sign in to keep a wishlist and price alerts in sync across devices.
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => rootNavigation.navigate('SignIn')}
          style={styles.primaryAction}
        >
          <Text style={styles.primaryActionLabel}>Sign in</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => rootNavigation.navigate('Premium')}
          style={styles.secondaryAction}
        >
          <Text style={styles.secondaryActionLabel}>Premium</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Appearance</Text>
      <View style={styles.segment}>
        {appearance.map(({ value, label, icon: Icon }) => {
          const active = preference === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setPreference(value)}
              style={[styles.segmentItem, active && styles.segmentItemActive]}
            >
              <Icon size={13} color={active ? colors.text : colors.textMuted} />
              <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>
        A manual choice lasts for this session; persisting it needs device storage, which this
        sprint does not add.
      </Text>

      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.list}>
        {[
          {
            icon: CreditCard,
            title: 'Subscription',
            detail: 'Free plan',
            note: 'Billing not implemented',
          },
          {
            icon: ShieldCheck,
            title: 'Privacy',
            detail: 'No data stored',
            note: 'No account, no tracking',
          },
          {
            icon: Monitor,
            title: 'Environment',
            detail: 'API details',
            note: 'Developer diagnostics',
          },
        ].map(({ icon: Icon, title, detail, note }, index) => (
          <Pressable
            key={title}
            accessibilityRole="button"
            onPress={index === 2 ? () => rootNavigation.navigate('Diagnostics') : undefined}
            style={styles.row}
          >
            <Icon size={16} color={colors.textSubtle} />
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{title}</Text>
              <Text style={styles.rowNote}>{note}</Text>
            </View>
            <Text style={styles.rowDetail}>{detail}</Text>
            <ChevronRight size={14} color={colors.textSubtle} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const buildStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
    heading: {
      fontSize: fontSizes.xxl,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -0.5,
    },
    identity: {
      flexDirection: 'row',
      gap: spacing.md,
      alignItems: 'center',
      padding: spacing.lg,
      borderRadius: radii.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
    },
    identityCopy: { flex: 1, gap: 3 },
    identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    name: { fontSize: fontSizes.md, fontWeight: '700', color: colors.text },
    badge: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: radii.pill,
      backgroundColor: colors.surfaceMuted,
    },
    badgeText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.6, color: colors.textMuted },
    identityBody: { fontSize: fontSizes.xs, color: colors.textMuted, lineHeight: 17 },
    actions: { flexDirection: 'row', gap: spacing.sm },
    primaryAction: {
      flex: 1,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.pill,
      backgroundColor: colors.primary,
    },
    primaryActionLabel: { color: colors.onPrimary, fontWeight: '700', fontSize: fontSizes.sm },
    secondaryAction: {
      flex: 1,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    secondaryActionLabel: { color: colors.text, fontWeight: '600', fontSize: fontSizes.sm },
    sectionTitle: {
      fontSize: fontSizes.sm,
      fontWeight: '700',
      color: colors.text,
      marginTop: spacing.sm,
    },
    segment: {
      flexDirection: 'row',
      padding: 4,
      borderRadius: radii.pill,
      backgroundColor: colors.surfaceMuted,
      gap: 4,
    },
    segmentItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      height: 36,
      borderRadius: radii.pill,
    },
    segmentItemActive: { backgroundColor: colors.surface },
    segmentLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
    segmentLabelActive: { color: colors.text },
    hint: { fontSize: 10, color: colors.textSubtle, lineHeight: 15 },
    list: {
      borderRadius: radii.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowCopy: { flex: 1, gap: 1 },
    rowTitle: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.text },
    rowNote: { fontSize: 10, color: colors.textSubtle },
    rowDetail: { fontSize: 11, color: colors.textMuted },
  });
