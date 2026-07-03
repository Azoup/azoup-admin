import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { AdminShell } from '@/components/layout/AdminShell';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';

export default function AppLayout() {
  const { theme } = useTheme();
  const { session, adminProfile, loading } = useAdminAuth();

  if (loading && !session) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.cadastroAction} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  if (!adminProfile && loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.cadastroAction} />
      </View>
    );
  }

  if (!adminProfile) {
    return <Redirect href="/unauthorized" />;
  }

  return (
    <AdminShell>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="clients" />
        <Stack.Screen name="conversas" />
        <Stack.Screen name="billing" />
        <Stack.Screen name="audit" />
        <Stack.Screen name="marketing" />
        <Stack.Screen name="config-suporte" />
        <Stack.Screen name="metodo360" />
        <Stack.Screen name="admins" />
      </Stack>
    </AdminShell>
  );
}
