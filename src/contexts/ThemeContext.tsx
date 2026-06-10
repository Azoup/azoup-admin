import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useColorScheme as useSystemColorScheme } from 'react-native';

import { darkTheme, lightTheme, THEME_STORAGE_KEY, type AppTheme } from '@/src/theme/colors';

type ThemeMode = 'light' | 'dark' | 'system';

type ThemeContextValue = {
  theme: AppTheme;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function resolveIsDark(mode: ThemeMode, systemScheme: 'light' | 'dark' | null | undefined): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return systemScheme === 'dark';
}

function injectWebThemeCss(isDark: boolean) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  const html = document.documentElement;
  html.setAttribute('data-theme', isDark ? 'dark' : 'light');
  html.style.colorScheme = isDark ? 'dark' : 'light';

  let style = document.getElementById('azoup-theme-css');
  if (!style) {
    style = document.createElement('style');
    style.id = 'azoup-theme-css';
    document.head.appendChild(style);
  }

  const bg = isDark ? darkTheme.background : lightTheme.background;
  const surface = isDark ? darkTheme.surface : lightTheme.surface;
  const text = isDark ? darkTheme.text : lightTheme.text;
  const border = isDark ? darkTheme.borderInput : lightTheme.borderInput;
  const inputBg = isDark ? darkTheme.inputBg : lightTheme.inputBg;

  style.textContent = `
    body { background-color: ${bg}; color: ${text}; }
    input, textarea, select {
      background-color: ${inputBg};
      color: ${text};
      border: 1px solid ${border};
      border-radius: 8px;
      font-family: inherit;
    }
    input:focus, textarea:focus, select:focus {
      outline: 2px solid ${isDark ? darkTheme.focusRing : lightTheme.focusRing};
      outline-offset: 1px;
    }
    ::selection { background: ${isDark ? '#FF7A1A55' : '#1565C033'}; }
  `;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
          if (stored === 'light' || stored === 'dark' || stored === 'system') {
            if (!cancelled) setModeState(stored);
          }
        } else {
          const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
          if (stored === 'light' || stored === 'dark' || stored === 'system') {
            if (!cancelled) setModeState(stored);
          }
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const isDark = resolveIsDark(mode, systemScheme);
  const theme = isDark ? darkTheme : lightTheme;

  useEffect(() => {
    if (!hydrated) return;
    injectWebThemeCss(isDark);
  }, [isDark, hydrated]);

  const persistMode = useCallback(async (next: ThemeMode) => {
    setModeState(next);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } else {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, next);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const next = isDark ? 'light' : 'dark';
    void persistMode(next);
  }, [isDark, persistMode]);

  const value = useMemo(
    () => ({
      theme,
      isDark,
      mode,
      setMode: persistMode,
      toggleTheme,
    }),
    [theme, isDark, mode, persistMode, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve estar dentro de ThemeProvider');
  return ctx;
}
