import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { env, isEnvConfigured } from '@/src/lib/env';

const isBrowser = typeof window !== 'undefined';
const persistSession = Platform.OS !== 'web';

const noopStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  if (!isEnvConfigured()) {
    throw new Error(
      'Supabase não configurado. Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY na Vercel e redeploy.',
    );
  }

  client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      storage: isBrowser ? AsyncStorage : noopStorage,
      autoRefreshToken: isBrowser,
      persistSession,
      detectSessionInUrl: false,
    },
  });

  return client;
}

/** Cliente lazy — evita crash na importação quando env ainda não foi injetado no build. */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const c = getSupabaseClient();
    const value = Reflect.get(c as unknown as object, prop, c);
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(c) : value;
  },
});
