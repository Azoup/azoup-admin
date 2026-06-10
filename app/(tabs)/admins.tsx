import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, StyleSheet, Switch, View } from 'react-native';

import { ChipSelect } from '@/components/ui/ChipSelect';
import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Text } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import { criarAdminLoginViaFunction, listarAdminsViaFunction } from '@/src/services/stripe-admin-api';

type AdminRole = 'owner' | 'manager' | 'viewer';

export default function AdminsScreen() {
  const { theme } = useTheme();
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
      <View style={{ flex: 1, padding: 16, backgroundColor: theme.background }}>
        <PageHeader title="Acessos Administrativos" />
        <Text style={{ color: theme.warning, fontWeight: '700' }}>
          Somente usuários com perfil owner podem gerenciar novos logins.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      data={(q.data?.admins ?? []) as Record<string, unknown>[]}
      keyExtractor={(item) => `${item.id}`}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <PageHeader
            title="Acessos Administrativos"
            subtitle="Qualquer e-mail ativo em admin_users pode entrar. Somente owner pode criar novos acessos."
          />

          <ScreenCard style={{ gap: 12 }}>
            <SectionTitle>Novo acesso administrativo</SectionTitle>
            <FormField label="E-mail" required>
              <FormInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            </FormField>
            <FormField label="Senha temporária" required>
              <FormInput value={password} onChangeText={setPassword} secureTextEntry />
            </FormField>
            <FormField label="Perfil">
              <ChipSelect
                options={['owner', 'manager', 'viewer'] as const}
                value={role}
                onChange={setRole}
              />
            </FormField>
            <View style={styles.rowBetween}>
              <Text style={{ color: theme.textMuted }}>Status do acesso</Text>
              <Switch value={active} onValueChange={setActive} trackColor={{ true: theme.cadastroAction }} />
            </View>
            <PrimaryButton
              label={createMutation.isPending ? 'Criando…' : 'Criar acesso'}
              loading={createMutation.isPending}
              onPress={() => createMutation.mutate()}
            />
            {createMutation.error ? (
              <Text style={{ color: theme.error, fontWeight: '700' }}>{(createMutation.error as Error).message}</Text>
            ) : null}
          </ScreenCard>

          <SectionTitle>Usuários administrativos cadastrados</SectionTitle>
        </View>
      }
      renderItem={({ item }) => (
        <ScreenCard style={{ marginTop: 8 }}>
          <Text style={{ color: theme.headerText, fontWeight: '800' }}>{`${item.email ?? ''}`}</Text>
          <Text style={{ color: theme.textMuted, marginTop: 4 }}>
            Perfil: {`${item.role ?? '-'}`} · Ativo: {item.active ? 'Sim' : 'Não'}
          </Text>
        </ScreenCard>
      )}
      ListEmptyComponent={
        q.isLoading ? (
          <Text style={{ color: theme.textMuted }}>Carregando…</Text>
        ) : (
          <Text style={{ color: theme.textMuted }}>Nenhum registro encontrado.</Text>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
