import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, TextInput } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { criarAdminLoginViaFunction, listarAdminsViaFunction } from '@/src/services/stripe-admin-api';
import { ui } from '@/src/theme/ui';

type AdminRole = 'owner' | 'manager' | 'viewer';

export default function AdminsScreen() {
  const { canManageAdmins } = useAdminAuth();
  const qc = useQueryClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AdminRole>('viewer');
  const [active, setActive] = useState(true);

  const q = useQuery({
    queryKey: ['admin_users_list'],
    queryFn: listarAdminsViaFunction,
    enabled: canManageAdmins,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!email.trim()) throw new Error('Informe e-mail');
      if (password.length < 6) throw new Error('Senha deve ter pelo menos 6 caracteres');
      return criarAdminLoginViaFunction({
        email: email.trim().toLowerCase(),
        password,
        role,
        active,
      });
    },
    onSuccess: async () => {
      setEmail('');
      setPassword('');
      setRole('viewer');
      setActive(true);
      await qc.invalidateQueries({ queryKey: ['admin_users_list'] });
    },
  });

  if (!canManageAdmins) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Acessos Administrativos</Text>
        <Text style={styles.warn}>Somente usuários com perfil owner podem gerenciar novos logins.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: ui.bg }}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      data={(q.data?.admins ?? []) as Record<string, unknown>[]}
      keyExtractor={(item) => `${item.id}`}
      ListHeaderComponent={
        <View style={{ gap: 10 }}>
          <Text style={styles.title}>Acessos Administrativos</Text>
          <Text style={styles.sub}>Qualquer e-mail ativo em `admin_users` pode entrar. Somente owner pode criar novos acessos.</Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Novo acesso administrativo</Text>
            <TextInput style={styles.input} placeholder="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" />
            <TextInput
              style={styles.input}
              placeholder="Senha temporária"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <View style={styles.row}>
              {(['owner', 'manager', 'viewer'] as const).map((r) => (
                <Pressable key={r} onPress={() => setRole(r)} style={[styles.roleBtn, role === r && styles.roleBtnOn]}>
                  <Text style={[styles.roleLabel, role === r && styles.roleLabelOn]}>{r}</Text>
                </Pressable>
              ))}
            </View>
            <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'center' }]}>
              <Text style={{ color: ui.muted }}>Status do acesso</Text>
              <Switch value={active} onValueChange={setActive} />
            </View>
            <Pressable style={styles.primary} onPress={() => createMutation.mutate()} disabled={createMutation.isPending}>
              <Text style={styles.primaryLabel}>{createMutation.isPending ? 'Criando...' : 'Criar acesso'}</Text>
            </Pressable>
            {createMutation.error ? <Text style={styles.err}>{(createMutation.error as Error).message}</Text> : null}
          </View>

          <Text style={styles.section}>Usuários administrativos cadastrados</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.itemCard}>
          <Text style={styles.itemTitle}>{`${item.email ?? ''}`}</Text>
          <Text style={styles.itemMeta}>{`Perfil: ${item.role ?? '-'} | Ativo: ${item.active ? 'Sim' : 'Não'}`}</Text>
        </View>
      )}
      ListEmptyComponent={q.isLoading ? <Text>Carregando...</Text> : <Text style={styles.sub}>Nenhum registro encontrado.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16, backgroundColor: ui.bg },
  title: { fontSize: 22, fontWeight: '900', color: ui.navy },
  sub: { color: ui.muted },
  warn: { color: ui.orange, fontWeight: '700', marginTop: 8 },
  section: { marginTop: 8, fontSize: 17, fontWeight: '800', color: ui.navySoft },
  card: { backgroundColor: ui.card, borderWidth: 1, borderColor: ui.border, borderRadius: 14, padding: 12, gap: 10 },
  cardTitle: { color: ui.navySoft, fontWeight: '800' },
  input: {
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F9FBFF',
  },
  row: { flexDirection: 'row', gap: 8 },
  roleBtn: { borderWidth: 1, borderColor: ui.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  roleBtnOn: { backgroundColor: ui.navy },
  roleLabel: { color: ui.navySoft, fontWeight: '700' },
  roleLabelOn: { color: '#fff' },
  primary: { marginTop: 4, backgroundColor: ui.orange, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  primaryLabel: { color: '#fff', fontWeight: '900' },
  err: { color: ui.danger, fontWeight: '700' },
  itemCard: {
    backgroundColor: ui.card,
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  itemTitle: { color: ui.navySoft, fontWeight: '800' },
  itemMeta: { color: ui.muted, marginTop: 4 },
});

