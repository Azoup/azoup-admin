import { Link, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';

import { AzoupLogo } from '@/components/AzoupLogo';
import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { ThemeToggleButton } from '@/components/ui/ThemeToggleButton';
import { Text, View } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';

export default function LoginScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  const { signIn, loading, session, adminProfile } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (session && adminProfile) {
      router.replace('/(tabs)');
      return;
    }
    if (session && !adminProfile) {
      router.replace('/unauthorized');
    }
  }, [loading, session, adminProfile]);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    const { error: err } = await signIn(email.trim(), password);
    setBusy(false);
    if (err) setError(err.message);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
      <View style={styles.topBar}>
        <ThemeToggleButton />
      </View>

      <ScreenCard style={styles.card}>
        <AzoupLogo size={88} style={styles.logo} />
        <Text style={styles.title}>Painel Administrativo Azoup</Text>
        <Text style={styles.sub}>Entre com uma conta ativa cadastrada em `admin_users`.</Text>

        <FormField label="E-mail" required>
          <FormInput
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="seu@email.com"
            value={email}
            onChangeText={setEmail}
          />
        </FormField>

        <FormField label="Senha" required>
          <FormInput secureTextEntry placeholder="••••••••" value={password} onChangeText={setPassword} />
        </FormField>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <PrimaryButton label="Entrar" loading={busy} onPress={onSubmit} style={{ marginTop: 4 }} />

        <Link href="/unauthorized" style={styles.linkMuted}>
          Está com problema de acesso?
        </Link>
      </ScreenCard>
    </KeyboardAvoidingView>
  );
}

function getStyles(theme: ReturnType<typeof useTheme>['theme']) {
  return StyleSheet.create({
    wrap: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: theme.background },
    topBar: { position: 'absolute', top: 16, right: 16 },
    card: { gap: 12, borderRadius: 16, padding: 20 },
    logo: { marginBottom: 4, alignSelf: 'center' },
    title: { fontSize: 24, fontWeight: '800', color: theme.headerText, textAlign: 'center' },
    sub: { color: theme.textMuted, marginBottom: 8, textAlign: 'center', lineHeight: 20 },
    error: { color: theme.error, fontWeight: '600' },
    linkMuted: { marginTop: 8, color: theme.textMuted, textAlign: 'center' },
  });
}
