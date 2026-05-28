import { Stack } from 'expo-router';

export default function ClientsStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Clientes Azoup' }} />
      <Stack.Screen name="[id]" options={{ title: 'Cliente' }} />
    </Stack>
  );
}
