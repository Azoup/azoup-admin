import { useQuery } from '@tanstack/react-query';
import { RefreshControl, View } from 'react-native';

import { AzoupLogo } from '@/components/AzoupLogo';
import { HomeStatCard } from '@/components/ui/HomeStatCard';
import { HomeStatCardsGrid } from '@/components/ui/HomeStatCardsGrid';
import { PageHeader } from '@/components/ui/PageHeader';
import { Screen } from '@/components/ui/Screen';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Text } from '@/components/Themed';
import { useTheme } from '@/src/contexts/ThemeContext';
import { carregarMetricasDashboard } from '@/src/services/repos/metrics-repo';
import { formatBRLFromCentavos } from '@/src/utils/format';

export default function DashboardScreen() {
  const { theme } = useTheme();
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard_metricas'],
    queryFn: carregarMetricasDashboard,
  });

  return (
    <Screen
      scroll
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={theme.cadastroAction} />}>
      <PageHeader
        title="Painel Administrativo"
        subtitle="Métricas consolidadas de clientes, assinaturas e consumo de IA."
        trailing={<AzoupLogo size={44} />}
      />

      {isLoading ? <Text style={{ color: theme.textMuted }}>Carregando métricas…</Text> : null}
      {error ? <Text style={{ color: theme.error, fontWeight: '700' }}>{(error as Error).message}</Text> : null}

      {data ? (
        <>
          <HomeStatCardsGrid>
            <HomeStatCard title="Clientes totais" value={String(data.total_clientes)} icon="users" />
            <HomeStatCard title="Assinaturas ativas" value={String(data.clientes_assinatura_ativa)} icon="check-circle" />
            <HomeStatCard title="Em trial" value={String(data.clientes_trial)} icon="clock-o" />
            <HomeStatCard title="Inadimplentes" value={String(data.clientes_inadimplentes)} icon="exclamation-triangle" />
            <HomeStatCard title="Cancelados" value={String(data.clientes_cancelados)} icon="ban" />
            <HomeStatCard title="MRR" value={formatBRLFromCentavos(data.mrr_centavos)} icon="money" />
            <HomeStatCard
              title="Tokens médios (amostra)"
              value={data.tokens_medio_mes != null ? String(data.tokens_medio_mes) : '—'}
              icon="magic"
            />
          </HomeStatCardsGrid>

          {data.desconto_centavos > 0 || data.mrr_fonte === 'stripe' ? (
            <ScreenCard style={{ gap: 4 }}>
              <Text style={{ color: theme.headerText, fontWeight: '800' }}>MRR com cupons (Stripe)</Text>
              <View style={{ gap: 2 }}>
                <Text style={{ color: theme.textMuted }}>
                  Bruto: {formatBRLFromCentavos(data.mrr_bruto_centavos)}
                  {data.desconto_centavos > 0
                    ? ` · Descontos: ${formatBRLFromCentavos(data.desconto_centavos)}`
                    : ''}
                </Text>
                {data.assinaturas_com_desconto > 0 ? (
                  <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                    {data.assinaturas_com_desconto} assinatura
                    {data.assinaturas_com_desconto === 1 ? '' : 's'} com cupom ativo
                  </Text>
                ) : (
                  <Text style={{ color: theme.textMuted, fontSize: 13 }}>Nenhum cupom ativo no próximo ciclo</Text>
                )}
              </View>
            </ScreenCard>
          ) : null}

          <SectionTitle>Clientes por plano</SectionTitle>
          <ScreenCard style={{ gap: 10 }}>
            {(data.planos_clientes ?? []).length ? (
              (data.planos_clientes ?? []).map((p, idx, arr) => (
                <View
                  key={p.plano_id}
                  style={{
                    gap: 4,
                    paddingBottom: idx < arr.length - 1 ? 10 : 0,
                    borderBottomWidth: idx < arr.length - 1 ? 1 : 0,
                    borderBottomColor: theme.border,
                  }}
                >
                  <Text style={{ color: theme.headerText, fontWeight: '800' }}>
                    {p.nome}{' '}
                    <Text style={{ color: theme.textMuted, fontWeight: '600' }}>({p.total})</Text>
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                    Ativos: <Text style={{ color: theme.success, fontWeight: '800' }}>{p.ativos}</Text>
                    {'  ·  '}
                    Inativos: <Text style={{ color: theme.warning, fontWeight: '800' }}>{p.inativos}</Text>
                  </Text>
                </View>
              ))
            ) : (
              <Text style={{ color: theme.textMuted }}>Nenhum cliente vinculado a planos ainda.</Text>
            )}
          </ScreenCard>
        </>
      ) : null}
    </Screen>
  );
}
