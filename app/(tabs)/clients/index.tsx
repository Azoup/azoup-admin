import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { FlatList, Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { listarClientesAzoup } from '@/src/services/repos/clientes-repo';
import { ui } from '@/src/theme/ui';
import { formatBRLFromCentavos, formatBRLFromReais } from '@/src/utils/format';

export default function ClientsListScreen() {
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['clientes_azoup_admin'],
    queryFn: listarClientesAzoup,
  });

  return (
    <View style={styles.wrap}>
      <FlatList
        refreshing={isRefetching}
        onRefresh={() => refetch()}
        data={data ?? []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Clientes</Text>
            <Text style={styles.sub}>Lista com dados de assinatura, plano e histórico financeiro.</Text>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <Text>Carregando…</Text>
          ) : error ? (
            <Text style={styles.err}>{(error as Error).message}</Text>
          ) : (
            <Text>Nenhum cliente encontrado.</Text>
          )
        }
        renderItem={({ item }) => {
          const nome =
            item.nome_fantasia ??
            item.nome ??
            item.razao_social ??
            item.email ??
            `Cliente ${item.id.slice(0, 8)}`;
          return (
            <Link href={`/clients/${item.id}`} asChild>
              <Pressable style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{nome}</Text>
                  <Text style={styles.meta}>{item.email ?? '—'} · {item.telefone ?? item.celular ?? '—'}</Text>
                  <Text style={styles.meta}>
                    Plano: {item.plano?.nome ?? '—'} · Valor atual:{' '}
                    {item.assinatura?.valor_atual_centavos != null
                      ? formatBRLFromCentavos(item.assinatura.valor_atual_centavos)
                      : item.assinatura?.valor_mensal_atual != null
                        ? formatBRLFromReais(item.assinatura.valor_mensal_atual)
                        : formatBRLFromCentavos(item.plano?.valor_mensal_centavos)}
                  </Text>
                  <Text style={styles.meta}>
                    Assinatura: {item.assinatura?.status ?? '—'} · Falhas de cobrança: {item.cobrancas_falhas ?? 0}
                  </Text>
                  {item.meses_em_aberto?.length ? (
                    <Text style={styles.warn}>Meses com pendência: {item.meses_em_aberto.join(', ')}</Text>
                  ) : null}
                </View>
                <Text style={styles.chev}>›</Text>
              </Pressable>
            </Link>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: ui.bg },
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, gap: 6, backgroundColor: ui.bg },
  title: { fontSize: 24, fontWeight: '800', color: ui.navy },
  sub: { color: ui.muted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: ui.card,
    gap: 8,
  },
  rowTitle: { fontSize: 17, fontWeight: '700', color: ui.navySoft },
  meta: { color: ui.muted, marginTop: 4 },
  warn: { color: ui.orange, marginTop: 6, fontWeight: '700' },
  chev: { fontSize: 28, color: ui.orange, opacity: 0.7 },
  err: { color: ui.danger },
});
