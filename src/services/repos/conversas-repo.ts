import { supabase } from '@/src/lib/supabase';
import type { AdminClienteConversaRow, ClienteAzoupRow } from '@/src/types/azoup';
import { rotuloCliente } from '@/src/utils/cliente-label';

export type ClienteConversaComCliente = AdminClienteConversaRow & {
  cliente?: Pick<ClienteAzoupRow, 'id' | 'nome' | 'email' | 'telefone'> | null;
};

/** Colunas reais de `clientes_azoup` no schema Azoup (sem nome_fantasia/razao_social/celular). */
const CLIENTE_SELECT_COLS = 'id,nome,email,telefone,created_at';

async function buscarClientesPorIds(ids: string[]): Promise<Map<string, ClienteAzoupRow>> {
  const map = new Map<string, ClienteAzoupRow>();
  if (!ids.length) return map;

  const { data, error } = await supabase.from('clientes_azoup').select(CLIENTE_SELECT_COLS).in('id', ids);

  if (error) throw new Error(error.message);
  for (const c of (data ?? []) as ClienteAzoupRow[]) {
    map.set(c.id, c);
  }
  return map;
}

export async function listarClientesParaSelecao(): Promise<ClienteAzoupRow[]> {
  const { data, error } = await supabase
    .from('clientes_azoup')
    .select(CLIENTE_SELECT_COLS)
    .order('nome', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ClienteAzoupRow[];
}

/** Clientes distintos que já possuem ao menos uma conversa registrada. */
export async function listarClientesComConversas(): Promise<ClienteAzoupRow[]> {
  const { data, error } = await supabase.from('admin_cliente_conversas').select('cliente_id');

  if (error) throw new Error(error.message);

  const ids = [...new Set((data ?? []).map((r) => (r as { cliente_id: string }).cliente_id).filter(Boolean))];
  if (!ids.length) return [];

  const map = await buscarClientesPorIds(ids);
  return ids
    .map((id) => map.get(id))
    .filter((c): c is ClienteAzoupRow => Boolean(c))
    .sort((a, b) => rotuloCliente(a).localeCompare(rotuloCliente(b), 'pt-BR'));
}

export async function listarConversasClientes(params?: {
  clienteId?: string | null;
  limit?: number;
}): Promise<ClienteConversaComCliente[]> {
  let query = supabase
    .from('admin_cliente_conversas')
    .select('id,cliente_id,data_conversa,descricao,admin_email,created_at')
    .order('data_conversa', { ascending: false })
    .limit(params?.limit ?? 200);

  if (params?.clienteId) {
    query = query.eq('cliente_id', params.clienteId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as AdminClienteConversaRow[];
  const clienteIds = [...new Set(rows.map((r) => r.cliente_id))];
  const clientesMap = await buscarClientesPorIds(clienteIds);

  return rows.map((row) => ({
    ...row,
    cliente: clientesMap.get(row.cliente_id) ?? null,
  }));
}

export async function criarConversaCliente(params: {
  clienteId: string;
  dataConversa: string;
  descricao: string;
  adminEmail?: string | null;
}): Promise<AdminClienteConversaRow> {
  const descricao = params.descricao.trim();
  if (!descricao) throw new Error('Descreva o que foi conversado com o cliente.');
  if (!params.clienteId) throw new Error('Selecione um cliente.');
  if (!params.dataConversa) throw new Error('Informe a data da conversa.');

  const { data, error } = await supabase
    .from('admin_cliente_conversas')
    .insert({
      cliente_id: params.clienteId,
      data_conversa: params.dataConversa,
      descricao,
      admin_email: params.adminEmail ?? null,
    } as never)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as AdminClienteConversaRow;
}

export function rotuloClienteConversa(row: ClienteConversaComCliente): string {
  if (row.cliente) return rotuloCliente(row.cliente);
  return `Cliente ${row.cliente_id.slice(0, 8)}`;
}
