import { supabase } from '@/src/lib/supabase';
import type { AdminClienteCongelamentoRow } from '@/src/types/azoup';
import { dataHojeBrasil } from '@/src/utils/format';

export async function listarCongelamentosClientes(
  clienteIds: string[],
): Promise<Map<string, AdminClienteCongelamentoRow>> {
  const map = new Map<string, AdminClienteCongelamentoRow>();
  if (!clienteIds.length) return map;

  const { data, error } = await supabase
    .from('admin_cliente_congelamento')
    .select('cliente_id,congelado,data_retorno,observacao,admin_email,updated_at,created_at')
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
    .select('cliente_id,congelado,data_retorno,observacao,admin_email,updated_at,created_at')
    .eq('cliente_id', clienteId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as AdminClienteCongelamentoRow | null) ?? null;
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

  const { data, error } = await supabase
    .from('admin_cliente_congelamento')
    .upsert(
      {
        cliente_id: params.clienteId,
        congelado: true,
        data_retorno: dataRetorno,
        observacao: params.observacao?.trim() || null,
        admin_email: params.adminEmail ?? null,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: 'cliente_id' },
    )
    .select('cliente_id,congelado,data_retorno,observacao,admin_email,updated_at,created_at')
    .single();

  if (error) throw new Error(error.message);
  return data as AdminClienteCongelamentoRow;
}

export async function descongelarCliente(params: {
  clienteId: string;
  adminEmail?: string | null;
}): Promise<AdminClienteCongelamentoRow> {
  const { data, error } = await supabase
    .from('admin_cliente_congelamento')
    .upsert(
      {
        cliente_id: params.clienteId,
        congelado: false,
        data_retorno: null,
        observacao: null,
        admin_email: params.adminEmail ?? null,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: 'cliente_id' },
    )
    .select('cliente_id,congelado,data_retorno,observacao,admin_email,updated_at,created_at')
    .single();

  if (error) throw new Error(error.message);
  return data as AdminClienteCongelamentoRow;
}

/** Cliente congelado com data_retorno <= hoje (precisa ser chamado). */
export function clientePrecisaChamar(row?: AdminClienteCongelamentoRow | null): boolean {
  if (!row?.congelado || !row.data_retorno) return false;
  return `${row.data_retorno}`.slice(0, 10) <= dataHojeBrasil();
}
