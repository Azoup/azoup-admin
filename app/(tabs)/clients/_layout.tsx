import { Stack } from 'expo-router';
import { View } from 'react-native';

import { ThemeToggleButton } from '@/components/ui/ThemeToggleButton';
import { useTheme } from '@/src/contexts/ThemeContext';

export default function ClientsStackLayout() {
  const { theme } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.headerText,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.background },
        headerRight: () => (
          <View style={{ marginRight: 12 }}>
            <ThemeToggleButton />
          </View>
        ),
      }}>
      <Stack.Screen name="index" options={{ title: 'Clientes' }} />
      <Stack.Screen name="[id]" options={{ title: 'Cliente' }} />
    </Stack>
  );
}
