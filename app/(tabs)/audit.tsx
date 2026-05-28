import { useQuery } from '@tanstack/react-query';
import { FlatList, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { supabase } from '@/src/lib/supabase';
import { ui } from '@/src/theme/ui';
import type { AdminAuditLogRow } from '@/src/types/azoup';
import { normalizarAuditLogParaExibicao } from '@/src/services/audit';
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
  const { canViewAudit } = useAdminAuth();

  const q = useQuery({ queryKey: ['admin_audit_logs'], queryFn: fetchAudit, enabled: canViewAudit });

  if (!canViewAudit) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.warn}>Seu papel não pode visualizar auditoria.</Text>
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      data={q.data ?? []}
      keyExtractor={(item) => item.id}
      refreshing={q.isRefetching}
      onRefresh={() => q.refetch()}
      ListHeaderComponent={
        <View style={{ marginBottom: 12, gap: 6 }}>
          <Text style={styles.title}>Auditoria Administrativa</Text>
          <Text style={styles.sub}>Registro das ações sensíveis salvas em `admin_audit_logs`.</Text>
        </View>
      }
      ListEmptyComponent={
        q.isLoading ? <Text>Carregando…</Text> : q.error ? <Text style={styles.err}>{(q.error as Error).message}</Text> : <Text>Nenhum evento encontrado.</Text>
      }
      renderItem={({ item }) => {
        const n = normalizarAuditLogParaExibicao(item);
        return (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {n.acao} · {formatDateBR(item.created_at)}
            </Text>
            <Text style={styles.meta}>
              Admin:{' '}
              {item.admin_user_id ?? item.admin_id ?? item.user_id ?? item.created_by ?? '—'} · Entidade: {n.entidade} (
              {n.entidade_id})
            </Text>
            <Text style={styles.mono} selectable>
              {JSON.stringify({ antes: n.antes, depois: n.depois }, null, 2)}
            </Text>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16, backgroundColor: ui.bg },
  title: { fontSize: 22, fontWeight: '900', color: ui.navy },
  sub: { color: ui.muted },
  card: {
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    gap: 8,
    backgroundColor: ui.card,
  },
  cardTitle: { fontWeight: '800', color: ui.navySoft },
  meta: { color: ui.muted },
  mono: { fontSize: 11, color: ui.text, opacity: 0.9 },
  err: { color: ui.danger },
  warn: { color: ui.orange, fontWeight: '800' },
});
