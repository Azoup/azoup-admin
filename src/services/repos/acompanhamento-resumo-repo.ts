import { supabase } from '@/src/lib/supabase';
import { obterResumoUsoClienteViaFunction } from '@/src/services/stripe-admin-api';
import { dataCalendarioBrasil } from '@/src/utils/format';
import {
  CAMPOS_USO_POR_SECAO,
  RESUMO_SECOES,
  ehTreinouStatus,
  metricaVazia,
  normalizarPayload,
  payloadVazio,
  type MetricaUsoCampo,
  type ResumoPayload,
  type ResumoSecaoId,
  type ResumoUsoCampos,
  type TreinouStatus,
} from '@/src/utils/acompanhamento-resumo';

export type ResumoSnapshotRow = {
  id: string;
  cliente_id: string;
  payload: ResumoPayload;
  admin_email?: string | null;
  created_at: string;
};

function erroTabela(message: string): Error {
  if (/admin_cliente_resumo_snapshots|admin_cliente_resumo_treinou|schema cache|does not exist/i.test(message)) {
    return new Error('Execute supabase/sql/admin_cliente_resumo.sql no Supabase.');
  }
  return new Error(message);
}

export async function listarTreinouResumo(clienteId: string): Promise<Record<ResumoSecaoId, TreinouStatus>> {
  const base = Object.fromEntries(RESUMO_SECOES.map((s) => [s, 'nao_treinou' as TreinouStatus])) as Record<
    ResumoSecaoId,
    TreinouStatus
  >;
  if (!clienteId) return base;
  const { data, error } = await supabase
    .from('admin_cliente_resumo_treinou')
    .select('secao,status')
    .eq('cliente_id', clienteId);
  if (error) throw erroTabela(error.message);
  for (const row of data ?? []) {
    const secao = `${(row as { secao?: string }).secao ?? ''}`.trim() as ResumoSecaoId;
    const status = `${(row as { status?: string }).status ?? ''}`.trim();
    if (RESUMO_SECOES.includes(secao) && ehTreinouStatus(status)) {
      base[secao] = status;
    }
  }
  return base;
}

export async function salvarTreinouResumo(params: {
  clienteId: string;
  secao: ResumoSecaoId;
  status: TreinouStatus;
  adminEmail?: string | null;
}): Promise<void> {
  if (!params.clienteId) throw new Error('Cliente inválido.');
  if (!RESUMO_SECOES.includes(params.secao)) throw new Error('Seção inválida.');
  if (!ehTreinouStatus(params.status)) throw new Error('Status inválido.');
  const { error } = await supabase.from('admin_cliente_resumo_treinou').upsert(
    {
      cliente_id: params.clienteId,
      secao: params.secao,
      status: params.status,
      admin_email: params.adminEmail?.trim() || null,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: 'cliente_id,secao' },
  );
  if (error) throw erroTabela(error.message);
}

/** Uso ao vivo do banco (edge function com fallback local). */
export async function carregarUsoResumo(
  clienteId: string,
): Promise<Partial<Record<ResumoSecaoId, ResumoUsoCampos>>> {
  return sugerirMetricasResumoUso(clienteId);
}

export async function listarSnapshotsResumo(clienteId: string): Promise<ResumoSnapshotRow[]> {
  if (!clienteId) return [];
  const { data, error } = await supabase
    .from('admin_cliente_resumo_snapshots')
    .select('id,cliente_id,payload,admin_email,created_at')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw erroTabela(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: `${row.id}`,
    cliente_id: `${row.cliente_id}`,
    payload: normalizarPayload(row.payload),
    admin_email: (row.admin_email as string | null) ?? null,
    created_at: `${row.created_at ?? ''}`,
  }));
}

export async function obterUltimoSnapshotResumo(clienteId: string): Promise<ResumoSnapshotRow | null> {
  const lista = await listarSnapshotsResumo(clienteId);
  return lista[0] ?? null;
}

export async function salvarSnapshotResumo(params: {
  clienteId: string;
  payload: ResumoPayload;
  adminEmail?: string | null;
}): Promise<ResumoSnapshotRow> {
  if (!params.clienteId) throw new Error('Cliente inválido.');
  const payload = normalizarPayload(params.payload);
  const { data, error } = await supabase
    .from('admin_cliente_resumo_snapshots')
    .insert({
      cliente_id: params.clienteId,
      payload,
      admin_email: params.adminEmail?.trim() || null,
    } as never)
    .select('id,cliente_id,payload,admin_email,created_at')
    .single();
  if (error) throw erroTabela(error.message);
  if (!data) throw new Error('Não foi possível salvar o resumo.');
  const row = data as Record<string, unknown>;
  return {
    id: `${row.id}`,
    cliente_id: `${row.cliente_id}`,
    payload: normalizarPayload(row.payload),
    admin_email: (row.admin_email as string | null) ?? null,
    created_at: `${row.created_at ?? ''}`,
  };
}

