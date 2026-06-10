import { useQuery } from '@tanstack/react-query';
import { FlatList, View } from 'react-native';

import { AuditLogCard } from '@/components/ui/AuditLogCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { Text } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import { supabase } from '@/src/lib/supabase';
import type { AdminAuditLogRow } from '@/src/types/azoup';
import { formatarAuditLogParaCard } from '@/src/utils/audit-display';

async function fetchAudit(): Promise<AdminAuditLogRow[]> {
  const { data, error } = await supabase
    .from('admin_audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(150);

  if (error) throw new Error(error.message);
  return (data ?? []) as AdminAuditLogRow[];
}

export default function AuditScreen() {
  const { theme } = useTheme();
  const { canViewAudit } = useAdminAuth();
  const q = useQuery({ queryKey: ['admin_audit_logs'], queryFn: fetchAudit, enabled: canViewAudit });

  if (!canViewAudit) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: theme.background }}>
        <Text style={{ color: theme.warning, fontWeight: '800' }}>Seu perfil não tem acesso à auditoria.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      data={q.data ?? []}
      keyExtractor={(item) => item.id}
      refreshing={q.isRefetching}
      onRefresh={() => q.refetch()}
      ListHeaderComponent={
        <PageHeader
          title="Histórico de alterações"
          subtitle="Veja quem alterou créditos, limites, cupons e configurações do painel — em linguagem simples."
        />
      }
      ListEmptyComponent={
        q.isLoading ? (
          <Text style={{ color: theme.textMuted }}>Carregando histórico…</Text>
        ) : q.error ? (
          <Text style={{ color: theme.error }}>{(q.error as Error).message}</Text>
        ) : (
          <Text style={{ color: theme.textMuted }}>Nenhuma alteração registrada ainda.</Text>
        )
      }
      renderItem={({ item }) => <AuditLogCard view={formatarAuditLogParaCard(item)} />}
    />
  );
}
