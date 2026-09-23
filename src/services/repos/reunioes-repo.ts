import { supabase } from '@/src/lib/supabase';
import { dataCalendarioBrasil, dataHojeBrasil } from '@/src/utils/format';

export type ReuniaoClienteRow = {
  id: string;
  cliente_id: string;
  empresa_nome?: string | null;
  assuntos?: string | null;
  pendencia: string;
  proxima_acao?: string | null;
  data_retorno: string;
  participante_ids?: string[] | null;
  concluida?: boolean | null;
  admin_email?: string | null;
  created_at?: string | null;
};

export type UsuarioDoCliente = {
  id: string;
  nome: string;
};

export type PendenciaColuna = 'atrasada' | 'em_andamento' | 'concluida';

const SELECT_REUNIAO =
  'id,cliente_id,empresa_nome,assuntos,pendencia,proxima_acao,data_retorno,participante_ids,concluida,admin_email,created_at';

export function colunaPendencia(row: Pick<ReuniaoClienteRow, 'concluida' | 'data_retorno'>): PendenciaColuna {
  if (row.concluida) return 'concluida';
  const prazo = `${row.data_retorno ?? ''}`.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(prazo) && prazo < dataHojeBrasil()) return 'atrasada';
  return 'em_andamento';
}

export async function listarUsuariosDoCliente(clienteId: string): Promise<UsuarioDoCliente[]> {
  if (!clienteId) return [];
  const { data, error } = await supabase
    .from('usuarios')
    .select('id,nome,ativo')
    .eq('cliente_id', clienteId)
    .eq('ativo', true)
    .order('nome', { ascending: true });

  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; nome: string }[]).filter((u) => u.id && `${u.nome ?? ''}`.trim());
}

export async function listarReunioesDoCliente(clienteId: string): Promise<ReuniaoClienteRow[]> {
  if (!clienteId) return [];
  const { data, error } = await supabase
    .from('admin_cliente_reunioes')
    .select(SELECT_REUNIAO)
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ReuniaoClienteRow[];
}

export async function listarReunioes(): Promise<ReuniaoClienteRow[]> {
  const { data, error } = await supabase
    .from('admin_cliente_reunioes')
    .select(SELECT_REUNIAO)
    .order('data_retorno', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ReuniaoClienteRow[];
}

export type ResumoReunioesCliente = {
  abertas: number;
  /** Data (YYYY-MM-DD) da criação do registro de reunião mais recente. */
  ultimaCriacao: string | null;
};

/** Pendências em aberto = reuniões ainda não concluídas. Última reunião = created_at do registro mais novo. */
export async function resumirReunioesPorCliente(clienteIds: string[]): Promise<Map<string, ResumoReunioesCliente>> {
  const map = new Map<string, ResumoReunioesCliente>();
  const maisRecente = new Map<string, string>();
  if (!clienteIds.length) return map;

  const CHUNK = 200;
  for (let i = 0; i < clienteIds.length; i += CHUNK) {
    const chunk = clienteIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('admin_cliente_reunioes')
      .select('cliente_id,concluida,created_at')
      .in('cliente_id', chunk);

    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as { cliente_id: string; concluida?: boolean | null; created_at?: string | null }[]) {
      if (!row.cliente_id) continue;
      const atual = map.get(row.cliente_id) ?? { abertas: 0, ultimaCriacao: null };
      if (!row.concluida) atual.abertas += 1;
      const criado = `${row.created_at ?? ''}`;
      const criadoMs = Date.parse(criado);
      const anteriorMs = Date.parse(maisRecente.get(row.cliente_id) ?? '');
      if (criado && Number.isFinite(criadoMs) && (!Number.isFinite(anteriorMs) || criadoMs >= anteriorMs)) {
        maisRecente.set(row.cliente_id, criado);
        atual.ultimaCriacao = dataCalendarioBrasil(criado);
      }
      map.set(row.cliente_id, atual);
    }
  }
  return map;
}

export async function criarPendenciasReuniao(params: {
  clienteId: string;
  empresaNome?: string | null;
  assuntos?: string | null;
  proximaAcao?: string | null;
  participanteIds: string[];
  adminEmail?: string | null;
  pendencias: { texto: string; dataRetorno: string }[];
}): Promise<ReuniaoClienteRow[]> {
  if (!params.clienteId) throw new Error('Cliente inválido.');

  const itens = params.pendencias
    .map((item) => ({ texto: item.texto.trim(), dataRetorno: item.dataRetorno.trim() }))
    .filter((item) => item.texto.length > 0);

  if (!itens.length) return [];

  const semData = itens.find((item) => !/^\d{4}-\d{2}-\d{2}$/.test(item.dataRetorno));
  if (semData) throw new Error('Informe a data do retorno de cada pendência preenchida.');

  const assuntos = params.assuntos?.trim() || null;
  const proximaAcao = params.proximaAcao?.trim() || null;
  const empresa = params.empresaNome?.trim() || null;

  const { data, error } = await supabase
    .from('admin_cliente_reunioes')
    .insert(
      itens.map((item) => ({
        cliente_id: params.clienteId,
        empresa_nome: empresa,
        assuntos,
        pendencia: item.texto,
        proxima_acao: proximaAcao,
        data_retorno: item.dataRetorno,
        participante_ids: params.participanteIds,
        concluida: false,
        admin_email: params.adminEmail ?? null,
      })) as never,
    )
    .select(SELECT_REUNIAO);

  if (error) {
    if (/admin_cliente_reunioes|schema cache/i.test(error.message)) {
      throw new Error('Execute supabase/sql/admin_cliente_reunioes.sql no Supabase.');
    }
    throw new Error(error.message);
  }
  return (data ?? []) as unknown as ReuniaoClienteRow[];
}

export async function definirReuniaoConcluida(id: string, concluida: boolean): Promise<void> {
  if (!id) throw new Error('Pendência inválida.');
  const { error } = await supabase.from('admin_cliente_reunioes').update({ concluida } as never).eq('id', id);
  if (error) throw new Error(error.message);
}
