import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { BackLink } from '@/components/ui/BackLink';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/Themed';
import { HistoricoClienteTela } from './index';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import { carregarAcompanhamentoClientes } from '@/src/services/repos/acompanhamento-repo';

export default function AcompanhamentoClienteScreen() {
  const { theme } = useTheme();
  const { canAccessScreen } = useAdminAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const clienteId = Array.isArray(id) ? id[0] : id;

  const q = useQuery({
    queryKey: ['acompanhamento_clientes'],
    queryFn: carregarAcompanhamentoClientes,
    enabled: canAccessScreen('acompanhamento') && Boolean(clienteId),
  });

  const cliente = useMemo(
    () => (q.data?.clientes ?? []).find((item) => item.id === clienteId) ?? null,
    [q.data, clienteId],
  );

  if (!canAccessScreen('acompanhamento')) {
    return (
      <Screen>
        <Text style={{ color: theme.warning, fontWeight: '800' }}>Seu perfil não tem acesso a Acompanhamento.</Text>
      </Screen>
    );
  }

  if (q.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.cadastroAction} />
      </View>
    );
  }

  if (!cliente) {
    return (
      <Screen>
        <BackLink href="/(tabs)/acompanhamento" label="Acompanhamento" />
        <Text style={{ color: theme.error, fontWeight: '700' }}>Cliente não encontrado no acompanhamento.</Text>
      </Screen>
    );
  }

  return <HistoricoClienteTela cliente={cliente} />;
}
