import { ArrowRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fontSizes, radii, spacing } from '../theme';

/** House promotional panel (not a paid placement - advertising is not implemented). */
export function PromotionalBanner({
  title,
  description,
  ctaLabel = 'See savings',
  onPress,
}: {
  readonly title: string;
  readonly description: string;
  readonly ctaLabel?: string;
  readonly onPress: () => void;
}) {
  const styles = buildStyles();

  return (
    <View style={styles.container}>
      <View style={styles.textBlock}>
        <Text style={styles.eyebrow}>SAVE SMARTER</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
      >
        <Text style={styles.ctaLabel}>{ctaLabel}</Text>
        <ArrowRight size={14} color="#065f46" />
      </Pressable>

      <View style={[styles.blob, styles.blobTop]} />
      <View style={[styles.blob, styles.blobBottom]} />
    </View>
  );
}

const buildStyles = () =>
  StyleSheet.create({
    container: {
      borderRadius: radii.xxl,
      backgroundColor: '#15803d',
      padding: spacing.lg,
      overflow: 'hidden',
      gap: spacing.md,
    },
    textBlock: { gap: 4 },
    eyebrow: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1.4,
      color: 'rgba(255,255,255,0.8)',
    },
    title: { fontSize: fontSizes.xl, fontWeight: '700', color: '#ffffff', lineHeight: 27 },
    description: { fontSize: fontSizes.sm, color: 'rgba(255,255,255,0.88)', lineHeight: 19 },
    cta: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#ffffff',
      paddingHorizontal: spacing.lg,
      height: 38,
      borderRadius: radii.pill,
    },
    ctaPressed: { opacity: 0.9 },
    ctaLabel: { fontSize: fontSizes.sm, fontWeight: '700', color: '#065f46' },
    blob: {
      position: 'absolute',
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.12)',
    },
    blobTop: { width: 140, height: 140, top: -60, right: -30 },
    blobBottom: {
      width: 170,
      height: 170,
      bottom: -90,
      right: -50,
      backgroundColor: 'rgba(0,0,0,0.10)',
    },
  });
