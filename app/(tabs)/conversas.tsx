import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { ClienteSearchPicker } from '@/components/ui/ClienteSearchPicker';
import { ConversaClienteCard } from '@/components/ui/ConversaClienteCard';
import { FormDateInput } from '@/components/ui/FormDateInput';
import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Text } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import {
  criarConversaCliente,
  listarClientesComConversas,
  listarClientesParaSelecao,
  listarConversasClientes,
} from '@/src/services/repos/conversas-repo';
import type { ClienteAzoupRow } from '@/src/types/azoup';
import { rotuloCliente } from '@/src/utils/cliente-label';

function hojeIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function ConversasScreen() {
  const { theme } = useTheme();
  const { adminProfile, canAccessScreen } = useAdminAuth();
  const qc = useQueryClient();

  const [cliente, setCliente] = useState<ClienteAzoupRow | null>(null);
  const [dataConversa, setDataConversa] = useState(hojeIsoLocal);
  const [descricao, setDescricao] = useState('');
  const [filtroCliente, setFiltroCliente] = useState<ClienteAzoupRow | null>(null);

  const clientesQ = useQuery({
    queryKey: ['clientes_selecao_conversas'],
    queryFn: listarClientesParaSelecao,
    enabled: canAccessScreen('conversas'),
  });

  const clientesComHistoricoQ = useQuery({
    queryKey: ['clientes_com_conversas'],
    queryFn: listarClientesComConversas,
    enabled: canAccessScreen('conversas'),
  });

  const conversasQ = useQuery({
    queryKey: ['admin_cliente_conversas', filtroCliente?.id ?? null],
    queryFn: () => listarConversasClientes({ clienteId: filtroCliente?.id ?? null }),
    enabled: canAccessScreen('conversas'),
  });

  const todosClientes = clientesQ.data ?? [];
  const clientesComHistorico = clientesComHistoricoQ.data ?? [];

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!cliente) throw new Error('Selecione um cliente.');
      return criarConversaCliente({
        clienteId: cliente.id,
        dataConversa,
        descricao,
        adminEmail: adminProfile?.email,
      });
    },
    onSuccess: async () => {
      setDescricao('');
      setDataConversa(hojeIsoLocal());
      await qc.invalidateQueries({ queryKey: ['admin_cliente_conversas'] });
      await qc.invalidateQueries({ queryKey: ['clientes_com_conversas'] });
    },
  });

  const loadingClientes = clientesQ.isLoading || clientesComHistoricoQ.isLoading;

  if (!canAccessScreen('conversas')) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: theme.background }}>
        <Text style={{ color: theme.warning, fontWeight: '800' }}>Seu perfil não tem acesso a Conversas.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      data={conversasQ.data ?? []}
      keyExtractor={(item) => item.id}
      refreshing={conversasQ.isRefetching}
      onRefresh={() => {
        conversasQ.refetch();
        clientesComHistoricoQ.refetch();
      }}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <PageHeader
            title="Histórico de conversas"
            subtitle="Selecione o cliente na lista ou busque por nome. Sem busca, aparecem os que já têm conversas."
          />

          <ScreenCard style={{ gap: 12 }}>
            <SectionTitle>Novo registro</SectionTitle>
            <FormField label="Cliente" required>
              <ClienteSearchPicker
                todosClientes={todosClientes}
                clientesPadrao={clientesComHistorico}
                value={cliente}
                onChange={setCliente}
                loading={loadingClientes}
              />
            </FormField>
            <FormField label="Data da conversa" required>
              <FormDateInput value={dataConversa} onChange={setDataConversa} />
            </FormField>
            <FormField label="O que foi conversado" required>
              <FormInput
                value={descricao}
                onChangeText={setDescricao}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                placeholder="Descreva o assunto, combinados, pendências…"
                style={{ minHeight: 100, paddingTop: 12 }}
              />
            </FormField>
            <PrimaryButton
              label={createMutation.isPending ? 'Salvando…' : 'Registrar conversa'}
              loading={createMutation.isPending}
              onPress={() => createMutation.mutate()}
            />
            {createMutation.error ? (
              <Text style={{ color: theme.error, fontWeight: '700' }}>{(createMutation.error as Error).message}</Text>
            ) : null}
          </ScreenCard>

          <ScreenCard style={{ gap: 10 }}>
            <View style={styles.filtroRow}>
              <SectionTitle>Filtrar histórico</SectionTitle>
              {filtroCliente ? (
                <SecondaryButton
                  label="Ver todos"
                  onPress={() => setFiltroCliente(null)}
                  style={{ paddingHorizontal: 12, minHeight: 36 }}
                />
              ) : null}
            </View>
            <ClienteSearchPicker
              todosClientes={todosClientes}
              clientesPadrao={clientesComHistorico}
              value={filtroCliente}
              onChange={setFiltroCliente}
              loading={loadingClientes}
              placeholderBusca="Buscar cliente para filtrar o histórico…"
              mensagemListaVazia="Nenhum cliente com esse nome."
            />
            {filtroCliente ? (
              <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                Exibindo conversas de: <Text style={{ fontWeight: '700' }}>{rotuloCliente(filtroCliente)}</Text>
              </Text>
            ) : (
              <Text style={{ color: theme.textMuted, fontSize: 13 }}>Exibindo conversas de todos os clientes.</Text>
            )}
          </ScreenCard>

          <SectionTitle>Registros</SectionTitle>
        </View>
      }
      ListEmptyComponent={
        conversasQ.isLoading ? (
          <Text style={{ color: theme.textMuted }}>Carregando histórico…</Text>
        ) : conversasQ.error ? (
          <Text style={{ color: theme.error }}>{(conversasQ.error as Error).message}</Text>
        ) : (
          <Text style={{ color: theme.textMuted }}>Nenhuma conversa registrada ainda.</Text>
        )
      }
      renderItem={({ item }) => <ConversaClienteCard conversa={item} />}
    />
  );
}

const styles = StyleSheet.create({
  filtroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});
