import { differenceInCalendarDays, parseISO } from 'date-fns';

import { supabase } from '@/src/lib/supabase';
import type {
  AssinaturaClienteRow,
  AssinaturaLimitesOverrideRow,
  ClienteAzoupAdminView,
  ClienteAzoupRow,
  HistoricoFaturaRow,
  PlanoAssinaturaRow,
} from '@/src/types/azoup';

function safeParseIso(d?: string | null) {
  if (!d) return null;
  try {
    return parseISO(d);
  } catch {
    return null;
  }
}

function mesReferencia(row: HistoricoFaturaRow): string | null {
  const base = row.periodo_inicio ?? row.data_vencimento ?? row.created_at ?? null;
  const dt = safeParseIso(base);
  if (!dt) return null;
  const y = dt.getFullYear();
  const m = `${dt.getMonth() + 1}`.padStart(2, '0');
  return `${y}-${m}`;
}

function pickLatestAssinatura(rows: AssinaturaClienteRow[]): AssinaturaClienteRow | null {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => `${b.data_inicio ?? ''}`.localeCompare(`${a.data_inicio ?? ''}`))[0] ?? null;
}

function sortHistorico(rows: HistoricoFaturaRow[]): HistoricoFaturaRow[] {
  return [...rows].sort((a, b) => {
    const da = a.data_vencimento ?? a.periodo_fim ?? a.periodo_inicio ?? a.data_pagamento ?? a.created_at ?? '';
    const db = b.data_vencimento ?? b.periodo_fim ?? b.periodo_inicio ?? b.data_pagamento ?? b.created_at ?? '';
    return `${db}`.localeCompare(`${da}`);
  });
}

export async function listarClientesAzoup(): Promise<ClienteAzoupAdminView[]> {
  const { data: clientes, error } = await supabase
    .from('clientes_azoup')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  const rows = (clientes ?? []) as ClienteAzoupRow[];
  if (!rows.length) return [];

  const ids = rows.map((c) => c.id);

  const [{ data: todasAssinaturas, error: eAss }, { data: todosOverrides, error: eOv }, { data: todasFaturas, error: eFat }] =
    await Promise.all([
      supabase.from('assinaturas_clientes').select('*').in('cliente_id', ids).limit(10000),
      supabase.from('assinatura_limites_override').select('*').in('cliente_id', ids).limit(10000),
      supabase.from('historico_faturas').select('*').in('cliente_id', ids).limit(5000),
    ]);

  if (eAss) throw new Error(eAss.message);
  if (eOv) throw new Error(eOv.message);
  if (eFat) throw new Error(eFat.message);

  const assinPorCliente = new Map<string, AssinaturaClienteRow[]>();
  for (const a of (todasAssinaturas ?? []) as AssinaturaClienteRow[]) {
    const arr = assinPorCliente.get(a.cliente_id) ?? [];
    arr.push(a);
    assinPorCliente.set(a.cliente_id, arr);
  }

  const overridePorCliente = new Map<string, AssinaturaLimitesOverrideRow>();
  for (const o of (todosOverrides ?? []) as AssinaturaLimitesOverrideRow[]) {
    overridePorCliente.set(o.cliente_id, o);
  }

  const faturasPorCliente = new Map<string, HistoricoFaturaRow[]>();
  for (const f of (todasFaturas ?? []) as HistoricoFaturaRow[]) {
    const cid = f.cliente_id;
    if (!cid) continue;
    const arr = faturasPorCliente.get(cid) ?? [];
    arr.push(f);
    faturasPorCliente.set(cid, arr);
  }

  const planoIds = [
    ...new Set(
      [...(todasAssinaturas ?? [])]
        .map((a: AssinaturaClienteRow) => a.plano_id)
        .filter((p) => p != null && `${p}` !== ''),
    ),
  ].map((id) => String(id));

  let planoPorId = new Map<string, PlanoAssinaturaRow>();
  if (planoIds.length) {
    const { data: planos, error: ePl } = await supabase.from('planos_assinatura').select('*').in('id', planoIds);
    if (ePl) throw new Error(ePl.message);
    planoPorId = new Map((planos as PlanoAssinaturaRow[]).map((p) => [String(p.id), p]));
  }

  return rows.map((c) => {
    const assinatura = pickLatestAssinatura(assinPorCliente.get(c.id) ?? []);
    const plano = assinatura?.plano_id != null ? planoPorId.get(String(assinatura.plano_id)) ?? null : null;
    const limites_override = overridePorCliente.get(c.id) ?? null;
    const historico_faturas = sortHistorico(faturasPorCliente.get(c.id) ?? []);

    const inicioAssinatura = safeParseIso(assinatura?.data_inicio ?? undefined);
    const dias_como_assinante = inicioAssinatura ? differenceInCalendarDays(new Date(), inicioAssinatura) : 0;

    const cobrancas_falhas = historico_faturas.filter((h) => h.status === 'falhou').length;

    const mesesAbertos = new Set<string>();
    for (const h of historico_faturas) {
      if (h.status === 'aberto' || h.status === 'falhou') {
        const m = mesReferencia(h);
        if (m) mesesAbertos.add(m);
      }
    }

    return {
      ...c,
      assinatura,
      plano,
      limites_override,
      historico_faturas,
      dias_como_assinante,
      meses_em_aberto: [...mesesAbertos].sort(),
      cobrancas_falhas,
    };
  });
}

