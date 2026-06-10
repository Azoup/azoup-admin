import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo } from 'react';
import 'react-native-reanimated';

import { EnvConfigGate } from '@/src/components/EnvConfigGate';
import { useTheme } from '@/src/contexts/ThemeContext';
import { AppProviders } from '@/src/providers/AppProviders';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <EnvConfigGate>
      <AppProviders>
        <RootLayoutNav />
      </AppProviders>
    </EnvConfigGate>
  );
}

function RootLayoutNav() {
  const { theme, isDark } = useTheme();

  const navTheme = useMemo(
    () =>
      isDark
        ? {
            ...DarkTheme,
            colors: {
              ...DarkTheme.colors,
              primary: theme.cadastroAction,
              background: theme.background,
              card: theme.surface,
              text: theme.text,
              border: theme.border,
              notification: theme.cadastroAction,
            },
          }
        : {
            ...DefaultTheme,
            colors: {
              ...DefaultTheme.colors,
              primary: theme.cadastroAction,
              background: theme.background,
              card: theme.surface,
              text: theme.text,
              border: theme.border,
              notification: theme.cadastroAction,
            },
          },
    [isDark, theme],
  );

  return (
    <NavThemeProvider value={navTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" options={{ presentation: 'modal' }} />
        <Stack.Screen name="unauthorized" />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </NavThemeProvider>
  );
}
