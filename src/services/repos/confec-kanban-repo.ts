import { ehSecaoConfec, type ConfecSecao } from '@/src/constants/confec-notas';
import { gerarESalvarNotaConfec } from '@/src/services/confec-notas-api';
import { supabase } from '@/src/lib/supabase';

export const BUCKET_CONFEC = 'confec-kanban-files';
export const LIMITE_ARQUIVO_BYTES = 5 * 1024 * 1024 * 1024;

const MIME_OK = [
  'image/',
  'video/',
  'application/pdf',
  'text/',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.rar',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument',
  'application/msword',
  'application/vnd.ms-powerpoint',
];

export type ConfecColuna = {
  id: string;
  title: string;
  slug: string;
  color: string;
  position: number;
};

export type ConfecEtiqueta = {
  id: string;
  name: string;
  color: string;
};

export type ConfecAnexo = {
  id: string;
  card_id: string;
  storage_path: string;
  nome: string;
  url: string;
  tamanho?: number | null;
  mime?: string | null;
  created_by_email?: string | null;
};

export type ConfecComentario = {
  id: string;
  card_id: string;
  texto: string;
  author_email: string;
  created_at: string;
};

export type ConfecChecklist = {
  id: string;
  card_id: string;
  texto: string;
  feito: boolean;
  position: number;
};

export type ConfecCard = {
  id: string;
  ticket_number: number;
  title: string;
  description: string;
  dev_notes: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  analista_email: string | null;
  desenvolvedor_email: string | null;
  created_by_email: string | null;
  status: string;
  position: number;
  completed_at: string | null;
  secao: ConfecSecao | null;
  tela: string | null;
  tela_nova: boolean;
  nota_linha: string | null;
  nota_detalhe: string | null;
  nota_gerada_em: string | null;
  created_at: string;
  etiquetas: ConfecEtiqueta[];
  imagens: ConfecAnexo[];
  arquivos: ConfecAnexo[];
  comentarios: ConfecComentario[];
  checklist: ConfecChecklist[];
};

export type QuadroConfec = {
  colunas: ConfecColuna[];
  cards: ConfecCard[];
  etiquetas: ConfecEtiqueta[];
};

function erroTabela(message: string): Error {
  if (/confec_kanban|kanban_card_checklist|schema cache|does not exist/i.test(message)) {
    return new Error('Execute supabase/sql/admin_confec_kanban.sql e admin_confec_notas_atualizacao.sql no Supabase.');
  }
  return new Error(message);
}

export function validarPublicacaoNota(params: { secao?: string | null; tela?: string | null }): void {
  const secao = `${params.secao ?? ''}`.trim();
  const tela = `${params.tela ?? ''}`.trim();
  if (!ehSecaoConfec(secao)) throw new Error('Informe a seção do sistema antes de finalizar.');
  if (!tela) throw new Error('Informe a tela do sistema antes de finalizar.');
}

export function normalizarTitulo(valor: string): string {
  return valor.replace(/\s+/g, ' ').trim();
}

export function numeroTicket(numero: number): string {
  return `${numero}`.padStart(4, '0');
}

