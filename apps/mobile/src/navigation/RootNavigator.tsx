import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { DiagnosticsScreen } from '../screens/DiagnosticsScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { theme } from '../theme';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Navigation foundation: one stack, two screens, typed route params. */
export function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTitleStyle: { color: theme.colors.text },
        headerTintColor: theme.colors.primary,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Smart Shopping' }} />
      <Stack.Screen
        name="Diagnostics"
        component={DiagnosticsScreen}
        options={{ title: 'Environment' }}
      />
    </Stack.Navigator>
  );
}
