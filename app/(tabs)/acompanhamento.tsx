import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { FormDateInput } from '@/components/ui/FormDateInput';
import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { FormTimeInput } from '@/components/ui/FormTimeInput';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { RegistrarReuniaoModal } from '@/components/ui/RegistrarReuniaoModal';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Text } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { registrarAuditoria } from '@/src/services/audit';
import { useTheme } from '@/src/contexts/ThemeContext';
import { carregarAcompanhamentoClientes } from '@/src/services/repos/acompanhamento-repo';
import { buscarMetricasUsoCliente } from '@/src/services/repos/clientes-repo';
import { atualizarConversaCliente, criarConversaCliente, excluirConversaCliente, listarConversasClientes, listarUltimoContatoPorCliente } from '@/src/services/repos/conversas-repo';
import {
  atualizarReuniaoCliente,
  excluirReuniaoCliente,
  listarReunioesDoCliente,
  resumirReunioesPorCliente,
  type ResumoReunioesCliente,
  type ReuniaoClienteRow,
} from '@/src/services/repos/reunioes-repo';
import { moverClienteKanban, salvarFichaAcompanhamento } from '@/src/services/repos/kanban-acompanhamento-repo';
import {
  ACOMPANHAMENTO_COLUNAS,
  agrupamentoAcompanhamentoVazio,
  iniciaisNome,
  rotuloTempoCadastro,
  isAcompanhamentoColuna,
  type AcompanhamentoCliente,
  type AcompanhamentoColuna,
} from '@/src/utils/acompanhamento';
import {
  colunaSobPonto,
  marcarColuna,
  marcarScrollKanban,
  posicionarFantasma,
  SemArraste,
  useCardPointerDrag,
} from '@/src/utils/kanban-drag';
import { agoraHorarioLocal, hojeIsoLocal } from '@/src/utils/conversa-datetime';
import { dataCalendarioBrasil, formatConversaQuando, formatDateTimeBR, formatYmdBR } from '@/src/utils/format';
import type { AdminClienteConversaRow } from '@/src/types/azoup';
import { digitsOnlyPhone } from '@/src/utils/whatsapp';

const COL_WIDTH = 300;
const SCROLL_ACOMPANHAMENTO = '[data-kanban-scroll="acompanhamento"]';
const AVATAR = '#FF7A1A';
const PENDENCIA = '#FF7A1A';

type Board = Awaited<ReturnType<typeof carregarAcompanhamentoClientes>>;

function recomporBoard(clientes: AcompanhamentoCliente[]): Board {
  const porColuna = agrupamentoAcompanhamentoVazio();
  for (const c of clientes) {
    const destino = porColuna[c.coluna] ? c.coluna : 'fila_espera';
    porColuna[destino].push({ ...c, coluna: destino, etiqueta: destino });
  }
  return { clientes, porColuna, porEtiqueta: porColuna };
}

function matchBusca(item: AcompanhamentoCliente, busca: string): boolean {
  const q = busca.trim().toLowerCase();
  if (!q) return true;
  const qDigits = digitsOnlyPhone(q);
  const texto = [item.nome, item.email, item.telefone, item.celular, item.empresa_nome, item.empresa_cnpj]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (texto.includes(q)) return true;
  if (qDigits.length >= 3) {
    const digits = digitsOnlyPhone(`${item.telefone ?? ''}${item.celular ?? ''}${item.empresa_cnpj ?? ''}`);
    if (digits.includes(qDigits)) return true;
  }
  return false;
}

function dataOuTraco(ymd?: string | null): string {
  const texto = formatYmdBR(ymd);
  return texto === '—' ? '—' : texto;
}

