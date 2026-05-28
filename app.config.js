const base = require('./app.json');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[app.config] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY ausentes no build. ' +
      'Configure na Vercel (Environment Variables) antes do deploy web.',
  );
}

module.exports = {
  expo: {
    ...base.expo,
    extra: {
      ...(base.expo.extra ?? {}),
      supabaseUrl,
      supabaseAnonKey,
    },
  },
};
