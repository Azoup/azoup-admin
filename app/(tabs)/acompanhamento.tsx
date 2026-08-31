import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Text } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import { carregarAcompanhamentoClientes } from '@/src/services/repos/acompanhamento-repo';
import { moverClienteKanban } from '@/src/services/repos/kanban-acompanhamento-repo';
import {
  contarObservacoesAcompanhamento,
  criarObservacaoAcompanhamento,
  listarObservacoesAcompanhamento,
} from '@/src/services/repos/observacoes-acompanhamento-repo';
import type { AdminAcompanhamentoObservacaoRow } from '@/src/types/azoup';
import {
  ACOMPANHAMENTO_COLUNAS,
  type AcompanhamentoCliente,
  type AcompanhamentoColuna,
} from '@/src/utils/acompanhamento';
import { formatBRLFromReais, formatDateBR, formatDateTimeBR, formatYmdBR } from '@/src/utils/format';
import { digitsOnlyPhone, resolveClienteWhatsAppUrl } from '@/src/utils/whatsapp';

const WHATSAPP_GREEN = '#25D366';
const COL_WIDTH = 280;
const DRAG_MIME = 'application/x-acompanhamento-cliente';

function corColuna(key: AcompanhamentoColuna, theme: ReturnType<typeof useTheme>['theme']) {
  if (key === 'fila_espera') return theme.textMuted;
  if (key === 'urgentes') return theme.error;
  if (key === 'precisa_ajuda') return theme.warning;
  if (key === 'pode_esperar') return theme.cadastroAction;
  return theme.success;
}

function matchBuscaAcompanhamento(item: AcompanhamentoCliente, busca: string): boolean {
  const q = busca.trim().toLowerCase();
  if (!q) return true;
  const qDigits = digitsOnlyPhone(q);
  const texto = [item.nome, item.email, item.telefone, item.celular, item.empresa_nome, item.empresa_cnpj]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (texto.includes(q)) return true;
  if (qDigits.length >= 3) {
    const digits = digitsOnlyPhone(
      `${item.telefone ?? ''}${item.celular ?? ''}${item.empresa_cnpj ?? ''}`,
    );
    if (digits.includes(qDigits)) return true;
  }
  return false;
}

function MetaLinha({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <Text style={{ color: theme.textMuted, fontSize: 12 }}>
      {label}: <Text style={{ color: theme.text, fontWeight: '700' }}>{value}</Text>
    </Text>
  );
}