async function contarEUltimaData(params: {
  tabela: string;
  campoCliente: string;
  clienteId: string;
  campoData?: string;
}): Promise<MetricaUsoCampo> {
  const campoData = params.campoData ?? 'created_at';
  const [countRes, lastRes] = await Promise.all([
    supabase
      .from(params.tabela)
      .select('id', { count: 'exact', head: true })
      .eq(params.campoCliente, params.clienteId),
    supabase
      .from(params.tabela)
      .select(campoData)
      .eq(params.campoCliente, params.clienteId)
      .order(campoData, { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (countRes.error) return metricaVazia();
  const raw = lastRes.data ? (lastRes.data as Record<string, unknown>)[campoData] : null;
  return {
    quantidade: countRes.count ?? 0,
    ultima_data: dataCalendarioBrasil(raw as string | null),
  };
}

/** Prefill local (fallback). Preferir edge function com service role. */
async function sugerirMetricasLocal(clienteId: string): Promise<Partial<Record<ResumoSecaoId, ResumoUsoCampos>>> {
  const [
    clientes,
    fornecedores,
    produtos,
    tecidos,
    aviamentos,
    vendas,
    notas,
    ops,
    cr,
    cp,
    mov,
  ] = await Promise.all([
    contarEUltimaData({ tabela: 'clientes_cadastros', campoCliente: 'cliente_id', clienteId }),
    contarEUltimaData({ tabela: 'fornecedores_cadastros', campoCliente: 'cliente_id', clienteId }),
    contarEUltimaData({ tabela: 'produtos', campoCliente: 'cliente_id', clienteId }),
    contarEUltimaData({ tabela: 'tecidos', campoCliente: 'cliente_id', clienteId }),
    contarEUltimaData({ tabela: 'aviamentos', campoCliente: 'cliente_id', clienteId }),
    contarEUltimaData({ tabela: 'venda', campoCliente: 'cliente_id_tenant', clienteId }),
    contarEUltimaData({ tabela: 'nota_fiscal', campoCliente: 'cliente_id_tenant', clienteId }),
    contarEUltimaData({ tabela: 'producao_op', campoCliente: 'cliente_id_tenant', clienteId }),
    contarEUltimaData({ tabela: 'contas_receber', campoCliente: 'cliente_id_tenant', clienteId }),
    contarEUltimaData({ tabela: 'contas_pagar', campoCliente: 'cliente_id_tenant', clienteId }),
    contarEUltimaData({
      tabela: 'estoque_movimentacao',
      campoCliente: 'cliente_id_tenant',
      clienteId,
      campoData: 'data_movimentacao',
    }),
  ]);

  return {
    cadastros: { clientes, fornecedores, produtos, tecidos, aviamentos },
    vendas: { vendas, notas_fiscais: notas },
    producao: { ops },
    financeiro: { contas_receber: cr, contas_pagar: cp },
    estoque: { movimentacoes: mov },
    pdv: {},
  };
}

export async function sugerirMetricasResumoUso(
  clienteId: string,
): Promise<Partial<Record<ResumoSecaoId, ResumoUsoCampos>>> {
  if (!clienteId) return {};
  try {
    const res = await obterResumoUsoClienteViaFunction({ cliente_id: clienteId });
    return res.uso ?? {};
  } catch {
    return sugerirMetricasLocal(clienteId);
  }
}

/** Monta payload inicial do formulário: último snapshot ou vazio + sugestões de uso. */
export async function montarPayloadFormularioResumo(clienteId: string): Promise<{
  payload: ResumoPayload;
  sugerido: boolean;
}> {
  const ultimo = await obterUltimoSnapshotResumo(clienteId).catch(() => null);
  if (ultimo) return { payload: ultimo.payload, sugerido: false };

  const base = payloadVazio();
  const sugestao = await sugerirMetricasResumoUso(clienteId).catch(() => ({}));
  for (const secao of Object.keys(CAMPOS_USO_POR_SECAO) as ResumoSecaoId[]) {
    const usoSug = sugestao[secao];
    if (!usoSug) continue;
    for (const campo of CAMPOS_USO_POR_SECAO[secao]) {
      const m = usoSug[campo.key];
      if (m) base[secao].uso[campo.key] = { ...m };
      else base[secao].uso[campo.key] = metricaVazia();
    }
  }
  return { payload: base, sugerido: true };
}
