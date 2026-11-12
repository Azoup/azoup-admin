import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { FormDateInput } from '@/components/ui/FormDateInput';
import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Text } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import {
  listarSnapshotsResumo,
  montarPayloadFormularioResumo,
  obterUltimoSnapshotResumo,
  salvarSnapshotResumo,
  type ResumoSnapshotRow,
} from '@/src/services/repos/acompanhamento-resumo-repo';
import {
  listarTicketsAbertosPorCliente,
  numeroTicket,
  type TicketConfecAberto,
} from '@/src/services/repos/confec-kanban-repo';
import {
  CAMPOS_USO_POR_SECAO,
  RESUMO_SECAO_CONFEC,
  RESUMO_SECAO_LABEL,
  RESUMO_SECOES,
  TREINOU_LABEL,
  TREINOU_STATUS,
  formatarMetricaUso,
  metricaVazia,
  normalizarPayload,
  textoUsoSecao,
  type ResumoPayload,
  type ResumoSecaoId,
  type TreinouStatus,
} from '@/src/utils/acompanhamento-resumo';
import { formatDateTimeBR } from '@/src/utils/format';

type Props = {
  clienteId: string;
  clienteNome?: string | null;
};

function ticketsDaSecao(tickets: TicketConfecAberto[], secao: ResumoSecaoId): TicketConfecAberto[] {
  const alvo = RESUMO_SECAO_CONFEC[secao];
  return tickets.filter((t) => `${t.secao ?? ''}`.trim() === alvo);
}

function TextoTickets({ tickets }: { tickets: TicketConfecAberto[] }) {
  const { theme } = useTheme();
  if (!tickets.length) {
    return <Text style={{ color: theme.textMuted, fontSize: 12 }}>—</Text>;
  }
  return (
    <View style={{ gap: 2 }}>
      {tickets.map((t) => (
        <Text key={t.id} style={{ color: theme.cadastroAction, fontWeight: '700', fontSize: 12 }}>
          #{numeroTicket(t.ticket_number)}
          {t.titulo ? ` · ${t.titulo}` : ''}
        </Text>
      ))}
    </View>
  );
}