function ObservacoesModal({
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
  const { session } = useAdminAuth();
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const obsQuery = useQuery({
    queryKey: ['acompanhamento_observacoes', cliente?.id],
    queryFn: () => listarObservacoesAcompanhamento(cliente!.id),
    enabled: visible && Boolean(cliente?.id),
  });

  const salvarMutation = useMutation({
    mutationFn: async () => {
      if (!cliente) throw new Error('Cliente inválido.');
      return criarObservacaoAcompanhamento({
        clienteId: cliente.id,
        observacao: texto,
        adminEmail: session?.user?.email ?? null,
      });
    },
    onSuccess: async () => {
      setTexto('');
      setErro(null);
      await obsQuery.refetch();
      onSaved();
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao salvar observação'),
  });

  useEffect(() => {
    if (!visible) {
      setTexto('');
      setErro(null);
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.rowBetween}>
            <Text style={{ fontWeight: '800', fontSize: 17, color: theme.headerText, flex: 1 }}>
              Observações · {cliente?.nome ?? 'Cliente'}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <FontAwesome name="times" size={18} color={theme.textMuted} />
            </Pressable>
          </View>

          <FormField label="Nova observação">
            <FormInput
              value={texto}
              onChangeText={setTexto}
              placeholder="Digite a observação…"
              multiline
              style={{ minHeight: 72, textAlignVertical: 'top' }}
            />
          </FormField>

          {erro ? <Text style={{ color: theme.error }}>{erro}</Text> : null}

          <PrimaryButton
            label="Adicionar observação"
            loading={salvarMutation.isPending}
            onPress={() => {
              setErro(null);
              salvarMutation.mutate();
            }}
          />

          <SectionTitle>Histórico</SectionTitle>

          <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
            {obsQuery.isLoading ? (
              <ActivityIndicator color={theme.cadastroAction} />
            ) : obsQuery.error ? (
              <Text style={{ color: theme.error }}>
                {(obsQuery.error as Error).message.includes('admin_acompanhamento_observacoes')
                  ? 'Execute supabase/sql/admin_acompanhamento_observacoes.sql no Supabase.'
                  : (obsQuery.error as Error).message}
              </Text>
            ) : (obsQuery.data ?? []).length === 0 ? (
              <Text style={{ color: theme.textMuted }}>Nenhuma observação ainda.</Text>
            ) : (
              (obsQuery.data as AdminAcompanhamentoObservacaoRow[]).map((obs) => (
                <View
                  key={obs.id}
                  style={[styles.obsItem, { borderColor: theme.border, backgroundColor: theme.surfaceMuted }]}
                >
                  <Text style={{ color: theme.text, fontSize: 14 }}>{obs.observacao}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
                    {obs.admin_email ?? 'admin'} · {formatDateTimeBR(obs.created_at)}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
        </View>
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
      <View style={[styles.modalOverlay, { justifyContent: 'center' }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.moverCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={{ fontWeight: '800', fontSize: 16, color: theme.headerText }}>
            Mover · {cliente?.nome ?? 'Cliente'}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 13 }}>Escolha a coluna de destino</Text>
          {ACOMPANHAMENTO_COLUNAS.map((col) => {
            const ativa = cliente?.coluna === col.key;
            const cor = corColuna(col.key, theme);
            return (
              <Pressable
                key={col.key}
                disabled={moving || ativa}
                onPress={() => onMover(col.key)}
                style={({ pressed }) => [
                  styles.moverOpt,
                  {
                    borderColor: cor,
                    backgroundColor: ativa ? `${cor}22` : theme.surfaceMuted,
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
          {moving ? <ActivityIndicator color={theme.cadastroAction} /> : null}
        </View>
      </View>
    </Modal>
  );
}

function KanbanCard({
  item,
  expandido,
  onToggle,
  qtdObservacoes,
  onAbrirObservacoes,
  onAbrirMover,
}: {
  item: AcompanhamentoCliente;
  expandido: boolean;
  onToggle: () => void;
  qtdObservacoes: number;
  onAbrirObservacoes: () => void;
  onAbrirMover: () => void;
}) {
  const { theme } = useTheme();
  const contato = item.celular ?? item.telefone ?? '—';
  const whatsappUrl = resolveClienteWhatsAppUrl(item.celular, item.telefone);

  const webDragProps =
    Platform.OS === 'web'
      ? ({
          draggable: true,
          onDragStart: (e: { dataTransfer?: { setData: (t: string, v: string) => void; effectAllowed: string } }) => {
            e.dataTransfer?.setData(DRAG_MIME, item.id);
            e.dataTransfer?.setData('text/plain', item.id);
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
          },
        } as Record<string, unknown>)
      : {};

  return (
    <View
      {...webDragProps}
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          cursor: Platform.OS === 'web' ? 'grab' : undefined,
        } as object,
      ]}
    >
      <Pressable onPress={onToggle} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, gap: 3 })}>
        <View style={styles.rowBetween}>
          <Text style={{ fontWeight: '800', fontSize: 14, color: theme.headerText, flex: 1 }} numberOfLines={2}>
            {item.nome}
          </Text>
          <FontAwesome name={expandido ? 'chevron-up' : 'chevron-down'} size={12} color={theme.textMuted} />
        </View>
        <Text style={{ color: theme.textMuted, fontSize: 12 }} numberOfLines={1}>
          {item.empresa_nome ?? '—'}
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 11 }}>
          P {item.produtos} · V {item.vendas} · OP {item.ordens_producao}
        </Text>
      </Pressable>

      <View style={styles.cardActions}>
        <Pressable
          onPress={onAbrirObservacoes}
          style={({ pressed }) => [
            styles.miniBtn,
            { borderColor: theme.border, backgroundColor: theme.surfaceMuted, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <FontAwesome name="comment" size={12} color={theme.cadastroAction} />
          <Text style={{ color: theme.headerText, fontWeight: '700', fontSize: 11 }}>
            Obs{qtdObservacoes > 0 ? ` (${qtdObservacoes})` : ''}
          </Text>
        </Pressable>
        <Pressable
          onPress={onAbrirMover}
          style={({ pressed }) => [
            styles.miniBtn,
            { borderColor: theme.border, backgroundColor: theme.surfaceMuted, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <FontAwesome name="arrows" size={12} color={theme.cadastroAction} />
          <Text style={{ color: theme.headerText, fontWeight: '700', fontSize: 11 }}>Mover</Text>
        </Pressable>
      </View>

      {expandido ? (
        <View style={[styles.detalhe, { borderTopColor: theme.border }]}>
          <MetaLinha label="Contato" value={contato} />
          <MetaLinha label="CNPJ" value={item.empresa_cnpj ?? '—'} />
          <MetaLinha label="Clientes" value={String(item.clientes_cadastrados)} />
          <MetaLinha label="Fornecedores" value={String(item.fornecedores_cadastrados)} />
          <MetaLinha label="Tempo" value={`${item.dias_usando} dias`} />
          <MetaLinha label="Plano" value={item.plano_nome ?? '—'} />
          <MetaLinha
            label="Valor"
            value={item.valor_mensal_atual != null ? formatBRLFromReais(item.valor_mensal_atual) : '—'}
          />
          <MetaLinha
            label="Renovação"
            value={
              formatYmdBR(item.data_renovacao) !== '—'
                ? formatYmdBR(item.data_renovacao)
                : formatDateBR(item.data_renovacao)
            }
          />
          {item.dias_trial_restantes != null ? (
            <MetaLinha
              label="Trial"
              value={
                item.dias_trial_restantes < 0
                  ? 'Expirado'
                  : `${item.dias_trial_restantes} dia(s)`
              }
            />
          ) : null}
          {whatsappUrl ? (
            <Pressable
              onPress={() => void Linking.openURL(whatsappUrl)}
              style={({ pressed }) => [
                styles.whatsappBtn,
                {
                  backgroundColor: `${WHATSAPP_GREEN}18`,
                  borderColor: WHATSAPP_GREEN,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <FontAwesome name="whatsapp" size={14} color={WHATSAPP_GREEN} />
              <Text style={{ color: WHATSAPP_GREEN, fontWeight: '800', fontSize: 12 }}>WhatsApp</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function KanbanColumn({
  coluna,
  clientes,
  dropOver,
  expandidoId,
  obsCounts,
  onToggleExpand,
  onAbrirObservacoes,
  onAbrirMover,
  onDragEnter,
  onDragLeave,
  onDropCliente,
}: {
  coluna: (typeof ACOMPANHAMENTO_COLUNAS)[number];
  clientes: AcompanhamentoCliente[];
  dropOver: boolean;
  expandidoId: string | null;
  obsCounts: Map<string, number>;
  onToggleExpand: (id: string) => void;
  onAbrirObservacoes: (c: AcompanhamentoCliente) => void;
  onAbrirMover: (c: AcompanhamentoCliente) => void;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDropCliente: (clienteId: string) => void;
}) {
  const { theme } = useTheme();
  const cor = corColuna(coluna.key, theme);

  const webDropProps =
    Platform.OS === 'web'
      ? ({
          onDragOver: (e: { preventDefault?: () => void; dataTransfer?: { dropEffect: string } }) => {
            e.preventDefault?.();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
          },
          onDragEnter: (e: { preventDefault?: () => void }) => {
            e.preventDefault?.();
            onDragEnter();
          },
          onDragLeave: () => onDragLeave(),
          onDrop: (e: {
            preventDefault?: () => void;
            dataTransfer?: { getData: (t: string) => string };
          }) => {
            e.preventDefault?.();
            const id =
              e.dataTransfer?.getData(DRAG_MIME) || e.dataTransfer?.getData('text/plain') || '';
            if (id) onDropCliente(id);
            onDragLeave();
          },
        } as Record<string, unknown>)
      : {};

  return (
    <View
      {...webDropProps}
      style={[
        styles.column,
        {
          backgroundColor: theme.surfaceMuted,
          borderColor: dropOver ? cor : theme.border,
          borderWidth: dropOver ? 2 : 1,
        },
      ]}
    >
      <View style={[styles.columnHeader, { borderBottomColor: theme.border }]}>
        <View style={[styles.dot, { backgroundColor: cor }]} />
        <Text style={{ fontWeight: '800', color: theme.headerText, flex: 1 }} numberOfLines={1}>
          {coluna.label}
        </Text>
        <Text style={{ color: theme.textMuted, fontWeight: '700', fontSize: 12 }}>{clientes.length}</Text>
      </View>
      <Text style={{ color: theme.textMuted, fontSize: 11, paddingHorizontal: 10, paddingBottom: 6 }}>
        {coluna.descricao}
      </Text>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 8, gap: 8, paddingBottom: 16 }}
        nestedScrollEnabled
      >
        {clientes.length === 0 ? (
          <Text style={{ color: theme.textMuted, fontSize: 12, textAlign: 'center', marginTop: 12 }}>
            Arraste um cliente para cá
          </Text>
        ) : (
          clientes.map((item) => (
            <KanbanCard
              key={item.id}
              item={item}
              expandido={expandidoId === item.id}
              onToggle={() => onToggleExpand(item.id)}
              qtdObservacoes={obsCounts.get(item.id) ?? 0}
              onAbrirObservacoes={() => onAbrirObservacoes(item)}
              onAbrirMover={() => onAbrirMover(item)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

export default function AcompanhamentoScreen() {
  const { theme } = useTheme();
  const { canAccessScreen, session } = useAdminAuth();
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [clienteObs, setClienteObs] = useState<AcompanhamentoCliente | null>(null);
  const [clienteMover, setClienteMover] = useState<AcompanhamentoCliente | null>(null);
  const [dropOverColuna, setDropOverColuna] = useState<AcompanhamentoColuna | null>(null);
  const [erroMove, setErroMove] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['acompanhamento_clientes'],
    queryFn: carregarAcompanhamentoClientes,
    enabled: canAccessScreen('acompanhamento'),
  });

  const ids = useMemo(() => (q.data?.clientes ?? []).map((c) => c.id), [q.data]);

  const obsCountQuery = useQuery({
    queryKey: ['acompanhamento_observacoes_counts', ids.join(',')],
    queryFn: () => contarObservacoesAcompanhamento(ids),
    enabled: canAccessScreen('acompanhamento') && ids.length > 0,
  });

  const porColunaFiltrado = useMemo(() => {
    const base = q.data?.porColuna;
    const out: Record<AcompanhamentoColuna, AcompanhamentoCliente[]> = {
      fila_espera: [],
      urgentes: [],
      precisa_ajuda: [],
      pode_esperar: [],
      esta_usando: [],
    };
    if (!base) return out;
    for (const col of ACOMPANHAMENTO_COLUNAS) {
      out[col.key] = (base[col.key] ?? []).filter((c) => matchBuscaAcompanhamento(c, busca));
    }
    return out;
  }, [q.data, busca]);

  const moverMutation = useMutation({
    mutationFn: async ({
      clienteId,
      coluna,
    }: {
      clienteId: string;
      coluna: AcompanhamentoColuna;
    }) =>
      moverClienteKanban({
        clienteId,
        coluna,
        adminEmail: session?.user?.email ?? null,
      }),
    onMutate: async ({ clienteId, coluna }) => {
      setErroMove(null);
      await qc.cancelQueries({ queryKey: ['acompanhamento_clientes'] });
      const prev = qc.getQueryData<Awaited<ReturnType<typeof carregarAcompanhamentoClientes>>>([
        'acompanhamento_clientes',
      ]);
      if (prev) {
        const clientes = prev.clientes.map((c) =>
          c.id === clienteId ? { ...c, coluna, etiqueta: coluna } : c,
        );
        const porColuna: typeof prev.porColuna = {
          fila_espera: [],
          urgentes: [],
          precisa_ajuda: [],
          pode_esperar: [],
          esta_usando: [],
        };
        for (const c of clientes) {
          porColuna[c.coluna].push(c);
        }
        qc.setQueryData(['acompanhamento_clientes'], {
          ...prev,
          clientes,
          porColuna,
          porEtiqueta: porColuna,
        });
      }
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['acompanhamento_clientes'], ctx.prev);
      setErroMove(
        e instanceof Error && e.message.includes('admin_acompanhamento_kanban')
          ? 'Execute supabase/sql/admin_acompanhamento_kanban.sql no Supabase.'
          : e instanceof Error
            ? e.message
            : 'Erro ao mover cliente',
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['acompanhamento_clientes'] });
      setClienteMover(null);
      setDropOverColuna(null);
    },
  });

  if (!canAccessScreen('acompanhamento')) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: theme.background }}>
        <Text style={{ color: theme.warning, fontWeight: '800' }}>
          Seu perfil não tem acesso a Acompanhamento.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        horizontal
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 12, minHeight: '100%' }}
        showsHorizontalScrollIndicator
      >
        <View style={{ gap: 12, minWidth: ACOMPANHAMENTO_COLUNAS.length * (COL_WIDTH + 12) }}>
          <PageHeader
            title="Acompanhamento"
            subtitle="Kanban: clientes ativos/trial começam na Fila de espera — arraste para as colunas."
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
            <Text style={{ color: theme.error }}>
              {q.error instanceof Error ? q.error.message : 'Erro ao carregar acompanhamento'}
            </Text>
          ) : null}
          {erroMove ? <Text style={{ color: theme.error }}>{erroMove}</Text> : null}

          <View style={styles.boardRow}>
            {ACOMPANHAMENTO_COLUNAS.map((col) => (
              <KanbanColumn
                key={col.key}
                coluna={col}
                clientes={porColunaFiltrado[col.key]}
                dropOver={dropOverColuna === col.key}
                expandidoId={expandidoId}
                obsCounts={obsCountQuery.data ?? new Map()}
                onToggleExpand={(id) => setExpandidoId((cur) => (cur === id ? null : id))}
                onAbrirObservacoes={setClienteObs}
                onAbrirMover={setClienteMover}
                onDragEnter={() => setDropOverColuna(col.key)}
                onDragLeave={() => setDropOverColuna((cur) => (cur === col.key ? null : cur))}
                onDropCliente={(clienteId) => {
                  const atual = q.data?.clientes.find((c) => c.id === clienteId);
                  if (!atual || atual.coluna === col.key) return;
                  moverMutation.mutate({ clienteId, coluna: col.key });
                }}
              />
            ))}
          </View>
        </View>
      </ScrollView>

      <ObservacoesModal
        cliente={clienteObs}
        visible={Boolean(clienteObs)}
        onClose={() => setClienteObs(null)}
        onSaved={() => {
          void qc.invalidateQueries({ queryKey: ['acompanhamento_observacoes_counts'] });
        }}
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
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: { position: 'relative', justifyContent: 'center', maxWidth: 480 },
  searchIcon: { position: 'absolute', left: 8, zIndex: 1 },
  searchInput: { height: 36, fontSize: 13, paddingLeft: 28, paddingRight: 28 },
  clearIcon: { position: 'absolute', right: 8, zIndex: 1 },
  boardRow: { flexDirection: 'row', alignItems: 'stretch', gap: 12, flex: 1, minHeight: 520 },
  column: {
    width: COL_WIDTH,
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 480,
    maxHeight: 720,
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  card: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  miniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  detalhe: { gap: 3, paddingTop: 8, marginTop: 2, borderTopWidth: 1 },
  whatsappBtn: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '88%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  moverCard: {
    margin: 24,
    marginBottom: 'auto',
    marginTop: 'auto',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  moverOpt: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  obsItem: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
});