function semAcento(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function colunaDeConclusao(colunas: ConfecColuna[]): ConfecColuna | null {
  const marca = (coluna: ConfecColuna) => {
    const slug = semAcento(coluna.slug);
    const titulo = semAcento(coluna.title);
    if (slug === 'concluidos' || titulo === 'concluidos') return 2;
    if (slug === 'concluido' || titulo === 'concluido' || slug === 'finalizados' || titulo === 'finalizados') return 1;
    return 0;
  };
  return [...colunas].sort((a, b) => marca(b) - marca(a) || a.position - b.position).find((coluna) => marca(coluna) > 0) ?? null;
}

export function ehColunaConclusao(coluna: ConfecColuna, colunas: ConfecColuna[]): boolean {
  return colunaDeConclusao(colunas)?.id === coluna.id;
}

function urlPublica(path: string): string {
  const { data } = supabase.storage.from(BUCKET_CONFEC).getPublicUrl(path);
  return data.publicUrl;
}

function slugBase(titulo: string): string {
  const base = titulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return base || 'lista';
}

export async function listarAdminsAtivos(): Promise<string[]> {
  const { data, error } = await supabase.rpc('painel_admins_ativos');
  if (error) throw erroTabela(error.message);
  const emails = ((data ?? []) as { email?: string | null }[])
    .map((row) => `${row.email ?? ''}`.trim())
    .filter(Boolean);
  return [...new Set(emails)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export async function carregarQuadroConfec(): Promise<QuadroConfec> {
  const [colunasRes, cardsRes, etiquetasRes, vinculosRes, imagensRes, arquivosRes, comentariosRes, checklistRes] =
    await Promise.all([
      supabase.from('confec_kanban_columns').select('id,title,slug,color,position').order('position'),
      supabase
        .from('confec_kanban_cards')
        .select(
          'id,ticket_number,title,description,dev_notes,cliente_id,analista_email,desenvolvedor_email,created_by_email,status,position,completed_at,secao,tela,tela_nova,nota_linha,nota_detalhe,nota_gerada_em,created_at,cliente:clientes_azoup(nome)',
        )
        .order('position'),
      supabase.from('confec_kanban_labels').select('id,name,color').order('name'),
      supabase.from('confec_kanban_card_labels').select('card_id,label_id'),
      supabase.from('confec_kanban_card_images').select('id,card_id,storage_path,nome,created_by_email'),
      supabase.from('confec_kanban_card_files').select('id,card_id,storage_path,nome,tamanho,mime,created_by_email'),
      supabase
        .from('confec_kanban_card_comments')
        .select('id,card_id,texto,author_email,created_at')
        .order('created_at'),
      supabase
        .from('kanban_card_checklist')
        .select('id,card_id,texto,feito,position')
        .eq('card_type', 'confec')
        .order('position'),
    ]);

  const primeiroErro = [colunasRes, cardsRes, etiquetasRes, vinculosRes, imagensRes, arquivosRes, comentariosRes, checklistRes].find(
    (res) => res.error,
  );
  if (primeiroErro?.error) throw erroTabela(primeiroErro.error.message);

  const etiquetas = (etiquetasRes.data ?? []) as ConfecEtiqueta[];
  const etiquetaPorId = new Map(etiquetas.map((item) => [item.id, item]));
  const etiquetasPorCard = new Map<string, ConfecEtiqueta[]>();
  for (const row of (vinculosRes.data ?? []) as { card_id: string; label_id: string }[]) {
    const etiqueta = etiquetaPorId.get(row.label_id);
    if (!etiqueta) continue;
    const lista = etiquetasPorCard.get(row.card_id) ?? [];
    lista.push(etiqueta);
    etiquetasPorCard.set(row.card_id, lista);
  }

  const imagensPorCard = new Map<string, ConfecAnexo[]>();
  for (const row of (imagensRes.data ?? []) as ConfecAnexo[]) {
    const lista = imagensPorCard.get(row.card_id) ?? [];
    lista.push({ ...row, nome: row.nome || 'imagem', url: urlPublica(row.storage_path) });
    imagensPorCard.set(row.card_id, lista);
  }
  const arquivosPorCard = new Map<string, ConfecAnexo[]>();
  for (const row of (arquivosRes.data ?? []) as ConfecAnexo[]) {
    const lista = arquivosPorCard.get(row.card_id) ?? [];
    lista.push({ ...row, nome: row.nome || 'arquivo', url: urlPublica(row.storage_path) });
    arquivosPorCard.set(row.card_id, lista);
  }
  const comentariosPorCard = new Map<string, ConfecComentario[]>();
  for (const row of (comentariosRes.data ?? []) as ConfecComentario[]) {
    const lista = comentariosPorCard.get(row.card_id) ?? [];
    lista.push(row);
    comentariosPorCard.set(row.card_id, lista);
  }
  const checklistPorCard = new Map<string, ConfecChecklist[]>();
  for (const row of (checklistRes.data ?? []) as ConfecChecklist[]) {
    const lista = checklistPorCard.get(row.card_id) ?? [];
    lista.push(row);
    checklistPorCard.set(row.card_id, lista);
  }

  const cards = ((cardsRes.data ?? []) as Array<ConfecCard & { cliente?: { nome?: string | null } | { nome?: string | null }[] | null }>).map(
    (row) => {
      const cliente = Array.isArray(row.cliente) ? row.cliente[0] : row.cliente;
      const secao = `${row.secao ?? ''}`.trim();
      return {
        ...row,
        description: row.description ?? '',
        dev_notes: row.dev_notes ?? '',
        cliente_nome: `${cliente?.nome ?? ''}`.trim() || null,
        secao: ehSecaoConfec(secao) ? secao : null,
        tela: `${row.tela ?? ''}`.trim() || null,
        tela_nova: Boolean(row.tela_nova),
        nota_linha: `${row.nota_linha ?? ''}`.trim() || null,
        nota_detalhe: `${row.nota_detalhe ?? ''}`.trim() || null,
        nota_gerada_em: row.nota_gerada_em ?? null,
        etiquetas: etiquetasPorCard.get(row.id) ?? [],
        imagens: imagensPorCard.get(row.id) ?? [],
        arquivos: arquivosPorCard.get(row.id) ?? [],
        comentarios: comentariosPorCard.get(row.id) ?? [],
        checklist: checklistPorCard.get(row.id) ?? [],
      };
    },
  );

  return {
    colunas: (colunasRes.data ?? []) as ConfecColuna[],
    cards,
    etiquetas,
  };
}

async function garantirEtiquetaConcluido(): Promise<ConfecEtiqueta> {
  const { data, error } = await supabase.from('confec_kanban_labels').select('id,name,color').ilike('name', 'Concluído').limit(1);
  if (error) throw erroTabela(error.message);
  const existente = (data ?? [])[0] as ConfecEtiqueta | undefined;
  if (existente) return existente;
  const { data: criada, error: criarErro } = await supabase
    .from('confec_kanban_labels')
    .insert({ name: 'Concluído', color: '#10b981' } as never)
    .select('id,name,color')
    .single();
  if (criarErro) throw erroTabela(criarErro.message);
  return criada as ConfecEtiqueta;
}

async function substituirEtiquetas(cardId: string, labelIds: string[]): Promise<void> {
  const { error: apagar } = await supabase.from('confec_kanban_card_labels').delete().eq('card_id', cardId);
  if (apagar) throw erroTabela(apagar.message);
  if (!labelIds.length) return;
  const { error } = await supabase
    .from('confec_kanban_card_labels')
    .insert(labelIds.map((labelId) => ({ card_id: cardId, label_id: labelId })) as never);
  if (error) throw erroTabela(error.message);
}

export async function criarCardConfec(params: {
  title: string;
  status: string;
  description?: string;
  devNotes?: string;
  clienteId?: string | null;
  analistaEmail?: string | null;
  desenvolvedorEmail?: string | null;
  createdByEmail: string;
  secao?: string | null;
  tela?: string | null;
  telaNova?: boolean;
  labelIds?: string[];
}): Promise<string> {
  const title = normalizarTitulo(params.title);
  if (!title) throw new Error('Informe o título do ticket.');
  const secao = `${params.secao ?? ''}`.trim();
  const tela = `${params.tela ?? ''}`.trim();
  const { data: posicao, error: posErro } = await supabase
    .from('confec_kanban_cards')
    .select('position')
    .eq('status', params.status)
    .order('position', { ascending: false })
    .limit(1);
  if (posErro) throw erroTabela(posErro.message);
  const position = ((posicao ?? [])[0] as { position?: number } | undefined)?.position;
  const { data, error } = await supabase
    .from('confec_kanban_cards')
    .insert({
      title,
      description: params.description?.trim() || null,
      dev_notes: params.devNotes?.trim() || null,
      cliente_id: params.clienteId || null,
      analista_email: params.analistaEmail?.trim() || null,
      desenvolvedor_email: params.desenvolvedorEmail?.trim() || null,
      created_by_email: params.createdByEmail,
      status: params.status,
      secao: ehSecaoConfec(secao) ? secao : null,
      tela: tela || null,
      tela_nova: Boolean(params.telaNova) && Boolean(tela),
      position: Number.isFinite(position) ? Number(position) + 1 : 0,
    } as never)
    .select('id')
    .single();
  if (error) throw erroTabela(error.message);
  const id = (data as { id: string }).id;
  if (params.labelIds?.length) await substituirEtiquetas(id, params.labelIds);
  return id;
}

async function aposEntrarEmFinalizados(params: {
  id: string;
  secao?: string | null;
  tela?: string | null;
  telaNova?: boolean;
}): Promise<void> {
  validarPublicacaoNota(params);
  await gerarESalvarNotaConfec({
    cardId: params.id,
    secao: `${params.secao ?? ''}`.trim(),
    tela: `${params.tela ?? ''}`.trim(),
    telaNova: Boolean(params.telaNova),
  });
}

export async function atualizarCardConfec(params: {
  id: string;
  title: string;
  description?: string;
  devNotes?: string;
  clienteId?: string | null;
  analistaEmail?: string | null;
  desenvolvedorEmail?: string | null;
  secao?: string | null;
  tela?: string | null;
  telaNova?: boolean;
  status: string;
  statusAnterior: string;
  colunas: ConfecColuna[];
  labelIds: string[];
}): Promise<void> {
  const title = normalizarTitulo(params.title);
  if (!title) throw new Error('Informe o título do ticket.');
  const secao = `${params.secao ?? ''}`.trim();
  const tela = `${params.tela ?? ''}`.trim();
  const destino = params.colunas.find((coluna) => coluna.slug === params.status);
  const origem = params.colunas.find((coluna) => coluna.slug === params.statusAnterior);
  const entrou = Boolean(destino && ehColunaConclusao(destino, params.colunas) && origem && !ehColunaConclusao(origem, params.colunas));
  const saiu = Boolean(origem && ehColunaConclusao(origem, params.colunas) && destino && !ehColunaConclusao(destino, params.colunas));
  if (entrou || (destino && ehColunaConclusao(destino, params.colunas))) {
    validarPublicacaoNota({ secao, tela });
  }

  let labelIds = params.labelIds;
  const patch: Record<string, unknown> = {
    title,
    description: params.description?.trim() || null,
    dev_notes: params.devNotes?.trim() || null,
    cliente_id: params.clienteId || null,
    analista_email: params.analistaEmail?.trim() || null,
    desenvolvedor_email: params.desenvolvedorEmail?.trim() || null,
    secao: ehSecaoConfec(secao) ? secao : null,
    tela: tela || null,
    tela_nova: Boolean(params.telaNova) && Boolean(tela),
    status: params.status,
    updated_at: new Date().toISOString(),
  };
  if (entrou) {
    const etiqueta = await garantirEtiquetaConcluido();
    labelIds = [etiqueta.id];
    patch.completed_at = new Date().toISOString();
  } else if (saiu) {
    const etiqueta = await garantirEtiquetaConcluido();
    labelIds = params.labelIds.filter((id) => id !== etiqueta.id);
    patch.completed_at = null;
    patch.nota_linha = null;
    patch.nota_detalhe = null;
    patch.nota_gerada_em = null;
  }

  const { error } = await supabase.from('confec_kanban_cards').update(patch as never).eq('id', params.id);
  if (error) throw erroTabela(error.message);
  await substituirEtiquetas(params.id, labelIds);
  if (entrou) {
    await aposEntrarEmFinalizados({
      id: params.id,
      secao,
      tela,
      telaNova: Boolean(params.telaNova),
    });
  }
}

export async function moverCardConfec(params: {
  id: string;
  status: string;
  position: number;
  statusAnterior: string;
  colunas: ConfecColuna[];
  labelIds: string[];
  gravarPosicao: boolean;
  secao?: string | null;
  tela?: string | null;
  telaNova?: boolean;
}): Promise<void> {
  const destino = params.colunas.find((coluna) => coluna.slug === params.status);
  const origem = params.colunas.find((coluna) => coluna.slug === params.statusAnterior);
  if (!destino) throw new Error('Coluna inválida.');
  const entrou = ehColunaConclusao(destino, params.colunas) && origem && !ehColunaConclusao(origem, params.colunas);
  const saiu = origem && ehColunaConclusao(origem, params.colunas) && !ehColunaConclusao(destino, params.colunas);
  if (entrou) {
    validarPublicacaoNota({ secao: params.secao, tela: params.tela });
  }
  const patch: Record<string, unknown> = {
    status: params.status,
    updated_at: new Date().toISOString(),
  };
  if (params.gravarPosicao) patch.position = params.position;
  let labelIds = params.labelIds;
  if (entrou) {
    const etiqueta = await garantirEtiquetaConcluido();
    labelIds = [etiqueta.id];
    patch.completed_at = new Date().toISOString();
  } else if (saiu) {
    const etiqueta = await garantirEtiquetaConcluido();
    labelIds = params.labelIds.filter((id) => id !== etiqueta.id);
    patch.completed_at = null;
    patch.nota_linha = null;
    patch.nota_detalhe = null;
    patch.nota_gerada_em = null;
  }
  const { error } = await supabase.from('confec_kanban_cards').update(patch as never).eq('id', params.id);
  if (error) throw erroTabela(error.message);
  if (entrou || saiu) await substituirEtiquetas(params.id, labelIds);
  if (entrou) {
    await aposEntrarEmFinalizados({
      id: params.id,
      secao: params.secao,
      tela: params.tela,
      telaNova: params.telaNova,
    });
  }
}

export async function atualizarNotaPublicadaConfec(params: {
  id: string;
  notaLinha: string;
  notaDetalhe: string;
}): Promise<void> {
  const linha = params.notaLinha.trim();
  const detalhe = params.notaDetalhe.trim();
  if (!linha) throw new Error('Informe a linha da nota.');
  if (!detalhe) throw new Error('Informe o detalhe da nota.');
  const { error } = await supabase
    .from('confec_kanban_cards')
    .update({
      nota_linha: linha,
      nota_detalhe: detalhe,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', params.id);
  if (error) throw erroTabela(error.message);
}

export async function listarNotasPublicadasConfec(): Promise<ConfecCard[]> {
  const quadro = await carregarQuadroConfec();
  return quadro.cards
    .filter((card) => {
      if (!card.completed_at) return false;
      const coluna = quadro.colunas.find((item) => item.slug === card.status);
      return Boolean(coluna && ehColunaConclusao(coluna, quadro.colunas));
    })
    .sort((a, b) => `${b.completed_at ?? ''}`.localeCompare(`${a.completed_at ?? ''}`));
}

export async function reordenarCardsConfec(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id, position) => supabase.from('confec_kanban_cards').update({ position } as never).eq('id', id)),
  );
}

export async function excluirCardConfec(id: string): Promise<void> {
  const { error } = await supabase.from('confec_kanban_cards').delete().eq('id', id);
  if (error) throw erroTabela(error.message);
}

export async function criarColunaConfec(title: string, color: string): Promise<void> {
  const nome = title.trim();
  if (!nome) throw new Error('Informe o nome da lista.');
  const { data, error } = await supabase.from('confec_kanban_columns').select('slug,position').order('position');
  if (error) throw erroTabela(error.message);
  const usados = new Set(((data ?? []) as { slug: string }[]).map((row) => row.slug));
  let slug = slugBase(nome);
  let n = 2;
  while (usados.has(slug)) {
    slug = `${slugBase(nome)}-${n}`;
    n += 1;
  }
  const position = ((data ?? []) as { position: number }[]).reduce((max, row) => Math.max(max, row.position), -1) + 1;
  const { error: criar } = await supabase.from('confec_kanban_columns').insert({ title: nome, slug, color, position } as never);
  if (criar) throw erroTabela(criar.message);
}

export async function atualizarColunaConfec(id: string, title: string, color: string): Promise<void> {
  const nome = title.trim();
  if (!nome) throw new Error('Informe o nome da lista.');
  const { error } = await supabase.from('confec_kanban_columns').update({ title: nome, color } as never).eq('id', id);
  if (error) throw erroTabela(error.message);
}

export async function excluirColunaConfec(id: string, colunas: ConfecColuna[]): Promise<void> {
  if (colunas.length <= 1) throw new Error('A última lista não pode ser excluída.');
  const ordenadas = [...colunas].sort((a, b) => a.position - b.position);
  const destino = ordenadas.find((coluna) => coluna.id !== id);
  if (!destino) throw new Error('A última lista não pode ser excluída.');
  const atual = ordenadas.find((coluna) => coluna.id === id);
  if (!atual) return;
  const restantes = ordenadas.filter((coluna) => coluna.id !== id);
  const saiu = ehColunaConclusao(atual, ordenadas) && !ehColunaConclusao(destino, restantes);
  const entrou = !ehColunaConclusao(atual, ordenadas) && ehColunaConclusao(destino, restantes);
  const { data, error: buscar } = await supabase.from('confec_kanban_cards').select('id').eq('status', atual.slug);
  if (buscar) throw erroTabela(buscar.message);
  const ids = ((data ?? []) as { id: string }[]).map((row) => row.id);
  if (ids.length) {
    const patch: Record<string, unknown> = { status: destino.slug, updated_at: new Date().toISOString() };
    if (saiu) patch.completed_at = null;
    if (entrou) patch.completed_at = new Date().toISOString();
    const { error: mover } = await supabase.from('confec_kanban_cards').update(patch as never).in('id', ids);
    if (mover) throw erroTabela(mover.message);
    if (saiu || entrou) {
      const etiqueta = await garantirEtiquetaConcluido();
      for (const cardId of ids) {
        if (entrou) {
          await substituirEtiquetas(cardId, [etiqueta.id]);
          continue;
        }
        const { data: vinculos, error } = await supabase.from('confec_kanban_card_labels').select('label_id').eq('card_id', cardId);
        if (error) throw erroTabela(error.message);
        const labelIds = ((vinculos ?? []) as { label_id: string }[])
          .map((row) => row.label_id)
          .filter((labelId) => labelId !== etiqueta.id);
        await substituirEtiquetas(cardId, labelIds);
      }
    }
  }
  const { error } = await supabase.from('confec_kanban_columns').delete().eq('id', id);
  if (error) throw erroTabela(error.message);
}

export async function reordenarColunasConfec(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id, position) => supabase.from('confec_kanban_columns').update({ position } as never).eq('id', id)),
  );
}

