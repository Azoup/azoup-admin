import { supabase } from '@/src/lib/supabase';
import type { AdminAuditLogRow } from '@/src/types/azoup';

export type AuditPayload = Pick<
  AdminAuditLogRow,
  'valores_anteriores' | 'valores_novos' | 'entidade' | 'entidade_id' | 'acao'
>;

export type RegistrarAuditoriaResult =
  | { ok: true }
  | { ok: false; reason: 'rls' | 'schema' | 'unknown'; message: string };

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

function isRlsOrPermissionError(err: { code?: string; message?: string }): boolean {
  const code = err.code ?? '';
  const m = (err.message ?? '').toLowerCase();
  return (
    code === '42501' ||
    code === 'PGRST301' ||
    m.includes('row-level security') ||
    m.includes('permission denied') ||
    m.includes('not authorized')
  );
}

let cachedAuditColumns: Set<string> | null = null;
let auditColumnsProbeDone = false;
/** Após 403/42501, não tenta mais inserts (evita spam no console). */
let auditInsertBlockedByRls = false;
let auditRlsWarningLogged = false;

async function discoverAuditTableColumns(): Promise<Set<string> | null> {
  if (cachedAuditColumns) return cachedAuditColumns;
  if (auditColumnsProbeDone) return null;
  auditColumnsProbeDone = true;

  const { data, error } = await supabase.from('admin_audit_logs').select('*').limit(1);
  if (error) {
    if (isRlsOrPermissionError(error)) {
      auditInsertBlockedByRls = true;
    }
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
    action: payload.acao ?? null,
    entity_type: payload.entidade ?? null,
    entity_id: payload.entidade_id != null ? String(payload.entidade_id) : null,
    old_values: payload.valores_anteriores ?? null,
    new_values: payload.valores_novos ?? null,
    admin_id: adminUserId ?? null,
  };
}

function buildRowFromDiscoveredColumns(
  cols: Set<string>,
  adminUserId: string | undefined,
  payload: AuditPayload,
): Record<string, unknown> | null {
  const row: Record<string, unknown> = {};
  const entityId = payload.entidade_id != null ? String(payload.entidade_id) : null;

  const actionCol = pickFirstColumn(cols, ['action', 'acao', 'tipo_evento', 'event_type', 'operation']);
  if (actionCol) row[actionCol] = payload.acao ?? null;

  const entityCol = pickFirstColumn(cols, ['entity_type', 'entidade', 'resource_type', 'table_name']);
  if (entityCol) row[entityCol] = payload.entidade ?? null;

  const entityIdCol = pickFirstColumn(cols, ['entity_id', 'entidade_id', 'resource_id', 'record_id']);
  if (entityIdCol) row[entityIdCol] = entityId;

  const oldCol = pickFirstColumn(cols, ['old_values', 'valores_anteriores', 'before', 'dados_anteriores']);
  if (oldCol) row[oldCol] = payload.valores_anteriores ?? null;

  const newCol = pickFirstColumn(cols, ['new_values', 'valores_novos', 'after', 'dados_novos']);
  if (newCol) row[newCol] = payload.valores_novos ?? null;

  if (adminUserId) {
    const adminCol = pickFirstColumn(cols, ['admin_id', 'user_id', 'created_by', 'actor_id']);
    if (adminCol) row[adminCol] = adminUserId;
  }

  return Object.keys(row).length > 0 ? row : null;
}

function buildJsonRow(cols: Set<string> | null, adminUserId: string | undefined, payload: AuditPayload): Record<string, unknown> {
  const jsonCol = cols
    ? pickFirstColumn(cols, ['metadata', 'details', 'payload', 'dados', 'event_data', 'changes'])
    : 'metadata';
  return { [jsonCol ?? 'metadata']: buildAuditBlob(adminUserId, payload) };
}

function formatErr(err: { message: string; details?: string; hint?: string; code?: string }) {
  return [err.message, err.details, err.hint, err.code && `(${err.code})`].filter(Boolean).join(' — ');
}

/**
 * Registra auditoria. Nunca lança erro — falha de RLS/schema não impede salvar limites/créditos.
 */
export async function registrarAuditoria(
  adminUserId: string | undefined,
  payload: AuditPayload,
): Promise<RegistrarAuditoriaResult> {
  if (auditInsertBlockedByRls) {
    return {
      ok: false,
      reason: 'rls',
      message: 'Auditoria desativada nesta sessão (RLS em admin_audit_logs). Aplique a política SQL no Supabase.',
    };
  }

  const cols = await discoverAuditTableColumns();
  const candidates: Record<string, unknown>[] = [];

  if (cols) {
    const mapped = buildRowFromDiscoveredColumns(cols, adminUserId, payload);
    if (mapped) candidates.push(mapped);
    candidates.push(buildJsonRow(cols, adminUserId, payload));
  } else {
    candidates.push(buildJsonRow(null, adminUserId, payload));
  }

  let lastErr: { message: string; details?: string; hint?: string; code?: string } | null = null;

  for (const row of candidates) {
    const { error } = await supabase.from('admin_audit_logs').insert(row as never);
    if (!error) {
      if (!cachedAuditColumns) cachedAuditColumns = new Set(Object.keys(row));
      return { ok: true };
    }

    lastErr = error;
    const msg = error.message ?? '';

    if (isRlsOrPermissionError(error)) {
      auditInsertBlockedByRls = true;
      if (!auditRlsWarningLogged) {
        auditRlsWarningLogged = true;
        console.warn(
          '[admin_audit_logs] INSERT bloqueado por RLS (42501). O salvamento do cliente foi feito; só o log de auditoria falhou. ' +
            'Execute o SQL em supabase/sql/admin_audit_logs_rls.sql no Supabase.',
        );
      }
      return {
        ok: false,
        reason: 'rls',
        message: formatErr(error),
      };
    }

    if (Object.keys(row).some((k) => isUnknownColumnError(msg, k)) || isPostgrestSchemaColumnError(msg)) {
      continue;
    }

    break;
  }

  if (!auditRlsWarningLogged && lastErr) {
    console.warn('[admin_audit_logs]', formatErr(lastErr));
  }

  return {
    ok: false,
    reason: lastErr && isPostgrestSchemaColumnError(lastErr.message ?? '') ? 'schema' : 'unknown',
    message: lastErr ? formatErr(lastErr) : 'Falha ao inserir auditoria',
  };
}

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
