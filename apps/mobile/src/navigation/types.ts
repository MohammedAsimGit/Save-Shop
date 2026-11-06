import type { NavigatorScreenParams } from '@react-navigation/native';

/** Bottom tabs: the four primary destinations. */
export type TabParamList = {
  Home: undefined;
  Search: { query?: string; category?: string; marketplace?: string } | undefined;
  Tracking: undefined;
  Profile: undefined;
};

/** Root stack: tabs plus full-screen flows that sit above them. */
export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Product: { productId: string };
  Premium: undefined;
  SignIn: undefined;
  Diagnostics: undefined;
};