export async function salvarEtiquetaConfec(params: { id?: string; name: string; color: string }): Promise<void> {
  const name = params.name.trim();
  if (!name) throw new Error('Informe o nome da etiqueta.');
  const query = params.id
    ? supabase.from('confec_kanban_labels').update({ name, color: params.color } as never).eq('id', params.id)
    : supabase.from('confec_kanban_labels').insert({ name, color: params.color } as never);
  const { error } = await query;
  if (error) throw erroTabela(error.message);
}

export async function excluirEtiquetaConfec(id: string): Promise<void> {
  const { error } = await supabase.from('confec_kanban_labels').delete().eq('id', id);
  if (error) throw erroTabela(error.message);
}

export async function adicionarComentarioConfec(cardId: string, texto: string, authorEmail: string): Promise<void> {
  const limpo = texto.trim();
  if (!limpo) throw new Error('Escreva o comentário.');
  const { error } = await supabase
    .from('confec_kanban_card_comments')
    .insert({ card_id: cardId, texto: limpo, author_email: authorEmail } as never);
  if (error) throw erroTabela(error.message);
}

export async function editarComentarioConfec(id: string, texto: string): Promise<void> {
  const limpo = texto.trim();
  if (!limpo) throw new Error('Escreva o comentário.');
  const { error } = await supabase
    .from('confec_kanban_card_comments')
    .update({ texto: limpo, updated_at: new Date().toISOString() } as never)
    .eq('id', id);
  if (error) throw erroTabela(error.message);
}

