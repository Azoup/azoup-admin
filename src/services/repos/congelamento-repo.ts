import { supabase } from '@/src/lib/supabase';
import type { AdminClienteCongelamentoHistoricoRow, AdminClienteCongelamentoRow } from '@/src/types/azoup';
import { dataHojeBrasil } from '@/src/utils/format';

const COLUNAS_CONGELAMENTO =
  'cliente_id,congelado,data_retorno,observacao,admin_email,congelado_em,updated_at,created_at';

const COLUNAS_HISTORICO =
  'id,cliente_id,congelado_em,descongelado_em,data_retorno,observacao,admin_email_congelou,admin_email_descongelou,created_at';

export async function listarCongelamentosClientes(
  clienteIds: string[],
): Promise<Map<string, AdminClienteCongelamentoRow>> {
  const map = new Map<string, AdminClienteCongelamentoRow>();
  if (!clienteIds.length) return map;

  const { data, error } = await supabase
    .from('admin_cliente_congelamento')
    .select(COLUNAS_CONGELAMENTO)
    .in('cliente_id', clienteIds);

  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as AdminClienteCongelamentoRow[]) {
    map.set(row.cliente_id, row);
  }
  return map;
}

export async function buscarCongelamentoCliente(
  clienteId: string,
): Promise<AdminClienteCongelamentoRow | null> {
  const { data, error } = await supabase
    .from('admin_cliente_congelamento')
    .select(COLUNAS_CONGELAMENTO)
    .eq('cliente_id', clienteId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as AdminClienteCongelamentoRow | null) ?? null;
}

export async function listarHistoricoCongelamento(
  clienteId: string,
): Promise<AdminClienteCongelamentoHistoricoRow[]> {
  const { data, error } = await supabase
    .from('admin_cliente_congelamento_historico')
    .select(COLUNAS_HISTORICO)
    .eq('cliente_id', clienteId)
    .order('descongelado_em', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as AdminClienteCongelamentoHistoricoRow[];
}

function inicioPeriodoCongelado(atual: AdminClienteCongelamentoRow | null): string {
  return atual?.congelado_em || atual?.updated_at || atual?.created_at || new Date().toISOString();
}

export async function congelarCliente(params: {
  clienteId: string;
  dataRetorno: string;
  observacao?: string | null;
  adminEmail?: string | null;
}): Promise<AdminClienteCongelamentoRow> {
  const dataRetorno = params.dataRetorno.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRetorno)) {
    throw new Error('Informe a data para chamar novamente (AAAA-MM-DD).');
  }

  const atual = await buscarCongelamentoCliente(params.clienteId).catch(() => null);
  const agora = new Date().toISOString();
  const congeladoEm = atual?.congelado ? inicioPeriodoCongelado(atual) : agora;

  const { data, error } = await supabase
    .from('admin_cliente_congelamento')
    .upsert(
      {
        cliente_id: params.clienteId,
        congelado: true,
        data_retorno: dataRetorno,
        observacao: params.observacao?.trim() || null,
        admin_email: params.adminEmail ?? null,
        congelado_em: congeladoEm,
        updated_at: agora,
      } as never,
      { onConflict: 'cliente_id' },
    )
    .select(COLUNAS_CONGELAMENTO)
    .single();

  if (error) throw new Error(error.message);
  return data as AdminClienteCongelamentoRow;
}

export async function descongelarCliente(params: {
  clienteId: string;
  adminEmail?: string | null;
}): Promise<AdminClienteCongelamentoRow> {
  const atual = await buscarCongelamentoCliente(params.clienteId).catch(() => null);
  const agora = new Date().toISOString();

  if (atual?.congelado) {
    const { error: histErro } = await supabase.from('admin_cliente_congelamento_historico').insert({
      cliente_id: params.clienteId,
      congelado_em: inicioPeriodoCongelado(atual),
      descongelado_em: agora,
      data_retorno: atual.data_retorno ?? null,
      observacao: atual.observacao ?? null,
      admin_email_congelou: atual.admin_email ?? null,
      admin_email_descongelou: params.adminEmail ?? null,
    } as never);
    if (histErro) throw new Error(histErro.message);
  }

  const { data, error } = await supabase
    .from('admin_cliente_congelamento')
    .upsert(
      {
        cliente_id: params.clienteId,
        congelado: false,
        data_retorno: null,
        observacao: null,
        admin_email: params.adminEmail ?? null,
        congelado_em: null,
        updated_at: agora,
      } as never,
      { onConflict: 'cliente_id' },
    )
    .select(COLUNAS_CONGELAMENTO)
    .single();

  if (error) throw new Error(error.message);
  return data as AdminClienteCongelamentoRow;
}

export function clienteCongelado(row?: AdminClienteCongelamentoRow | null): boolean {
  return Boolean(row?.congelado);
}

/** Cliente congelado com data_retorno <= hoje (precisa ser chamado). */
export function clientePrecisaChamar(row?: AdminClienteCongelamentoRow | null): boolean {
  if (!row?.congelado || !row.data_retorno) return false;
  return `${row.data_retorno}`.slice(0, 10) <= dataHojeBrasil();
}
