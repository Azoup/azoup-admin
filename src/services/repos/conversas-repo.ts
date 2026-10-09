import { supabase } from '@/src/lib/supabase';
import type { AdminClienteConversaRow, ClienteAzoupRow } from '@/src/types/azoup';
import { rotuloCliente } from '@/src/utils/cliente-label';
import { dataCalendarioBrasil } from '@/src/utils/format';

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

function nomeEmpresaCadastrada(empresa: {
  nome_fantasia?: string | null;
  razao_social?: string | null;
}): string {
  const fantasia = `${empresa.nome_fantasia ?? ''}`.trim();
  if (fantasia) return fantasia;
  return `${empresa.razao_social ?? ''}`.trim();
}

/** Empresa matriz do cliente; se não houver matriz, a primeira cadastrada. */
async function anexarEmpresaCadastrada(clientes: ClienteAzoupRow[]): Promise<ClienteAzoupRow[]> {
  if (!clientes.length) return clientes;
  const escolhida = new Map<string, { nome: string; matriz: boolean }>();
  const CHUNK = 200;
  for (let i = 0; i < clientes.length; i += CHUNK) {
    const ids = clientes.slice(i, i + CHUNK).map((c) => c.id);
    const { data, error } = await supabase
      .from('empresas')
      .select('cliente_id,razao_social,nome_fantasia,empresa_matriz,created_at')
      .in('cliente_id', ids);
    if (error) {
      if (/empresas|schema cache|does not exist/i.test(error.message)) return clientes;
      throw new Error(error.message);
    }
    for (const row of (data ?? []) as {
      cliente_id?: string;
      razao_social?: string | null;
      nome_fantasia?: string | null;
      empresa_matriz?: boolean | null;
      created_at?: string | null;
    }[]) {
      const clienteId = `${row.cliente_id ?? ''}`;
      const nome = nomeEmpresaCadastrada(row);
      if (!clienteId || !nome) continue;
      const atual = escolhida.get(clienteId);
      const matriz = Boolean(row.empresa_matriz);
      if (!atual || (matriz && !atual.matriz)) {
        escolhida.set(clienteId, { nome, matriz });
      }
    }
  }
  return clientes.map((cliente) => ({
    ...cliente,
    empresa_matriz_nome: escolhida.get(cliente.id)?.nome ?? null,
  }));
}

export async function listarClientesParaSelecao(): Promise<ClienteAzoupRow[]> {
  const { data, error } = await supabase
    .from('clientes_azoup')
    .select(CLIENTE_SELECT_COLS)
    .order('nome', { ascending: true });

  if (error) throw new Error(error.message);
  return anexarEmpresaCadastrada((data ?? []) as ClienteAzoupRow[]);
}

/** Clientes distintos que já possuem ao menos uma conversa registrada. */
export async function listarClientesComConversas(): Promise<ClienteAzoupRow[]> {
  const { data, error } = await supabase.from('admin_cliente_conversas').select('cliente_id');

  if (error) throw new Error(error.message);

  const ids = [...new Set((data ?? []).map((r) => (r as { cliente_id: string }).cliente_id).filter(Boolean))];
  if (!ids.length) return [];

  const map = await buscarClientesPorIds(ids);
  const clientes = ids
    .map((id) => map.get(id))
    .filter((c): c is ClienteAzoupRow => Boolean(c))
    .sort((a, b) => rotuloCliente(a).localeCompare(rotuloCliente(b), 'pt-BR'));
  return anexarEmpresaCadastrada(clientes);
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

  const rows = ((data ?? []) as AdminClienteConversaRow[]).filter(
    (row) => row.descricao !== 'Contato pelo último chamado da Digisac',
  );
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

const diasChamadoVistos = new Map<string, string>();

/** Guarda o dia do chamado já exibido, para o card não voltar à data da conversa. */
export function registrarUltimoChamadoVisto(clienteId: string, dia: string | null) {
  const id = clienteId.trim();
  const data = `${dia ?? ''}`.trim().slice(0, 10);
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return;
  const atual = diasChamadoVistos.get(id);
  if (!atual || data > atual) diasChamadoVistos.set(id, data);
}

function guardarData(map: Map<string, string>, clienteId: string, data: string | null) {
  const id = clienteId.trim();
  const dia = `${data ?? ''}`.trim().slice(0, 10);
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return;
  const atual = map.get(id);
  if (!atual || dia > atual) map.set(id, dia);
}

/** Data da conversa ou do chamado Digisac mais recente de cada cliente. */
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
      guardarData(map, row.cliente_id, row.data_conversa ? `${row.data_conversa}`.slice(0, 10) : null);
    }

    const rpc = await supabase.rpc('painel_datas_ultimo_chamado', { p_ids: chunk });
    if (!rpc.error) {
      for (const row of (rpc.data ?? []) as { cliente_id?: string; dia?: string | null }[]) {
        guardarData(map, `${row.cliente_id ?? ''}`, row.dia ?? null);
      }
    } else if (!/schema cache|does not exist|could not find the function/i.test(rpc.error.message)) {
      console.warn('[ultimo-contato] painel_datas_ultimo_chamado', rpc.error.message);
    }

    const chamados = await supabase
      .from('admin_digisac_chamados')
      .select('cliente_id,inicio')
      .in('cliente_id', chunk)
      .order('inicio', { ascending: false });
    if (chamados.error) {
      console.warn('[ultimo-contato] admin_digisac_chamados', chamados.error.message);
      continue;
    }
    for (const row of (chamados.data ?? []) as { cliente_id?: string; inicio?: string | null }[]) {
      guardarData(map, `${row.cliente_id ?? ''}`, dataCalendarioBrasil(row.inicio));
    }
  }
  for (const [id, dia] of diasChamadoVistos) guardarData(map, id, dia);
  return map;
}

export function rotuloClienteConversa(row: ClienteConversaComCliente): string {
  if (row.cliente) return rotuloCliente(row.cliente);
  return `Cliente ${row.cliente_id.slice(0, 8)}`;
}
