import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ClienteSearchPicker } from '@/components/ui/ClienteSearchPicker';
import { FormDateInput } from '@/components/ui/FormDateInput';
import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Text } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import { listarClientesParaSelecao } from '@/src/services/repos/conversas-repo';
import {
  colunaPendencia,
  criarPendenciaAvulsa,
  definirReuniaoConcluida,
  listarReunioes,
  type PendenciaColuna,
  type ReuniaoClienteRow,
} from '@/src/services/repos/reunioes-repo';
import type { ClienteAzoupRow } from '@/src/types/azoup';
import { rotuloCliente } from '@/src/utils/cliente-label';
import { formatYmdBR } from '@/src/utils/format';
import {
  colunaSobPonto,
  marcarColuna,
  marcarScrollKanban,
  posicionarFantasma,
  SemArraste,
  useCardPointerDrag,
} from '@/src/utils/kanban-drag';

const COL_WIDTH = 320;
const SCROLL_PENDENCIAS = '[data-kanban-scroll="pendencias"]';

const COLUNAS: { key: PendenciaColuna; label: string; cor: string }[] = [
  { key: 'atrasada', label: 'Atrasada', cor: '#F07167' },
  { key: 'em_andamento', label: 'Em andamento', cor: '#F5C542' },
  { key: 'concluida', label: 'Concluída', cor: '#3DDC97' },
];

function PendenciaCard({
  item,
  cor,
  onConcluir,
  onReabrir,
  onArrastar,
  onSoltar,
}: {
  item: ReuniaoClienteRow;
  cor: string;
  onConcluir: () => void;
  onReabrir: () => void;
  onArrastar: (x: number, y: number) => void;
  onSoltar: (x: number, y: number) => void;
}) {
  const { theme } = useTheme();
  const coluna = colunaPendencia(item);
  const empresa = item.empresa_nome?.trim() || 'Cliente';
  const arrastarRef = useRef(onArrastar);
  const soltarRef = useRef(onSoltar);
  arrastarRef.current = onArrastar;
  soltarRef.current = onSoltar;
  const { ref } = useCardPointerDrag({
    scrollSelector: SCROLL_PENDENCIAS,
    onMove: ({ x, y }) => arrastarRef.current(x, y),
    onDrop: ({ x, y }) => soltarRef.current(x, y),
    onCancel: () => soltarRef.current(-1, -1),
  });

  return (
    <View
      ref={ref}
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: cor,
        },
      ]}
    >
      <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 15 }} numberOfLines={2}>
        {empresa}
      </Text>
      <Text style={{ color: theme.text, fontSize: 13, lineHeight: 18 }}>{item.pendencia}</Text>
      <View style={styles.cardRodape}>
        <Text style={{ color: theme.textMuted, fontWeight: '700', fontSize: 12 }}>{formatYmdBR(item.data_retorno)}</Text>
        <SemArraste>
          {coluna === 'concluida' ? (
            <Pressable onPress={onReabrir} hitSlop={6}>
              <Text style={{ color: theme.cadastroAction, fontWeight: '800', fontSize: 12 }}>Reabrir</Text>
            </Pressable>
          ) : (
            <Pressable onPress={onConcluir} hitSlop={6}>
              <Text style={{ color: theme.cadastroAction, fontWeight: '800', fontSize: 12 }}>Concluir</Text>
            </Pressable>
          )}
        </SemArraste>
      </View>
    </View>
  );
}

