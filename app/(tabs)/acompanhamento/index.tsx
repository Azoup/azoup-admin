import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { FormDateInput } from '@/components/ui/FormDateInput';
import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { FormTimeInput } from '@/components/ui/FormTimeInput';
import { BackLink } from '@/components/ui/BackLink';
import { PageHeader } from '@/components/ui/PageHeader';
import { Screen } from '@/components/ui/Screen';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { RegistrarReuniaoModal } from '@/components/ui/RegistrarReuniaoModal';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Text } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { registrarAuditoria } from '@/src/services/audit';
import { useTheme } from '@/src/contexts/ThemeContext';
import { listarAlertaContato } from '@/src/services/repos/acompanhamento-alerta-repo';
import { carregarAcompanhamentoClientes } from '@/src/services/repos/acompanhamento-repo';
import { listarMensagensAutomaticasEnviadas } from '@/src/services/repos/digisac-boas-vindas-repo';
import {
  adicionarTelefoneDigisac,
  listarTelefonesDigisac,
  removerTelefoneDigisac,
} from '@/src/services/repos/digisac-telefones-repo';
import { listarAgendaDoCliente, listarProximasReunioesGoogle } from '@/src/services/repos/google-agendamentos-repo';
import {
  listarChamadosDigisac,
  listarMensagensDigisac,
  type DigisacChamado,
} from '@/src/services/digisac-historico-api';
import { buscarMetricasUsoCliente } from '@/src/services/repos/clientes-repo';
import { atualizarConversaCliente, criarConversaCliente, excluirConversaCliente, listarConversasClientes, listarUltimoContatoPorCliente } from '@/src/services/repos/conversas-repo';
import {
  atualizarReuniaoCliente,
  criarPendenciaAvulsa,
  definirReuniaoConcluida,
  excluirReuniaoCliente,
  colunaPendencia,
  listarPendenciasDoCliente,
  listarReunioes,
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
  contatoAtrasado,
  rotuloTempoCadastro,
  rotuloUltimoContato,
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
import { dataCalendarioBrasil, formatConversaQuando, formatDataHoraBrasil, formatDateTimeBR, formatYmdBR } from '@/src/utils/format';
import type { AdminClienteConversaRow } from '@/src/types/azoup';
import { digitsOnlyPhone } from '@/src/utils/whatsapp';

const COL_WIDTH = 300;
/** Espaço livre embaixo das colunas para a barra horizontal não cobrir o último card. */
const FOLGA_BARRA_HORIZONTAL = 28;
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

function temProximaReuniao(item: AcompanhamentoCliente, reuniaoGoogle: string | undefined, hoje: string): boolean {
  if (`${reuniaoGoogle ?? ''}`.trim()) return true;
  const marcada = `${item.proxima_reuniao ?? ''}`.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(marcada) && marcada >= hoje;
}

function FiltroChip({ label, ativo, onPress }: { label: string; ativo: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: ativo }}
      style={({ pressed }) => ({
        minHeight: 34,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.cadastroAction,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: ativo ? theme.cadastroAction : 'transparent',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: ativo ? theme.cadastroActionText : theme.cadastroAction, fontWeight: '800', fontSize: 12 }}>
        {label}
      </Text>
    </Pressable>
  );
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

function NovaPendenciaClienteModal({
  cliente,
  visible,
  onClose,
  onSaved,
}: {
  cliente: AcompanhamentoCliente;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { theme } = useTheme();
  const { adminProfile, session } = useAdminAuth();
  const [texto, setTexto] = useState('');
  const [dataRetorno, setDataRetorno] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTexto('');
    setDataRetorno('');
    setErro(null);
  }, [visible, cliente.id]);

  const salvar = useMutation({
    mutationFn: () =>
      criarPendenciaAvulsa({
        clienteId: cliente.id,
        empresaNome: cliente.empresa_nome?.trim() || cliente.nome,
        pendencia: texto,
        dataRetorno,
        adminEmail: adminProfile?.email ?? session?.user?.email ?? null,
      }),
    onSuccess: () => {
      setErro(null);
      onSaved();
      onClose();
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao cadastrar pendência'),
  });

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.conversaCard, { backgroundColor: theme.surface, borderColor: theme.border, zIndex: 2 }]}>
          <SectionTitle>Nova pendência</SectionTitle>
          <Text style={{ color: theme.textMuted, fontSize: 13 }}>{cliente.empresa_nome?.trim() || cliente.nome}</Text>
          <FormField label="Pendência" required>
            <FormInput
              value={texto}
              onChangeText={setTexto}
              placeholder="O que precisa ser feito"
              multiline
              style={{ minHeight: 88, textAlignVertical: 'top', paddingTop: 10 }}
            />
          </FormField>
          <FormField label="Data do retorno" required>
            <FormDateInput value={dataRetorno} onChange={setDataRetorno} />
          </FormField>
          {erro ? <Text style={{ color: theme.error }}>{erro}</Text> : null}
          <PrimaryButton label="Salvar pendência" loading={salvar.isPending} onPress={() => salvar.mutate()} />
        </View>
      </View>
    </Modal>
  );
}

function exibirTelefone(digits: string): string {
  const local = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return digits;
}