export async function excluirComentarioConfec(id: string): Promise<void> {
  const { error } = await supabase.from('confec_kanban_card_comments').delete().eq('id', id);
  if (error) throw erroTabela(error.message);
}

export async function adicionarChecklistConfec(cardId: string, texto: string): Promise<void> {
  const limpo = texto.trim();
  if (!limpo) throw new Error('Escreva o item.');
  const { error } = await supabase.from('kanban_card_checklist').insert({
    card_id: cardId,
    card_type: 'confec',
    texto: limpo,
    feito: false,
    position: Date.now(),
  } as never);
  if (error) throw erroTabela(error.message);
}

export async function alternarChecklistConfec(id: string, feito: boolean): Promise<void> {
  const { error } = await supabase.from('kanban_card_checklist').update({ feito } as never).eq('id', id);
  if (error) throw erroTabela(error.message);
}

export async function excluirChecklistConfec(id: string): Promise<void> {
  const { error } = await supabase.from('kanban_card_checklist').delete().eq('id', id);
  if (error) throw erroTabela(error.message);
}

function aceitaArquivo(mime: string, nome: string): boolean {
  const tipo = mime.toLowerCase();
  if (MIME_OK.some((prefixo) => (prefixo.endsWith('/') ? tipo.startsWith(prefixo) : tipo === prefixo))) return true;
  return /\.(png|jpe?g|gif|webp|mp4|mov|pdf|txt|csv|xlsx?|docx?|pptx?|zip|rar|7z)$/i.test(nome);
}

