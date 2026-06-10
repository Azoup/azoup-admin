import { useQuery } from '@tanstack/react-query';
import { FlatList, StyleSheet, View } from 'react-native';

import { PageHeader } from '@/components/ui/PageHeader';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { Text } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import { supabase } from '@/src/lib/supabase';
import { normalizarAuditLogParaExibicao } from '@/src/services/audit';
import type { AdminAuditLogRow } from '@/src/types/azoup';
import { formatDateBR } from '@/src/utils/format';

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
        <Text style={{ color: theme.warning, fontWeight: '800' }}>Seu papel não pode visualizar auditoria.</Text>
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
          title="Auditoria Administrativa"
          subtitle="Registro das ações sensíveis salvas em admin_audit_logs."
        />
      }
      ListEmptyComponent={
        q.isLoading ? (
          <Text style={{ color: theme.textMuted }}>Carregando…</Text>
        ) : q.error ? (
          <Text style={{ color: theme.error }}>{(q.error as Error).message}</Text>
        ) : (
          <Text style={{ color: theme.textMuted }}>Nenhum evento encontrado.</Text>
        )
      }
      renderItem={({ item }) => {
        const n = normalizarAuditLogParaExibicao(item);
        return (
          <ScreenCard style={styles.card}>
            <Text style={{ fontWeight: '800', color: theme.headerText }}>
              {n.acao} · {formatDateBR(item.created_at)}
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 13 }}>
              Admin: {item.admin_user_id ?? item.admin_id ?? item.user_id ?? item.created_by ?? '—'} · Entidade:{' '}
              {n.entidade} ({n.entidade_id})
            </Text>
            <Text selectable style={[styles.mono, { color: theme.text }]}>
              {JSON.stringify({ antes: n.antes, depois: n.depois }, null, 2)}
            </Text>
          </ScreenCard>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12, gap: 8 },
  mono: { fontFamily: 'SpaceMono', fontSize: 11, opacity: 0.9 },
});
