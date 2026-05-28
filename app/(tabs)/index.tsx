import { useQuery } from '@tanstack/react-query';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { carregarMetricasDashboard } from '@/src/services/repos/metrics-repo';
import { ui } from '@/src/theme/ui';
import { formatBRLFromCentavos } from '@/src/utils/format';

export default function DashboardScreen() {
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard_metricas'],
    queryFn: carregarMetricasDashboard,
  });

  return (
    <ScrollView
      contentContainerStyle={styles.wrap}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}>
      <Text style={styles.title}>Painel Administrativo</Text>
      <Text style={styles.sub}>Métricas consolidadas de clientes, assinaturas e consumo de IA.</Text>

      {isLoading ? <Text>Carregando métricas…</Text> : null}
      {error ? <Text style={styles.err}>{(error as Error).message}</Text> : null}

      {data ? (
        <>
          <View style={styles.grid}>
            <Kpi label="Clientes totais" value={String(data.total_clientes)} />
            <Kpi label="Assinaturas ativas" value={String(data.clientes_assinatura_ativa)} />
            <Kpi label="Em trial" value={String(data.clientes_trial)} />
            <Kpi label="Clientes inadimplentes" value={String(data.clientes_inadimplentes)} />
            <Kpi label="Cancelados" value={String(data.clientes_cancelados)} />
            <Kpi label="MRR estimado" value={formatBRLFromCentavos(data.mrr_centavos)} />
            <Kpi label="Tokens médios (amostra)" value={data.tokens_medio_mes != null ? String(data.tokens_medio_mes) : '—'} />
          </View>

          <Text style={styles.section}>Planos mais contratados</Text>
          {(data.planos_ranking ?? []).map((p) => (
            <Text key={p.plano_id} style={styles.meta}>
              {p.nome}: {p.quantidade}
            </Text>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12, paddingBottom: 40, backgroundColor: ui.bg },
  title: { fontSize: 26, fontWeight: '900', color: ui.navy },
  sub: { color: ui.muted, lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpi: {
    width: '47%',
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 16,
    padding: 14,
    gap: 6,
    backgroundColor: ui.card,
  },
  kpiLabel: { color: ui.muted, fontSize: 12, fontWeight: '700' },
  kpiValue: { fontSize: 20, fontWeight: '900', color: ui.navy },
  section: { marginTop: 10, fontSize: 17, fontWeight: '800', color: ui.navySoft },
  meta: { color: ui.text },
  err: { color: ui.danger, fontWeight: '700' },
});