function tituloChamado(chamado: DigisacChamado): string {
  const assunto = chamado.assunto?.trim();
  if (assunto) return assunto;
  if (chamado.protocolo) return `Protocolo ${chamado.protocolo}`;
  return 'Chamado';
}

function detalheChamado(chamado: DigisacChamado): string {
  const partes = [chamado.aberto ? 'Aberto' : 'Encerrado'];
  if (chamado.assunto?.trim() && chamado.protocolo) partes.push(`Protocolo ${chamado.protocolo}`);
  if (chamado.inicio) partes.push(formatDataHoraBrasil(chamado.inicio));
  return partes.join(' · ');
}

const VAZIO_CHAMADOS: Record<string, string> = {
  sem_telefone: 'Este cliente não tem telefone para buscar na Digisac.',
  sem_contato: 'Nenhum contato no departamento Azoup Confec com o nome da empresa, o nome do cliente ou os telefones.',
  sem_chamados: 'Nenhum chamado deste cliente no departamento Azoup Confec.',
};

function textoBusca(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function chamadoCombina(chamado: DigisacChamado, assunto: string, de: string, ate: string): boolean {
  const termo = textoBusca(assunto.trim());
  if (termo) {
    const alvo = textoBusca(`${chamado.assunto ?? ''} ${chamado.protocolo ?? ''}`);
    if (!alvo.includes(termo)) return false;
  }
  const dia = dataCalendarioBrasil(chamado.inicio);
  if ((de || ate) && !dia) return false;
  if (de && dia && dia < de) return false;
  if (ate && dia && dia > ate) return false;
  return true;
}

function ChamadoDigisacModal({
  clienteId,
  chamado,
  onClose,
}: {
  clienteId: string;
  chamado: DigisacChamado | null;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const mensagensQ = useQuery({
    queryKey: ['digisac_mensagens', clienteId, chamado?.id],
    queryFn: () => listarMensagensDigisac(clienteId, chamado!.id),
    enabled: Boolean(clienteId && chamado?.id),
  });
  const mensagens = mensagensQ.data?.mensagens ?? [];

  return (
    <Modal visible={Boolean(chamado)} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.historicoCard, { backgroundColor: theme.surface, borderColor: theme.border, maxHeight: '85%' }]}>
          <View style={styles.rowBetween}>
            <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 16, flex: 1 }} numberOfLines={2}>
              {chamado ? tituloChamado(chamado) : 'Chamado'}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <FontAwesome name="times" size={16} color={theme.textMuted} />
            </Pressable>
          </View>
          {chamado ? <Text style={{ color: theme.textMuted, fontSize: 12 }}>{detalheChamado(chamado)}</Text> : null}
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
            {mensagensQ.isLoading ? <ActivityIndicator color={theme.cadastroAction} /> : null}
            {mensagensQ.error ? <Text style={{ color: theme.error }}>{(mensagensQ.error as Error).message}</Text> : null}
            {!mensagensQ.isLoading && !mensagensQ.error && mensagens.length === 0 ? (
              <Text style={{ color: theme.textMuted, fontSize: 13 }}>Nenhuma mensagem neste chamado.</Text>
            ) : null}
            {mensagens.map((mensagem) => (
              <View
                key={mensagem.id}
                style={{
                  alignSelf: mensagem.deEquipe ? 'flex-end' : 'flex-start',
                  maxWidth: '88%',
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  backgroundColor: mensagem.deEquipe ? theme.cadastroAction : theme.background,
                }}
              >
                <Text style={{ color: mensagem.deEquipe ? theme.cadastroActionText : theme.text, fontSize: 14 }}>
                  {mensagem.texto}
                </Text>
                <Text
                  style={{
                    color: mensagem.deEquipe ? theme.cadastroActionText : theme.textMuted,
                    fontSize: 11,
                    marginTop: 4,
                    opacity: 0.85,
                  }}
                >
                  {mensagem.deEquipe ? 'Equipe' : 'Cliente'} · {formatDataHoraBrasil(mensagem.em)}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function BotaoAcao({ label, onPress }: { label: string; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }) => {
        const ativo = pressed || Boolean(hovered);
        return [
          styles.registrarBtn,
          {
            paddingHorizontal: 12,
            borderWidth: 1,
            borderColor: theme.cadastroAction,
            backgroundColor: ativo ? theme.cadastroAction : 'transparent',
            cursor: 'pointer',
          },
        ];
      }}
    >
      {({ pressed, hovered }) => {
        const ativo = pressed || Boolean(hovered);
        return (
          <Text style={{ color: ativo ? theme.cadastroActionText : theme.cadastroAction, fontWeight: '800', fontSize: 12 }}>
            {label}
          </Text>
        );
      }}
    </Pressable>
  );
}

