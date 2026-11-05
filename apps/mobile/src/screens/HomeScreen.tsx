import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '../components/Card';
import { StatusPill } from '../components/StatusPill';
import { useApiHealth } from '../hooks/useApiHealth';
import { theme, type StatusTone } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

/**
 * Sprint 0 placeholder screen.
 *
 * No products, prices or marketplace data are shown because none exist yet.
 * The API status reflects a real health request.
 */
export function HomeScreen({ navigation }: Props) {
  const { state, retry } = useApiHealth();

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <StatusPill tone="ok" label="Sprint 0 - foundation" />
        <Text style={styles.heading}>The mobile shell is running</Text>
        <Text style={styles.body}>
          Expo + React Native + TypeScript, a typed navigation stack, shared contracts with the API,
          and design tokens shared with the web app.
        </Text>
      </View>

      <Card title="Backend API">
        <View style={styles.row}>
          <Text style={styles.muted}>Status</Text>
          <StatusPill tone={toneFor(state)} label={labelFor(state)} />
        </View>

        {state.status === 'ready' && (
          <>
            <View style={styles.row}>
              <Text style={styles.muted}>Database</Text>
              <Text style={styles.mono}>{state.health.checks.database.status}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.muted}>Service version</Text>
              <Text style={styles.mono}>{state.health.version}</Text>
            </View>
          </>
        )}

        {state.status === 'error' && <Text style={styles.error}>{state.message}</Text>}

        <Pressable accessibilityRole="button" onPress={retry} style={styles.button}>
          <Text style={styles.buttonLabel}>Re-check</Text>
        </Pressable>
      </Card>

      <Card title="What is intentionally absent">
        <Text style={styles.body}>No marketplace integrations or credentials.</Text>
        <Text style={styles.body}>No product catalogue, listings or price history.</Text>
        <Text style={styles.body}>No accounts, ads, affiliate tracking or subscriptions.</Text>
        <Text style={styles.body}>No fabricated prices anywhere in this build.</Text>
      </Card>

      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('Diagnostics')}
        style={styles.secondaryButton}
      >
        <Text style={styles.secondaryLabel}>Open environment details</Text>
      </Pressable>
    </ScrollView>
  );
}

function toneFor(state: ReturnType<typeof useApiHealth>['state']): StatusTone {
  if (state.status === 'loading') return 'neutral';
  if (state.status === 'error') return 'error';
  return state.health.status === 'ok' ? 'ok' : 'warn';
}

function labelFor(state: ReturnType<typeof useApiHealth>['state']): string {
  if (state.status === 'loading') return 'Checking...';
  if (state.status === 'error') return 'Unreachable';
  return state.health.status === 'ok' ? 'Healthy' : 'Degraded';
}

const styles = StyleSheet.create({
  content: {
    padding: theme.screen.paddingHorizontal,
    paddingVertical: theme.screen.paddingVertical,
    gap: theme.screen.gap,
  },
  header: {
    gap: theme.spacing.sm,
  },
  heading: {
    fontSize: theme.fontSizes.xl,
    fontWeight: '700',
    color: theme.colors.text,
  },
  body: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  muted: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textMuted,
  },
  mono: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.text,
    fontFamily: 'monospace',
  },
  error: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.danger,
  },
  button: {
    marginTop: theme.spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  buttonLabel: {
    fontSize: theme.fontSizes.sm,
    fontWeight: '600',
    color: theme.colors.text,
  },
  secondaryButton: {
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
  },
  secondaryLabel: {
    color: theme.colors.primaryContrast,
    fontSize: theme.fontSizes.sm,
    fontWeight: '600',
  },
});
