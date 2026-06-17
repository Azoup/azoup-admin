import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Text } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import { listarMarketingUtm } from '@/src/services/repos/marketing-repo';
import type { ClienteMarketingUtmRow } from '@/src/types/azoup';
import { exportarMarketingUtmExcel } from '@/src/utils/export-marketing-xlsx';
import { formatDateTimeBR } from '@/src/utils/format';

function rotuloUtm(valor?: string | null): string {
  const t = `${valor ?? ''}`.trim();
  return t || '—';
}

function MarketingUtmCard({ row }: { row: ClienteMarketingUtmRow }) {
  const { theme } = useTheme();
  const cliente = row.clientes_azoup;

  return (
    <ScreenCard style={{ marginBottom: 12, gap: 6 }}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: theme.headerText }}>
        {cliente?.nome ?? 'Cliente sem nome'}
      </Text>
      {cliente?.email ? <Text style={{ color: theme.textMuted }}>{cliente.email}</Text> : null}

      <View style={styles.utmGrid}>
        <UtmField label="Source" value={row.utm_source} />
        <UtmField label="Medium" value={row.utm_medium} />
        <UtmField label="Campaign" value={row.utm_campaign} />
        <UtmField label="Content" value={row.utm_content} />
        <UtmField label="Term" value={row.utm_term} />
      </View>

      <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
        Capturado: {formatDateTimeBR(row.capturado_em) ?? '—'}
        {row.atualizado_em && row.atualizado_em !== row.capturado_em
          ? ` · Atualizado: ${formatDateTimeBR(row.atualizado_em)}`
          : ''}
      </Text>
    </ScreenCard>
  );
}

function UtmField({ label, value }: { label: string; value?: string | null }) {
  const { theme } = useTheme();
  return (
    <View style={styles.utmField}>
      <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '700' }}>{label}</Text>
      <Text style={{ color: theme.text, fontSize: 13 }}>{rotuloUtm(value)}</Text>
    </View>
  );
}

export default function MarketingScreen() {
  const { theme } = useTheme();
  const { canAccessScreen } = useAdminAuth();
  const [exportErro, setExportErro] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const q = useQuery({
    queryKey: ['clientes_marketing_utm'],
    queryFn: listarMarketingUtm,
    enabled: canAccessScreen('marketing'),
  });

  const rows = q.data ?? [];

  if (!canAccessScreen('marketing')) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: theme.background }}>
        <Text style={{ color: theme.warning, fontWeight: '800' }}>Seu perfil não tem acesso à área de Marketing.</Text>
      </View>
    );
  }

  const handleExportar = () => {
    setExportErro(null);
    setExportando(true);
    try {
      exportarMarketingUtmExcel(rows);
    } catch (e) {
      setExportErro(e instanceof Error ? e.message : 'Falha ao exportar Excel');
    } finally {
      setExportando(false);
    }
  };

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      data={rows}
      keyExtractor={(item) => item.id}
      refreshing={q.isRefetching}
      onRefresh={() => q.refetch()}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 8 }}>
          <PageHeader
            title="Marketing UTM"
            subtitle="Parâmetros UTM capturados no cadastro de cada cliente."
          />

          <View style={styles.exportRow}>
            <PrimaryButton
              label={exportando ? 'Exportando…' : 'Exportar Excel'}
              loading={exportando}
              disabled={!rows.length || q.isLoading}
              onPress={handleExportar}
              style={{ flex: 1 }}
            />
          </View>

          {exportErro ? <Text style={{ color: theme.error, fontWeight: '700' }}>{exportErro}</Text> : null}

          <SectionTitle>Registros ({rows.length})</SectionTitle>
        </View>
      }
      ListEmptyComponent={
        q.isLoading ? (
          <Text style={{ color: theme.textMuted }}>Carregando registros…</Text>
        ) : q.error ? (
          <Text style={{ color: theme.error }}>{(q.error as Error).message}</Text>
        ) : (
          <Text style={{ color: theme.textMuted }}>Nenhum parâmetro UTM capturado ainda.</Text>
        )
      }
      renderItem={({ item }) => <MarketingUtmCard row={item} />}
    />
  );
}

const styles = StyleSheet.create({
  exportRow: { flexDirection: 'row', gap: 10 },
  utmGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  utmField: { minWidth: '45%', flexGrow: 1, gap: 2 },
});
