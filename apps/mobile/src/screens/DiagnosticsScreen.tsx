import { ScrollView, StyleSheet, Text } from 'react-native';

import { Card } from '../components/Card';
import { mobileEnv } from '../config/env';
import { theme } from '../theme';

/**
 * Read-only environment view. Exists so the API base URL is inspectable on a
 * device - the most common cause of "the app cannot reach the API".
 */
export function DiagnosticsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card title="API base URL">
        <Text style={styles.mono}>{mobileEnv.apiBaseUrl}</Text>
        <Text style={styles.hint}>
          Android emulator reaches the host machine through 10.0.2.2, an iOS simulator through
          localhost, and a physical device through your computer's LAN IP.
        </Text>
      </Card>

      <Card title="Configuration source">
        <Text style={styles.body}>EXPO_PUBLIC_API_BASE_URL (see apps/mobile/.env.example)</Text>
        <Text style={styles.hint}>
          Only public values may use the EXPO_PUBLIC_ prefix - they are bundled into the app.
        </Text>
      </Card>

      <Card title="Not implemented yet">
        <Text style={styles.body}>
          Authentication, product search, comparison, wishlist, subscriptions and advertising are
          planned for later sprints. Nothing here talks to a marketplace.
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: theme.screen.paddingHorizontal,
    paddingVertical: theme.screen.paddingVertical,
    gap: theme.screen.gap,
  },
  body: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.text,
  },
  hint: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textMuted,
    lineHeight: 18,
  },
  mono: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.text,
    fontFamily: 'monospace',
  },
});
