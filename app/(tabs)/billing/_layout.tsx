import { Stack } from 'expo-router';

export default function BillingStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Billing administrativo' }} />
      <Stack.Screen name="trial" options={{ title: 'Trial global' }} />
      <Stack.Screen name="coupons" options={{ title: 'Cupons Stripe' }} />
      <Stack.Screen name="plans" options={{ title: 'Planos' }} />
    </Stack>
  );
}
