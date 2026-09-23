import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import FontAwesome from '@expo/vector-icons/FontAwesome';

import { ClienteMultiSelect } from '@/components/ui/ClienteMultiSelect';
import { ClienteSearchPicker } from '@/components/ui/ClienteSearchPicker';
import { ConversaClienteCard } from '@/components/ui/ConversaClienteCard';
import { FormDateInput } from '@/components/ui/FormDateInput';
import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { FormTimeInput } from '@/components/ui/FormTimeInput';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Text } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import {
  atualizarConversaCliente,
  criarConversaCliente,
  excluirConversaCliente,
  listarClientesParaSelecao,
  listarConversasClientes,
  rotuloClienteConversa,
  type ClienteConversaComCliente,
} from '@/src/services/repos/conversas-repo';
import type { ClienteAzoupRow } from '@/src/types/azoup';
import { agoraHorarioLocal, hojeIsoLocal } from '@/src/utils/conversa-datetime';

function ConversaFormModal({
  visible,
  conversa,
  clienteInicial,
  todosClientes,
  loadingClientes,
  adminEmail,
  onClose,
  onSaved,
}: {
  visible: boolean;
  conversa: ClienteConversaComCliente | null;
  clienteInicial: ClienteAzoupRow | null;
  todosClientes: ClienteAzoupRow[];
  loadingClientes: boolean;
  adminEmail?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { theme } = useTheme();
  const editando = Boolean(conversa);
  const [cliente, setCliente] = useState<ClienteAzoupRow | null>(null);
  const [dataConversa, setDataConversa] = useState(hojeIsoLocal);
  const [horaConversa, setHoraConversa] = useState(agoraHorarioLocal);
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setErro(null);
    if (conversa) {
      const encontrado = todosClientes.find((c) => c.id === conversa.cliente_id) ?? null;
      setCliente(encontrado);
      setDataConversa(`${conversa.data_conversa ?? ''}`.slice(0, 10));
      setHoraConversa(`${conversa.hora_conversa ?? ''}`.slice(0, 5));
      setDescricao(conversa.descricao ?? '');
      return;
    }
    setCliente(clienteInicial);
    setDataConversa(hojeIsoLocal());
    setHoraConversa(agoraHorarioLocal());
    setDescricao('');
  }, [visible, conversa, clienteInicial, todosClientes]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (conversa) {
        return atualizarConversaCliente({
          id: conversa.id,
          dataConversa,
          horaConversa,
          descricao,
        });
      }
      if (!cliente) throw new Error('Selecione um cliente.');
      return criarConversaCliente({
        clienteId: cliente.id,
        dataConversa,
        horaConversa,
        descricao,
        adminEmail,
      });
    },
    onSuccess: () => {
      setErro(null);
      onSaved();
      onClose();
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao salvar conversa'),
  });

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <ScrollView
          style={{ width: '100%', maxWidth: 520, maxHeight: '90%' }}
          contentContainerStyle={{ flexGrow: 0 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 18 }}>
              {editando ? 'Editar conversa' : 'Nova conversa'}
            </Text>
            <FormField label="Cliente" required>
              {editando ? (
                <Text style={{ color: theme.headerText, fontWeight: '700' }}>
                  {conversa ? rotuloClienteConversa(conversa) : 'Cliente'}
                </Text>
              ) : (
                <ClienteSearchPicker
                  todosClientes={todosClientes}
                  value={cliente}
                  onChange={setCliente}
                  loading={loadingClientes}
                />
              )}
            </FormField>
            <FormField label="Data da conversa" required>
              <FormDateInput value={dataConversa} onChange={setDataConversa} />
            </FormField>
            <FormField label="Horário da conversa" required>
              <FormTimeInput value={horaConversa} onChange={setHoraConversa} />
            </FormField>
            <FormField label="O que foi conversado" required>
              <FormInput
                value={descricao}
                onChangeText={setDescricao}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                placeholder="Descreva o assunto, combinados, pendências…"
                style={{ minHeight: 100, height: 100, paddingTop: 12 }}
              />
            </FormField>
            {erro ? <Text style={{ color: theme.error, fontWeight: '700' }}>{erro}</Text> : null}
            <PrimaryButton
              label={editando ? 'Salvar alterações' : 'Registrar conversa'}
              loading={salvar.isPending}
              onPress={() => salvar.mutate()}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function ConversasScreen() {
  const { theme } = useTheme();
  const { adminProfile, canAccessScreen, canDeleteRecords } = useAdminAuth();
  const qc = useQueryClient();
  const { cliente_id: clienteIdParam } = useLocalSearchParams<{ cliente_id?: string }>();
  const clienteIdInicial = `${clienteIdParam ?? ''}`.trim();
  const clientePreSelecionadoRef = useRef<string | null>(null);

  const [formAberto, setFormAberto] = useState(false);
  const [conversaEditando, setConversaEditando] = useState<ClienteConversaComCliente | null>(null);
  const [clienteInicial, setClienteInicial] = useState<ClienteAzoupRow | null>(null);
  const [filtroClientes, setFiltroClientes] = useState<ClienteAzoupRow[]>([]);
  const [confirmarId, setConfirmarId] = useState<string | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);

  const clientesQ = useQuery({
    queryKey: ['clientes_selecao_conversas'],
    queryFn: listarClientesParaSelecao,
    enabled: canAccessScreen('conversas'),
  });

  const filtroIds = filtroClientes.map((c) => c.id).sort();
  const conversasQ = useQuery({
    queryKey: ['admin_cliente_conversas', 'lista', filtroIds.join(',')],
    queryFn: () => listarConversasClientes({ clienteIds: filtroIds }),
    enabled: canAccessScreen('conversas'),
  });

  const todosClientes = clientesQ.data ?? [];

  useEffect(() => {
    if (!clienteIdInicial || !todosClientes.length) return;
    if (clientePreSelecionadoRef.current === clienteIdInicial) return;
    const encontrado = todosClientes.find((c) => c.id === clienteIdInicial);
    if (!encontrado) return;
    clientePreSelecionadoRef.current = clienteIdInicial;
    setFiltroClientes([encontrado]);
    setClienteInicial(encontrado);
    setConversaEditando(null);
    setFormAberto(true);
  }, [clienteIdInicial, todosClientes]);

  function invalidar() {
    void qc.invalidateQueries({ queryKey: ['admin_cliente_conversas'] });
    void qc.invalidateQueries({ queryKey: ['clientes_com_conversas'] });
    void qc.invalidateQueries({ queryKey: ['acompanhamento_ultimos_contatos'] });
  }

  const excluir = useMutation({
    mutationFn: excluirConversaCliente,
    onSuccess: () => {
      setErroLista(null);
      setConfirmarId(null);
      invalidar();
    },
    onError: (e) => setErroLista(e instanceof Error ? e.message : 'Erro ao excluir conversa'),
  });

  if (!canAccessScreen('conversas')) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: theme.background }}>
        <Text style={{ color: theme.warning, fontWeight: '800' }}>Seu perfil não tem acesso a Conversas.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        data={conversasQ.data ?? []}
        keyExtractor={(item) => item.id}
        refreshing={conversasQ.isRefetching}
        onRefresh={() => conversasQ.refetch()}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <PageHeader
              title="Histórico de conversas"
              subtitle="Filtre por um ou mais clientes. O registro novo abre em uma janela."
              trailing={
                <Pressable
                  onPress={() => {
                    setConversaEditando(null);
                    setClienteInicial(null);
                    setFormAberto(true);
                  }}
                  style={({ pressed }) => [
                    styles.novaBtn,
                    { backgroundColor: theme.cadastroAction, opacity: pressed ? 0.88 : 1 },
                  ]}
                >
                  <Text style={{ color: theme.cadastroActionText, fontWeight: '800', fontSize: 13 }}>Nova conversa</Text>
                </Pressable>
              }
            />

            <ScreenCard style={{ gap: 10 }}>
              <SectionTitle>Filtrar clientes</SectionTitle>
              <ClienteMultiSelect
                clientes={todosClientes}
                selecionados={filtroClientes}
                onChange={setFiltroClientes}
                loading={clientesQ.isLoading}
              />
              <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                {filtroClientes.length === 0
                  ? 'Exibindo conversas de todos os clientes.'
                  : `Exibindo conversas de ${filtroClientes.length} cliente${filtroClientes.length === 1 ? '' : 's'}.`}
              </Text>
            </ScreenCard>

            {erroLista ? <Text style={{ color: theme.error, fontWeight: '700' }}>{erroLista}</Text> : null}
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
        renderItem={({ item }) => (
          <ConversaClienteCard
            conversa={item}
            acoes={
              canDeleteRecords && confirmarId === item.id ? (
                <>
                  <Pressable
                    onPress={() => {
                      if (!canDeleteRecords) return;
                      excluir.mutate(item.id);
                    }}
                    hitSlop={8}
                    accessibilityLabel="Confirmar exclusão"
                  >
                    <FontAwesome name="trash" size={15} color={theme.error} />
                  </Pressable>
                  <Pressable onPress={() => setConfirmarId(null)} hitSlop={8} accessibilityLabel="Cancelar">
                    <FontAwesome name="times" size={16} color={theme.textMuted} />
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    onPress={() => {
                      setErroLista(null);
                      setConfirmarId(null);
                      setConversaEditando(item);
                      setClienteInicial(null);
                      setFormAberto(true);
                    }}
                    hitSlop={8}
                    accessibilityLabel="Editar"
                  >
                    <FontAwesome name="pencil" size={15} color={theme.cadastroAction} />
                  </Pressable>
                  {canDeleteRecords ? (
                    <Pressable
                      onPress={() => {
                        setErroLista(null);
                        setConfirmarId(item.id);
                      }}
                      hitSlop={8}
                      accessibilityLabel="Excluir"
                    >
                      <FontAwesome name="trash" size={15} color={theme.error} />
                    </Pressable>
                  ) : null}
                </>
              )
            }
          />
        )}
      />

      <ConversaFormModal
        visible={formAberto}
        conversa={conversaEditando}
        clienteInicial={clienteInicial}
        todosClientes={todosClientes}
        loadingClientes={clientesQ.isLoading}
        adminEmail={adminProfile?.email}
        onClose={() => {
          setFormAberto(false);
          setConversaEditando(null);
        }}
        onSaved={invalidar}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  novaBtn: { minHeight: 36, borderRadius: 8, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: { width: '100%', borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
});
