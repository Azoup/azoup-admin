import { supabase } from '@/src/lib/supabase';
import { dataCalendarioBrasil, dataHojeBrasil, instanteNaDataBrasil } from '@/src/utils/format';
import { diaDoRegistroReuniao } from '@/src/utils/reuniao-sem-registro';

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
  avulsa?: boolean | null;
  gerado_ia?: boolean | null;
  comentario_conclusao?: string | null;
  reuniao_cancelada?: boolean | null;
  confec_card_id?: string | null;
  admin_email?: string | null;
  /** Dia do registro (YYYY-MM-DD), inclusive lançamento retroativo. */
  data_registro?: string | null;
  created_at?: string | null;
};

export type UsuarioDoCliente = {
  id: string;
  nome: string;
};

export type PendenciaColuna = 'atrasada' | 'em_andamento' | 'concluida';

const SELECT_REUNIAO =
  'id,cliente_id,empresa_nome,assuntos,pendencia,proxima_acao,data_retorno,participante_ids,concluida,admin_email,created_at';

let suporteAvulsa: boolean | null = null;
let suporteGeradoIa: boolean | null = null;
let suporteComentario: boolean | null = null;
let suporteReuniaoCancelada: boolean | null = null;
let suporteDataRegistro: boolean | null = null;

function faltaColunaAvulsa(message: string): boolean {
  return /avulsa/i.test(message);
}

function faltaColunaDataRegistro(message: string): boolean {
  return /data_registro/i.test(message);
}

async function consultarReunioes<T>(
  colunasBase: string,
  montar: (colunas: string) => PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<{ data: T; error: { message: string } | null }> {
  const extras = [
    suporteAvulsa === false ? '' : 'avulsa',
    suporteGeradoIa === false ? '' : 'gerado_ia',
    suporteComentario === false ? '' : 'comentario_conclusao',
    suporteReuniaoCancelada === false ? '' : 'reuniao_cancelada',
    suporteDataRegistro === false ? '' : 'data_registro',
  ].filter(Boolean);
  const colunas = [colunasBase, ...extras].join(',');
  const primeiro = await montar(colunas);
  if (!primeiro.error) {
    if (extras.includes('avulsa')) suporteAvulsa = true;
    if (extras.includes('gerado_ia')) suporteGeradoIa = true;
    if (extras.includes('comentario_conclusao')) suporteComentario = true;
    if (extras.includes('reuniao_cancelada')) suporteReuniaoCancelada = true;
    if (extras.includes('data_registro')) suporteDataRegistro = true;
    return primeiro;
  }
  const mensagem = primeiro.error.message;
  let mudou = false;
  if (suporteAvulsa !== false && faltaColunaAvulsa(mensagem)) {
    suporteAvulsa = false;
    mudou = true;
  }
  if (suporteGeradoIa !== false && /gerado_ia/i.test(mensagem)) {
    suporteGeradoIa = false;
    mudou = true;
  }
  if (suporteComentario !== false && /comentario_conclusao/i.test(mensagem)) {
    suporteComentario = false;
    mudou = true;
  }
  if (suporteReuniaoCancelada !== false && /reuniao_cancelada/i.test(mensagem)) {
    suporteReuniaoCancelada = false;
    mudou = true;
  }
  if (suporteDataRegistro !== false && faltaColunaDataRegistro(mensagem)) {
    suporteDataRegistro = false;
    mudou = true;
  }
  if (!mudou) return primeiro;
  return consultarReunioes(colunasBase, montar);
}

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

export async function listarPendenciasDoCliente(clienteId: string): Promise<ReuniaoClienteRow[]> {
  if (!clienteId) return [];
  const { data, error } = await consultarReunioes(SELECT_REUNIAO, (colunas) =>
    supabase
      .from('admin_cliente_reunioes')
      .select(colunas)
      .eq('cliente_id', clienteId)
      .order('data_retorno', { ascending: true }),
  );
  if (error) throw new Error(error.message);
  const ordem: Record<PendenciaColuna, number> = { atrasada: 0, em_andamento: 1, concluida: 2 };
  return ((data ?? []) as unknown as ReuniaoClienteRow[])
    .filter((row) => `${row.pendencia ?? ''}`.trim())
    .sort((a, b) => ordem[colunaPendencia(a)] - ordem[colunaPendencia(b)] || `${a.data_retorno}`.localeCompare(`${b.data_retorno}`));
}

export async function listarReunioesDoCliente(clienteId: string): Promise<ReuniaoClienteRow[]> {
  if (!clienteId) return [];
  const { data, error } = await consultarReunioes(SELECT_REUNIAO, (colunas) =>
    supabase
      .from('admin_cliente_reunioes')
      .select(colunas)
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false }),
  );

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as ReuniaoClienteRow[]).filter((row) => !row.avulsa);
}

