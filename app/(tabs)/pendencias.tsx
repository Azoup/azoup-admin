import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PageHeader } from '@/components/ui/PageHeader';
import { Text } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import {
  colunaPendencia,
  definirReuniaoConcluida,
  listarReunioes,
  type PendenciaColuna,
  type ReuniaoClienteRow,
} from '@/src/services/repos/reunioes-repo';
import { formatYmdBR } from '@/src/utils/format';

const COL_WIDTH = 320;
const DRAG_MIME = 'application/x-pendencia-reuniao';

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
}: {
  item: ReuniaoClienteRow;
  cor: string;
  onConcluir: () => void;
  onReabrir: () => void;
}) {
  const { theme } = useTheme();
  const coluna = colunaPendencia(item);
  const empresa = item.empresa_nome?.trim() || 'Cliente';

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
          borderColor: cor,
          cursor: Platform.OS === 'web' ? 'grab' : undefined,
        } as object,
      ]}
    >
      <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 15 }} numberOfLines={2}>
        {empresa}
      </Text>
      <Text style={{ color: theme.text, fontSize: 13, lineHeight: 18 }}>{item.pendencia}</Text>
      <View style={styles.cardRodape}>
        <Text style={{ color: theme.textMuted, fontWeight: '700', fontSize: 12 }}>{formatYmdBR(item.data_retorno)}</Text>
        {coluna === 'concluida' ? (
          <Pressable onPress={onReabrir} hitSlop={6}>
            <Text style={{ color: theme.cadastroAction, fontWeight: '800', fontSize: 12 }}>Reabrir</Text>
          </Pressable>
        ) : (
          <Pressable onPress={onConcluir} hitSlop={6}>
            <Text style={{ color: theme.cadastroAction, fontWeight: '800', fontSize: 12 }}>Concluir</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function PendenciasScreen() {
  const { theme } = useTheme();
  const { canAccessScreen } = useAdminAuth();
  const qc = useQueryClient();
  const [dropOver, setDropOver] = useState<PendenciaColuna | null>(null);
  const [erro, setErro] = useState<string | null>(null);
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
      <ScrollView horizontal contentContainerStyle={{ padding: 16, gap: 12, minHeight: '100%' }}>
        <View style={{ gap: 12, minWidth: COLUNAS.length * (COL_WIDTH + 12) }}>
          <PageHeader
            title="Pendências"
            subtitle="Em andamento enquanto a data de retorno não vence. Depois disso, Atrasada. Concluída é manual."
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
              const webDrop =
                Platform.OS === 'web'
                  ? ({
                      onDragOver: (e: { preventDefault?: () => void; dataTransfer?: { dropEffect: string } }) => {
                        e.preventDefault?.();
                        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                      },
                      onDragEnter: (e: { preventDefault?: () => void }) => {
                        e.preventDefault?.();
                        setDropOver(col.key);
                      },
                      onDragLeave: () => setDropOver((cur) => (cur === col.key ? null : cur)),
                      onDrop: (e: { preventDefault?: () => void; dataTransfer?: { getData: (t: string) => string } }) => {
                        e.preventDefault?.();
                        const id = e.dataTransfer?.getData(DRAG_MIME) || e.dataTransfer?.getData('text/plain') || '';
                        if (id) aoSoltar(col.key, id);
                        setDropOver(null);
                      },
                    } as Record<string, unknown>)
                  : {};

              return (
                <View
                  key={col.key}
                  {...webDrop}
                  style={[
                    styles.coluna,
                    {
                      backgroundColor: theme.surfaceMuted,
                      borderColor: dropOver === col.key ? col.cor : theme.border,
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
                  <ScrollView contentContainerStyle={{ padding: 10, gap: 10 }} nestedScrollEnabled>
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
});
