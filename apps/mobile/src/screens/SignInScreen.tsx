import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Info, LockKeyhole, Mail } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '../components/Button';
import type { RootStackParamList } from '../navigation/types';
import { fontSizes, radii, spacing, type ThemeColors } from '../theme';
import { useAppTheme } from '../theme/ThemeProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'SignIn'>;

/**
 * Presentational sign-in. Firebase Authentication is intended but unconfigured,
 * so inputs are disabled and nothing can be typed or transmitted.
 */
export function SignInScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const styles = buildStyles(colors);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Sign in to SaveShop</Text>
      <Text style={styles.lede}>
        Accounts keep your wishlist and price alerts in sync across web and mobile.
      </Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>AUTHENTICATION NOT IMPLEMENTED</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Email</Text>
        <View style={styles.inputRow}>
          <Mail size={15} color={colors.textSubtle} />
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={colors.textSubtle}
            editable={false}
            accessibilityLabel="Email address"
          />
        </View>

        <Text style={styles.label}>Password</Text>
        <View style={styles.inputRow}>
          <LockKeyhole size={15} color={colors.textSubtle} />
          <TextInput
            style={styles.input}
            placeholder="Your password"
            placeholderTextColor={colors.textSubtle}
            secureTextEntry
            editable={false}
            accessibilityLabel="Password"
          />
        </View>

        <Button label="Sign in" disabled block onPress={() => undefined} />

        <View style={styles.note}>
          <Info size={13} color={colors.textSubtle} />
          <Text style={styles.noteText}>
            Sign-in is deliberately disabled: no Firebase project or credentials exist, and this
            build captures no credentials.
          </Text>
        </View>
      </View>

      <Button label="Back" variant="secondary" block onPress={() => navigation.goBack()} />
    </ScrollView>
  );
}

const buildStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
    heading: { fontSize: fontSizes.xl, fontWeight: '800', color: colors.text },
    lede: { fontSize: fontSizes.sm, color: colors.textMuted, lineHeight: 20 },
    badge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radii.pill,
      backgroundColor: 'rgba(245, 158, 11, 0.16)',
    },
    badgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.7, color: colors.warning },
    form: {
      gap: spacing.sm,
      padding: spacing.lg,
      borderRadius: radii.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    label: { fontSize: fontSizes.xs, fontWeight: '600', color: colors.text },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      height: 46,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgroundAlt,
    },
    input: { flex: 1, fontSize: fontSizes.sm, color: colors.text, paddingVertical: 0 },
    note: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'flex-start',
      marginTop: spacing.xs,
    },
    noteText: { flex: 1, fontSize: 11, color: colors.textSubtle, lineHeight: 16 },
  });