/** True = só o rascunho automático da IA (sem participantes). Registro lançado à mão conta mesmo com assistente de IA. */
function soResumoAutomaticoIa(row: ReuniaoClienteRow): boolean {
  if (!row.gerado_ia) return false;
  if (row.reuniao_cancelada) return false;
  return !(Array.isArray(row.participante_ids) && row.participante_ids.length > 0);
}

/** Registros lançados no período. Pendência avulsa e resumo automático da IA ficam de fora. */
export async function listarRegistrosManuaisNoPeriodo(inicio: string, fim: string): Promise<ReuniaoClienteRow[]> {
  const pagina = 500;
  const saida: ReuniaoClienteRow[] = [];
  for (let from = 0; from < 8000; from += pagina) {
    const { data, error } = await consultarReunioes(
      'id,cliente_id,empresa_nome,assuntos,admin_email,created_at,participante_ids',
      (colunas) =>
        supabase
          .from('admin_cliente_reunioes')
          .select(colunas)
          .gte('created_at', inicio)
          .lt('created_at', fim)
          .order('created_at', { ascending: true })
          .range(from, from + pagina - 1),
    );
    if (error) {
      if (/admin_cliente_reunioes|schema cache/i.test(error.message)) return [];
      throw new Error(error.message);
    }
    const rows = ((data ?? []) as unknown as ReuniaoClienteRow[]).filter(
      (row) => !row.avulsa && !soResumoAutomaticoIa(row),
    );
    saida.push(...rows);
    if ((data ?? []).length < pagina) break;
  }
  return saida;
}

export async function listarReunioes(): Promise<ReuniaoClienteRow[]> {
  const { data, error } = await consultarReunioes(SELECT_REUNIAO, (colunas) =>
    supabase.from('admin_cliente_reunioes').select(colunas).order('data_retorno', { ascending: true }),
  );

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as ReuniaoClienteRow[]).filter((row) => row.pendencia?.trim());
}

export type ResumoReunioesCliente = {
  abertas: number;
  /** Data (YYYY-MM-DD) da criação do registro de reunião mais recente. */
  ultimaCriacao: string | null;
};