export function HistoricoClienteTela({
  cliente,
  embutido = false,
}: {
  cliente: AcompanhamentoCliente;
  embutido?: boolean;
}) {
  const { theme } = useTheme();
  const { adminProfile, canDeleteRecords, papel } = useAdminAuth();
  const podeAlterarDataRegistro = papel === 'owner';
  const qc = useQueryClient();
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [confirmarId, setConfirmarId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [reuniaoAberta, setReuniaoAberta] = useState(false);
  const [conversaAberta, setConversaAberta] = useState(false);
  const [pendenciaAberta, setPendenciaAberta] = useState(false);
  const [chamadoAberto, setChamadoAberto] = useState<DigisacChamado | null>(null);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [buscaAssunto, setBuscaAssunto] = useState('');
  const [periodoDe, setPeriodoDe] = useState('');
  const [periodoAte, setPeriodoAte] = useState('');
  const [novoTelefone, setNovoTelefone] = useState('');
  const [erroTelefone, setErroTelefone] = useState<string | null>(null);
  const telefone = cliente?.telefone?.trim() || '';
  const celular = cliente?.celular?.trim() || '';
  const contato = [telefone, celular && celular !== telefone ? celular : ''].filter(Boolean).join(' · ') || '—';
  const cadastroEm = formatYmdBR(dataCalendarioBrasil(cliente?.created_at));

  const reunioesQ = useQuery({
    queryKey: ['admin_cliente_reunioes', cliente?.id, 'historico'],
    queryFn: () => listarReunioesDoCliente(cliente!.id),
    enabled: Boolean(cliente.id),
  });

  const agendaQ = useQuery({
    queryKey: ['google_agenda_cliente', cliente.id],
    queryFn: () => listarAgendaDoCliente(cliente.id),
    enabled: Boolean(cliente.id),
  });

  const agenda = useMemo(() => {
    const agora = Date.now();
    const eventos = agendaQ.data ?? [];
    const futuras = eventos
      .filter((ev) => Date.parse(ev.inicio) >= agora)
      .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
    const passadas = eventos
      .filter((ev) => Date.parse(ev.inicio) < agora)
      .sort((a, b) => Date.parse(b.inicio) - Date.parse(a.inicio));
    const registros = reunioesQ.data ?? [];
    const registroNoDia = (inicio: string) => {
      const dia = dataCalendarioBrasil(inicio);
      if (!dia) return [];
      return registros.filter((row) => dataCalendarioBrasil(row.created_at) === dia);
    };
    return { futuras, passadas, registroNoDia };
  }, [agendaQ.data, reunioesQ.data]);

  const pendenciasQ = useQuery({
    queryKey: ['admin_cliente_reunioes', cliente.id, 'pendencias-tela'],
    queryFn: () => listarPendenciasDoCliente(cliente.id),
    enabled: Boolean(cliente.id),
  });

  const conversasQ = useQuery({
    queryKey: ['admin_cliente_conversas', cliente.id, 'historico'],
    queryFn: () => listarConversasClientes({ clienteId: cliente.id, limit: 50 }),
    enabled: Boolean(cliente.id),
  });

  const acessoQ = useQuery({
    queryKey: ['cliente_ultimo_acesso', cliente.id],
    queryFn: () => buscarMetricasUsoCliente(cliente.id),
    enabled: Boolean(cliente.id),
  });

  const chamadosQ = useQuery({
    queryKey: ['digisac_chamados', cliente.id],
    queryFn: () => listarChamadosDigisac(cliente.id),
    enabled: Boolean(cliente.id) && historicoAberto,
  });

  const chamadosFiltrados = useMemo(() => {
    const lista = chamadosQ.data?.chamados ?? [];
    return lista.filter((chamado) => chamadoCombina(chamado, buscaAssunto, periodoDe, periodoAte));
  }, [chamadosQ.data, buscaAssunto, periodoDe, periodoAte]);

  const telefonesQ = useQuery({
    queryKey: ['admin_digisac_telefones', cliente.id],
    queryFn: () => listarTelefonesDigisac(cliente.id),
    enabled: Boolean(cliente.id),
  });

  const adicionarTelefone = useMutation({
    mutationFn: () => adicionarTelefoneDigisac(cliente.id, novoTelefone),
    onSuccess: () => {
      setNovoTelefone('');
      setErroTelefone(null);
      void qc.invalidateQueries({ queryKey: ['admin_digisac_telefones', cliente.id] });
      void qc.invalidateQueries({ queryKey: ['digisac_chamados', cliente.id] });
    },
    onError: (e) => setErroTelefone(e instanceof Error ? e.message : 'Erro ao adicionar telefone'),
  });

  const removerTelefone = useMutation({
    mutationFn: (id: string) => removerTelefoneDigisac(id),
    onSuccess: () => {
      setErroTelefone(null);
      void qc.invalidateQueries({ queryKey: ['admin_digisac_telefones', cliente.id] });
      void qc.invalidateQueries({ queryKey: ['digisac_chamados', cliente.id] });
    },
    onError: (e) => setErroTelefone(e instanceof Error ? e.message : 'Erro ao remover telefone'),
  });

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

  const concluirPendencia = useMutation({
    mutationFn: ({ id, concluida }: { id: string; concluida: boolean }) => definirReuniaoConcluida(id, concluida),
    onSuccess: () => {
      setErro(null);
      invalidarHistorico();
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao atualizar pendência'),
  });

  const ocupado = salvarReuniao.isPending || excluirReuniao.isPending || salvarConversa.isPending || excluirConversa.isPending;

  const conteudo = (
    <>
      {embutido ? null : <BackLink href="/(tabs)/acompanhamento" label="Acompanhamento" />}
      {embutido ? null : <PageHeader title={cliente.nome} subtitle={cliente.empresa_nome?.trim() || 'Cliente'} />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <BotaoAcao label="Registrar reunião" onPress={() => setReuniaoAberta(true)} />
        <BotaoAcao label="Registrar conversa" onPress={() => setConversaAberta(true)} />
        <BotaoAcao label="Nova pendência" onPress={() => setPendenciaAberta(true)} />
      </View>
      <View style={{ gap: 14 }}>
            <View style={{ gap: 4 }}>
              <Text style={[styles.secaoLabel, { color: theme.textMuted }]}>CADASTRO</Text>
              <Text style={{ color: theme.text, fontSize: 14 }}>
                Nome: <Text style={{ fontWeight: '800' }}>{cliente?.nome ?? '—'}</Text>
              </Text>
              <Text style={{ color: theme.text, fontSize: 14 }}>
                Telefone: <Text style={{ fontWeight: '800' }}>{contato}</Text>
              </Text>
              <View style={{ gap: 6 }}>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                  Outros telefones da mesma empresa no departamento Azoup Confec
                </Text>
                {(telefonesQ.data ?? []).map((item) => (
                  <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800', flex: 1 }}>
                      {exibirTelefone(item.telefone)}
                    </Text>
                    <Pressable
                      onPress={() => removerTelefone.mutate(item.id)}
                      hitSlop={8}
                      disabled={removerTelefone.isPending}
                    >
                      <FontAwesome name="times" size={14} color={theme.textMuted} />
                    </Pressable>
                  </View>
                ))}
                {telefonesQ.isLoading ? <ActivityIndicator color={theme.cadastroAction} /> : null}
                {telefonesQ.error ? (
                  <Text style={{ color: theme.error, fontSize: 12 }}>{(telefonesQ.error as Error).message}</Text>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <FormInput
                      value={novoTelefone}
                      onChangeText={setNovoTelefone}
                      placeholder="DDD e número"
                      keyboardType="phone-pad"
                      autoCorrect={false}
                    />
                  </View>
                  <Pressable
                    onPress={() => adicionarTelefone.mutate()}
                    disabled={adicionarTelefone.isPending || !novoTelefone.trim()}
                    style={({ pressed }) => ({
                      minHeight: 40,
                      paddingHorizontal: 12,
                      borderRadius: 8,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: theme.cadastroAction,
                      opacity: adicionarTelefone.isPending || !novoTelefone.trim() ? 0.55 : pressed ? 0.85 : 1,
                    })}
                  >
                    <Text style={{ color: theme.cadastroActionText, fontWeight: '800', fontSize: 13 }}>Adicionar</Text>
                  </Pressable>
                </View>
                {erroTelefone ? <Text style={{ color: theme.error, fontSize: 12 }}>{erroTelefone}</Text> : null}
              </View>
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

            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.surface,
                overflow: 'hidden',
              }}
            >
              <Pressable
                onPress={() => setHistoricoAberto((atual) => !atual)}
                accessibilityRole="button"
                accessibilityState={{ expanded: historicoAberto }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  opacity: pressed ? 0.82 : 1,
                })}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.secaoLabel, { color: theme.textMuted }]}>HISTÓRICO DE CHAMADOS</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                    {chamadosQ.data
                      ? chamadosQ.data.chamados.length === 1
                        ? '1 chamado'
                        : `${chamadosQ.data.chamados.length} chamados`
                      : 'Toque para abrir'}
                  </Text>
                </View>
                <FontAwesome name={historicoAberto ? 'chevron-up' : 'chevron-down'} size={12} color={theme.textMuted} />
              </Pressable>
              {historicoAberto ? (
                <View style={{ gap: 10, paddingHorizontal: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: theme.border }}>
                  <FormField label="Assunto">
                    <FormInput
                      value={buscaAssunto}
                      onChangeText={setBuscaAssunto}
                      placeholder="Buscar pelo assunto"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </FormField>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <FormField label="De">
                        <FormDateInput value={periodoDe} onChange={setPeriodoDe} />
                      </FormField>
                    </View>
                    <View style={{ flex: 1 }}>
                      <FormField label="Até">
                        <FormDateInput value={periodoAte} onChange={setPeriodoAte} />
                      </FormField>
                    </View>
                  </View>
                  {chamadosQ.isLoading ? <ActivityIndicator color={theme.cadastroAction} /> : null}
                  {chamadosQ.error ? <Text style={{ color: theme.error }}>{(chamadosQ.error as Error).message}</Text> : null}
                  {!chamadosQ.isLoading && !chamadosQ.error && chamadosQ.data?.situacao && chamadosQ.data.situacao !== 'ok' ? (
                    <Text style={{ color: theme.textMuted, fontSize: 13 }}>{VAZIO_CHAMADOS[chamadosQ.data.situacao]}</Text>
                  ) : null}
                  {!chamadosQ.isLoading && !chamadosQ.error && chamadosQ.data?.situacao === 'ok' && chamadosFiltrados.length === 0 ? (
                    <Text style={{ color: theme.textMuted, fontSize: 13 }}>Nenhum chamado nesse filtro.</Text>
                  ) : null}
                  {chamadosFiltrados.map((chamado) => (
                    <Pressable
                      key={chamado.id}
                      onPress={() => setChamadoAberto(chamado)}
                      style={({ pressed }) => [styles.historicoItem, { borderColor: theme.border, opacity: pressed ? 0.85 : 1 }]}
                    >
                      <Text style={{ color: theme.headerText, fontWeight: '800' }}>{tituloChamado(chamado)}</Text>
                      <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>{detalheChamado(chamado)}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            <View style={{ gap: 8 }}>
              <Text style={[styles.secaoLabel, { color: theme.textMuted }]}>PENDÊNCIAS</Text>
              {pendenciasQ.isLoading ? <ActivityIndicator color={theme.cadastroAction} /> : null}
              {pendenciasQ.error ? <Text style={{ color: theme.error }}>{(pendenciasQ.error as Error).message}</Text> : null}
              {!pendenciasQ.isLoading && !pendenciasQ.error && (pendenciasQ.data ?? []).length === 0 ? (
                <Text style={{ color: theme.textMuted, fontSize: 13 }}>Nenhuma pendência deste cliente.</Text>
              ) : null}
              {(pendenciasQ.data ?? []).map((item) => {
                const coluna = colunaPendencia(item);
                const atrasada = coluna === 'atrasada';
                const concluida = coluna === 'concluida';
                return (
                  <View key={item.id} style={[styles.historicoItem, { borderColor: atrasada ? '#F07167' : theme.border }]}>
                    <View style={styles.rowBetween}>
                      <Text style={{ color: atrasada ? '#F07167' : concluida ? theme.textMuted : theme.cadastroAction, fontWeight: '800', fontSize: 12, flex: 1 }}>
                        {atrasada ? 'Atrasada' : concluida ? 'Concluída' : 'Em andamento'} · {formatYmdBR(item.data_retorno)}
                      </Text>
                      <Pressable
                        onPress={() => concluirPendencia.mutate({ id: item.id, concluida: !concluida })}
                        hitSlop={6}
                        disabled={concluirPendencia.isPending}
                      >
                        <Text style={{ color: theme.cadastroAction, fontWeight: '800', fontSize: 12 }}>
                          {concluida ? 'Reabrir' : 'Concluir'}
                        </Text>
                      </Pressable>
                    </View>
                    <Text style={{ color: theme.headerText, fontWeight: '800', marginTop: 4 }}>{item.pendencia}</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
                      Escrito por {item.admin_email?.trim() || '—'}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={{ gap: 8 }}>
              <Text style={[styles.secaoLabel, { color: theme.textMuted }]}>AGENDA</Text>
              {agendaQ.isLoading ? <ActivityIndicator color={theme.cadastroAction} /> : null}
              {agendaQ.error ? (
                <Text style={{ color: theme.error }}>{(agendaQ.error as Error).message}</Text>
              ) : null}
              {!agendaQ.isLoading && !agendaQ.error ? (
                <>
                  <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 13 }}>Futuras</Text>
                  {agenda.futuras.length === 0 ? (
                    <Text style={{ color: theme.textMuted, fontSize: 13 }}>Nenhuma reunião futura marcada.</Text>
                  ) : (
                    agenda.futuras.map((ev) => (
                      <View key={ev.id} style={[styles.historicoItem, { borderColor: theme.border }]}>
                        <Text style={{ color: theme.headerText, fontWeight: '800' }}>{ev.titulo || '(Sem título)'}</Text>
                        <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                          {formatDateTimeBR(ev.inicio)}
                          {ev.fim ? ` — ${formatDateTimeBR(ev.fim)}` : ''}
                        </Text>
                      </View>
                    ))
                  )}
                  <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 13, marginTop: 6 }}>
                    Já realizadas
                  </Text>
                  {agenda.passadas.length === 0 ? (
                    <Text style={{ color: theme.textMuted, fontSize: 13 }}>Nenhuma reunião passada na agenda.</Text>
                  ) : (
                    agenda.passadas.map((ev) => {
                      const registros = agenda.registroNoDia(ev.inicio);
                      return (
                        <View key={ev.id} style={[styles.historicoItem, { borderColor: theme.border, gap: 6 }]}>
                          <Text style={{ color: theme.headerText, fontWeight: '800' }}>{ev.titulo || '(Sem título)'}</Text>
                          <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                            {formatDateTimeBR(ev.inicio)}
                            {ev.fim ? ` — ${formatDateTimeBR(ev.fim)}` : ''}
                          </Text>
                          {registros.length === 0 ? (
                            <Text style={{ color: theme.textMuted, fontSize: 12 }}>Sem registro neste dia.</Text>
                          ) : (
                            registros.map((reuniao) => (
                              <View
                                key={reuniao.id}
                                style={{
                                  borderTopWidth: 1,
                                  borderTopColor: theme.border,
                                  paddingTop: 6,
                                  gap: 2,
                                }}
                              >
                                <Text style={{ color: theme.cadastroAction, fontWeight: '800', fontSize: 12 }}>
                                  Registro do mesmo dia
                                </Text>
                                <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                                  {formatDateTimeBR(reuniao.created_at)} · {reuniao.admin_email?.trim() || '—'}
                                </Text>
                                {reuniao.pendencia?.trim() ? (
                                  <Text style={{ color: theme.headerText, fontWeight: '700' }}>{reuniao.pendencia}</Text>
                                ) : null}
                                {reuniao.pendencia?.trim() ? (
                                  <Text style={{ color: theme.text, fontSize: 13 }}>
                                    Retorno: {formatYmdBR(reuniao.data_retorno)}
                                  </Text>
                                ) : null}
                                {reuniao.assuntos?.trim() ? (
                                  <Text style={{ color: theme.textMuted, fontSize: 13 }}>{reuniao.assuntos}</Text>
                                ) : null}
                              </View>
                            ))
                          )}
                        </View>
                      );
                    })
                  )}
                </>
              ) : null}
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
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                          {formatDateTimeBR(reuniao.created_at)}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                          Registrado por {reuniao.admin_email?.trim() || '—'}
                        </Text>
                      </View>
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
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                          {formatConversaQuando(conversa.data_conversa, conversa.hora_conversa)}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                          Registrado por {conversa.admin_email?.trim() || '—'}
                        </Text>
                      </View>
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
          {erro ? <Text style={{ color: theme.error }}>{erro}</Text> : null}
          {ocupado && !salvarReuniao.isPending && !salvarConversa.isPending ? (
            <ActivityIndicator color={theme.cadastroAction} />
          ) : null}
      </View>
      <RegistrarReuniaoModal
        cliente={cliente}
        visible={reuniaoAberta}
        onClose={() => setReuniaoAberta(false)}
        onSaved={invalidarHistorico}
      />
      <ConversaModal
        cliente={cliente}
        visible={conversaAberta}
        onClose={() => setConversaAberta(false)}
        onSaved={invalidarHistorico}
      />
      <NovaPendenciaClienteModal
        cliente={cliente}
        visible={pendenciaAberta}
        onClose={() => setPendenciaAberta(false)}
        onSaved={invalidarHistorico}
      />
      <ChamadoDigisacModal clienteId={cliente.id} chamado={chamadoAberto} onClose={() => setChamadoAberto(null)} />
    </>
  );

  if (embutido) return conteudo;
  return <Screen scroll>{conteudo}</Screen>;
}

function PendenciasAbertasModal({
  cliente,
  visible,
  onClose,
}: {
  cliente: AcompanhamentoCliente | null;
  visible: boolean;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const q = useQuery({
    queryKey: ['admin_cliente_reunioes', cliente?.id, 'pendencias-abertas-modal'],
    queryFn: () => listarReunioes(),
    enabled: visible && Boolean(cliente?.id),
    select: (rows) =>
      rows.filter(
        (row) => row.cliente_id === cliente?.id && !row.concluida && `${row.pendencia ?? ''}`.trim(),
      ),
  });

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.historicoCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.rowBetween}>
            <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 18, flex: 1 }} numberOfLines={2}>
              Pendências · {cliente?.nome ?? 'Cliente'}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <FontAwesome name="times" size={16} color={theme.textMuted} />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 8 }}>
            {q.isLoading ? <ActivityIndicator color={theme.cadastroAction} /> : null}
            {q.error ? <Text style={{ color: theme.error }}>{(q.error as Error).message}</Text> : null}
            {!q.isLoading && !q.error && (q.data ?? []).length === 0 ? (
              <Text style={{ color: theme.textMuted, fontSize: 13 }}>Nenhuma pendência em aberto.</Text>
            ) : null}
            {(q.data ?? []).map((item) => {
              const coluna = colunaPendencia(item);
              const atrasada = coluna === 'atrasada';
              return (
                <View key={item.id} style={[styles.historicoItem, { borderColor: atrasada ? '#F07167' : theme.border }]}>
                  <Text style={{ color: atrasada ? '#F07167' : theme.cadastroAction, fontWeight: '800', fontSize: 12 }}>
                    {atrasada ? 'Atrasada' : 'Em andamento'} · {formatYmdBR(item.data_retorno)}
                  </Text>
                  <Text style={{ color: theme.headerText, fontWeight: '800', marginTop: 4 }}>{item.pendencia}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
                    Escrito por {item.admin_email?.trim() || '—'}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function KanbanCard({
  item,
  ultimoContato,
  diasAlerta,
  pendenciasAbertas,
  ultimaReuniao,
  proximaReuniaoGoogle,
  mensagemAutomatica,
  onAbrir,
  onAbrirPendencias,
  onRegistrarConversa,
  onRegistrarReuniao,
  onEditarFicha,
  onAbrirMover,
  onArrastar,
  onSoltar,
}: {
  item: AcompanhamentoCliente;
  ultimoContato?: string | null;
  diasAlerta: number;
  pendenciasAbertas: number;
  ultimaReuniao?: string | null;
  proximaReuniaoGoogle?: string | null;
  mensagemAutomatica?: boolean;
  onAbrir: () => void;
  onAbrirPendencias: () => void;
  onRegistrarConversa: () => void;
  onRegistrarReuniao: () => void;
  onEditarFicha: () => void;
  onAbrirMover: () => void;
  onArrastar: (x: number, y: number) => void;
  onSoltar: (x: number, y: number) => void;
}) {
  const { theme } = useTheme();
  const [aberto, setAberto] = useState(false);
  const empresa = `${item.empresa_nome ?? ''}`.trim();
  const pendencias = pendenciasAbertas;
  const proximaReuniao = proximaReuniaoGoogle || item.proxima_reuniao || null;
  const proximaDeGoogle = Boolean(proximaReuniaoGoogle);
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
      <View style={styles.cardTopo}>
        <Pressable
          onPress={() => {
            if (arrastou.current) {
              arrastou.current = false;
              return;
            }
            onAbrir();
          }}
          style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1, flex: 1, flexDirection: 'row', gap: 10, minWidth: 0 })}
        >
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
            <Text
              style={{
                color: contatoAtrasado(ultimoContato, diasAlerta)
                  ? theme.error
                  : theme.mode === 'dark'
                    ? '#FFFFFF'
                    : theme.headerText,
                fontSize: 11,
                fontWeight: '700',
                marginTop: 2,
              }}
            >
              {rotuloUltimoContato(ultimoContato)}
            </Text>
            {mensagemAutomatica ? (
              <Text style={{ color: theme.cadastroAction, fontSize: 11, fontWeight: '800', marginTop: 4 }}>
                Mensagem automática enviada
              </Text>
            ) : null}
          </View>
        </Pressable>
        <SemArraste>
          <Pressable
            onPress={() => setAberto((atual) => !atual)}
            hitSlop={8}
            accessibilityLabel={aberto ? 'Recolher card' : 'Expandir card'}
          >
            <FontAwesome name={aberto ? 'chevron-up' : 'chevron-down'} size={14} color={theme.textMuted} />
          </Pressable>
        </SemArraste>
      </View>

      {aberto ? (
        <>
      <View style={{ gap: 10 }}>
      <View style={styles.datasRow}>
        <Pressable
          onPress={() => {
            if (arrastou.current) {
              arrastou.current = false;
              return;
            }
            onAbrir();
          }}
          style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1, flex: 1, gap: 8 })}
        >
          <View>
            <Text style={[styles.metaLabel, { color: theme.textMuted }]}>Último contato</Text>
            <Text style={[styles.metaValor, { color: theme.headerText }]}>{dataOuTraco(ultimoContato)}</Text>
          </View>
          <View>
            <Text style={[styles.metaLabel, { color: theme.textMuted }]}>Última reunião</Text>
            <Text style={[styles.metaValor, { color: theme.headerText }]}>{dataOuTraco(ultimaReuniao)}</Text>
          </View>
          <View>
            <Text style={[styles.metaLabel, { color: theme.textMuted }]}>
              Próxima reunião{proximaDeGoogle ? ' · agenda' : ''}
            </Text>
            <Text style={[styles.metaValor, { color: theme.headerText }]}>
              {proximaDeGoogle ? formatDataHoraBrasil(proximaReuniao) : dataOuTraco(proximaReuniao)}
            </Text>
          </View>
        </Pressable>
        <SemArraste>
          <Pressable
            onPress={onAbrirPendencias}
            hitSlop={6}
            accessibilityLabel="Ver pendências em aberto"
            style={({ pressed }) => [styles.pendenciasBox, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={[styles.pendenciasLabel, { color: theme.textMuted }]}>PENDÊNCIAS EM ABERTO</Text>
            <Text style={[styles.pendenciasNumero, { color: pendencias > 0 ? PENDENCIA : theme.textMuted }]}>{pendencias}</Text>
          </Pressable>
        </SemArraste>
      </View>

      <Pressable
        onPress={() => {
          if (arrastou.current) {
            arrastou.current = false;
            return;
          }
          onAbrir();
        }}
        style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
      >
      <View style={[styles.fichaBloco, { borderTopColor: theme.border }]}>
        <Text style={[styles.secaoLabel, { color: theme.textMuted }]}>ÚLTIMA DIFICULDADE</Text>
        <Text style={{ color: theme.text, fontSize: 13, marginTop: 3 }}>{item.ultima_dificuldade?.trim() || '—'}</Text>
        <Text style={[styles.secaoLabel, { color: theme.textMuted, marginTop: 10 }]}>PRÓXIMA AÇÃO</Text>
        <Text style={{ color: theme.text, fontSize: 13, marginTop: 3 }}>{item.proxima_acao?.trim() || '—'}</Text>
      </View>
      </Pressable>
      </View>
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
        </>
      ) : null}
    </View>
  );
}

