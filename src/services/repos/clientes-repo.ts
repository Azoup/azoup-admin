import { differenceInCalendarDays, parseISO } from 'date-fns';

import { supabase } from '@/src/lib/supabase';
import { obterMetricasClienteViaFunction } from '@/src/services/stripe-admin-api';
import { prioridadeAssinatura } from '@/src/utils/assinatura-status';
import type {
  AssinaturaClienteRow,
  AssinaturaLimitesOverrideRow,
  ClienteAzoupAdminView,
  ClienteAzoupRow,
  ClienteMetricasUso,
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
  return (
    [...rows].sort((a, b) => {
      const pa = prioridadeAssinatura(a);
      const pb = prioridadeAssinatura(b);
      if (pb !== pa) return pb - pa;
      const da = b.atualizado_em ?? b.data_inicio ?? b.criado_em ?? '';
      const db = a.atualizado_em ?? a.data_inicio ?? a.criado_em ?? '';
      return `${da}`.localeCompare(`${db}`);
    })[0] ?? null
  );
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

async function contarTabela(
  tabela: string,
  coluna: string,
  valor: string,
): Promise<number | null> {
  const { count, error } = await supabase
    .from(tabela)
    .select('id', { count: 'exact', head: true })
    .eq(coluna, valor);

  if (error) return null;
  return count ?? 0;
}

async function buscarUltimaAtividadeLocal(clienteId: string): Promise<string | null> {
  const consultas = await Promise.all([
    supabase
      .from('venda')
      .select('updated_at,created_at')
      .eq('cliente_id_tenant', clienteId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('produtos')
      .select('updated_at,created_at')
      .eq('cliente_id', clienteId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('producao_op')
      .select('updated_at,created_at')
      .eq('cliente_id_tenant', clienteId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let melhor: string | null = null;
  for (const { data } of consultas) {
    const row = data as { updated_at?: string | null; created_at?: string | null } | null;
    const cand = row?.updated_at ?? row?.created_at ?? null;
    if (cand && (!melhor || cand > melhor)) melhor = cand;
  }
  return melhor;
}

/** Métricas de uso do tenant — Edge Function (service role) com fallback local. */
export async function buscarMetricasUsoCliente(clienteId: string): Promise<ClienteMetricasUso> {
  try {
    const res = await obterMetricasClienteViaFunction({ cliente_id: clienteId });
    return res.metricas;
  } catch {
    const [empresas, produtos, vendas, ops, ultimo] = await Promise.all([
      contarTabela('empresas', 'cliente_id', clienteId),
      contarTabela('produtos', 'cliente_id', clienteId),
      contarTabela('venda', 'cliente_id_tenant', clienteId),
      contarTabela('producao_op', 'cliente_id_tenant', clienteId),
      buscarUltimaAtividadeLocal(clienteId),
    ]);

    return {
      empresas_cadastradas: empresas,
      produtos_cadastrados: produtos,
      vendas,
      ordens_producao: ops,
      ultimo_acesso: ultimo,
      ultimo_acesso_fonte: ultimo ? 'atividade' : null,
    };
  }
}

export async function montarVisaoCliente(clienteId: string, base?: ClienteAzoupRow): Promise<ClienteAzoupAdminView> {
  let cliente = base ?? null;
  if (!cliente) {
    const { data, error } = await supabase.from('clientes_azoup').select('*').eq('id', clienteId).single();
    if (error) throw new Error(error.message);
    cliente = data as ClienteAzoupRow;
  }

  const [assinatura, limites_override, historico_faturas, metricas_uso] = await Promise.all([
    buscarAssinaturaRecente(clienteId),
    buscarOverride(clienteId),
    buscarHistoricoFaturas(clienteId),
    buscarMetricasUsoCliente(clienteId),
  ]);
  const plano = await buscarPlano(assinatura?.plano_id);

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
    metricas_uso,
  };
}

export type LimitesEffectivos = {
  /** Total efetivo (override absoluto ou plano + adicionais na assinatura). */
  usuarios: number | null;
  empresas: number | null;
  armazenamento_gb: number | null;
  /** Limite mensal IA — prioriza assinatura (`credito_ia_limite_mensal`). */
  tokens_ia_mes: number | null;
  plano_usuarios: number | null;
  plano_empresas: number | null;
  /** Teto do plano Enterprise (`limite_empresas_enterprise`). */
  limite_empresas_enterprise: number | null;
  usuarios_adicionais: number;
  empresas_adicionais: number;
  override_usuarios: number | null;
  override_empresas: number | null;
};

const USERS_COLUMN_CANDIDATES = [
  'usuarios_inclusos',
  'limite_usuarios',
  'max_usuarios',
  'usuarios_limite',
  'qtde_usuarios',
  'qtd_usuarios',
  'limite_usuario',
] as const;

const EMPRESAS_COLUMN_CANDIDATES = [
  'empresas_incluidas',
  'limite_empresas',
  'limite_empresas_enterprise',
  'max_empresas',
  'empresas_limite',
  'qtde_empresas',
  'qtd_empresas',
  'limite_empresa',
] as const;

const GB_COLUMN_CANDIDATES = [
  'limite_armazenamento_gb',
  'limite_storage_gb',
  'limite_gb',
  'armazenamento_gb_limite',
  'limite_armazenamento',
  'quota_storage_gb',
  'armazenamento_gb',
] as const;

const IA_TOKEN_COLUMN_CANDIDATES = [
  'credito_ia_mensal',
  'credito_ia_limite_mensal',
  'limite_tokens_ia_mes',
  'limite_tokens_mes',
  'limite_ia_tokens_mes',
  'limite_tokens',
  'quota_tokens_ia_mes',
  'tokens_limite_mes',
] as const;

function coerceNum(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function firstNumericFromKeys(r: Record<string, unknown> | null, keys: readonly string[]): number | null {
  if (!r) return null;
  for (const k of keys) {
    const n = coerceNum(r[k]);
    if (n != null) return n;
  }
  return null;
}

function totalComAdicionais(base: number | null, adicionais: number): number | null {
  if (base == null) return adicionais > 0 ? adicionais : null;
  return base + adicionais;
}

/** `empresas_incluidas` do plano — 0 é válido (Enterprise); ausente no row → default 1 (schema Azoup). */
function empresasIncluidasDoPlano(planoRec: Record<string, unknown> | null): number | null {
  if (!planoRec) return null;
  if (Object.prototype.hasOwnProperty.call(planoRec, 'empresas_incluidas')) {
    return coerceNum(planoRec.empresas_incluidas) ?? 0;
  }
  const alt = firstNumericFromKeys(
    planoRec,
    EMPRESAS_COLUMN_CANDIDATES.filter((c) => c !== 'empresas_incluidas' && c !== 'limite_empresas_enterprise'),
  );
  return alt ?? 1;
}

export function resolverLimitesEfetivos(view: ClienteAzoupAdminView): LimitesEffectivos {
  const plano = view.plano;
  const ov = view.limites_override;
  const a = view.assinatura;
  const ovRec = (ov ?? null) as unknown as Record<string, unknown> | null;
  const planoRec = (plano ?? null) as unknown as Record<string, unknown> | null;
  const assinRec = (a ?? null) as unknown as Record<string, unknown> | null;
  const clienteRec = view as unknown as Record<string, unknown>;

  const usuariosAdicionais =
    coerceNum(a?.usuarios_adicionais) ?? coerceNum(a?.usuarios_extras) ?? 0;
  const empresasAdicionais =
    coerceNum(a?.empresas_adicionais) ?? coerceNum(a?.empresas_extras) ?? 0;

  const overrideUsuarios =
    coerceNum(ov?.limite_usuarios) ?? firstNumericFromKeys(ovRec, USERS_COLUMN_CANDIDATES);
  const overrideEmpresas =
    coerceNum(ov?.limite_empresas) ?? firstNumericFromKeys(ovRec, EMPRESAS_COLUMN_CANDIDATES);

  const planoUsuarios =
    firstNumericFromKeys(planoRec, USERS_COLUMN_CANDIDATES) ??
    coerceNum(view.qtde_user) ??
    coerceNum(view.usuarios_extra) ??
    coerceNum(clienteRec.qtde_user) ??
    coerceNum(clienteRec.usuarios_extra);

  const planoEmpresas = empresasIncluidasDoPlano(planoRec);
  const limiteEmpresasEnterprise = coerceNum(planoRec?.limite_empresas_enterprise);

  const tokensAssinatura = coerceNum(a?.credito_ia_limite_mensal);

  const empresasLimiteContratado =
    overrideEmpresas ?? totalComAdicionais(planoEmpresas, empresasAdicionais);

  return {
    usuarios: overrideUsuarios ?? totalComAdicionais(planoUsuarios, usuariosAdicionais),
    empresas: empresasLimiteContratado,
    armazenamento_gb:
      firstNumericFromKeys(ovRec, GB_COLUMN_CANDIDATES) ??
      firstNumericFromKeys(planoRec, GB_COLUMN_CANDIDATES) ??
      firstNumericFromKeys(assinRec, GB_COLUMN_CANDIDATES) ??
      coerceNum(ov?.limite_armazenamento_gb) ??
      coerceNum(plano?.limite_armazenamento_gb) ??
      null,
    tokens_ia_mes:
      firstNumericFromKeys(ovRec, IA_TOKEN_COLUMN_CANDIDATES) ??
      firstNumericFromKeys(planoRec, IA_TOKEN_COLUMN_CANDIDATES) ??
      tokensAssinatura ??
      coerceNum(ov?.limite_tokens_ia_mes) ??
      coerceNum(plano?.limite_tokens_ia_mes) ??
      null,
    plano_usuarios: planoUsuarios,
    plano_empresas: planoEmpresas,
    limite_empresas_enterprise: limiteEmpresasEnterprise,
    usuarios_adicionais: usuariosAdicionais,
    empresas_adicionais: empresasAdicionais,
    override_usuarios: overrideUsuarios,
    override_empresas: overrideEmpresas,
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