function NovaPendenciaModal({
  visible,
  adminEmail,
  onClose,
  onSaved,
}: {
  visible: boolean;
  adminEmail: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { theme } = useTheme();
  const [cliente, setCliente] = useState<ClienteAzoupRow | null>(null);
  const [texto, setTexto] = useState('');
  const [dataRetorno, setDataRetorno] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const clientesQ = useQuery({
    queryKey: ['clientes_para_selecao'],
    queryFn: listarClientesParaSelecao,
    enabled: visible,
  });

  useEffect(() => {
    if (!visible) return;
    setCliente(null);
    setTexto('');
    setDataRetorno('');
    setErro(null);
  }, [visible]);

  const salvar = useMutation({
    mutationFn: () =>
      criarPendenciaAvulsa({
        clienteId: cliente?.id ?? '',
        empresaNome: cliente ? rotuloCliente(cliente) : null,
        pendencia: texto,
        dataRetorno,
        adminEmail,
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
        <ScrollView
          style={{ width: '100%', maxWidth: 520, maxHeight: '90%' }}
          contentContainerStyle={{ flexGrow: 0 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 18 }}>Nova pendência</Text>
            <FormField label="Cliente" required>
              <ClienteSearchPicker
                todosClientes={clientesQ.data ?? []}
                value={cliente}
                onChange={setCliente}
                loading={clientesQ.isLoading}
                placeholderBusca="Buscar cliente por nome, e-mail ou telefone…"
              />
            </FormField>
            <FormField label="Pendência" required>
              <FormInput
                value={texto}
                onChangeText={setTexto}
                placeholder="O que precisa ser feito"
                multiline
                style={{ minHeight: 88, height: 88, textAlignVertical: 'top', paddingTop: 10 }}
              />
            </FormField>
            <FormField label="Data do retorno" required>
              <FormDateInput value={dataRetorno} onChange={setDataRetorno} />
            </FormField>
            {erro ? <Text style={{ color: theme.error }}>{erro}</Text> : null}
            <PrimaryButton label="Salvar pendência" loading={salvar.isPending} onPress={() => salvar.mutate()} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function PendenciasScreen() {
  const { theme } = useTheme();
  const { canAccessScreen, session, adminProfile } = useAdminAuth();
  const qc = useQueryClient();
  const [novaAberta, setNovaAberta] = useState(false);
  const [dropOver, setDropOver] = useState<PendenciaColuna | null>(null);
  const [rotuloArraste, setRotuloArraste] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const fantasmaRef = useRef<View>(null);
  const posicaoArraste = useRef({ x: 0, y: 0 });
  const colunaSobre = useRef<string | null>(null);
  const arrasteId = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!rotuloArraste) return;
    posicionarFantasma(fantasmaRef.current, posicaoArraste.current.x, posicaoArraste.current.y, true);
  });
  const pode = canAccessScreen('acompanhamento') || canAccessScreen('pendencias');

  const q = useQuery({
    queryKey: ['admin_cliente_reunioes'],
    queryFn: listarReunioes,
    enabled: pode,
  });

  const porColuna = useMemo(() => {
    const out: Record<PendenciaColuna, ReuniaoClienteRow[]> = {
      atrasada: [],
      em_andamento: [],
      concluida: [],
    };
    for (const row of q.data ?? []) {
      out[colunaPendencia(row)].push(row);
    }
    return out;
  }, [q.data]);

  const statusMutation = useMutation({
    mutationFn: ({ id, concluida }: { id: string; concluida: boolean }) => definirReuniaoConcluida(id, concluida),
    onSuccess: () => {
      setErro(null);
      void qc.invalidateQueries({ queryKey: ['admin_cliente_reunioes'] });
      void qc.invalidateQueries({ queryKey: ['pendencias_abertas'] });
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao atualizar pendência'),
  });

  function colunaValida(valor: string | null): PendenciaColuna | null {
    if (valor === 'atrasada' || valor === 'em_andamento' || valor === 'concluida') return valor;
    return null;
  }

  function aoArrastar(item: ReuniaoClienteRow, x: number, y: number) {
    posicaoArraste.current = { x, y };
    posicionarFantasma(fantasmaRef.current, x, y, true);
    if (arrasteId.current !== item.id) {
      arrasteId.current = item.id;
      setRotuloArraste(item.empresa_nome?.trim() || 'Pendência');
    }
    const col = colunaValida(colunaSobPonto(x, y));
    if (colunaSobre.current !== col) {
      colunaSobre.current = col;
      setDropOver(col);
    }
  }

  function aoSoltarPonto(item: ReuniaoClienteRow, x: number, y: number) {
    const col = x < 0 ? null : colunaValida(colunaSobPonto(x, y));
    posicionarFantasma(fantasmaRef.current, 0, 0, false);
    arrasteId.current = null;
    colunaSobre.current = null;
    setRotuloArraste(null);
    setDropOver(null);
    if (col) aoSoltar(col, item.id);
  }

  function aoSoltar(coluna: PendenciaColuna, id: string) {
    const atual = q.data?.find((r) => r.id === id);
    if (!atual) return;
    const onde = colunaPendencia(atual);
    if (onde === coluna) return;
    if (coluna === 'concluida') {
      statusMutation.mutate({ id, concluida: true });
      return;
    }
    if (atual.concluida) statusMutation.mutate({ id, concluida: false });
  }

  if (!pode) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: theme.background }}>
        <Text style={{ color: theme.warning, fontWeight: '800' }}>Seu perfil não tem acesso a Pendências.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView horizontal ref={marcarScrollKanban('pendencias')} contentContainerStyle={{ padding: 16, gap: 12, minHeight: '100%' }}>
        <View style={{ gap: 12, minWidth: COLUNAS.length * (COL_WIDTH + 12) }}>
          <PageHeader
            title="Pendências"
            subtitle="Cadastre uma pendência aqui ou ela entra ao registrar uma reunião. Atrasada e Em andamento seguem a data de retorno."
            trailing={
              <Pressable
                onPress={() => setNovaAberta(true)}
                style={({ pressed }) => [
                  styles.novaBtn,
                  { backgroundColor: theme.cadastroAction, opacity: pressed ? 0.88 : 1 },
                ]}
              >
                <Text style={{ color: theme.cadastroActionText, fontWeight: '800', fontSize: 13 }}>Nova pendência</Text>
              </Pressable>
            }
          />
          {q.isLoading ? <Text style={{ color: theme.textMuted }}>Carregando pendências…</Text> : null}
          {q.error ? (
            <Text style={{ color: theme.error }}>
              {(q.error as Error).message.includes('admin_cliente_reunioes')
                ? 'Execute supabase/sql/admin_cliente_reunioes.sql no Supabase.'
                : (q.error as Error).message}
            </Text>
          ) : null}
          {erro ? <Text style={{ color: theme.error }}>{erro}</Text> : null}

          <View style={styles.board}>
            {COLUNAS.map((col) => {
              const itens = porColuna[col.key];
              return (
                <View
                  key={col.key}
                  ref={marcarColuna(col.key)}
                  style={[
                    styles.coluna,
                    {
                      backgroundColor: theme.surfaceMuted,
                      borderColor: dropOver === col.key ? col.cor : theme.border,
                      borderWidth: dropOver === col.key ? 2 : 1,
                    },
                  ]}
                >
                  <View style={styles.colunaTopo}>
                    <View style={[styles.dot, { backgroundColor: col.cor }]} />
                    <Text style={{ color: theme.headerText, fontWeight: '800', flex: 1 }}>{col.label}</Text>
                    <View style={[styles.badge, { backgroundColor: col.cor }]}>
                      <Text style={{ color: '#1A1408', fontWeight: '800', fontSize: 12 }}>{itens.length}</Text>
                    </View>
                  </View>
                  <ScrollView contentContainerStyle={{ padding: 10, gap: 10, flexGrow: 1 }} nestedScrollEnabled>
                    {itens.length === 0 ? (
                      <Text style={{ color: theme.textMuted, fontSize: 12, textAlign: 'center', marginTop: 12 }}>
                        Nenhuma pendência
                      </Text>
                    ) : (
                      itens.map((item) => (
                        <PendenciaCard
                          key={item.id}
                          item={item}
                          cor={col.cor}
                          onConcluir={() => statusMutation.mutate({ id: item.id, concluida: true })}
                          onReabrir={() => statusMutation.mutate({ id: item.id, concluida: false })}
                          onArrastar={(x, y) => aoArrastar(item, x, y)}
                          onSoltar={(x, y) => aoSoltarPonto(item, x, y)}
                        />
                      ))
                    )}
                  </ScrollView>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
      <NovaPendenciaModal
        visible={novaAberta}
        adminEmail={adminProfile?.email ?? session?.user?.email ?? null}
        onClose={() => setNovaAberta(false)}
        onSaved={() => {
          void qc.invalidateQueries({ queryKey: ['admin_cliente_reunioes'] });
          void qc.invalidateQueries({ queryKey: ['pendencias_abertas'] });
        }}
      />
      <View
        ref={fantasmaRef}
        pointerEvents="none"
        style={[styles.fantasma, { backgroundColor: theme.surface, borderColor: theme.cadastroAction, opacity: 0 }]}
      >
        <Text style={{ color: theme.headerText, fontWeight: '800' }} numberOfLines={1}>
          {rotuloArraste ?? 'Mover pendência'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  board: { flexDirection: 'row', gap: 12, alignItems: 'stretch', minHeight: 520 },
  coluna: { width: COL_WIDTH, borderRadius: 16, borderWidth: 1, minHeight: 480, maxHeight: 820, overflow: 'hidden' },
  colunaTopo: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 14, paddingBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badge: { minWidth: 28, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  cardRodape: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  novaBtn: { minHeight: 36, borderRadius: 8, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: { width: '100%', borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  fantasma: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 240,
  },
});