function ConversaModal({
  cliente,
  visible,
  onClose,
  onSaved,
}: {
  cliente: AcompanhamentoCliente | null;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { theme } = useTheme();
  const { adminProfile, session } = useAdminAuth();
  const [dataConversa, setDataConversa] = useState(hojeIsoLocal);
  const [horaConversa, setHoraConversa] = useState(agoraHorarioLocal);
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDataConversa(hojeIsoLocal());
    setHoraConversa(agoraHorarioLocal());
    setDescricao('');
    setErro(null);
  }, [visible, cliente?.id]);

  const salvarMutation = useMutation({
    mutationFn: async () => {
      if (!cliente) throw new Error('Cliente inválido.');
      return criarConversaCliente({
        clienteId: cliente.id,
        dataConversa,
        horaConversa,
        descricao,
        adminEmail: adminProfile?.email ?? session?.user?.email ?? null,
      });
    },
    onSuccess: () => {
      setDescricao('');
      setErro(null);
      onSaved();
      onClose();
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao registrar conversa'),
  });

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.conversaCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.rowBetween}>
            <SectionTitle>Novo registro</SectionTitle>
            <Pressable onPress={onClose} hitSlop={10}>
              <FontAwesome name="times" size={16} color={theme.textMuted} />
            </Pressable>
          </View>

          <FormField label="Cliente">
            <View style={[styles.clienteFixo, { borderColor: theme.borderInput, backgroundColor: theme.inputBg }]}>
              <Text style={{ color: theme.text, fontSize: 15 }} numberOfLines={1}>
                {cliente?.empresa_nome?.trim() || cliente?.nome || '—'}
              </Text>
            </View>
          </FormField>

          <FormField label="Data da conversa" required>
            <FormDateInput value={dataConversa} onChange={setDataConversa} />
          </FormField>

          <FormField label="Horário" required>
            <FormTimeInput value={horaConversa} onChange={setHoraConversa} />
          </FormField>

          <FormField label="O que foi conversado" required>
            <FormInput
              value={descricao}
              onChangeText={setDescricao}
              placeholder="Descreva o assunto, combinados, pendências..."
              multiline
              style={{ minHeight: 96, textAlignVertical: 'top' }}
            />
          </FormField>

          {erro ? <Text style={{ color: theme.error }}>{erro}</Text> : null}

          <PrimaryButton
            label="REGISTRAR CONVERSA"
            loading={salvarMutation.isPending}
            onPress={() => {
              setErro(null);
              salvarMutation.mutate();
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

function FichaModal({
  cliente,
  visible,
  onClose,
  saving,
  erro,
  onSalvar,
}: {
  cliente: AcompanhamentoCliente | null;
  visible: boolean;
  onClose: () => void;
  saving: boolean;
  erro: string | null;
  onSalvar: (ficha: {
    proximaReuniao: string;
    ultimaDificuldade: string;
    proximaAcao: string;
  }) => void;
}) {
  const { theme } = useTheme();
  const [proximaReuniao, setProximaReuniao] = useState('');
  const [dificuldade, setDificuldade] = useState('');
  const [proximaAcao, setProximaAcao] = useState('');

  useEffect(() => {
    if (!visible || !cliente) return;
    setProximaReuniao(`${cliente.proxima_reuniao ?? ''}`.slice(0, 10));
    setDificuldade(cliente.ultima_dificuldade ?? '');
    setProximaAcao(cliente.proxima_acao ?? '');
  }, [visible, cliente]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <ScrollView
          style={{ width: '100%', maxWidth: 440, maxHeight: '90%' }}
          contentContainerStyle={{ flexGrow: 0 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.moverCard, { backgroundColor: theme.surface, borderColor: theme.border, maxWidth: 440 }]}>
            <Text style={{ fontWeight: '800', fontSize: 16, color: theme.headerText }}>
              Ficha · {cliente?.nome ?? 'Cliente'}
            </Text>
            <FormField label="Próxima reunião">
              <FormDateInput value={proximaReuniao} onChange={setProximaReuniao} />
            </FormField>
            <FormField label="Última dificuldade">
              <FormInput value={dificuldade} onChangeText={setDificuldade} placeholder="Ex.: Dúvida no cadastro de produtos" />
            </FormField>
            <FormField label="Próxima ação">
              <FormInput value={proximaAcao} onChangeText={setProximaAcao} placeholder="Ex.: Confirmar uso do módulo de PDV" />
            </FormField>
            {erro ? <Text style={{ color: theme.error }}>{erro}</Text> : null}
            <PrimaryButton
              label="Salvar ficha"
              loading={saving}
              onPress={() =>
                onSalvar({
                  proximaReuniao,
                  ultimaDificuldade: dificuldade,
                  proximaAcao,
                })
              }
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function MoverModal({
  cliente,
  visible,
  onClose,
  onMover,
  moving,
}: {
  cliente: AcompanhamentoCliente | null;
  visible: boolean;
  onClose: () => void;
  onMover: (coluna: AcompanhamentoColuna) => void;
  moving: boolean;
}) {
  const { theme } = useTheme();
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.moverCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={{ fontWeight: '800', fontSize: 16, color: theme.headerText }}>
            Mover · {cliente?.nome ?? 'Cliente'}
          </Text>
          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }}>
            {ACOMPANHAMENTO_COLUNAS.map((col) => {
              const ativa = cliente?.coluna === col.key;
              return (
                <Pressable
                  key={col.key}
                  disabled={moving || ativa}
                  onPress={() => onMover(col.key)}
                  style={({ pressed }) => [
                    styles.moverOpt,
                    {
                      borderColor: col.cor,
                      backgroundColor: ativa ? `${col.cor}22` : theme.surfaceMuted,
                      opacity: moving ? 0.6 : pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text style={{ color: theme.headerText, fontWeight: '700' }}>
                    {col.label}
                    {ativa ? ' (atual)' : ''}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {moving ? <ActivityIndicator color={theme.cadastroAction} /> : null}
        </View>
      </View>
    </Modal>
  );
}

function AcoesRegistro({
  confirmar,
  podeExcluir,
  onEditar,
  onPedirExclusao,
  onCancelarExclusao,
  onConfirmarExclusao,
}: {
  confirmar: boolean;
  podeExcluir: boolean;
  onEditar: () => void;
  onPedirExclusao: () => void;
  onCancelarExclusao: () => void;
  onConfirmarExclusao: () => void;
}) {
  const { theme } = useTheme();
  if (podeExcluir && confirmar) {
    return (
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <Pressable onPress={onConfirmarExclusao} hitSlop={8} accessibilityLabel="Confirmar exclusão">
          <FontAwesome name="trash" size={15} color={theme.error} />
        </Pressable>
        <Pressable onPress={onCancelarExclusao} hitSlop={8} accessibilityLabel="Cancelar">
          <FontAwesome name="times" size={16} color={theme.textMuted} />
        </Pressable>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
      <Pressable onPress={onEditar} hitSlop={8} accessibilityLabel="Editar">
        <FontAwesome name="pencil" size={15} color={theme.cadastroAction} />
      </Pressable>
      {podeExcluir ? (
        <Pressable onPress={onPedirExclusao} hitSlop={8} accessibilityLabel="Excluir">
          <FontAwesome name="trash" size={15} color={theme.error} />
        </Pressable>
      ) : null}
    </View>
  );
}

function EditarReuniaoBloco({
  reuniao,
  saving,
  podeAlterarData,
  onCancelar,
  onSalvar,
}: {
  reuniao: ReuniaoClienteRow;
  saving: boolean;
  podeAlterarData: boolean;
  onCancelar: () => void;
  onSalvar: (valor: {
    pendencia: string;
    dataRetorno: string;
    assuntos: string;
    proximaAcao: string;
    dataRegistro?: string;
  }) => void;
}) {
  const { theme } = useTheme();
  const [pendencia, setPendencia] = useState(reuniao.pendencia ?? '');
  const [dataRetorno, setDataRetorno] = useState(`${reuniao.data_retorno ?? ''}`.slice(0, 10));
  const [dataRegistro, setDataRegistro] = useState(dataCalendarioBrasil(reuniao.created_at) ?? '');
  const [assuntos, setAssuntos] = useState(reuniao.assuntos ?? '');
  const [proximaAcao, setProximaAcao] = useState(reuniao.proxima_acao ?? '');

  return (
    <View style={{ gap: 8, marginTop: 8 }}>
      {podeAlterarData ? (
        <FormField label="Data do registro">
          <FormDateInput value={dataRegistro} onChange={setDataRegistro} />
        </FormField>
      ) : null}
      <FormField label="Pendência">
        <FormInput value={pendencia} onChangeText={setPendencia} multiline style={styles.areaHistorico} />
      </FormField>
      <FormField label="Data do retorno">
        <FormDateInput value={dataRetorno} onChange={setDataRetorno} />
      </FormField>
      <FormField label="Assuntos tratados">
        <FormInput value={assuntos} onChangeText={setAssuntos} multiline style={styles.areaHistorico} />
      </FormField>
      <FormField label="Próxima ação">
        <FormInput value={proximaAcao} onChangeText={setProximaAcao} multiline style={styles.areaHistorico} />
      </FormField>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <PrimaryButton
          label="Salvar"
          loading={saving}
          onPress={() =>
            onSalvar({
              pendencia,
              dataRetorno,
              assuntos,
              proximaAcao,
              dataRegistro: podeAlterarData ? dataRegistro : undefined,
            })
          }
          style={{ flex: 1 }}
        />
        <Pressable onPress={onCancelar} style={styles.cancelarHistorico}>
          <Text style={{ color: theme.textMuted, fontWeight: '800' }}>Cancelar</Text>
        </Pressable>
      </View>
    </View>
  );
}

function EditarConversaBloco({
  conversa,
  saving,
  onCancelar,
  onSalvar,
}: {
  conversa: AdminClienteConversaRow;
  saving: boolean;
  onCancelar: () => void;
  onSalvar: (valor: { dataConversa: string; horaConversa: string; descricao: string }) => void;
}) {
  const { theme } = useTheme();
  const [dataConversa, setDataConversa] = useState(`${conversa.data_conversa ?? ''}`.slice(0, 10));
  const [horaConversa, setHoraConversa] = useState(`${conversa.hora_conversa ?? ''}`.slice(0, 5));
  const [descricao, setDescricao] = useState(conversa.descricao ?? '');

  return (
    <View style={{ gap: 8, marginTop: 8 }}>
      <FormField label="Data">
        <FormDateInput value={dataConversa} onChange={setDataConversa} />
      </FormField>
      <FormField label="Horário">
        <FormTimeInput value={horaConversa} onChange={setHoraConversa} />
      </FormField>
      <FormField label="O que foi conversado">
        <FormInput value={descricao} onChangeText={setDescricao} multiline style={styles.areaHistorico} />
      </FormField>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <PrimaryButton
          label="Salvar"
          loading={saving}
          onPress={() => onSalvar({ dataConversa, horaConversa, descricao })}
          style={{ flex: 1 }}
        />
        <Pressable onPress={onCancelar} style={styles.cancelarHistorico}>
          <Text style={{ color: theme.textMuted, fontWeight: '800' }}>Cancelar</Text>
        </Pressable>
      </View>
    </View>
  );
}

function HistoricoClienteModal({
  cliente,
  visible,
  onClose,
}: {
  cliente: AcompanhamentoCliente | null;
  visible: boolean;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const { adminProfile, canDeleteRecords, papel } = useAdminAuth();
  const podeAlterarDataRegistro = papel === 'owner';
  const qc = useQueryClient();
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [confirmarId, setConfirmarId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const telefone = cliente?.telefone?.trim() || '';
  const celular = cliente?.celular?.trim() || '';
  const contato = [telefone, celular && celular !== telefone ? celular : ''].filter(Boolean).join(' · ') || '—';
  const cadastroEm = formatYmdBR(dataCalendarioBrasil(cliente?.created_at));

  const reunioesQ = useQuery({
    queryKey: ['admin_cliente_reunioes', cliente?.id, 'historico'],
    queryFn: () => listarReunioesDoCliente(cliente!.id),
    enabled: visible && Boolean(cliente?.id),
  });

  const conversasQ = useQuery({
    queryKey: ['admin_cliente_conversas', cliente?.id, 'historico'],
    queryFn: () => listarConversasClientes({ clienteId: cliente!.id, limit: 50 }),
    enabled: visible && Boolean(cliente?.id),
  });

  const acessoQ = useQuery({
    queryKey: ['cliente_ultimo_acesso', cliente?.id],
    queryFn: () => buscarMetricasUsoCliente(cliente!.id),
    enabled: visible && Boolean(cliente?.id),
  });

  useEffect(() => {
    if (visible) return;
    setEditandoId(null);
    setConfirmarId(null);
    setErro(null);
  }, [visible]);

  function invalidarHistorico() {
    void qc.invalidateQueries({ queryKey: ['admin_cliente_reunioes'] });
    void qc.invalidateQueries({ queryKey: ['admin_cliente_conversas'] });
    void qc.invalidateQueries({ queryKey: ['pendencias_abertas'] });
    void qc.invalidateQueries({ queryKey: ['acompanhamento_ultimos_contatos'] });
    void qc.invalidateQueries({ queryKey: ['admin_audit_logs'] });
  }

  const salvarReuniao = useMutation({
    mutationFn: async (params: {
      id: string;
      pendencia: string;
      dataRetorno: string;
      assuntos: string;
      proximaAcao: string;
      dataRegistro?: string;
    }) => {
      const anterior = (reunioesQ.data ?? []).find((r) => r.id === params.id);
      if (podeAlterarDataRegistro && !/^\d{4}-\d{2}-\d{2}$/.test(`${params.dataRegistro ?? ''}`.trim())) {
        throw new Error('Informe a data do registro.');
      }
      await atualizarReuniaoCliente({
        ...params,
        dataRegistro: podeAlterarDataRegistro ? params.dataRegistro : null,
        createdAtAtual: anterior?.created_at,
      });
      await registrarAuditoria(
        { id: adminProfile?.id, email: adminProfile?.email },
        {
          acao: 'REUNIAO_UPDATE',
          entidade: 'admin_cliente_reunioes',
          entidade_id: params.id,
          valores_anteriores: {
            cliente: cliente?.nome ?? null,
            data_registro: dataCalendarioBrasil(anterior?.created_at),
            pendencia: anterior?.pendencia ?? null,
            data_retorno: anterior?.data_retorno ?? null,
            assuntos: anterior?.assuntos ?? null,
            proxima_acao: anterior?.proxima_acao ?? null,
          },
          valores_novos: {
            cliente: cliente?.nome ?? null,
            data_registro: podeAlterarDataRegistro ? params.dataRegistro?.trim() || null : dataCalendarioBrasil(anterior?.created_at),
            pendencia: params.pendencia.trim(),
            data_retorno: params.dataRetorno.trim(),
            assuntos: params.assuntos.trim() || null,
            proxima_acao: params.proximaAcao.trim() || null,
          },
        },
      );
    },
    onSuccess: () => {
      setErro(null);
      setEditandoId(null);
      invalidarHistorico();
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao salvar reunião'),
  });

  const excluirReuniao = useMutation({
    mutationFn: async (id: string) => {
      if (!canDeleteRecords) throw new Error('Sem permissão para excluir.');
      const anterior = (reunioesQ.data ?? []).find((r) => r.id === id);
      await excluirReuniaoCliente(id);
      await registrarAuditoria(
        { id: adminProfile?.id, email: adminProfile?.email },
        {
          acao: 'REUNIAO_DELETE',
          entidade: 'admin_cliente_reunioes',
          entidade_id: id,
          valores_anteriores: {
            cliente: cliente?.nome ?? null,
            pendencia: anterior?.pendencia ?? null,
            data_retorno: anterior?.data_retorno ?? null,
            assuntos: anterior?.assuntos ?? null,
            proxima_acao: anterior?.proxima_acao ?? null,
          },
          valores_novos: null,
        },
      );
    },
    onSuccess: () => {
      setErro(null);
      setConfirmarId(null);
      setEditandoId(null);
      invalidarHistorico();
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao excluir reunião'),
  });

  const salvarConversa = useMutation({
    mutationFn: async (params: {
      id: string;
      dataConversa: string;
      horaConversa: string;
      descricao: string;
    }) => {
      const anterior = (conversasQ.data ?? []).find((c) => c.id === params.id);
      await atualizarConversaCliente(params);
      await registrarAuditoria(
        { id: adminProfile?.id, email: adminProfile?.email },
        {
          acao: 'CONVERSA_UPDATE',
          entidade: 'admin_cliente_conversas',
          entidade_id: params.id,
          valores_anteriores: {
            cliente: cliente?.nome ?? null,
            data_conversa: anterior?.data_conversa ?? null,
            hora_conversa: anterior?.hora_conversa ?? null,
            descricao: anterior?.descricao ?? null,
          },
          valores_novos: {
            cliente: cliente?.nome ?? null,
            data_conversa: params.dataConversa.trim(),
            hora_conversa: params.horaConversa.trim() || null,
            descricao: params.descricao.trim(),
          },
        },
      );
    },
    onSuccess: () => {
      setErro(null);
      setEditandoId(null);
      invalidarHistorico();
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao salvar conversa'),
  });

  const excluirConversa = useMutation({
    mutationFn: async (id: string) => {
      if (!canDeleteRecords) throw new Error('Sem permissão para excluir.');
      const anterior = (conversasQ.data ?? []).find((c) => c.id === id);
      await excluirConversaCliente(id);
      await registrarAuditoria(
        { id: adminProfile?.id, email: adminProfile?.email },
        {
          acao: 'CONVERSA_DELETE',
          entidade: 'admin_cliente_conversas',
          entidade_id: id,
          valores_anteriores: {
            cliente: cliente?.nome ?? null,
            data_conversa: anterior?.data_conversa ?? null,
            hora_conversa: anterior?.hora_conversa ?? null,
            descricao: anterior?.descricao ?? null,
          },
          valores_novos: null,
        },
      );
    },
    onSuccess: () => {
      setErro(null);
      setConfirmarId(null);
      setEditandoId(null);
      invalidarHistorico();
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao excluir conversa'),
  });

  const ocupado = salvarReuniao.isPending || excluirReuniao.isPending || salvarConversa.isPending || excluirConversa.isPending;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.historicoCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.rowBetween}>
            <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 18, flex: 1 }} numberOfLines={2}>
              {cliente?.nome ?? 'Cliente'}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <FontAwesome name="times" size={16} color={theme.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: 14, paddingBottom: 8 }}>
            <View style={{ gap: 4 }}>
              <Text style={[styles.secaoLabel, { color: theme.textMuted }]}>CADASTRO</Text>
              <Text style={{ color: theme.text, fontSize: 14 }}>
                Nome: <Text style={{ fontWeight: '800' }}>{cliente?.nome ?? '—'}</Text>
              </Text>
              <Text style={{ color: theme.text, fontSize: 14 }}>
                Telefone: <Text style={{ fontWeight: '800' }}>{contato}</Text>
              </Text>
              <Text style={{ color: theme.text, fontSize: 14 }}>
                Empresa: <Text style={{ fontWeight: '800' }}>{cliente?.empresa_nome?.trim() || '—'}</Text>
              </Text>
              <Text style={{ color: theme.text, fontSize: 14 }}>
                Plano: <Text style={{ fontWeight: '800' }}>{cliente?.plano_nome?.trim() || '—'}</Text>
              </Text>
              {cliente?.dias_trial_restantes != null ? (
                <Text style={{ color: theme.text, fontSize: 14 }}>
                  Trial:{' '}
                  <Text style={{ fontWeight: '800' }}>
                    {cliente.dias_trial_restantes} {cliente.dias_trial_restantes === 1 ? 'dia restante' : 'dias restantes'}
                    {cliente.trial_fim ? ` · até ${formatYmdBR(cliente.trial_fim)}` : ''}
                  </Text>
                </Text>
              ) : null}
              <Text style={{ color: theme.text, fontSize: 14 }}>
                Último acesso:{' '}
                <Text style={{ fontWeight: '800' }}>
                  {acessoQ.isLoading ? '…' : formatDateTimeBR(acessoQ.data?.ultimo_acesso)}
                </Text>
              </Text>
              <Text style={{ color: theme.text, fontSize: 14 }}>
                Desde {cadastroEm} · {rotuloTempoCadastro(cliente?.created_at)}
              </Text>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={[styles.secaoLabel, { color: theme.textMuted }]}>REUNIÕES</Text>
              {reunioesQ.isLoading ? (
                <ActivityIndicator color={theme.cadastroAction} />
              ) : reunioesQ.error ? (
                <Text style={{ color: theme.error }}>{(reunioesQ.error as Error).message}</Text>
              ) : (reunioesQ.data ?? []).length === 0 ? (
                <Text style={{ color: theme.textMuted, fontSize: 13 }}>Nenhuma reunião registrada.</Text>
              ) : (
                (reunioesQ.data ?? []).map((reuniao) => (
                  <View key={reuniao.id} style={[styles.historicoItem, { borderColor: theme.border }]}>
                    <View style={styles.rowBetween}>
                      <Text style={{ color: theme.textMuted, fontSize: 12, flex: 1 }}>
                        {formatDateTimeBR(reuniao.created_at)}
                      </Text>
                      {editandoId === reuniao.id ? null : (
                        <AcoesRegistro
                          confirmar={confirmarId === reuniao.id}
                          podeExcluir={canDeleteRecords}
                          onEditar={() => {
                            setErro(null);
                            setConfirmarId(null);
                            setEditandoId(reuniao.id);
                          }}
                          onPedirExclusao={() => {
                            setErro(null);
                            setEditandoId(null);
                            setConfirmarId(reuniao.id);
                          }}
                          onCancelarExclusao={() => setConfirmarId(null)}
                          onConfirmarExclusao={() => {
                            if (!canDeleteRecords) return;
                            excluirReuniao.mutate(reuniao.id);
                          }}
                        />
                      )}
                    </View>
                    {editandoId === reuniao.id ? (
                      <EditarReuniaoBloco
                        reuniao={reuniao}
                        saving={salvarReuniao.isPending}
                        podeAlterarData={podeAlterarDataRegistro}
                        onCancelar={() => setEditandoId(null)}
                        onSalvar={(valor) =>
                          salvarReuniao.mutate({
                            id: reuniao.id,
                            pendencia: valor.pendencia,
                            dataRetorno: valor.dataRetorno,
                            assuntos: valor.assuntos,
                            proximaAcao: valor.proximaAcao,
                            dataRegistro: valor.dataRegistro,
                          })
                        }
                      />
                    ) : (
                      <>
                        {reuniao.pendencia?.trim() ? (
                          <Text style={{ color: theme.headerText, fontWeight: '800', marginTop: 4 }}>{reuniao.pendencia}</Text>
                        ) : null}
                        {reuniao.pendencia?.trim() ? (
                          <Text style={{ color: theme.text, fontSize: 13, marginTop: 2 }}>
                            Retorno: {formatYmdBR(reuniao.data_retorno)}
                          </Text>
                        ) : null}
                        {reuniao.assuntos?.trim() ? (
                          <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 2 }}>{reuniao.assuntos}</Text>
                        ) : null}
                      </>
                    )}
                  </View>
                ))
              )}
            </View>

            <View style={{ gap: 8 }}>
              <Text style={[styles.secaoLabel, { color: theme.textMuted }]}>CONVERSAS</Text>
              {conversasQ.isLoading ? (
                <ActivityIndicator color={theme.cadastroAction} />
              ) : conversasQ.error ? (
                <Text style={{ color: theme.error }}>{(conversasQ.error as Error).message}</Text>
              ) : (conversasQ.data ?? []).length === 0 ? (
                <Text style={{ color: theme.textMuted, fontSize: 13 }}>Nenhuma conversa registrada.</Text>
              ) : (
                (conversasQ.data ?? []).map((conversa) => (
                  <View key={conversa.id} style={[styles.historicoItem, { borderColor: theme.border }]}>
                    <View style={styles.rowBetween}>
                      <Text style={{ color: theme.textMuted, fontSize: 12, flex: 1 }}>
                        {formatConversaQuando(conversa.data_conversa, conversa.hora_conversa)}
                      </Text>
                      {editandoId === conversa.id ? null : (
                        <AcoesRegistro
                          confirmar={confirmarId === conversa.id}
                          podeExcluir={canDeleteRecords}
                          onEditar={() => {
                            setErro(null);
                            setConfirmarId(null);
                            setEditandoId(conversa.id);
                          }}
                          onPedirExclusao={() => {
                            setErro(null);
                            setEditandoId(null);
                            setConfirmarId(conversa.id);
                          }}
                          onCancelarExclusao={() => setConfirmarId(null)}
                          onConfirmarExclusao={() => {
                            if (!canDeleteRecords) return;
                            excluirConversa.mutate(conversa.id);
                          }}
                        />
                      )}
                    </View>
                    {editandoId === conversa.id ? (
                      <EditarConversaBloco
                        conversa={conversa}
                        saving={salvarConversa.isPending}
                        onCancelar={() => setEditandoId(null)}
                        onSalvar={(valor) =>
                          salvarConversa.mutate({
                            id: conversa.id,
                            dataConversa: valor.dataConversa,
                            horaConversa: valor.horaConversa,
                            descricao: valor.descricao,
                          })
                        }
                      />
                    ) : (
                      <Text style={{ color: theme.text, fontSize: 14, marginTop: 4 }}>{conversa.descricao}</Text>
                    )}
                  </View>
                ))
              )}
            </View>
          </ScrollView>
          {erro ? <Text style={{ color: theme.error }}>{erro}</Text> : null}
          {ocupado && !salvarReuniao.isPending && !salvarConversa.isPending ? (
            <ActivityIndicator color={theme.cadastroAction} />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function KanbanCard({
  item,
  ultimoContato,
  pendenciasAbertas,
  ultimaReuniao,
  onAbrir,
  onRegistrarConversa,
  onRegistrarReuniao,
  onEditarFicha,
  onAbrirMover,
  onArrastar,
  onSoltar,
}: {
  item: AcompanhamentoCliente;
  ultimoContato?: string | null;
  pendenciasAbertas: number;
  ultimaReuniao?: string | null;
  onAbrir: () => void;
  onRegistrarConversa: () => void;
  onRegistrarReuniao: () => void;
  onEditarFicha: () => void;
  onAbrirMover: () => void;
  onArrastar: (x: number, y: number) => void;
  onSoltar: (x: number, y: number) => void;
}) {
  const { theme } = useTheme();
  const empresa = `${item.empresa_nome ?? ''}`.trim();
  const pendencias = pendenciasAbertas;
  const arrastarRef = useRef(onArrastar);
  const soltarRef = useRef(onSoltar);
  arrastarRef.current = onArrastar;
  soltarRef.current = onSoltar;
  const { ref: cardRef, arrastou } = useCardPointerDrag({
    scrollSelector: SCROLL_ACOMPANHAMENTO,
    onMove: ({ x, y }) => arrastarRef.current(x, y),
    onDrop: ({ x, y }) => soltarRef.current(x, y),
    onCancel: () => soltarRef.current(-1, -1),
  });

  return (
    <View
      ref={cardRef}
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
        },
      ]}
    >
      <Pressable
        onPress={() => {
          if (arrastou.current) {
            arrastou.current = false;
            return;
          }
          onAbrir();
        }}
        style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1, gap: 10 })}
      >
      <View style={styles.cardTopo}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarTexto}>{iniciaisNome(item.nome)}</Text>
          </View>
          {item.dias_trial_restantes != null ? (
            <View style={styles.marcaTrial}>
              <Text style={styles.marcaTrialTexto}>T</Text>
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontWeight: '800', fontSize: 15, color: theme.headerText }} numberOfLines={2}>
            {item.nome}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
            {empresa ? empresa.toUpperCase() : '—'}
          </Text>
          <Text style={{ color: theme.cadastroAction, fontSize: 11, fontWeight: '700', marginTop: 2 }}>
            {rotuloTempoCadastro(item.created_at)}
          </Text>
        </View>
      </View>

      <View style={styles.datasRow}>
        <View style={{ flex: 1, gap: 8 }}>
          <View>
            <Text style={[styles.metaLabel, { color: theme.textMuted }]}>Último contato</Text>
            <Text style={[styles.metaValor, { color: theme.headerText }]}>{dataOuTraco(ultimoContato)}</Text>
          </View>
          <View>
            <Text style={[styles.metaLabel, { color: theme.textMuted }]}>Última reunião</Text>
            <Text style={[styles.metaValor, { color: theme.headerText }]}>{dataOuTraco(ultimaReuniao)}</Text>
          </View>
          <View>
            <Text style={[styles.metaLabel, { color: theme.textMuted }]}>Próxima reunião</Text>
            <Text style={[styles.metaValor, { color: theme.headerText }]}>{dataOuTraco(item.proxima_reuniao)}</Text>
          </View>
        </View>
        <View style={styles.pendenciasBox}>
          <Text style={[styles.pendenciasLabel, { color: theme.textMuted }]}>PENDÊNCIAS EM ABERTO</Text>
          <Text style={[styles.pendenciasNumero, { color: pendencias > 0 ? PENDENCIA : theme.textMuted }]}>{pendencias}</Text>
        </View>
      </View>

      <View style={[styles.fichaBloco, { borderTopColor: theme.border }]}>
        <Text style={[styles.secaoLabel, { color: theme.textMuted }]}>ÚLTIMA DIFICULDADE</Text>
        <Text style={{ color: theme.text, fontSize: 13, marginTop: 3 }}>{item.ultima_dificuldade?.trim() || '—'}</Text>
        <Text style={[styles.secaoLabel, { color: theme.textMuted, marginTop: 10 }]}>PRÓXIMA AÇÃO</Text>
        <Text style={{ color: theme.text, fontSize: 13, marginTop: 3 }}>{item.proxima_acao?.trim() || '—'}</Text>
      </View>
      </Pressable>
      <SemArraste style={{ gap: 10 }}>
      <Pressable onPress={onEditarFicha} hitSlop={6}>
        <Text style={{ color: theme.cadastroAction, fontWeight: '700', fontSize: 12 }}>Editar ficha</Text>
      </Pressable>

      <Pressable
        onPress={onRegistrarConversa}
        style={({ pressed }) => [styles.registrarBtn, { backgroundColor: theme.cadastroAction, opacity: pressed ? 0.88 : 1 }]}
      >
        <Text style={{ color: theme.cadastroActionText, fontWeight: '800', fontSize: 12 }}>Registrar conversa</Text>
      </Pressable>
      <Pressable
        onPress={onRegistrarReuniao}
        style={({ pressed }) => [
          styles.registrarBtn,
          { borderWidth: 1, borderColor: theme.cadastroAction, opacity: pressed ? 0.88 : 1 },
        ]}
      >
        <Text style={{ color: theme.cadastroAction, fontWeight: '800', fontSize: 12 }}>Registrar reunião</Text>
      </Pressable>
      <Pressable onPress={onAbrirMover} hitSlop={6}>
        <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '700', textAlign: 'center' }}>Mover de coluna</Text>
      </Pressable>
      </SemArraste>
    </View>
  );
}

function KanbanColumn({
  coluna,
  clientes,
  ultimosContatos,
  dropOver,
  onAbrir,
  onRegistrarConversa,
  onRegistrarReuniao,
  onEditarFicha,
  onAbrirMover,
  onArrastar,
  onSoltar,
  resumoReunioes,
}: {
  coluna: (typeof ACOMPANHAMENTO_COLUNAS)[number];
  clientes: AcompanhamentoCliente[];
  ultimosContatos: Map<string, string>;
  resumoReunioes: Map<string, ResumoReunioesCliente>;
  dropOver: boolean;
  onAbrir: (c: AcompanhamentoCliente) => void;
  onRegistrarConversa: (c: AcompanhamentoCliente) => void;
  onRegistrarReuniao: (c: AcompanhamentoCliente) => void;
  onEditarFicha: (c: AcompanhamentoCliente) => void;
  onAbrirMover: (c: AcompanhamentoCliente) => void;
  onArrastar: (c: AcompanhamentoCliente, x: number, y: number) => void;
  onSoltar: (c: AcompanhamentoCliente, x: number, y: number) => void;
}) {
  const { theme } = useTheme();

  return (
    <View
      ref={marcarColuna(coluna.key)}
      style={[
        styles.column,
        {
          backgroundColor: theme.surfaceMuted,
          borderColor: dropOver ? coluna.cor : theme.border,
          borderWidth: dropOver ? 2 : 1,
        },
      ]}
    >
      <View style={styles.columnHeader}>
        <View style={[styles.dot, { backgroundColor: coluna.cor }]} />
        <Text style={[styles.columnTitle, { color: theme.headerText }]}>{coluna.label}</Text>
        <Text style={[styles.columnCount, { color: coluna.cor }]}>{clientes.length}</Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10, gap: 10, paddingBottom: 16 }} nestedScrollEnabled>
        {clientes.length === 0 ? (
          <View style={[styles.vazio, { backgroundColor: theme.background }]} />
        ) : (
          clientes.map((item) => (
            <KanbanCard
              key={item.id}
              item={item}
              ultimoContato={ultimosContatos.get(item.id) ?? null}
              pendenciasAbertas={resumoReunioes.get(item.id)?.abertas ?? 0}
              ultimaReuniao={resumoReunioes.get(item.id)?.ultimaCriacao ?? null}
              onAbrir={() => onAbrir(item)}
              onRegistrarConversa={() => onRegistrarConversa(item)}
              onRegistrarReuniao={() => onRegistrarReuniao(item)}
              onEditarFicha={() => onEditarFicha(item)}
              onAbrirMover={() => onAbrirMover(item)}
              onArrastar={(x, y) => onArrastar(item, x, y)}
              onSoltar={(x, y) => onSoltar(item, x, y)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

export default function AcompanhamentoScreen() {
  const { theme } = useTheme();
  const { canAccessScreen, session, adminProfile } = useAdminAuth();
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [clienteHistorico, setClienteHistorico] = useState<AcompanhamentoCliente | null>(null);
  const [clienteConversa, setClienteConversa] = useState<AcompanhamentoCliente | null>(null);
  const [clienteReuniao, setClienteReuniao] = useState<AcompanhamentoCliente | null>(null);
  const [clienteFicha, setClienteFicha] = useState<AcompanhamentoCliente | null>(null);
  const [clienteMover, setClienteMover] = useState<AcompanhamentoCliente | null>(null);
  const [dropOverColuna, setDropOverColuna] = useState<AcompanhamentoColuna | null>(null);
  const [rotuloArraste, setRotuloArraste] = useState<string | null>(null);
  const fantasmaRef = useRef<View>(null);
  const posicaoArraste = useRef({ x: 0, y: 0 });
  const colunaSobre = useRef<string | null>(null);
  const arrasteId = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!rotuloArraste) return;
    posicionarFantasma(fantasmaRef.current, posicaoArraste.current.x, posicaoArraste.current.y, true);
  });
  const [erroMove, setErroMove] = useState<string | null>(null);
  const [erroFicha, setErroFicha] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['acompanhamento_clientes'],
    queryFn: carregarAcompanhamentoClientes,
    enabled: canAccessScreen('acompanhamento'),
  });

  const ids = useMemo(() => (q.data?.clientes ?? []).map((c) => c.id), [q.data]);

  const contatosQ = useQuery({
    queryKey: ['acompanhamento_ultimos_contatos', ids.join(',')],
    queryFn: () => listarUltimoContatoPorCliente(ids),
    enabled: canAccessScreen('acompanhamento') && ids.length > 0,
  });

  const abertasQ = useQuery({
    queryKey: ['pendencias_abertas', ids.join(',')],
    queryFn: () => resumirReunioesPorCliente(ids),
    enabled: canAccessScreen('acompanhamento') && ids.length > 0,
  });

  const porColunaFiltrado = useMemo(() => {
    const out = agrupamentoAcompanhamentoVazio();
    const base = q.data?.porColuna;
    if (!base) return out;
    for (const col of ACOMPANHAMENTO_COLUNAS) {
      out[col.key] = (base[col.key] ?? []).filter((c) => matchBusca(c, busca));
    }
    return out;
  }, [q.data, busca]);

  const adminEmail = adminProfile?.email ?? session?.user?.email ?? null;

  const moverMutation = useMutation({
    mutationFn: async ({ clienteId, coluna }: { clienteId: string; coluna: AcompanhamentoColuna }) =>
      moverClienteKanban({ clienteId, coluna, adminEmail }),
    onMutate: async ({ clienteId, coluna }) => {
      setErroMove(null);
      await qc.cancelQueries({ queryKey: ['acompanhamento_clientes'] });
      const prev = qc.getQueryData<Board>(['acompanhamento_clientes']);
      if (prev) {
        qc.setQueryData(
          ['acompanhamento_clientes'],
          recomporBoard(prev.clientes.map((c) => (c.id === clienteId ? { ...c, coluna, etiqueta: coluna } : c))),
        );
      }
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['acompanhamento_clientes'], ctx.prev);
      const message = e instanceof Error ? e.message : 'Erro ao mover cliente';
      setErroMove(
        message.includes('admin_acompanhamento_kanban') || message.includes('check constraint')
          ? 'Execute supabase/sql/admin_acompanhamento_kanban.sql no Supabase.'
          : message,
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['acompanhamento_clientes'] });
      setClienteMover(null);
      setDropOverColuna(null);
    },
  });

  const fichaMutation = useMutation({
    mutationFn: async (ficha: {
      proximaReuniao: string;
      ultimaDificuldade: string;
      proximaAcao: string;
    }) => {
      if (!clienteFicha) throw new Error('Cliente inválido.');
      return salvarFichaAcompanhamento({
        clienteId: clienteFicha.id,
        coluna: clienteFicha.coluna,
        adminEmail,
        ultimaReuniao: clienteFicha.ultima_reuniao,
        proximaReuniao: ficha.proximaReuniao,
        pendenciasAbertas: clienteFicha.pendencias_abertas,
        ultimaDificuldade: ficha.ultimaDificuldade,
        proximaAcao: ficha.proximaAcao,
      });
    },
    onMutate: async (ficha) => {
      if (!clienteFicha) return { prev: undefined as Board | undefined };
      setErroFicha(null);
      await qc.cancelQueries({ queryKey: ['acompanhamento_clientes'] });
      const prev = qc.getQueryData<Board>(['acompanhamento_clientes']);
      if (prev) {
        qc.setQueryData(
          ['acompanhamento_clientes'],
          recomporBoard(
            prev.clientes.map((c) =>
              c.id === clienteFicha.id
                ? {
                    ...c,
                    proxima_reuniao: ficha.proximaReuniao || null,
                    ultima_dificuldade: ficha.ultimaDificuldade.trim() || null,
                    proxima_acao: ficha.proximaAcao.trim() || null,
                  }
                : c,
            ),
          ),
        );
      }
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['acompanhamento_clientes'], ctx.prev);
      setErroFicha(e instanceof Error ? e.message : 'Erro ao salvar ficha');
    },
    onSuccess: () => {
      setClienteFicha(null);
      setErroFicha(null);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['acompanhamento_clientes'] });
    },
  });

  if (!canAccessScreen('acompanhamento')) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: theme.background }}>
        <Text style={{ color: theme.warning, fontWeight: '800' }}>Seu perfil não tem acesso a Acompanhamento.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        horizontal
        ref={marcarScrollKanban('acompanhamento')}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 12, minHeight: '100%' }}
        showsHorizontalScrollIndicator
      >
        <View style={{ gap: 12, minWidth: ACOMPANHAMENTO_COLUNAS.length * (COL_WIDTH + 12) }}>
          <PageHeader
            title="Acompanhamento"
            subtitle="Trial e planos entram na Fila de espera. Arraste o card para avançar."
          />

          <View style={styles.searchRow}>
            <FontAwesome name="search" size={13} color={theme.textMuted} style={styles.searchIcon} />
            <FormInput
              style={styles.searchInput}
              placeholder="Buscar por nome, e-mail, telefone ou empresa…"
              value={busca}
              onChangeText={setBusca}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {busca ? (
              <Pressable onPress={() => setBusca('')} hitSlop={8} style={styles.clearIcon}>
                <FontAwesome name="times-circle" size={14} color={theme.textMuted} />
              </Pressable>
            ) : null}
          </View>

          {q.isLoading ? <Text style={{ color: theme.textMuted }}>Carregando Kanban…</Text> : null}
          {q.error ? (
            <Text style={{ color: theme.error }}>{q.error instanceof Error ? q.error.message : 'Erro ao carregar'}</Text>
          ) : null}
          {erroMove ? <Text style={{ color: theme.error }}>{erroMove}</Text> : null}

          <View style={styles.boardRow}>
            {ACOMPANHAMENTO_COLUNAS.map((col) => (
              <KanbanColumn
                key={col.key}
                coluna={col}
                clientes={porColunaFiltrado[col.key]}
                ultimosContatos={contatosQ.data ?? new Map()}
                resumoReunioes={abertasQ.data ?? new Map()}
                dropOver={dropOverColuna === col.key}
                onAbrir={setClienteHistorico}
                onRegistrarConversa={setClienteConversa}
                onRegistrarReuniao={setClienteReuniao}
                onEditarFicha={(c) => {
                  setErroFicha(null);
                  setClienteFicha(c);
                }}
                onAbrirMover={setClienteMover}
                onArrastar={(item, x, y) => {
                  posicaoArraste.current = { x, y };
                  posicionarFantasma(fantasmaRef.current, x, y, true);
                  if (arrasteId.current !== item.id) {
                    arrasteId.current = item.id;
                    setRotuloArraste(item.nome);
                  }
                  const col = colunaSobPonto(x, y);
                  const valida = isAcompanhamentoColuna(col) ? col : null;
                  if (colunaSobre.current !== valida) {
                    colunaSobre.current = valida;
                    setDropOverColuna(valida);
                  }
                }}
                onSoltar={(item, x, y) => {
                  const col = x < 0 ? null : colunaSobPonto(x, y);
                  posicionarFantasma(fantasmaRef.current, 0, 0, false);
                  arrasteId.current = null;
                  colunaSobre.current = null;
                  setRotuloArraste(null);
                  setDropOverColuna(null);
                  if (!isAcompanhamentoColuna(col) || col === item.coluna) return;
                  moverMutation.mutate({ clienteId: item.id, coluna: col });
                }}
              />
            ))}
          </View>
        </View>
      </ScrollView>

      <HistoricoClienteModal
        cliente={clienteHistorico}
        visible={Boolean(clienteHistorico)}
        onClose={() => setClienteHistorico(null)}
      />
      <ConversaModal
        cliente={clienteConversa}
        visible={Boolean(clienteConversa)}
        onClose={() => setClienteConversa(null)}
        onSaved={() => {
          void qc.invalidateQueries({ queryKey: ['acompanhamento_ultimos_contatos'] });
          void qc.invalidateQueries({ queryKey: ['admin_cliente_conversas'] });
        }}
      />
      <RegistrarReuniaoModal
        cliente={clienteReuniao}
        visible={Boolean(clienteReuniao)}
        onClose={() => setClienteReuniao(null)}
        onSaved={() => {
          void qc.invalidateQueries({ queryKey: ['admin_cliente_reunioes'] });
          void qc.invalidateQueries({ queryKey: ['pendencias_abertas'] });
          void qc.invalidateQueries({ queryKey: ['acompanhamento_clientes'] });
          void qc.invalidateQueries({ queryKey: ['acompanhamento_ultimos_contatos'] });
        }}
      />
      <FichaModal
        cliente={clienteFicha}
        visible={Boolean(clienteFicha)}
        onClose={() => setClienteFicha(null)}
        saving={fichaMutation.isPending}
        erro={erroFicha}
        onSalvar={(ficha) => fichaMutation.mutate(ficha)}
      />
      <MoverModal
        cliente={clienteMover}
        visible={Boolean(clienteMover)}
        onClose={() => setClienteMover(null)}
        moving={moverMutation.isPending}
        onMover={(coluna) => {
          if (!clienteMover) return;
          moverMutation.mutate({ clienteId: clienteMover.id, coluna });
        }}
      />
      <View
        ref={fantasmaRef}
        pointerEvents="none"
        style={[styles.fantasma, { backgroundColor: theme.surface, borderColor: theme.cadastroAction, opacity: 0 }]}
      >
        <Text style={{ color: theme.headerText, fontWeight: '800' }} numberOfLines={1}>
          {rotuloArraste ?? 'Mover cliente'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: { position: 'relative', justifyContent: 'center', maxWidth: 480 },
  searchIcon: { position: 'absolute', left: 8, zIndex: 1 },
  searchInput: { height: 36, fontSize: 13, paddingLeft: 28, paddingRight: 28 },
  clearIcon: { position: 'absolute', right: 8, zIndex: 1 },
  boardRow: { flexDirection: 'row', alignItems: 'stretch', gap: 12, flex: 1, minHeight: 560 },
  column: { width: COL_WIDTH, borderRadius: 16, overflow: 'hidden', minHeight: 520, maxHeight: 820 },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  columnTitle: { fontWeight: '700', fontSize: 13, flex: 1 },
  columnCount: { fontWeight: '800', fontSize: 13 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
  cardTopo: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatarWrap: { width: 40, height: 40 },
  marcaTrial: {
    position: 'absolute',
    top: -3,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#F5C542',
    alignItems: 'center',
    justifyContent: 'center',
  },
  marcaTrialTexto: { color: '#1A1408', fontSize: 10, fontWeight: '800', lineHeight: 12 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: AVATAR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTexto: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  datasRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  metaLabel: { fontSize: 11 },
  metaValor: { fontSize: 15, fontWeight: '800', marginTop: 1 },
  pendenciasBox: { width: 92, alignItems: 'flex-end' },
  pendenciasLabel: { fontSize: 9, fontWeight: '700', textAlign: 'right' },
  pendenciasNumero: { fontSize: 28, fontWeight: '800', lineHeight: 32, marginTop: 4 },
  fichaBloco: { borderTopWidth: 1, paddingTop: 10 },
  secaoLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  registrarBtn: { minHeight: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  vazio: { height: 72, borderRadius: 12, opacity: 0.65 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  conversaCard: { width: '100%', maxWidth: 440, borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  historicoCard: { width: '100%', maxWidth: 520, borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  historicoItem: { borderWidth: 1, borderRadius: 10, padding: 10 },
  areaHistorico: { minHeight: 72, height: 72, textAlignVertical: 'top', paddingTop: 8 },
  cancelarHistorico: { minHeight: 40, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  clienteFixo: { minHeight: 44, borderWidth: 1, borderRadius: 8, justifyContent: 'center', paddingHorizontal: 12 },
  moverCard: { width: '100%', maxWidth: 420, borderRadius: 12, borderWidth: 1, padding: 16, gap: 8 },
  moverOpt: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  fantasma: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 240,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
});
