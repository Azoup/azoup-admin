import { Stack } from 'expo-router';

import { useTheme } from '@/src/contexts/ThemeContext';

export default function BillingStackLayout() {
  const { theme } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="trial" />
      <Stack.Screen name="coupons" />
      <Stack.Screen name="plans" />
    </Stack>
  );
}
