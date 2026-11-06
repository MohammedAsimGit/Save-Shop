import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { DiagnosticsScreen } from '../screens/DiagnosticsScreen';
import { PremiumScreen } from '../screens/PremiumScreen';
import { ProductScreen } from '../screens/ProductScreen';
import { SignInScreen } from '../screens/SignInScreen';
import { useAppTheme } from '../theme/ThemeProvider';
import { TabsNavigator } from './TabsNavigator';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Root navigation: tabs underneath, full-screen flows above them.
 *
 * Keeping product, sign-in and premium on the root stack means they can be
 * opened from any tab without duplicating routes per tab.
 */
export function RootNavigator() {
  const { colors } = useAppTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text },
        headerTintColor: colors.primary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="Tabs" component={TabsNavigator} options={{ headerShown: false }} />
      <Stack.Screen
        name="Product"
        component={ProductScreen}
        options={{ title: 'Compare prices' }}
      />
      <Stack.Screen name="Premium" component={PremiumScreen} options={{ title: 'Premium' }} />
      <Stack.Screen name="SignIn" component={SignInScreen} options={{ title: 'Sign in' }} />
      <Stack.Screen
        name="Diagnostics"
        component={DiagnosticsScreen}
        options={{ title: 'Environment' }}
      />
    </Stack.Navigator>
  );
}
