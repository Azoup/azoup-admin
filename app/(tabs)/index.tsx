import { useQuery } from '@tanstack/react-query';
import { RefreshControl } from 'react-native';

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
            <HomeStatCard title="MRR estimado" value={formatBRLFromCentavos(data.mrr_centavos)} icon="money" />
            <HomeStatCard
              title="Tokens médios (amostra)"
              value={data.tokens_medio_mes != null ? String(data.tokens_medio_mes) : '—'}
              icon="magic"
            />
          </HomeStatCardsGrid>

          <SectionTitle>Planos mais contratados</SectionTitle>
          <ScreenCard>
            {(data.planos_ranking ?? []).length ? (
              (data.planos_ranking ?? []).map((p) => (
                <Text key={p.plano_id} style={{ color: theme.text, marginBottom: 6 }}>
                  {p.nome}: <Text style={{ fontWeight: '800' }}>{p.quantidade}</Text>
                </Text>
              ))
            ) : (
              <Text style={{ color: theme.textMuted }}>Sem dados de ranking ainda.</Text>
            )}
          </ScreenCard>
        </>
      ) : null}
    </Screen>
  );
}