/** Pendências em aberto = reuniões ainda não concluídas. Última reunião = data_registro/created_at mais recente. */
export async function resumirReunioesPorCliente(clienteIds: string[]): Promise<Map<string, ResumoReunioesCliente>> {
  const map = new Map<string, ResumoReunioesCliente>();
  if (!clienteIds.length) return map;

  const CHUNK = 200;
  for (let i = 0; i < clienteIds.length; i += CHUNK) {
    const chunk = clienteIds.slice(i, i + CHUNK);
    const { data, error } = await consultarReunioes('cliente_id,concluida,created_at,pendencia', (colunas) =>
      supabase.from('admin_cliente_reunioes').select(colunas).in('cliente_id', chunk),
    );

    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as {
      cliente_id: string;
      concluida?: boolean | null;
      created_at?: string | null;
      data_registro?: string | null;
      pendencia?: string | null;
      avulsa?: boolean | null;
    }[]) {
      if (!row.cliente_id) continue;
      const atual = map.get(row.cliente_id) ?? { abertas: 0, ultimaCriacao: null };
      if (!row.concluida && `${row.pendencia ?? ''}`.trim()) atual.abertas += 1;
      if (row.avulsa) {
        map.set(row.cliente_id, atual);
        continue;
      }
      const diaReg = diaDoRegistroReuniao(row);
      if (diaReg && (!atual.ultimaCriacao || diaReg > atual.ultimaCriacao)) {
        atual.ultimaCriacao = diaReg;
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
  /** YYYY-MM-DD. Só o owner envia; define a data do registro em vez de agora. */
  dataRegistro?: string | null;
  geradoIa?: boolean;
  reuniaoCancelada?: boolean;
  pendencias: { texto: string; dataRetorno: string }[];
}): Promise<ReuniaoClienteRow[]> {
  if (!params.clienteId) throw new Error('Cliente inválido.');
  if (!params.reuniaoCancelada && !params.participanteIds.length) {
    throw new Error('Selecione ao menos um participante.');
  }

  const itens = params.pendencias
    .map((item) => ({ texto: item.texto.trim(), dataRetorno: item.dataRetorno.trim() }))
    .filter((item) => item.texto.length > 0);

  const semData = itens.find((item) => !/^\d{4}-\d{2}-\d{2}$/.test(item.dataRetorno));
  if (semData) throw new Error('Informe a data do retorno de cada pendência preenchida.');

  const assuntos = params.assuntos?.trim() || null;
  const proximaAcao = params.proximaAcao?.trim() || null;
  const empresa = params.empresaNome?.trim() || null;
  const dataRegistro = params.dataRegistro?.trim() ?? '';
  // Meio-dia em SP: a data informada permanece o dia do registro (retroativo ou hoje).
  const createdAt = /^\d{4}-\d{2}-\d{2}$/.test(dataRegistro) ? instanteNaDataBrasil(dataRegistro, '12:00:00') : null;
  const diaRegistro = /^\d{4}-\d{2}-\d{2}$/.test(dataRegistro) ? dataRegistro : dataHojeBrasil();
  const linhas = itens.length
    ? itens
    : [{ texto: '', dataRetorno: diaRegistro }];

  const linhasInsert = (opts: { comCreatedAt: boolean; comDataRegistro: boolean }) =>
    linhas.map((item) => ({
      cliente_id: params.clienteId,
      empresa_nome: empresa,
      assuntos,
      pendencia: item.texto,
      proxima_acao: proximaAcao,
      data_retorno: item.dataRetorno,
      participante_ids: params.participanteIds,
      concluida: false,
      admin_email: params.adminEmail ?? null,
      ...(params.geradoIa ? { gerado_ia: true } : {}),
      ...(params.reuniaoCancelada ? { reuniao_cancelada: true } : {}),
      ...(opts.comDataRegistro && suporteDataRegistro !== false ? { data_registro: diaRegistro } : {}),
      ...(opts.comCreatedAt && createdAt ? { created_at: createdAt } : {}),
    })) as never;

  async function tentarInsert(opts: { comCreatedAt: boolean; comDataRegistro: boolean }) {
    const selectCols =
      opts.comDataRegistro && suporteDataRegistro !== false
        ? `${SELECT_REUNIAO},data_registro`
        : SELECT_REUNIAO;
    return supabase.from('admin_cliente_reunioes').insert(linhasInsert(opts)).select(selectCols);
  }

  let { data, error } = await tentarInsert({
    comCreatedAt: Boolean(createdAt),
    comDataRegistro: true,
  });

  if (error && faltaColunaDataRegistro(error.message)) {
    suporteDataRegistro = false;
    ({ data, error } = await tentarInsert({ comCreatedAt: Boolean(createdAt), comDataRegistro: false }));
  }
  if (error && createdAt && /created_at|timestamp|time zone/i.test(error.message)) {
    ({ data, error } = await tentarInsert({
      comCreatedAt: false,
      comDataRegistro: suporteDataRegistro !== false,
    }));
  }

  if (error) {
    if (/gerado_ia|reuniao_cancelada|data_registro/i.test(error.message)) {
      throw new Error('Execute supabase/sql/admin_cliente_reunioes.sql no Supabase.');
    }
    if (/admin_cliente_reunioes|schema cache/i.test(error.message)) {
      throw new Error('Execute supabase/sql/admin_cliente_reunioes.sql no Supabase.');
    }
    throw new Error(error.message);
  }
  if (!data?.length) throw new Error('Não foi possível registrar a reunião.');

  let rows = data as unknown as ReuniaoClienteRow[];
  const ids = rows.map((row) => row.id).filter(Boolean);

  // data_registro é a fonte da verdade do dia (retroativo). Não depende de alterar created_at.
  if (ids.length && suporteDataRegistro !== false) {
    const faltaData = rows.some((row) => `${row.data_registro ?? ''}`.slice(0, 10) !== diaRegistro);
    if (faltaData) {
      const { error: updDr } = await supabase
        .from('admin_cliente_reunioes')
        .update({ data_registro: diaRegistro } as never)
        .in('id', ids);
      if (updDr && faltaColunaDataRegistro(updDr.message)) {
        suporteDataRegistro = false;
      } else if (!updDr) {
        rows = rows.map((row) => ({ ...row, data_registro: diaRegistro }));
      }
    } else {
      rows = rows.map((row) => ({ ...row, data_registro: row.data_registro ?? diaRegistro }));
    }
  }

  // Best-effort em created_at só para exibição — nunca impede o salvamento.
  if (ids.length && createdAt && rows.some((row) => dataCalendarioBrasil(row.created_at) !== diaRegistro)) {
    const { error: updCa } = await supabase
      .from('admin_cliente_reunioes')
      .update({ created_at: createdAt } as never)
      .in('id', ids);
    if (!updCa) {
      rows = rows.map((row) => ({ ...row, created_at: createdAt }));
    }
  }

  return rows;
}

/** Pendência criada na tela de pendências, sem registro de reunião. */
export async function criarPendenciaAvulsa(params: {
  clienteId: string;
  empresaNome?: string | null;
  pendencia: string;
  dataRetorno: string;
  adminEmail?: string | null;
  confecCardId?: string | null;
}): Promise<ReuniaoClienteRow> {
  if (!params.clienteId) throw new Error('Selecione o cliente.');
  const texto = params.pendencia.trim();
  if (!texto) throw new Error('Escreva a pendência.');
  const dataRetorno = params.dataRetorno.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRetorno)) throw new Error('Informe a data do retorno.');

  const payload = {
    cliente_id: params.clienteId,
    empresa_nome: params.empresaNome?.trim() || null,
    pendencia: texto,
    data_retorno: dataRetorno,
    participante_ids: [],
    concluida: false,
    avulsa: true,
    admin_email: params.adminEmail ?? null,
    ...(params.confecCardId ? { confec_card_id: params.confecCardId } : {}),
  };
  let { data, error } = await supabase.from('admin_cliente_reunioes').insert(payload as never).select(SELECT_REUNIAO).single();
  if (error && params.confecCardId && /confec_card_id/i.test(error.message)) {
    const { confec_card_id: _c, ...semCard } = payload;
    ({ data, error } = await supabase.from('admin_cliente_reunioes').insert(semCard as never).select(SELECT_REUNIAO).single());
  }

  if (error) {
    if (/duplicate|unique/i.test(error.message) && params.confecCardId) {
      const { data: ja } = await supabase
        .from('admin_cliente_reunioes')
        .select(SELECT_REUNIAO)
        .eq('confec_card_id', params.confecCardId)
        .maybeSingle();
      if (ja) return ja as unknown as ReuniaoClienteRow;
    }
    if (faltaColunaAvulsa(error.message)) {
      throw new Error('Execute de novo supabase/sql/admin_cliente_reunioes.sql no Supabase para cadastrar pendência avulsa.');
    }
    if (/admin_cliente_reunioes|schema cache/i.test(error.message)) {
      throw new Error('Execute supabase/sql/admin_cliente_reunioes.sql no Supabase.');
    }
    throw new Error(error.message);
  }
  return data as unknown as ReuniaoClienteRow;
}

