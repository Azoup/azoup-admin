import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Text } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import { carregarAcompanhamentoClientes } from '@/src/services/repos/acompanhamento-repo';
import {
  contarObservacoesAcompanhamento,
  criarObservacaoAcompanhamento,
  listarObservacoesAcompanhamento,
} from '@/src/services/repos/observacoes-acompanhamento-repo';
import type { AdminAcompanhamentoObservacaoRow } from '@/src/types/azoup';
import {
  ACOMPANHAMENTO_ETIQUETAS,
  type AcompanhamentoCliente,
  type AcompanhamentoEtiqueta,
} from '@/src/utils/acompanhamento';
import { formatBRLFromReais, formatDateBR, formatDateTimeBR, formatYmdBR } from '@/src/utils/format';
import { digitsOnlyPhone, resolveClienteWhatsAppUrl } from '@/src/utils/whatsapp';

const WHATSAPP_GREEN = '#25D366';
const PAGE_SIZE = 10;

function corEtiqueta(key: AcompanhamentoEtiqueta, theme: ReturnType<typeof useTheme>['theme']) {
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
    <Text style={{ color: theme.textMuted, fontSize: 13 }}>
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

function ClienteAcompanhamentoCard({
  item,
  expandido,
  onToggle,
  qtdObservacoes,
  onAbrirObservacoes,
}: {
  item: AcompanhamentoCliente;
  expandido: boolean;
  onToggle: () => void;
  qtdObservacoes: number;
  onAbrirObservacoes: () => void;
}) {
  const { theme } = useTheme();
  const contato = item.celular ?? item.telefone ?? '—';
  const whatsappUrl = resolveClienteWhatsAppUrl(item.celular, item.telefone);

  return (
    <ScreenCard style={{ gap: 8 }}>
      <Pressable onPress={onToggle} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, gap: 4 })}>
        <View style={styles.rowBetween}>
          <Text style={{ fontWeight: '800', fontSize: 16, color: theme.headerText, flex: 1 }}>{item.nome}</Text>
          <FontAwesome name={expandido ? 'chevron-up' : 'chevron-down'} size={14} color={theme.textMuted} />
        </View>
        <Text style={{ color: theme.textMuted, fontSize: 13 }}>Contato: {contato}</Text>
        <Text style={{ color: theme.textMuted, fontSize: 13 }}>
          Empresa: {item.empresa_nome ?? '—'}
          {item.empresa_cnpj ? ` · ${item.empresa_cnpj}` : ''}
        </Text>
      </Pressable>

      <View style={styles.cardActions}>
        <Pressable
          onPress={onAbrirObservacoes}
          style={({ pressed }) => [
            styles.obsBtn,
            {
              backgroundColor: theme.surfaceMuted,
              borderColor: theme.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <FontAwesome name="comment" size={14} color={theme.cadastroAction} />
          <Text style={{ color: theme.headerText, fontWeight: '700', fontSize: 13 }}>
            Observações{qtdObservacoes > 0 ? ` (${qtdObservacoes})` : ''}
          </Text>
        </Pressable>
      </View>

      {expandido ? (
        <View style={[styles.detalhe, { borderTopColor: theme.border }]}>
          <MetaLinha label="Produtos" value={String(item.produtos)} />
          <MetaLinha label="Vendas" value={String(item.vendas)} />
          <MetaLinha label="OPs" value={String(item.ordens_producao)} />
          <MetaLinha label="Clientes cadastrados" value={String(item.clientes_cadastrados)} />
          <MetaLinha label="Fornecedores cadastrados" value={String(item.fornecedores_cadastrados)} />
          <MetaLinha label="Contato" value={contato} />
          <MetaLinha label="Empresa" value={item.empresa_nome ?? '—'} />
          <MetaLinha label="CNPJ" value={item.empresa_cnpj ?? '—'} />
          <MetaLinha
            label="Tempo no sistema"
            value={item.dias_usando === 1 ? '1 dia' : `${item.dias_usando} dias`}
          />
          <MetaLinha label="Plano" value={item.plano_nome ?? '—'} />
          <MetaLinha
            label="Valor atual"
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
              label="Trial restante"
              value={
                item.dias_trial_restantes < 0
                  ? 'Expirado'
                  : item.dias_trial_restantes === 1
                    ? '1 dia'
                    : `${item.dias_trial_restantes} dias`
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
              <FontAwesome name="whatsapp" size={18} color={WHATSAPP_GREEN} />
              <Text style={{ color: WHATSAPP_GREEN, fontWeight: '800' }}>Chamar no WhatsApp</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </ScreenCard>
  );
}

export default function AcompanhamentoScreen() {
  const { theme } = useTheme();
  const { canAccessScreen } = useAdminAuth();
  const qc = useQueryClient();
  const [etiquetaAtiva, setEtiquetaAtiva] = useState<AcompanhamentoEtiqueta>('urgentes');
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [clienteObs, setClienteObs] = useState<AcompanhamentoCliente | null>(null);

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

  const listaFiltrada = useMemo(() => {
    const base = q.data?.porEtiqueta[etiquetaAtiva] ?? [];
    return base.filter((c) => matchBuscaAcompanhamento(c, busca));
  }, [q.data, etiquetaAtiva, busca]);

  const totalPaginas = Math.max(1, Math.ceil(listaFiltrada.length / PAGE_SIZE));
  const paginaAtual = Math.min(pagina, totalPaginas);

  const listaPaginada = useMemo(() => {
    const start = (paginaAtual - 1) * PAGE_SIZE;
    return listaFiltrada.slice(start, start + PAGE_SIZE);
  }, [listaFiltrada, paginaAtual]);

  useEffect(() => {
    setPagina(1);
  }, [etiquetaAtiva, busca]);

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
    <>
      <FlatList
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}
        data={listaPaginada}
        keyExtractor={(item) => item.id}
        refreshing={q.isRefetching}
        onRefresh={() => void q.refetch()}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 4 }}>
            <PageHeader
              title="Acompanhamento"
              subtitle="Clientes separados por urgência de uso do sistema (produtos, vendas e OPs)."
            />

            <View style={styles.chipsWrap}>
              {ACOMPANHAMENTO_ETIQUETAS.map((e) => {
                const qtd = q.data?.porEtiqueta[e.key]?.length ?? 0;
                const ativa = etiquetaAtiva === e.key;
                const cor = corEtiqueta(e.key, theme);
                return (
                  <Pressable
                    key={e.key}
                    onPress={() => {
                      setEtiquetaAtiva(e.key);
                      setExpandidoId(null);
                    }}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: ativa ? cor : theme.surfaceMuted,
                        borderColor: cor,
                      },
                    ]}
                  >
                    <Text style={{ color: ativa ? '#fff' : theme.headerText, fontWeight: '800', fontSize: 13 }}>
                      {e.label} ({qtd})
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={{ color: theme.textMuted, fontSize: 13 }}>
              {ACOMPANHAMENTO_ETIQUETAS.find((e) => e.key === etiquetaAtiva)?.descricao}
            </Text>

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

            <SectionTitle>{`Lista · ${listaFiltrada.length}`}</SectionTitle>

            {q.isLoading ? <Text style={{ color: theme.textMuted }}>Carregando acompanhamento…</Text> : null}
            {q.error ? (
              <Text style={{ color: theme.error }}>
                {q.error instanceof Error ? q.error.message : 'Erro ao carregar acompanhamento'}
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <ClienteAcompanhamentoCard
            item={item}
            expandido={expandidoId === item.id}
            onToggle={() => setExpandidoId((cur) => (cur === item.id ? null : item.id))}
            qtdObservacoes={obsCountQuery.data?.get(item.id) ?? 0}
            onAbrirObservacoes={() => setClienteObs(item)}
          />
        )}
        ListEmptyComponent={
          !q.isLoading && !q.error ? (
            <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 8 }}>
              {busca.trim()
                ? 'Nenhum cliente encontrado com essa busca nesta etiqueta.'
                : 'Nenhum cliente nesta etiqueta.'}
            </Text>
          ) : null
        }
        ListFooterComponent={
          listaFiltrada.length > 0 ? (
            <View style={styles.pager}>
              <Pressable
                disabled={paginaAtual <= 1}
                onPress={() => setPagina((p) => Math.max(1, p - 1))}
                style={({ pressed }) => [
                  styles.pageBtn,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.surfaceMuted,
                    opacity: paginaAtual <= 1 ? 0.4 : pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={{ color: theme.headerText, fontWeight: '700' }}>Anterior</Text>
              </Pressable>

              <Text style={{ color: theme.textMuted, fontWeight: '700' }}>
                Página {paginaAtual} de {totalPaginas}
              </Text>

              <Pressable
                disabled={paginaAtual >= totalPaginas}
                onPress={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                style={({ pressed }) => [
                  styles.pageBtn,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.surfaceMuted,
                    opacity: paginaAtual >= totalPaginas ? 0.4 : pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={{ color: theme.headerText, fontWeight: '700' }}>Próxima</Text>
              </Pressable>
            </View>
          ) : null
        }
      />

      <ObservacoesModal
        cliente={clienteObs}
        visible={Boolean(clienteObs)}
        onClose={() => setClienteObs(null)}
        onSaved={() => {
          void qc.invalidateQueries({ queryKey: ['acompanhamento_observacoes_counts'] });
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchRow: { position: 'relative', justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: 8, zIndex: 1 },
  searchInput: { height: 36, fontSize: 13, paddingLeft: 28, paddingRight: 28 },
  clearIcon: { position: 'absolute', right: 8, zIndex: 1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  obsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  detalhe: {
    gap: 4,
    paddingTop: 10,
    marginTop: 4,
    borderTopWidth: 1,
  },
  whatsappBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
    marginBottom: 12,
  },
  pageBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
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
  obsItem: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
});
