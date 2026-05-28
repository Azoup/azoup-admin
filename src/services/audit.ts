import { supabase } from '@/src/lib/supabase';
import type { AdminAuditLogRow } from '@/src/types/azoup';

export type AuditPayload = Pick<
  AdminAuditLogRow,
  'valores_anteriores' | 'valores_novos' | 'entidade' | 'entidade_id' | 'acao'
>;

function isUnknownColumnError(msg: string, col: string): boolean {
  const m = msg.toLowerCase();
  const c = col.toLowerCase();
  return (
    (m.includes('could not find') && m.includes(c)) ||
    (m.includes('column') && m.includes(c) && (m.includes('does not exist') || m.includes('schema cache')))
  );
}

function isPostgrestSchemaColumnError(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes('schema cache') || m.includes('could not find');
}

/** Cache de colunas reais retornadas pelo PostgREST (uma linha existente na tabela). */
let cachedAuditColumns: Set<string> | null = null;
let auditColumnsProbeDone = false;

async function discoverAuditTableColumns(): Promise<Set<string> | null> {
  if (cachedAuditColumns) return cachedAuditColumns;
  if (auditColumnsProbeDone) return null;
  auditColumnsProbeDone = true;

  const { data, error } = await supabase.from('admin_audit_logs').select('*').limit(1);
  if (error) {
    console.warn('[admin_audit_logs] não foi possível inspecionar colunas:', error.message);
    return null;
  }
  const row = data?.[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  cachedAuditColumns = new Set(Object.keys(row));
  return cachedAuditColumns;
}

function pickFirstColumn(cols: Set<string>, aliases: string[]): string | null {
  return aliases.find((a) => cols.has(a)) ?? null;
}

function buildAuditBlob(adminUserId: string | undefined, payload: AuditPayload): Record<string, unknown> {
  return {
    acao: payload.acao ?? null,
    action: payload.acao ?? null,
    entidade: payload.entidade ?? null,
    entity_type: payload.entidade ?? null,
    entidade_id: payload.entidade_id != null ? String(payload.entidade_id) : null,
    entity_id: payload.entidade_id != null ? String(payload.entidade_id) : null,
    admin_user_id: adminUserId ?? null,
    valores_anteriores: payload.valores_anteriores ?? null,
    valores_novos: payload.valores_novos ?? null,
    old_values: payload.valores_anteriores ?? null,
    new_values: payload.valores_novos ?? null,
  };
}

/** Monta 1 linha de insert usando só colunas que existem na tabela (quando já há registro para inspecionar). */
function buildRowFromDiscoveredColumns(
  cols: Set<string>,
  adminUserId: string | undefined,
  payload: AuditPayload,
): Record<string, unknown> | null {
  const row: Record<string, unknown> = {};
  const entityId = payload.entidade_id != null ? String(payload.entidade_id) : null;

  const actionCol = pickFirstColumn(cols, [
    'action',
    'acao',
    'tipo',
    'tipo_acao',
    'tipo_evento',
    'event_type',
    'evento',
    'operation',
    'operacao',
  ]);
  if (actionCol) row[actionCol] = payload.acao ?? null;

  const entityCol = pickFirstColumn(cols, [
    'entity_type',
    'entidade',
    'entity',
    'resource_type',
    'tabela',
    'table_name',
  ]);
  if (entityCol) row[entityCol] = payload.entidade ?? null;

  const entityIdCol = pickFirstColumn(cols, [
    'entity_id',
    'entidade_id',
    'resource_id',
    'record_id',
    'referencia_id',
  ]);
  if (entityIdCol) row[entityIdCol] = entityId;

  const oldCol = pickFirstColumn(cols, [
    'old_values',
    'valores_anteriores',
    'before',
    'dados_anteriores',
    'previous_data',
    'payload_antes',
  ]);
  if (oldCol) row[oldCol] = payload.valores_anteriores ?? null;

  const newCol = pickFirstColumn(cols, [
    'new_values',
    'valores_novos',
    'after',
    'dados_novos',
    'new_data',
    'payload_depois',
  ]);
  if (newCol) row[newCol] = payload.valores_novos ?? null;

  if (adminUserId) {
    const adminCol = pickFirstColumn(cols, [
      'admin_id',
      'admin_user_id',
      'user_id',
      'created_by',
      'created_by_admin_id',
      'actor_id',
      'usuario_admin_id',
    ]);
    if (adminCol) row[adminCol] = adminUserId;
  }

  return Object.keys(row).length > 0 ? row : null;
}

function buildJsonRowFromDiscoveredColumns(
  cols: Set<string>,
  adminUserId: string | undefined,
  payload: AuditPayload,
): Record<string, unknown> | null {
  const jsonCol = pickFirstColumn(cols, [
    'metadata',
    'details',
    'payload',
    'dados',
    'event_data',
    'changes',
    'log',
    'body',
    'extra',
  ]);
  if (!jsonCol) return null;
  return { [jsonCol]: buildAuditBlob(adminUserId, payload) };
}

/** Quando a tabela está vazia: tenta só colunas JSON comuns (poucos POSTs). */
function buildJsonOnlyCandidates(
  adminUserId: string | undefined,
  payload: AuditPayload,
): Record<string, unknown>[] {
  const blob = buildAuditBlob(adminUserId, payload);
  const jsonKeys = ['metadata', 'details', 'payload', 'dados', 'event_data', 'changes', 'log', 'body'] as const;
  return jsonKeys.map((k) => ({ [k]: blob }));
}

/**
 * Registra auditoria administrativa.
 * Não bloqueia o fluxo principal: falhas só aparecem no console.
 */
export async function registrarAuditoria(
  adminUserId: string | undefined,
  payload: AuditPayload,
): Promise<void> {
  const cols = await discoverAuditTableColumns();
  const candidates: Record<string, unknown>[] = [];

  if (cols) {
    const mapped = buildRowFromDiscoveredColumns(cols, adminUserId, payload);
    if (mapped) candidates.push(mapped);
    const jsonRow = buildJsonRowFromDiscoveredColumns(cols, adminUserId, payload);
    if (jsonRow) candidates.push(jsonRow);
  } else {
    candidates.push(...buildJsonOnlyCandidates(adminUserId, payload));
  }

  let lastErr: { message: string; details?: string; hint?: string; code?: string } | null = null;

  for (const row of candidates) {
    const { error } = await supabase.from('admin_audit_logs').insert(row as never);
    if (!error) {
      if (!cachedAuditColumns) {
        cachedAuditColumns = new Set(Object.keys(row));
      }
      return;
    }

    lastErr = error;
    const msg = error.message ?? '';
    if (Object.keys(row).some((k) => isUnknownColumnError(msg, k)) || isPostgrestSchemaColumnError(msg)) {
      continue;
    }
    break;
  }

  if (lastErr) {
    console.error(
      '[admin_audit_logs]',
      lastErr.message,
      lastErr.details ?? '',
      lastErr.hint ?? '',
      lastErr.code ?? '',
      '— Abra a aba Auditoria (com pelo menos 1 registro) ou rode information_schema.columns para admin_audit_logs.',
    );
  }
}

/** Expõe leitura amigável de um registro (inclui blob em metadata/details). */
export function normalizarAuditLogParaExibicao(item: AdminAuditLogRow): {
  acao: string;
  entidade: string;
  entidade_id: string;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
} {
  const blob =
    (item.metadata as Record<string, unknown> | undefined) ??
    (item.details as Record<string, unknown> | undefined) ??
    (item.payload as Record<string, unknown> | undefined) ??
    (item.dados as Record<string, unknown> | undefined) ??
    null;

  return {
    acao: String(item.acao ?? item.action ?? blob?.acao ?? blob?.action ?? 'evento'),
    entidade: String(item.entidade ?? item.entity_type ?? blob?.entidade ?? blob?.entity_type ?? '—'),
    entidade_id: String(item.entidade_id ?? item.entity_id ?? blob?.entidade_id ?? blob?.entity_id ?? '—'),
    antes: (item.valores_anteriores ?? item.old_values ?? blob?.valores_anteriores ?? blob?.old_values ?? null) as Record<
      string,
      unknown
    > | null,
    depois: (item.valores_novos ?? item.new_values ?? blob?.valores_novos ?? blob?.new_values ?? null) as Record<
      string,
      unknown
    > | null,
  };
}
