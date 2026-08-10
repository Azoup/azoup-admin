import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, View } from 'react-native';

import { PageHeader } from '@/components/ui/PageHeader';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Text } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import { carregarAcompanhamentoClientes } from '@/src/services/repos/acompanhamento-repo';
import {
  ACOMPANHAMENTO_ETIQUETAS,
  type AcompanhamentoCliente,
  type AcompanhamentoEtiqueta,
} from '@/src/utils/acompanhamento';
import { formatBRLFromReais, formatDateBR, formatYmdBR } from '@/src/utils/format';
import { resolveClienteWhatsAppUrl } from '@/src/utils/whatsapp';

const WHATSAPP_GREEN = '#25D366';

function corEtiqueta(key: AcompanhamentoEtiqueta, theme: ReturnType<typeof useTheme>['theme']) {
  if (key === 'urgentes') return theme.error;
  if (key === 'precisa_ajuda') return theme.warning;
  if (key === 'pode_esperar') return theme.cadastroAction;
  return theme.success;
}

function MetaLinha({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <Text style={{ color: theme.textMuted, fontSize: 13 }}>
      {label}: <Text style={{ color: theme.text, fontWeight: '700' }}>{value}</Text>
    </Text>
  );
}

function ClienteAcompanhamentoCard({
  item,
  expandido,
  onToggle,
}: {
  item: AcompanhamentoCliente;
  expandido: boolean;
  onToggle: () => void;
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
            value={
              item.valor_mensal_atual != null ? formatBRLFromReais(item.valor_mensal_atual) : '—'
            }
          />
          <MetaLinha label="Renovação" value={formatYmdBR(item.data_renovacao) !== '—' ? formatYmdBR(item.data_renovacao) : formatDateBR(item.data_renovacao)} />
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
                { backgroundColor: `${WHATSAPP_GREEN}18`, borderColor: WHATSAPP_GREEN, opacity: pressed ? 0.85 : 1 },
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
  const [etiquetaAtiva, setEtiquetaAtiva] = useState<AcompanhamentoEtiqueta>('urgentes');
  const [expandidoId, setExpandidoId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['acompanhamento_clientes'],
    queryFn: carregarAcompanhamentoClientes,
    enabled: canAccessScreen('acompanhamento'),
  });

  const lista = useMemo(
    () => q.data?.porEtiqueta[etiquetaAtiva] ?? [],
    [q.data, etiquetaAtiva],
  );

  if (!canAccessScreen('acompanhamento')) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: theme.background }}>
        <Text style={{ color: theme.warning, fontWeight: '800' }}>Seu perfil não tem acesso a Acompanhamento.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}
      data={lista}
      keyExtractor={(item) => item.id}
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
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

          <SectionTitle>{`Lista · ${lista.length}`}</SectionTitle>

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
        />
      )}
      ListEmptyComponent={
        !q.isLoading && !q.error ? (
          <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 8 }}>
            Nenhum cliente nesta etiqueta.
          </Text>
        ) : null
      }
    />
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
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
});
