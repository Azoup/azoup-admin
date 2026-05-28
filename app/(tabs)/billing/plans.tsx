import { useQuery } from '@tanstack/react-query';
import { FlatList, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { listarPlanos } from '@/src/services/repos/billing-repo';
import { formatBRLFromCentavos } from '@/src/utils/format';

export default function PlansScreen() {
  const { data, isLoading, error } = useQuery({ queryKey: ['planos_assinatura'], queryFn: listarPlanos });

  return (
    <FlatList
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      data={data ?? []}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        <View style={{ marginBottom: 12, gap: 6 }}>
          <Text style={styles.title}>Planos Azoup</Text>
          <Text style={styles.sub}>Fonte: `planos_assinatura`. Ajustes profundos de pricing continuam no núcleo/stripe sync.</Text>
        </View>
      }
      ListEmptyComponent={
        isLoading ? (
          <Text>Carregando…</Text>
        ) : error ? (
          <Text style={styles.err}>{(error as Error).message}</Text>
        ) : (
          <Text>Nenhum plano cadastrado.</Text>
        )
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{item.nome ?? item.slug ?? item.id}</Text>
          <Text style={styles.meta}>Preço mensal: {formatBRLFromCentavos(item.valor_mensal_centavos)}</Text>
          <Text style={styles.meta}>Stripe price: {item.stripe_price_id ?? '—'}</Text>
          <Text style={styles.meta}>
            Limites base · usuários {item.limite_usuarios ?? '—'} · empresas {item.limite_empresas ?? '—'} · GB{' '}
            {item.limite_armazenamento_gb ?? '—'} · tokens {item.limite_tokens_ia_mes ?? '—'}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '800' },
  sub: { opacity: 0.78, lineHeight: 20 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#00000022',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    gap: 6,
  },
  cardTitle: { fontSize: 17, fontWeight: '800' },
  meta: { opacity: 0.78 },
  err: { color: '#b91c1c' },
});
