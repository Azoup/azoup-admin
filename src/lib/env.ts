import Constants from 'expo-constants';

function extra(key: string): string | undefined {
  const e = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const v = e?.[key];
  return v && String(v).trim() ? String(v).trim() : undefined;
}

function fromProcess(key: 'EXPO_PUBLIC_SUPABASE_URL' | 'EXPO_PUBLIC_SUPABASE_ANON_KEY'): string | undefined {
  const v = process.env[key];
  return v && String(v).trim() ? String(v).trim() : undefined;
}

/** URLs e chaves públicas — nunca coloque secret Stripe aqui. */
export const env = {
  /** `extra` vem do `app.config.js` no build (Vercel); `process.env` no dev local. */
  supabaseUrl: extra('supabaseUrl') ?? fromProcess('EXPO_PUBLIC_SUPABASE_URL') ?? '',
  supabaseAnonKey: extra('supabaseAnonKey') ?? fromProcess('EXPO_PUBLIC_SUPABASE_ANON_KEY') ?? '',
};

export function isEnvConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

export function getEnvSetupMessage(): string {
  if (!env.supabaseUrl && !env.supabaseAnonKey) {
    return 'Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY na Vercel (Settings → Environment Variables), marque Production/Preview e faça um novo deploy.';
  }
  if (!env.supabaseUrl) {
    return 'Falta EXPO_PUBLIC_SUPABASE_URL na Vercel (Environment Variables) — novo deploy necessário após salvar.';
  }
  return 'Falta EXPO_PUBLIC_SUPABASE_ANON_KEY na Vercel (Environment Variables) — novo deploy necessário após salvar.';
}