async function buscarAssinaturaRecente(clienteId: string): Promise<AssinaturaClienteRow | null> {
  const { data, error } = await supabase
    .from('assinaturas_clientes')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('data_inicio', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return (data as AssinaturaClienteRow) ?? null;
}

async function buscarPlano(planoId?: string | number | null): Promise<PlanoAssinaturaRow | null> {
  if (planoId === undefined || planoId === null || `${planoId}` === '') return null;
  const { data, error } = await supabase.from('planos_assinatura').select('*').eq('id', planoId).maybeSingle();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return (data as PlanoAssinaturaRow) ?? null;
}

async function buscarOverride(clienteId: string): Promise<AssinaturaLimitesOverrideRow | null> {
  const { data, error } = await supabase
    .from('assinatura_limites_override')
    .select('*')
    .eq('cliente_id', clienteId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return (data as AssinaturaLimitesOverrideRow) ?? null;
}

async function buscarHistoricoFaturas(clienteId: string): Promise<HistoricoFaturaRow[]> {
  const { data, error } = await supabase
    .from('historico_faturas')
    .select('*')
    .eq('cliente_id', clienteId)
    .limit(120);

  if (error) throw new Error(error.message);
  return sortHistorico((data ?? []) as HistoricoFaturaRow[]);
}

export async function montarVisaoCliente(clienteId: string, base?: ClienteAzoupRow): Promise<ClienteAzoupAdminView> {
  let cliente = base ?? null;
  if (!cliente) {
    const { data, error } = await supabase.from('clientes_azoup').select('*').eq('id', clienteId).single();
    if (error) throw new Error(error.message);
    cliente = data as ClienteAzoupRow;
  }

  const assinatura = await buscarAssinaturaRecente(clienteId);
  const plano = await buscarPlano(assinatura?.plano_id);
  const limites_override = await buscarOverride(clienteId);
  const historico_faturas = await buscarHistoricoFaturas(clienteId);

  const inicioAssinatura = safeParseIso(assinatura?.data_inicio ?? undefined);
  const dias_como_assinante = inicioAssinatura ? differenceInCalendarDays(new Date(), inicioAssinatura) : 0;

  const cobrancas_falhas = historico_faturas.filter((h) => h.status === 'falhou').length;

  const mesesAbertos = new Set<string>();
  for (const h of historico_faturas) {
    if (h.status === 'aberto' || h.status === 'falhou') {
      const m = mesReferencia(h);
      if (m) mesesAbertos.add(m);
    }
  }

  return {
    ...cliente,
    assinatura,
    plano,
    limites_override,
    historico_faturas,
    dias_como_assinante,
    meses_em_aberto: [...mesesAbertos].sort(),
    cobrancas_falhas,
  };
}

export type LimitesEffectivos = {
  usuarios: number | null;
  empresas: number | null;
  armazenamento_gb: number | null;
  tokens_ia_mes: number | null;
};

const GB_COLUMN_CANDIDATES = [
  'limite_armazenamento_gb',
  'limite_storage_gb',
  'limite_gb',
  'armazenamento_gb_limite',
  'limite_armazenamento',
  'quota_storage_gb',
] as const;

function firstNumericFromKeys(r: Record<string, unknown> | null, keys: readonly string[]): number | null {
  if (!r) return null;
  for (const k of keys) {
    const v = r[k];
    if (v != null && typeof v === 'number' && !Number.isNaN(v)) return v as number;
  }
  return null;
}

export function resolverLimitesEfetivos(view: ClienteAzoupAdminView): LimitesEffectivos {
  const plano = view.plano;
  const ov = view.limites_override;
  const a = view.assinatura;
  const ovRec = (ov ?? null) as unknown as Record<string, unknown> | null;
  const planoRec = (plano ?? null) as unknown as Record<string, unknown> | null;

  const usuAdic =
    typeof a?.usuarios_adicionais === 'number' && !Number.isNaN(a.usuarios_adicionais)
      ? a.usuarios_adicionais
      : typeof a?.usuarios_extras === 'number' && !Number.isNaN(a.usuarios_extras)
        ? a.usuarios_extras
        : null;
  const empAdic =
    typeof a?.empresas_adicionais === 'number' && !Number.isNaN(a.empresas_adicionais)
      ? a.empresas_adicionais
      : typeof a?.empresas_extras === 'number' && !Number.isNaN(a.empresas_extras)
        ? a.empresas_extras
        : null;

  const tokenFrom = (r: Record<string, unknown> | null) =>
    (r?.limite_tokens_ia_mes as number | null | undefined) ??
    (r?.limite_tokens_mes as number | null | undefined) ??
    (r?.limite_ia_tokens_mes as number | null | undefined) ??
    (r?.limite_tokens as number | null | undefined) ??
    (r?.quota_tokens_ia_mes as number | null | undefined) ??
    null;

  return {
    usuarios: ov?.limite_usuarios ?? plano?.limite_usuarios ?? usuAdic,
    empresas: ov?.limite_empresas ?? plano?.limite_empresas ?? empAdic,
    armazenamento_gb:
      firstNumericFromKeys(ovRec, GB_COLUMN_CANDIDATES) ??
      firstNumericFromKeys(planoRec, GB_COLUMN_CANDIDATES) ??
      ov?.limite_armazenamento_gb ??
      plano?.limite_armazenamento_gb ??
      null,
    /** Limite mensal IA em assinatura (`credito_ia_limite_mensal`) ou override/plano. O campo de formulário “somar” usa `credito_ia_extra`. */
    tokens_ia_mes:
      tokenFrom(ovRec) ??
      tokenFrom(planoRec) ??
      ov?.limite_tokens_ia_mes ??
      plano?.limite_tokens_ia_mes ??
      (typeof a?.credito_ia_limite_mensal === 'number' && !Number.isNaN(a.credito_ia_limite_mensal) ? a.credito_ia_limite_mensal : null) ??
      null,
  };
}

function formatSupabaseWriteError(err: { message: string; details?: string; hint?: string; code?: string }) {
  return [err.message, err.details, err.hint, err.code && `(${err.code})`].filter(Boolean).join(' — ');
}

/** Nome de coluna presente em `row` entre candidatos, ou null se nenhuma existir. */
function pickColFromRow(row: Record<string, unknown> | null, candidates: string[]): string | null {
  if (!row) return null;
  const hit = candidates.find((c) => Object.prototype.hasOwnProperty.call(row, c));
  return hit ?? null;
}

/**
 * Monta payload só com colunas que existem na linha atual (evita PGRST204 ao usar fallback
 * que não existe na tabela, ex.: `limite_armazenamento_gb`).
 */
function buildLimitsPayload(
  anteriorRow: Record<string, unknown> | null,
  valores: LimitesEffectivos,
): Record<string, unknown> {
  if (!anteriorRow) return {};

  const usersCol = pickColFromRow(anteriorRow, ['limite_usuarios', 'max_usuarios', 'usuarios_limite']);
  const empsCol = pickColFromRow(anteriorRow, ['limite_empresas', 'max_empresas', 'empresas_limite']);
  const gbCol = pickColFromRow(anteriorRow, [...GB_COLUMN_CANDIDATES]);
  const tokCol = pickColFromRow(anteriorRow, [
    'limite_tokens_ia_mes',
    'limite_tokens_mes',
    'limite_ia_tokens_mes',
    'limite_tokens',
    'tokens_limite_mes',
    'quota_tokens_ia_mes',
  ]);

  const out: Record<string, unknown> = {};
  if (usersCol) out[usersCol] = valores.usuarios;
  if (empsCol) out[empsCol] = valores.empresas;
  if (gbCol) out[gbCol] = valores.armazenamento_gb;
  if (tokCol) out[tokCol] = valores.tokens_ia_mes;
  return out;
}

function isUnknownColumnError(msg: string, col: string): boolean {
  const m = msg.toLowerCase();
  const c = col.toLowerCase();
  return (
    (m.includes('could not find') && m.includes(c)) ||
    (m.includes('column') && m.includes(c) && (m.includes('does not exist') || m.includes('schema cache')))
  );
}

const INSERT_BASE_COLS_FOR_UNKNOWN_CHECK = [
  'limite_usuarios',
  'limite_empresas',
  ...GB_COLUMN_CANDIDATES,
] as const;

function isUnknownColumnForAnyInsertBase(msg: string): boolean {
  return INSERT_BASE_COLS_FOR_UNKNOWN_CHECK.some((c) => isUnknownColumnError(msg, c));
}

function isUnknownGbColumn(msg: string, gbKey: string): boolean {
  return isUnknownColumnError(msg, gbKey);
}

/** Linha de insert: não envia chaves com valor null (evita 400 em NOT NULL / defaults do Postgres). */
function buildInsertRowPartial(
  clienteId: string,
  valores: LimitesEffectivos,
  tokKey: string,
  includeNamedBaseLimits: boolean,
  gbColumnName: string | null,
): Record<string, unknown> {
  const row: Record<string, unknown> = { cliente_id: clienteId };
  if (includeNamedBaseLimits) {
    if (valores.usuarios !== null) row.limite_usuarios = valores.usuarios;
    if (valores.empresas !== null) row.limite_empresas = valores.empresas;
    if (valores.armazenamento_gb !== null && gbColumnName) row[gbColumnName] = valores.armazenamento_gb;
  }
  if (valores.tokens_ia_mes !== null) row[tokKey] = valores.tokens_ia_mes;
  return row;
}

async function insertLimitesOverrideWithFallbacks(
  clienteId: string,
  valores: LimitesEffectivos,
): Promise<{ data: AssinaturaLimitesOverrideRow; error: null } | { data: null; error: { message: string; code?: string; details?: string; hint?: string } }> {
  const tokenVariants = [
    'limite_tokens_ia_mes',
    'limite_tokens_mes',
    'limite_ia_tokens_mes',
    'limite_tokens',
    'tokens_limite_mes',
    'quota_tokens_ia_mes',
  ];

  const gbVariantsForInsert =
    valores.armazenamento_gb !== null ? [...GB_COLUMN_CANDIDATES] : [null as string | null];

  let lastErr: { message: string; code?: string; details?: string; hint?: string } | null = null;

  nextTok: for (const tokKey of tokenVariants) {
    nextInclude: for (const includeBase of [true, false] as const) {
      const gbIterations = includeBase && valores.armazenamento_gb !== null ? gbVariantsForInsert : [null];

      for (const gbKey of gbIterations) {
        const insertRow = buildInsertRowPartial(clienteId, valores, tokKey, includeBase, gbKey);
        if (Object.keys(insertRow).length <= 1) {
          if (!includeBase) break nextInclude;
          continue;
        }

        const { data, error } = await supabase.from('assinatura_limites_override').insert(insertRow as never).select('*').single();

        if (!error && data) {
          return { data: data as AssinaturaLimitesOverrideRow, error: null };
        }
        if (error) {
          lastErr = error;
          const msg = formatSupabaseWriteError(error);
          if (isUnknownColumnError(msg, tokKey)) continue nextTok;
          if (gbKey && isUnknownGbColumn(msg, gbKey)) continue;
          if (includeBase && isUnknownColumnForAnyInsertBase(msg)) continue nextInclude;
          return { data: null, error };
        }
        lastErr = { message: 'Inserção concluída sem retorno de linha.' };
      }
    }
  }

  return { data: null, error: lastErr ?? { message: 'Falha ao inserir override' } };
}

function assertLimitesNumericos(v: LimitesEffectivos) {
  const entries: [string, number | null][] = [
    ['usuários', v.usuarios],
    ['empresas', v.empresas],
    ['armazenamento (GB)', v.armazenamento_gb],
    ['valor em tokens / créditos extra', v.tokens_ia_mes],
  ];
  for (const [label, n] of entries) {
    if (n === null) continue;
    if (typeof n !== 'number' || Number.isNaN(n)) {
      throw new Error(`Valor inválido em ${label}. Use apenas números ou deixe em branco.`);
    }
    if (n < 0) {
      throw new Error(`${label} não pode ser negativo.`);
    }
  }
}

/**
 * Grava em `assinaturas_clientes` (assinatura mais recente do cliente):
 * - `credito_ia_extra`: soma `tokens_ia_mes` (incremento).
 * - `usuarios_adicionais` / `empresas_adicionais`: valor absoluto quando preenchidos.
 */
async function persistLimitesEmAssinaturaCliente(
  clienteId: string,
  valores: LimitesEffectivos,
): Promise<{ data: AssinaturaClienteRow; error: null } | { data: null; error: { message: string; details?: string; hint?: string; code?: string } }> {
  const { data: cur, error: eSel } = await supabase
    .from('assinaturas_clientes')
    .select('id, credito_ia_extra, usuarios_adicionais, empresas_adicionais')
    .eq('cliente_id', clienteId)
    .order('data_inicio', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (eSel) return { data: null, error: eSel };
  if (!cur) {
    return {
      data: null,
      error: {
        message:
          'Nenhuma linha em assinaturas_clientes para este cliente. Crie a assinatura ou confira RLS de SELECT.',
        code: 'ASSINATURA_NAO_ENCONTRADA',
      },
    };
  }

  const patch: Record<string, unknown> = {};
  if (valores.tokens_ia_mes !== null) {
    const baseRaw = cur.credito_ia_extra;
    const base = typeof baseRaw === 'number' && !Number.isNaN(baseRaw) ? baseRaw : 0;
    patch.credito_ia_extra = base + Math.trunc(valores.tokens_ia_mes);
  }
  if (valores.usuarios !== null) {
    patch.usuarios_adicionais = Math.trunc(valores.usuarios);
  }
  if (valores.empresas !== null) {
    patch.empresas_adicionais = Math.trunc(valores.empresas);
  }

  if (Object.keys(patch).length === 0) {
    return {
      data: null,
      error: {
        message:
          'Nada para gravar em assinaturas_clientes: incremento em credito_ia_extra, ou absolutos em usuarios_adicionais / empresas_adicionais. Armazenamento (GB) não está nesta tabela.',
      },
    };
  }

  const { data, error } = await supabase
    .from('assinaturas_clientes')
    .update(patch as never)
    .eq('id', cur.id)
    .select('*')
    .maybeSingle();

  if (error) return { data: null, error };

  if (!data) {
    return {
      data: null,
      error: {
        message:
          'UPDATE em assinaturas_clientes não retornou linha (RLS bloqueando UPDATE/SELECT, ou id de assinatura inválido).',
        code: 'UPDATE_SEM_LINHA',
      },
    };
  }

  return { data: data as AssinaturaClienteRow, error: null };
}

export type UpsertLimitesOverrideResult = {
  novo: AssinaturaLimitesOverrideRow | null;
  anterior: AssinaturaLimitesOverrideRow | null;
  persistidoEmAssinaturaCliente: boolean;
  assinaturaAtualizada?: AssinaturaClienteRow | null;
};

/**
 * Persiste override de limites. Envia apenas colunas previstas no mapa Azoup
 * (evita 400 por colunas inexistentes como atualizado_por_admin_id / motivo).
 * Se `assinatura_limites_override` não aplicar ao schema, grava em `assinaturas_clientes`:
 * soma em `credito_ia_extra`, absolutos em `usuarios_adicionais` / `empresas_adicionais`.
 */
export async function upsertLimitesOverride(params: {
  clienteId: string;
  adminUserId?: string;
  valores: LimitesEffectivos;
  motivo?: string;
}): Promise<UpsertLimitesOverrideResult> {
  assertLimitesNumericos(params.valores);

  const anterior = await buscarOverride(params.clienteId);
  const anteriorRec = anterior ? (anterior as unknown as Record<string, unknown>) : null;

  /** Sem linha em override: tenta primeiro `assinaturas_clientes` (assinatura atual) para evitar POST inútil em override. */
  const persistirAssinaturaSemOverride =
    !anterior?.id &&
    (params.valores.tokens_ia_mes !== null ||
      params.valores.usuarios !== null ||
      params.valores.empresas !== null) &&
    params.valores.armazenamento_gb === null;

  if (persistirAssinaturaSemOverride) {
    const fbPrimeiro = await persistLimitesEmAssinaturaCliente(params.clienteId, params.valores);
    if (fbPrimeiro.data) {
      return {
        novo: null,
        anterior: null,
        persistidoEmAssinaturaCliente: true,
        assinaturaAtualizada: fbPrimeiro.data,
      };
    }
  }

  if (anterior?.id) {
    const limitsOnly = buildLimitsPayload(anteriorRec!, params.valores);
    if (Object.keys(limitsOnly).length === 0) {
      const fb = await persistLimitesEmAssinaturaCliente(params.clienteId, params.valores);
      if (fb.data) {
        return {
          novo: null,
          anterior,
          persistidoEmAssinaturaCliente: true,
          assinaturaAtualizada: fb.data,
        };
      }
      throw new Error(
        `Nenhuma coluna de limite reconhecida em assinatura_limites_override para este registro. Fallback assinaturas_clientes: ${fb.error ? formatSupabaseWriteError(fb.error) : 'indisponível.'}`,
      );
    }
    const { data, error } = await supabase
      .from('assinatura_limites_override')
      .update(limitsOnly as never)
      .eq('id', anterior.id)
      .select('*')
      .single();
    if (error) throw new Error(formatSupabaseWriteError(error));
    return { novo: data as AssinaturaLimitesOverrideRow, anterior, persistidoEmAssinaturaCliente: false };
  }

  const inserted = await insertLimitesOverrideWithFallbacks(params.clienteId, params.valores);
  if (inserted.data) {
    return { novo: inserted.data, anterior, persistidoEmAssinaturaCliente: false };
  }

  const msg = formatSupabaseWriteError(inserted.error ?? { message: 'Erro desconhecido' });
  if (
    inserted.error?.code === '23505' ||
    msg.toLowerCase().includes('duplicate') ||
    msg.toLowerCase().includes('unique')
  ) {
    const existing = await buscarOverride(params.clienteId);
    const rec = existing ? (existing as unknown as Record<string, unknown>) : null;
    if (!rec) throw new Error(msg);
    const limUpdate = buildLimitsPayload(rec, params.valores);
    if (Object.keys(limUpdate).length === 0) {
      const fb = await persistLimitesEmAssinaturaCliente(params.clienteId, params.valores);
      if (fb.data) {
        return {
          novo: null,
          anterior: existing,
          persistidoEmAssinaturaCliente: true,
          assinaturaAtualizada: fb.data,
        };
      }
      throw new Error(
        `Nenhuma coluna de limite reconhecida após duplicidade em assinatura_limites_override. Fallback assinaturas_clientes: ${fb.error ? formatSupabaseWriteError(fb.error) : 'indisponível.'}`,
      );
    }
    const { data: row2, error: e2 } = await supabase
      .from('assinatura_limites_override')
      .update(limUpdate as never)
      .eq('cliente_id', params.clienteId)
      .select('*')
      .maybeSingle();
    if (e2) throw new Error(formatSupabaseWriteError(e2));
    if (!row2) throw new Error(msg);
    return { novo: row2 as AssinaturaLimitesOverrideRow, anterior, persistidoEmAssinaturaCliente: false };
  }

  const fb = await persistLimitesEmAssinaturaCliente(params.clienteId, params.valores);
  if (fb.data) {
    return {
      novo: null,
      anterior,
      persistidoEmAssinaturaCliente: true,
      assinaturaAtualizada: fb.data,
    };
  }

  const extra = fb.error ? ` — Fallback assinaturas_clientes: ${formatSupabaseWriteError(fb.error)}` : '';
  throw new Error(`${msg}${extra}`);
}