/** Uma pendência por ticket Confec, no nome de quem abriu o card. */
export async function garantirPendenciaDoTicketConfec(params: {
  cardId: string;
  clienteId: string;
  empresaNome?: string | null;
  pendencia: string;
  adminEmail?: string | null;
}): Promise<void> {
  const cardId = `${params.cardId ?? ''}`.trim();
  const clienteId = `${params.clienteId ?? ''}`.trim();
  if (!cardId || !clienteId) return;
  const { data: existente, error: busca } = await supabase
    .from('admin_cliente_reunioes')
    .select('id')
    .eq('confec_card_id', cardId)
    .limit(1);
  if (busca) {
    if (/confec_card_id/i.test(busca.message)) {
      throw new Error('Execute supabase/sql/admin_cliente_reunioes.sql no Supabase.');
    }
    if (/admin_cliente_reunioes|schema cache/i.test(busca.message)) return;
    throw new Error(busca.message);
  }
  if (existente?.length) return;
  await criarPendenciaAvulsa({
    clienteId,
    empresaNome: params.empresaNome,
    pendencia: params.pendencia,
    dataRetorno: dataHojeBrasil(),
    adminEmail: params.adminEmail,
    confecCardId: cardId,
  });
}

/** Marca a pendência ligada ao ticket Confec como concluída/reaberta (sem exigir comentário manual). */
export async function sincronizarPendenciaDoTicketConfec(params: {
  cardId: string;
  concluida: boolean;
  comentario?: string | null;
}): Promise<void> {
  const cardId = `${params.cardId ?? ''}`.trim();
  if (!cardId) return;
  const patch: Record<string, unknown> = { concluida: params.concluida };
  if (params.concluida) {
    patch.comentario_conclusao =
      `${params.comentario ?? ''}`.trim() || 'Ticket finalizado no Kanban Confec.';
  }
  const { error } = await supabase
    .from('admin_cliente_reunioes')
    .update(patch as never)
    .eq('confec_card_id', cardId)
    .eq('concluida', !params.concluida);
  if (error) {
    if (/confec_card_id/i.test(error.message)) {
      throw new Error('Execute supabase/sql/admin_cliente_reunioes.sql no Supabase.');
    }
    if (/comentario_conclusao/i.test(error.message)) {
      const { error: semComentario } = await supabase
        .from('admin_cliente_reunioes')
        .update({ concluida: params.concluida } as never)
        .eq('confec_card_id', cardId);
      if (semComentario && !/confec_card_id|0 rows/i.test(semComentario.message)) {
        throw new Error(semComentario.message);
      }
      return;
    }
    if (/0 rows|PGRST116/i.test(error.message)) return;
    throw new Error(error.message);
  }
}

