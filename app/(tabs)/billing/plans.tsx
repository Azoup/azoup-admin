import { useQuery } from '@tanstack/react-query';
import { FlatList } from 'react-native';

import { PageHeader } from '@/components/ui/PageHeader';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { Text } from '@/components/Themed';
import { useTheme } from '@/src/contexts/ThemeContext';
import { listarPlanos } from '@/src/services/repos/billing-repo';
import { formatBRLFromCentavos } from '@/src/utils/format';

export default function PlansScreen() {
  const { theme } = useTheme();
  const { data, isLoading, error } = useQuery({ queryKey: ['planos_assinatura'], queryFn: listarPlanos });

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      data={data ?? []}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        <PageHeader
          title="Planos Azoup"
          subtitle="Fonte: planos_assinatura. Ajustes profundos de pricing continuam no núcleo/stripe sync."
        />
      }
      ListEmptyComponent={
        isLoading ? (
          <Text style={{ color: theme.textMuted }}>Carregando…</Text>
        ) : error ? (
          <Text style={{ color: theme.error }}>{(error as Error).message}</Text>
        ) : (
          <Text style={{ color: theme.textMuted }}>Nenhum plano cadastrado.</Text>
        )
      }
      renderItem={({ item }) => (
        <ScreenCard style={{ marginBottom: 12, gap: 6 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: theme.headerText }}>
            {item.nome ?? item.slug ?? item.id}
          </Text>
          <Text style={{ color: theme.textMuted }}>Preço mensal: {formatBRLFromCentavos(item.valor_mensal_centavos)}</Text>
          <Text style={{ color: theme.textMuted }}>Stripe price: {item.stripe_price_id ?? '—'}</Text>
          <Text style={{ color: theme.textMuted }}>
            Limites · usuários {item.limite_usuarios ?? '—'} · empresas {item.limite_empresas ?? '—'} · GB{' '}
            {item.limite_armazenamento_gb ?? '—'} · tokens {item.limite_tokens_ia_mes ?? '—'}
          </Text>
        </ScreenCard>
      )}
    />
  );
}
