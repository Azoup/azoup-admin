import { supabase } from '@/src/lib/supabase';
import { registrarAuditoriaViaFunction } from '@/src/services/stripe-admin-api';
import type { AdminAuditLogRow } from '@/src/types/azoup';

export type AuditPayload = Pick<
  AdminAuditLogRow,
  'valores_anteriores' | 'valores_novos' | 'entidade' | 'entidade_id' | 'acao'
>;

export type RegistrarAuditoriaResult =
  | { ok: true }
  | { ok: false; reason: 'rls' | 'schema' | 'unknown'; message: string };

export type AdminAuditActor = { id?: string; email?: string | null } | string | undefined;

/** Schema real do painel ADM (`migration_painel_adm_billing.sql`). */
const PAINEL_AUDIT_KNOWN_COLUMNS = new Set([
  'id',
  'admin_email',
  'action',
  'target_type',
  'target_id',
  'payload',
  'created_at',
]);

function resolveAdminActor(actor: AdminAuditActor): { id?: string; email?: string | null } {
  if (typeof actor === 'string') return { id: actor };
  return actor ?? {};
}

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
let auditRlsWarningLogged = false;

async function discoverAuditTableColumns(): Promise<Set<string>> {
  if (cachedAuditColumns) return cachedAuditColumns;
  if (auditColumnsProbeDone) return PAINEL_AUDIT_KNOWN_COLUMNS;
  auditColumnsProbeDone = true;

  const { data, error } = await supabase.from('admin_audit_logs').select('*').limit(1);
  if (error) {
    cachedAuditColumns = PAINEL_AUDIT_KNOWN_COLUMNS;
    return cachedAuditColumns;
  }

  const row = data?.[0] as Record<string, unknown> | undefined;
  cachedAuditColumns = row ? new Set(Object.keys(row)) : PAINEL_AUDIT_KNOWN_COLUMNS;
  return cachedAuditColumns;
}

function pickFirstColumn(cols: Set<string>, aliases: string[]): string | null {
  return aliases.find((a) => cols.has(a)) ?? null;
}

function buildPainelAuditRow(
  adminEmail: string | null | undefined,
  payload: AuditPayload,
): Record<string, unknown> {
  return {
    action: payload.acao,
    target_type: payload.entidade ?? null,
    target_id: payload.entidade_id != null ? String(payload.entidade_id) : null,
    admin_email: adminEmail ?? null,
    payload: {
      valores_anteriores: payload.valores_anteriores ?? null,
      valores_novos: payload.valores_novos ?? null,
    },
  };
}

function buildAuditBlob(
  admin: { id?: string; email?: string | null },
  payload: AuditPayload,
): Record<string, unknown> {
  return {
    action: payload.acao ?? null,
    entity_type: payload.entidade ?? null,
    entity_id: payload.entidade_id != null ? String(payload.entidade_id) : null,
    old_values: payload.valores_anteriores ?? null,
    new_values: payload.valores_novos ?? null,
    admin_id: admin.id ?? null,
    admin_email: admin.email ?? null,
  };
}

function buildRowFromDiscoveredColumns(
  cols: Set<string>,
  admin: { id?: string; email?: string | null },
  payload: AuditPayload,
): Record<string, unknown> | null {
  const row: Record<string, unknown> = {};
  const entityId = payload.entidade_id != null ? String(payload.entidade_id) : null;

  const actionCol = pickFirstColumn(cols, ['action', 'acao', 'tipo_evento', 'event_type', 'operation']);
  if (actionCol) row[actionCol] = payload.acao ?? null;

  const entityCol = pickFirstColumn(cols, ['target_type', 'entity_type', 'entidade', 'resource_type', 'table_name']);
  if (entityCol) row[entityCol] = payload.entidade ?? null;

  const entityIdCol = pickFirstColumn(cols, ['target_id', 'entity_id', 'entidade_id', 'resource_id', 'record_id']);
  if (entityIdCol) row[entityIdCol] = entityId;

  const oldCol = pickFirstColumn(cols, ['old_values', 'valores_anteriores', 'before', 'dados_anteriores']);
  if (oldCol) row[oldCol] = payload.valores_anteriores ?? null;

  const newCol = pickFirstColumn(cols, ['new_values', 'valores_novos', 'after', 'dados_novos']);
  if (newCol) row[newCol] = payload.valores_novos ?? null;

  if (admin.email) {
    const emailCol = pickFirstColumn(cols, ['admin_email', 'actor_email', 'user_email']);
    if (emailCol) row[emailCol] = admin.email;
  }

  if (admin.id) {
    const adminCol = pickFirstColumn(cols, ['admin_id', 'user_id', 'created_by', 'actor_id', 'admin_user_id']);
    if (adminCol) row[adminCol] = admin.id;
  }

  const payloadCol = pickFirstColumn(cols, ['payload', 'metadata', 'details', 'dados', 'event_data', 'changes']);
  if (payloadCol && !oldCol && !newCol) {
    row[payloadCol] = buildAuditBlob(admin, payload);
  }

  return Object.keys(row).length > 0 ? row : null;
}

