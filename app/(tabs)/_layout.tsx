import React, { useMemo } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { AzoupLogo } from '@/components/AzoupLogo';
import { ThemeToggleButton } from '@/components/ui/ThemeToggleButton';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={22} style={{ marginBottom: -2 }} {...props} />;
}

export default function TabLayout() {
  const { theme } = useTheme();
  const { session, adminProfile, loading, canAccessScreen } = useAdminAuth();
  const headerShown = useClientOnlyValue(false, true);

  const screenOptions = useMemo(
    () => ({
      tabBarActiveTintColor: theme.tabIconSelected,
      tabBarInactiveTintColor: theme.tabIconDefault,
      tabBarStyle: {
        backgroundColor: theme.tabBarBg,
        borderTopColor: theme.border,
        height: 64,
        paddingBottom: 8,
        paddingTop: 6,
      },
      tabBarLabelStyle: { fontWeight: '700' as const, fontSize: 11 },
      headerShown,
      headerStyle: { backgroundColor: theme.surface },
      headerTintColor: theme.headerText,
      headerTitle: () => <AzoupLogo size={32} />,
      headerRight: () => (
        <View style={{ marginRight: 12 }}>
          <ThemeToggleButton />
        </View>
      ),
    }),
    [theme, headerShown],
  );

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.cadastroAction} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  if (!adminProfile) {
    return <Redirect href="/unauthorized" />;
  }

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Painel',
          href: canAccessScreen('dashboard') ? undefined : null,
          tabBarIcon: ({ color }) => <TabBarIcon name="dashboard" color={color} />,
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: 'Clientes',
          href: canAccessScreen('clients') ? undefined : null,
          tabBarIcon: ({ color }) => <TabBarIcon name="users" color={color} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="conversas"
        options={{
          title: 'Conversas',
          href: canAccessScreen('conversas') ? undefined : null,
          tabBarIcon: ({ color }) => <TabBarIcon name="comments" color={color} />,
        }}
      />
      <Tabs.Screen
        name="billing"
        options={{
          title: 'Cobrança',
          href: canAccessScreen('billing') ? undefined : null,
          tabBarIcon: ({ color }) => <TabBarIcon name="credit-card" color={color} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="audit"
        options={{
          title: 'Auditoria',
          href: canAccessScreen('audit') ? undefined : null,
          tabBarIcon: ({ color }) => <TabBarIcon name="history" color={color} />,
        }}
      />
      <Tabs.Screen
        name="admins"
        options={{
          title: 'Acessos',
          href: canAccessScreen('admins') ? undefined : null,
          tabBarIcon: ({ color }) => <TabBarIcon name="shield" color={color} />,
        }}
      />
    </Tabs>
  );
}