function KanbanColumn({
  coluna,
  clientes,
  ultimosContatos,
  diasAlerta,
  dropOver,
  altura,
  onAbrir,
  onAbrirPendencias,
  onRegistrarConversa,
  onRegistrarReuniao,
  onEditarFicha,
  onAbrirMover,
  onArrastar,
  onSoltar,
  resumoReunioes,
  proximasGoogle,
  mensagensEnviadas,
}: {
  coluna: (typeof ACOMPANHAMENTO_COLUNAS)[number];
  clientes: AcompanhamentoCliente[];
  ultimosContatos: Map<string, string>;
  diasAlerta: number;
  resumoReunioes: Map<string, ResumoReunioesCliente>;
  proximasGoogle: Map<string, string>;
  mensagensEnviadas: Set<string>;
  dropOver: boolean;
  altura: number;
  onAbrir: (c: AcompanhamentoCliente) => void;
  onAbrirPendencias: (c: AcompanhamentoCliente) => void;
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
        altura ? { height: altura } : null,
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
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{ padding: 10, gap: 10, paddingBottom: 24 }}
        nestedScrollEnabled
        showsVerticalScrollIndicator
      >
        {clientes.length === 0 ? (
          <View style={[styles.vazio, { backgroundColor: theme.background }]} />
        ) : (
          clientes.map((item) => (
            <KanbanCard
              key={item.id}
              item={item}
              ultimoContato={ultimosContatos.get(item.id) ?? null}
              diasAlerta={diasAlerta}
              pendenciasAbertas={resumoReunioes.get(item.id)?.abertas ?? 0}
              ultimaReuniao={resumoReunioes.get(item.id)?.ultimaCriacao ?? null}
              proximaReuniaoGoogle={proximasGoogle.get(item.id) ?? null}
              mensagemAutomatica={coluna.key === 'primeiro_contato' && mensagensEnviadas.has(item.id)}
              onAbrir={() => onAbrir(item)}
              onAbrirPendencias={() => onAbrirPendencias(item)}
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
  const router = useRouter();
  const { canAccessScreen, session, adminProfile } = useAdminAuth();
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [filtroAlerta, setFiltroAlerta] = useState(false);
  const [filtroSemReuniao, setFiltroSemReuniao] = useState(false);
  const [alturaSlot, setAlturaSlot] = useState(0);
  const alturaColuna = Math.max(alturaSlot - 12 - FOLGA_BARRA_HORIZONTAL, 0);
  const [clientePendencias, setClientePendencias] = useState<AcompanhamentoCliente | null>(null);
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

  const alertaQ = useQuery({
    queryKey: ['acompanhamento_alerta_contato'],
    queryFn: listarAlertaContato,
    enabled: canAccessScreen('acompanhamento'),
  });

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

  const googleProximasQ = useQuery({
    queryKey: ['google_proximas_reunioes', ids.join(',')],
    queryFn: () => listarProximasReunioesGoogle(ids),
    enabled: canAccessScreen('acompanhamento') && ids.length > 0,
  });

  const mensagensDigisacQ = useQuery({
    queryKey: ['digisac_mensagens_enviadas', ids.join(',')],
    queryFn: () => listarMensagensAutomaticasEnviadas(ids),
    enabled: canAccessScreen('acompanhamento') && ids.length > 0,
  });

  const porColunaFiltrado = useMemo(() => {
    const out = agrupamentoAcompanhamentoVazio();
    const base = q.data?.porColuna;
    if (!base) return out;
    const hoje = hojeIsoLocal();
    const contatos = contatosQ.data;
    const alertas = alertaQ.data;
    const google = googleProximasQ.data;
    for (const col of ACOMPANHAMENTO_COLUNAS) {
      out[col.key] = (base[col.key] ?? []).filter((c) => {
        if (!matchBusca(c, busca)) return false;
        if (filtroAlerta && !contatoAtrasado(contatos?.get(c.id) ?? null, alertas?.[col.key] ?? 7)) return false;
        if (filtroSemReuniao && temProximaReuniao(c, google?.get(c.id), hoje)) return false;
        return true;
      });
    }
    return out;
  }, [q.data, busca, filtroAlerta, filtroSemReuniao, contatosQ.data, alertaQ.data, googleProximasQ.data]);

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
    <View style={{ flex: 1, minHeight: 0, backgroundColor: theme.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
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

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <FiltroChip label="Com alerta" ativo={filtroAlerta} onPress={() => setFiltroAlerta((atual) => !atual)} />
          <FiltroChip
            label="Sem próxima reunião"
            ativo={filtroSemReuniao}
            onPress={() => setFiltroSemReuniao((atual) => !atual)}
          />
        </View>

        {q.isLoading ? <Text style={{ color: theme.textMuted }}>Carregando Kanban…</Text> : null}
        {q.error ? (
          <Text style={{ color: theme.error }}>{q.error instanceof Error ? q.error.message : 'Erro ao carregar'}</Text>
        ) : null}
        {erroMove ? <Text style={{ color: theme.error }}>{erroMove}</Text> : null}
      </View>

      <View
        style={{ flex: 1, minHeight: 0 }}
        onLayout={(event) => {
          const altura = Math.floor(event.nativeEvent.layout.height);
          setAlturaSlot((atual) => (atual === altura ? atual : altura));
        }}
      >
      <ScrollView
        horizontal
        ref={marcarScrollKanban('acompanhamento')}
        style={{ height: alturaSlot || '100%', minHeight: 0 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          height: alturaSlot || undefined,
        }}
        showsHorizontalScrollIndicator
      >
        <View style={[styles.boardRow, alturaColuna ? { height: alturaColuna } : null]}>
          {ACOMPANHAMENTO_COLUNAS.map((col) => (
            <KanbanColumn
              key={col.key}
              coluna={col}
              clientes={porColunaFiltrado[col.key]}
              ultimosContatos={contatosQ.data ?? new Map()}
              diasAlerta={alertaQ.data?.[col.key] ?? 7}
              resumoReunioes={abertasQ.data ?? new Map()}
              proximasGoogle={googleProximasQ.data ?? new Map()}
              mensagensEnviadas={mensagensDigisacQ.data ?? new Set()}
              dropOver={dropOverColuna === col.key}
              altura={alturaColuna}
              onAbrir={(cliente) =>
                router.push({
                  pathname: '/(tabs)/acompanhamento/[id]',
                  params: { id: cliente.id },
                })
              }
              onAbrirPendencias={setClientePendencias}
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
      </ScrollView>
      </View>

      <PendenciasAbertasModal
        cliente={clientePendencias}
        visible={Boolean(clientePendencias)}
        onClose={() => setClientePendencias(null)}
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
  boardRow: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
  column: {
    width: COL_WIDTH,
    borderRadius: 16,
    overflow: 'hidden',
    alignSelf: 'stretch',
    flexDirection: 'column',
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
    flexShrink: 0,
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