function buildJsonRow(cols: Set<string>, admin: { id?: string; email?: string | null }, payload: AuditPayload): Record<string, unknown> {
  const jsonCol = pickFirstColumn(cols, ['payload', 'metadata', 'details', 'dados', 'event_data', 'changes']) ?? 'payload';
  return { [jsonCol]: buildAuditBlob(admin, payload) };
}

function formatErr(err: { message: string; details?: string; hint?: string; code?: string }) {
  return [err.message, err.details, err.hint, err.code && `(${err.code})`].filter(Boolean).join(' — ');
}

/**
 * Registra auditoria. Nunca lança erro — falha de RLS/schema não impede salvar limites/créditos.
 */
async function registrarAuditoriaViaEdgeFunction(payload: AuditPayload): Promise<RegistrarAuditoriaResult> {
  try {
    await registrarAuditoriaViaFunction({
      acao: payload.acao,
      entidade: payload.entidade ?? null,
      entidade_id: payload.entidade_id ?? null,
      valores_anteriores: payload.valores_anteriores ?? null,
      valores_novos: payload.valores_novos ?? null,
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: 'unknown',
      message: e instanceof Error ? e.message : 'Falha ao gravar auditoria via admin-stripe',
    };
  }
}

export async function registrarAuditoria(
  actor: AdminAuditActor,
  payload: AuditPayload,
): Promise<RegistrarAuditoriaResult> {
  const admin = resolveAdminActor(actor);
  const cols = await discoverAuditTableColumns();
  const candidates: Record<string, unknown>[] = [buildPainelAuditRow(admin.email, payload)];

  const mapped = buildRowFromDiscoveredColumns(cols, admin, payload);
  if (mapped) candidates.push(mapped);
  candidates.push(buildJsonRow(cols, admin, payload));

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
      const viaFn = await registrarAuditoriaViaEdgeFunction(payload);
      if (viaFn.ok) return { ok: true };

      if (!auditRlsWarningLogged) {
        auditRlsWarningLogged = true;
        console.warn(
          '[admin_audit_logs] INSERT direto bloqueado por RLS; fallback admin-stripe também falhou. ' +
            'Execute supabase/sql/admin_audit_logs_rls.sql no Supabase e faça deploy de admin-stripe.',
        );
      }
      return {
        ok: false,
        reason: 'rls',
        message: viaFn.message || formatErr(error),
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
    (item.payload as Record<string, unknown> | undefined) ??
    (item.metadata as Record<string, unknown> | undefined) ??
    (item.details as Record<string, unknown> | undefined) ??
    (item.dados as Record<string, unknown> | undefined) ??
    null;

  return {
    acao: String(item.acao ?? item.action ?? blob?.acao ?? blob?.action ?? 'evento'),
    entidade: String(
      item.entidade ?? item.entity_type ?? item.target_type ?? blob?.entidade ?? blob?.entity_type ?? '—',
    ),
    entidade_id: String(
      item.entidade_id ?? item.entity_id ?? item.target_id ?? blob?.entidade_id ?? blob?.entity_id ?? '—',
    ),
    antes: (item.valores_anteriores ??
      item.old_values ??
      blob?.valores_anteriores ??
      blob?.old_values ??
      null) as Record<string, unknown> | null,
    depois: (item.valores_novos ??
      item.new_values ??
      blob?.valores_novos ??
      blob?.new_values ??
      null) as Record<string, unknown> | null,
  };
}
