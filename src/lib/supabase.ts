import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { env, isEnvConfigured } from '@/src/lib/env';

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
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  return client;
}

/** Garante JWT válido antes de chamar Edge Functions (evita 401 com token expirado no cache). */
export async function getValidAccessToken(): Promise<string> {
  const sb = getSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await sb.auth.getUser();

  if (!userError && user) {
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (session?.access_token) return session.access_token;
  }

  const { data: refreshed, error: refreshError } = await sb.auth.refreshSession();
  const token = refreshed.session?.access_token;
  if (refreshError || !token) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }
  return token;
}

/** Cliente lazy — evita crash na importação quando env ainda não foi injetado no build. */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const c = getSupabaseClient();
    const value = Reflect.get(c as unknown as object, prop, c);
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(c) : value;
  },
});
