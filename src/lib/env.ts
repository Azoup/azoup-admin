import Constants from 'expo-constants';

function extra(key: string): string | undefined {
  const e = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  return e?.[key];
}

/** URLs e chaves públicas — nunca coloque secret Stripe aqui. */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra('supabaseUrl') ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra('supabaseAnonKey') ?? '',
};
