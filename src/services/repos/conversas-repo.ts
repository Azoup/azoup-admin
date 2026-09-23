import { supabase } from '@/src/lib/supabase';
import type { AdminClienteConversaRow, ClienteAzoupRow } from '@/src/types/azoup';
import { rotuloCliente } from '@/src/utils/cliente-label';
import { normalizarHorarioInput } from '@/src/utils/conversa-datetime';

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
  clienteIds?: string[] | null;
  limit?: number;
}): Promise<ClienteConversaComCliente[]> {
  let query = supabase
    .from('admin_cliente_conversas')
    .select('id,cliente_id,data_conversa,hora_conversa,descricao,admin_email,created_at')
    .order('data_conversa', { ascending: false })
    .order('hora_conversa', { ascending: false, nullsFirst: false })
    .limit(params?.limit ?? 200);

  const ids = (params?.clienteIds ?? []).map((id) => id.trim()).filter(Boolean);
  if (ids.length === 1) query = query.eq('cliente_id', ids[0]);
  else if (ids.length > 1) query = query.in('cliente_id', ids);
  else if (params?.clienteId) query = query.eq('cliente_id', params.clienteId);

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
  horaConversa?: string | null;
  descricao: string;
  adminEmail?: string | null;
}): Promise<AdminClienteConversaRow> {
  const descricao = params.descricao.trim();
  if (!descricao) throw new Error('Descreva o que foi conversado com o cliente.');
  if (!params.clienteId) throw new Error('Selecione um cliente.');
  if (!params.dataConversa) throw new Error('Informe a data da conversa.');

  const hora = params.horaConversa != null ? normalizarHorarioInput(params.horaConversa) : null;
  if (params.horaConversa?.trim() && !hora) {
    throw new Error('Horário inválido. Use o formato HH:MM (ex.: 14:30).');
  }

  const { data, error } = await supabase
    .from('admin_cliente_conversas')
    .insert({
      cliente_id: params.clienteId,
      data_conversa: params.dataConversa,
      hora_conversa: hora,
      descricao,
      admin_email: params.adminEmail ?? null,
    } as never)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as AdminClienteConversaRow;
}

function erroHistorico(message: string, tabela: string): string {
  if (/row-level security|permission denied|policy|0 rows|PGRST116|coerce the result/i.test(message)) {
    return `Execute de novo supabase/sql/${tabela}.sql no Supabase para liberar editar e excluir.`;
  }
  return message;
}

export async function atualizarConversaCliente(params: {
  id: string;
  dataConversa: string;
  horaConversa?: string | null;
  descricao: string;
}): Promise<void> {
  if (!params.id) throw new Error('Conversa inválida.');
  const descricao = params.descricao.trim();
  if (!descricao) throw new Error('Descreva o que foi conversado com o cliente.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.dataConversa.trim())) throw new Error('Informe a data da conversa.');
  const hora = params.horaConversa != null && params.horaConversa.trim() ? normalizarHorarioInput(params.horaConversa) : null;
  if (params.horaConversa?.trim() && !hora) throw new Error('Horário inválido. Use o formato HH:MM (ex.: 14:30).');

  const { data, error } = await supabase
    .from('admin_cliente_conversas')
    .update({
      data_conversa: params.dataConversa.trim(),
      hora_conversa: hora,
      descricao,
    } as never)
    .eq('id', params.id)
    .select('id')
    .single();

  if (error) throw new Error(erroHistorico(error.message, 'admin_cliente_conversas'));
  if (!data) throw new Error('Não foi possível atualizar a conversa.');
}

export async function excluirConversaCliente(id: string): Promise<void> {
  if (!id) throw new Error('Conversa inválida.');
  const { error } = await supabase.from('admin_cliente_conversas').delete().eq('id', id);
  if (error) throw new Error(erroHistorico(error.message, 'admin_cliente_conversas'));
}

/** Data da conversa mais recente de cada cliente — "Último contato" no card. */
export async function listarUltimoContatoPorCliente(clienteIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!clienteIds.length) return map;

  const CHUNK = 200;
  for (let i = 0; i < clienteIds.length; i += CHUNK) {
    const chunk = clienteIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('admin_cliente_conversas')
      .select('cliente_id,data_conversa,hora_conversa')
      .in('cliente_id', chunk)
      .order('data_conversa', { ascending: false })
      .order('hora_conversa', { ascending: false, nullsFirst: false });

    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Pick<AdminClienteConversaRow, 'cliente_id' | 'data_conversa'>[]) {
      if (!row.cliente_id || map.has(row.cliente_id) || !row.data_conversa) continue;
      map.set(row.cliente_id, row.data_conversa);
    }
  }
  return map;
}

export function rotuloClienteConversa(row: ClienteConversaComCliente): string {
  if (row.cliente) return rotuloCliente(row.cliente);
  return `Cliente ${row.cliente_id.slice(0, 8)}`;
}
