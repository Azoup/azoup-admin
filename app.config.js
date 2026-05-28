const base = require('./app.json');

module.exports = {
  expo: {
    ...base.expo,
    extra: {
      ...(base.expo.extra ?? {}),
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    },
  },
};