export function AcompanhamentoResumoPanel({ clienteId, clienteNome }: Props) {
  const { theme } = useTheme();
  const { adminProfile, session } = useAdminAuth();
  const qc = useQueryClient();
  const [formAberto, setFormAberto] = useState(false);

  const ultimoQ = useQuery({
    queryKey: ['admin_cliente_resumo_ultimo', clienteId],
    queryFn: () => obterUltimoSnapshotResumo(clienteId),
    enabled: Boolean(clienteId),
  });

  const ticketsQ = useQuery({
    queryKey: ['confec_tickets_abertos', clienteId],
    queryFn: () => listarTicketsAbertosPorCliente(clienteId),
    enabled: Boolean(clienteId),
  });

  const payload = ultimoQ.data?.payload ?? null;
  const tickets = ticketsQ.data ?? [];

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 16, flex: 1 }}>
          Resumo{clienteNome ? ` · ${clienteNome}` : ''}
        </Text>
        <Pressable
          onPress={() => setFormAberto(true)}
          style={({ pressed }) => [
            styles.botao,
            { backgroundColor: theme.cadastroAction, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <FontAwesome name="pencil" size={12} color={theme.cadastroActionText} />
          <Text style={{ color: theme.cadastroActionText, fontWeight: '800', fontSize: 13 }}>Atualizar uso</Text>
        </Pressable>
      </View>

      {ultimoQ.isLoading || ticketsQ.isLoading ? <ActivityIndicator color={theme.cadastroAction} /> : null}
      {ultimoQ.isError ? (
        <Text style={{ color: theme.error }}>{(ultimoQ.error as Error).message}</Text>
      ) : null}
      {ticketsQ.isError ? (
        <Text style={{ color: theme.error }}>{(ticketsQ.error as Error).message}</Text>
      ) : null}

      {!ultimoQ.isLoading ? (
        <View style={[styles.tabela, { borderColor: theme.border }]}>
          <View style={[styles.linhaCabecalho, { backgroundColor: theme.surfaceMuted, borderBottomColor: theme.border }]}>
            <Text style={[styles.celSecao, { color: theme.textMuted, fontWeight: '800' }]}>Seção</Text>
            <Text style={[styles.celTreinou, { color: theme.textMuted, fontWeight: '800' }]}>Treinou</Text>
            <Text style={[styles.celUso, { color: theme.textMuted, fontWeight: '800' }]}>Uso</Text>
            <Text style={[styles.celPend, { color: theme.textMuted, fontWeight: '800' }]}>Pendência</Text>
          </View>
          {RESUMO_SECOES.map((secao) => {
            const bloco = payload?.[secao];
            const treinou = bloco?.treinou ?? 'nao_treinou';
            return (
              <View
                key={secao}
                style={[styles.linha, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}
              >
                <Text style={[styles.celSecao, { color: theme.headerText, fontWeight: '800' }]}>
                  {RESUMO_SECAO_LABEL[secao]}
                </Text>
                <Text style={[styles.celTreinou, { color: theme.text, fontSize: 12 }]}>
                  {TREINOU_LABEL[treinou]}
                </Text>
                <Text style={[styles.celUso, { color: theme.text, fontSize: 12, lineHeight: 17 }]}>
                  {textoUsoSecao(secao, bloco?.uso ?? {})}
                </Text>
                <View style={styles.celPend}>
                  <TextoTickets tickets={ticketsDaSecao(tickets, secao)} />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {ultimoQ.data ? (
        <Text style={{ color: theme.textMuted, fontSize: 12 }}>
          Última atualização {formatDateTimeBR(ultimoQ.data.created_at)}
          {ultimoQ.data.admin_email ? ` · ${ultimoQ.data.admin_email}` : ''}
        </Text>
      ) : !ultimoQ.isLoading ? (
        <Text style={{ color: theme.textMuted, fontSize: 13 }}>
          Ainda não há registro de uso. Clique em Atualizar uso para lançar o primeiro.
        </Text>
      ) : null}

      <AtualizarUsoResumoModal
        visible={formAberto}
        clienteId={clienteId}
        onClose={() => setFormAberto(false)}
        onSaved={() => {
          void qc.invalidateQueries({ queryKey: ['admin_cliente_resumo_ultimo', clienteId] });
          void qc.invalidateQueries({ queryKey: ['admin_cliente_resumo_historico', clienteId] });
          setFormAberto(false);
        }}
        adminEmail={adminProfile?.email ?? session?.user?.email ?? null}
      />
    </View>
  );
}

function AtualizarUsoResumoModal({
  visible,
  clienteId,
  onClose,
  onSaved,
  adminEmail,
}: {
  visible: boolean;
  clienteId: string;
  onClose: () => void;
  onSaved: () => void;
  adminEmail?: string | null;
}) {
  const { theme } = useTheme();
  const [payload, setPayload] = useState<ResumoPayload>(() => normalizarPayload(null));
  const [erro, setErro] = useState<string | null>(null);
  const [sugerido, setSugerido] = useState(false);

  const historicoQ = useQuery({
    queryKey: ['admin_cliente_resumo_historico', clienteId],
    queryFn: () => listarSnapshotsResumo(clienteId),
    enabled: visible && Boolean(clienteId),
  });

  const carregarQ = useQuery({
    queryKey: ['admin_cliente_resumo_form', clienteId, visible],
    queryFn: () => montarPayloadFormularioResumo(clienteId),
    enabled: visible && Boolean(clienteId),
  });

  useEffect(() => {
    if (!visible || !carregarQ.data) return;
    setPayload(carregarQ.data.payload);
    setSugerido(carregarQ.data.sugerido);
    setErro(null);
  }, [visible, carregarQ.data]);

  const salvar = useMutation({
    mutationFn: () =>
      salvarSnapshotResumo({
        clienteId,
        payload,
        adminEmail,
      }),
    onSuccess: () => {
      setErro(null);
      onSaved();
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao salvar'),
  });

  function setTreinou(secao: ResumoSecaoId, treinou: TreinouStatus) {
    setPayload((atual) => ({
      ...atual,
      [secao]: { ...atual[secao], treinou },
    }));
  }

  function setMetrica(
    secao: ResumoSecaoId,
    campo: keyof ResumoPayload[ResumoSecaoId]['uso'],
    patch: Partial<{ quantidade: string; ultima_data: string }>,
  ) {
    setPayload((atual) => {
      const atualM = atual[secao].uso[campo] ?? metricaVazia();
      let quantidade = atualM.quantidade;
      if (patch.quantidade !== undefined) {
        const t = patch.quantidade.trim();
        quantidade = t === '' ? null : Number(t);
        if (quantidade != null && !Number.isFinite(quantidade)) quantidade = null;
      }
      return {
        ...atual,
        [secao]: {
          ...atual[secao],
          uso: {
            ...atual[secao].uso,
            [campo]: {
              quantidade,
              ultima_data:
                patch.ultima_data !== undefined
                  ? /^\d{4}-\d{2}-\d{2}$/.test(patch.ultima_data.trim())
                    ? patch.ultima_data.trim()
                    : null
                  : atualM.ultima_data,
            },
          },
        },
      };
    });
  }

  function carregarHistorico(item: ResumoSnapshotRow) {
    setPayload(item.payload);
    setSugerido(false);
    setErro(null);
  }

  const historico = useMemo(() => historicoQ.data ?? [], [historicoQ.data]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border, zIndex: 2 }]}>
          <View style={styles.tituloRow}>
            <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 16, flex: 1 }}>
              Atualizar uso / treinou
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <FontAwesome name="times" size={16} color={theme.textMuted} />
            </Pressable>
          </View>
          {sugerido ? (
            <Text style={{ color: theme.cadastroAction, fontSize: 12, fontWeight: '700' }}>
              Valores sugeridos a partir do sistema. Revise e salve para registrar.
            </Text>
          ) : null}

          <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: 14, paddingBottom: 8 }}>
            {carregarQ.isLoading ? <ActivityIndicator color={theme.cadastroAction} /> : null}

            {RESUMO_SECOES.map((secao) => (
              <View key={secao} style={[styles.blocoSecao, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 14 }}>
                  {RESUMO_SECAO_LABEL[secao]}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700' }}>Treinou</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {TREINOU_STATUS.map((status) => {
                    const ativo = payload[secao].treinou === status;
                    return (
                      <Pressable
                        key={status}
                        onPress={() => setTreinou(secao, status)}
                        style={[
                          styles.chip,
                          {
                            borderColor: ativo ? theme.cadastroAction : theme.border,
                            backgroundColor: ativo ? theme.surfaceMuted : theme.background,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: ativo ? theme.cadastroAction : theme.text,
                            fontWeight: ativo ? '800' : '600',
                            fontSize: 12,
                          }}
                        >
                          {TREINOU_LABEL[status]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {CAMPOS_USO_POR_SECAO[secao].length === 0 ? (
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>Sem campos de uso por enquanto.</Text>
                ) : (
                  CAMPOS_USO_POR_SECAO[secao].map((campo) => {
                    const m = payload[secao].uso[campo.key] ?? metricaVazia();
                    return (
                      <View key={campo.key} style={{ gap: 6 }}>
                        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{campo.label}</Text>
                        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                          <View style={{ flexGrow: 1, flexBasis: 120, minWidth: 100 }}>
                            <FormField label="Quantidade">
                              <FormInput
                                value={m.quantidade == null ? '' : `${m.quantidade}`}
                                onChangeText={(quantidade) => setMetrica(secao, campo.key, { quantidade })}
                                keyboardType="number-pad"
                                placeholder="0"
                              />
                            </FormField>
                          </View>
                          <View style={{ flexGrow: 1, flexBasis: 140, minWidth: 120 }}>
                            <FormField label="Última data">
                              <FormDateInput
                                value={m.ultima_data ?? ''}
                                onChange={(ultima_data) => setMetrica(secao, campo.key, { ultima_data })}
                              />
                            </FormField>
                          </View>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            ))}

            <View style={{ gap: 8 }}>
              <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 14 }}>Histórico</Text>
              {historicoQ.isLoading ? <ActivityIndicator color={theme.cadastroAction} /> : null}
              {!historicoQ.isLoading && historico.length === 0 ? (
                <Text style={{ color: theme.textMuted, fontSize: 13 }}>Nenhum registro anterior.</Text>
              ) : null}
              {historico.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => carregarHistorico(item)}
                  style={[styles.histItem, { borderColor: theme.border, backgroundColor: theme.surface }]}
                >
                  <Text style={{ color: theme.headerText, fontWeight: '700', fontSize: 13 }}>
                    {formatDateTimeBR(item.created_at)}
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                    {item.admin_email?.trim() || '—'} · toque para carregar no formulário
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>
                    Cadastros clientes: {formatarMetricaUso(item.payload.cadastros.uso.clientes)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          {erro ? <Text style={{ color: theme.error, fontWeight: '700' }}>{erro}</Text> : null}
          <PrimaryButton
            label="Salvar novo registro"
            loading={salvar.isPending}
            onPress={() => salvar.mutate()}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  botao: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabela: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  linhaCabecalho: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 6,
  },
  linha: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 6,
    alignItems: 'flex-start',
  },
  celSecao: { flexBasis: '18%', flexGrow: 0, flexShrink: 0, fontSize: 12 },
  celTreinou: { flexBasis: '20%', flexGrow: 0, flexShrink: 0 },
  celUso: { flex: 1, flexGrow: 1 },
  celPend: { flexBasis: '22%', flexGrow: 0, flexShrink: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 720,
    maxHeight: '92%',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  tituloRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  blocoSecao: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  histItem: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 2 },
});
