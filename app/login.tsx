import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { ui } from '@/src/theme/ui';

export default function LoginScreen() {
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
    if (err) {
      setError(err.message);
      return;
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>Painel Administrativo Azoup</Text>
        <Text style={styles.sub}>Entre com uma conta ativa cadastrada em `admin_users`.</Text>

        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="E-mail"
          placeholderTextColor="#888"
          style={styles.input}
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          secureTextEntry
          placeholder="Senha"
          placeholderTextColor="#888"
          style={styles.input}
          value={password}
          onChangeText={setPassword}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.button} disabled={busy} onPress={onSubmit}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonLabel}>Entrar</Text>}
        </Pressable>

        <Link href="/unauthorized" style={styles.linkMuted}>
          Está com problema de acesso?
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: ui.bg },
  card: {
    gap: 12,
    backgroundColor: ui.card,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: ui.border,
    shadowColor: '#0B1F3A',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  title: { fontSize: 24, fontWeight: '800', color: ui.navy },
  sub: { color: ui.muted, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.select({ web: 10, default: 12 }),
    fontSize: 16,
    backgroundColor: '#F9FBFF',
    color: ui.text,
  },
  button: {
    marginTop: 8,
    backgroundColor: ui.orange,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonLabel: { color: '#fff', fontWeight: '800', fontSize: 16 },
  error: { color: ui.danger, fontWeight: '600' },
  linkMuted: { marginTop: 16, color: ui.navySoft },
});