export async function enviarAnexoConfec(params: {
  cardId: string;
  arquivo: Blob;
  nome: string;
  mime: string;
  imagem: boolean;
  authorEmail: string;
}): Promise<void> {
  if (params.arquivo.size > LIMITE_ARQUIVO_BYTES) throw new Error('O arquivo passa de 5 GB.');
  if (!aceitaArquivo(params.mime, params.nome)) throw new Error('Tipo de arquivo não aceito.');
  const seguro = params.nome.replace(/[^\w.\-]+/g, '_').slice(0, 80) || 'arquivo';
  const path = `${params.cardId}/${Date.now()}-${seguro}`;
  const { error: up } = await supabase.storage.from(BUCKET_CONFEC).upload(path, params.arquivo, {
    contentType: params.mime || 'application/octet-stream',
    upsert: false,
  });
  if (up) throw new Error(up.message);
  const tabela = params.imagem ? 'confec_kanban_card_images' : 'confec_kanban_card_files';
  const linha = params.imagem
    ? { card_id: params.cardId, storage_path: path, nome: params.nome, created_by_email: params.authorEmail }
    : {
        card_id: params.cardId,
        storage_path: path,
        nome: params.nome,
        tamanho: params.arquivo.size,
        mime: params.mime,
        created_by_email: params.authorEmail,
      };
  const { error } = await supabase.from(tabela).insert(linha as never);
  if (error) throw erroTabela(error.message);
}

export async function excluirAnexoConfec(anexo: ConfecAnexo, imagem: boolean): Promise<void> {
  await supabase.storage.from(BUCKET_CONFEC).remove([anexo.storage_path]);
  const tabela = imagem ? 'confec_kanban_card_images' : 'confec_kanban_card_files';
  const { error } = await supabase.from(tabela).delete().eq('id', anexo.id);
  if (error) throw erroTabela(error.message);
}

export function assinarQuadroConfec(aoMudar: () => void): () => void {
  const tabelas = [
    'confec_kanban_columns',
    'confec_kanban_cards',
    'confec_kanban_labels',
    'confec_kanban_card_labels',
    'confec_kanban_card_images',
    'confec_kanban_card_files',
    'confec_kanban_card_comments',
    'kanban_card_checklist',
  ];
  const canal = supabase.channel('confec-kanban');
  for (const table of tabelas) {
    canal.on('postgres_changes', { event: '*', schema: 'public', table }, () => aoMudar());
  }
  canal.subscribe();
  return () => {
    void supabase.removeChannel(canal);
  };
}
