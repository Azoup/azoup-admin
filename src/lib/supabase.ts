import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { env } from '@/src/lib/env';

const isBrowser = typeof window !== 'undefined';
const persistSession = Platform.OS !== 'web';

const noopStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    // On Expo web SSR, window/localStorage are unavailable.
    storage: isBrowser ? AsyncStorage : noopStorage,
    autoRefreshToken: isBrowser,
    // Requirement: on web refresh, force logout (no persisted session).
    persistSession,
    detectSessionInUrl: false,
  },
});
