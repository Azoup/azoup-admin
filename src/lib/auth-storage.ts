import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { SupportedStorage } from '@supabase/supabase-js';

const webStorage: SupportedStorage = {
  getItem: (key) => {
    if (typeof localStorage === 'undefined') return Promise.resolve(null);
    return Promise.resolve(localStorage.getItem(key));
  },
  setItem: (key, value) => {
    if (typeof localStorage === 'undefined') return Promise.resolve();
    localStorage.setItem(key, value);
    return Promise.resolve();
  },
  removeItem: (key) => {
    if (typeof localStorage === 'undefined') return Promise.resolve();
    localStorage.removeItem(key);
    return Promise.resolve();
  },
};

/** Web usa localStorage nativo; native usa AsyncStorage (recomendado pelo Supabase). */
export const supabaseAuthStorage: SupportedStorage = Platform.OS === 'web' ? webStorage : AsyncStorage;

export function isInvalidRefreshError(message: string | undefined | null): boolean {
  const m = `${message ?? ''}`.toLowerCase();
  return (
    m.includes('refresh token') ||
    m.includes('invalid refresh') ||
    m.includes('token not found') ||
    m.includes('session not found')
  );
}
