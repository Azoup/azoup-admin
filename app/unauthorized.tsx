import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { ui } from '@/src/theme/ui';

export default function UnauthorizedScreen() {
  const { signOut, adminError } = useAdminAuth();

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Sem permissão administrativa</Text>
      <Text style={styles.body}>
        Seu login foi autenticado, mas seu e-mail não está ativo em `admin_users` ou não possui permissão para esta área.
      </Text>
      <Text style={styles.debug}>Diagnóstico técnico: {adminError ?? 'Sem detalhes adicionais.'}</Text>
      <Pressable
        style={styles.button}
        onPress={async () => {
          await signOut();
          router.replace('/login');
        }}>
        <Text style={styles.buttonLabel}>Sair e entrar com outra conta</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24, gap: 16, justifyContent: 'center', backgroundColor: ui.bg },
  title: { fontSize: 24, fontWeight: '800', color: ui.navy },
  body: { color: ui.muted, lineHeight: 22 },
  debug: {
    color: ui.danger,
    backgroundColor: '#fff2f2',
    borderColor: '#ffd7d7',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  button: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: ui.navy,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonLabel: { color: '#fff', fontWeight: '700' },
});