export async function definirReuniaoConcluida(id: string, concluida: boolean, comentario?: string | null): Promise<void> {
  if (!id) throw new Error('Pendência inválida.');
  const texto = `${comentario ?? ''}`.trim();
  if (concluida && !texto) throw new Error('Escreva um comentário para concluir a pendência.');
  const patch: Record<string, unknown> = { concluida };
  if (concluida) patch.comentario_conclusao = texto;
  const { error } = await supabase.from('admin_cliente_reunioes').update(patch as never).eq('id', id);
  if (error) {
    if (/comentario_conclusao/i.test(error.message)) {
      throw new Error('Execute supabase/sql/admin_cliente_reunioes.sql no Supabase para salvar o comentário da conclusão.');
    }
    throw new Error(error.message);
  }
}

function erroPermissaoReuniao(message: string): string {
  if (/row-level security|permission denied|policy|0 rows|PGRST116|coerce the result/i.test(message)) {
    return 'Execute de novo supabase/sql/admin_cliente_reunioes.sql no Supabase para liberar editar e excluir.';
  }
  return message;
}

export async function atualizarReuniaoCliente(params: {
  id: string;
  pendencia: string;
  dataRetorno: string;
  assuntos?: string | null;
  proximaAcao?: string | null;
  /** YYYY-MM-DD. Quando informado, troca a data do registro e mantém o horário. */
  dataRegistro?: string | null;
  createdAtAtual?: string | null;
}): Promise<void> {
  if (!params.id) throw new Error('Reunião inválida.');
  const pendencia = params.pendencia.trim();
  const dataRetorno = params.dataRetorno.trim();
  if (pendencia && !/^\d{4}-\d{2}-\d{2}$/.test(dataRetorno)) throw new Error('Informe a data do retorno.');
  const dataRegistro = params.dataRegistro?.trim() ?? '';

  const patch: Record<string, unknown> = { pendencia };
  if (/^\d{4}-\d{2}-\d{2}$/.test(dataRetorno)) patch.data_retorno = dataRetorno;
  if (params.assuntos !== undefined) patch.assuntos = params.assuntos?.trim() || null;
  if (params.proximaAcao !== undefined) patch.proxima_acao = params.proximaAcao?.trim() || null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dataRegistro)) {
    if (suporteDataRegistro !== false) patch.data_registro = dataRegistro;
    const diaAtual = dataCalendarioBrasil(params.createdAtAtual);
    if (diaAtual !== dataRegistro) {
      patch.created_at = instanteNaDataBrasil(dataRegistro, '12:00:00');
    }
  }

  let { data, error } = await supabase
    .from('admin_cliente_reunioes')
    .update(patch as never)
    .eq('id', params.id)
    .select('id')
    .single();

  if (error && patch.data_registro != null && faltaColunaDataRegistro(error.message)) {
    suporteDataRegistro = false;
    delete patch.data_registro;
    ({ data, error } = await supabase
      .from('admin_cliente_reunioes')
      .update(patch as never)
      .eq('id', params.id)
      .select('id')
      .single());
  }

  // Se created_at for imutável no banco, tenta de novo só com os demais campos.
  if (error && patch.created_at != null && /created_at|timestamp|time zone/i.test(error.message)) {
    delete patch.created_at;
    ({ data, error } = await supabase
      .from('admin_cliente_reunioes')
      .update(patch as never)
      .eq('id', params.id)
      .select('id')
      .single());
  }

  if (error) throw new Error(erroPermissaoReuniao(error.message));
  if (!data) throw new Error('Não foi possível atualizar a reunião.');
}

export async function excluirReuniaoCliente(id: string): Promise<void> {
  if (!id) throw new Error('Reunião inválida.');
  const { error } = await supabase.from('admin_cliente_reunioes').delete().eq('id', id);
  if (error) throw new Error(erroPermissaoReuniao(error.message));
}
