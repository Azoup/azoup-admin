import { supabase } from '@/src/lib/supabase';
import type {
  AtualizarMetodo360ChecklistItemInput,
  CriarMetodo360ChecklistItemInput,
  Metodo360ChecklistItemRow,
} from '@/src/types/azoup';

const SELECT_COM_VIDEO = `
  id,
  missao_numero,
  nome,
  tela_referencia,
  suporte_video_id,
  criterio_verificacao,
  ordem,
  ativo,
  created_at,
  updated_at,
  suporte_videos ( id, titulo, youtube_url, categoria, ativo )
`;

function mapRow(row: unknown): Metodo360ChecklistItemRow {
  return row as unknown as Metodo360ChecklistItemRow;
}

async function buscarChecklistItemPorId(id: string): Promise<Metodo360ChecklistItemRow | null> {
  const { data, error } = await supabase
    .from('metodo360_checklist_itens')
    .select(SELECT_COM_VIDEO)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapRow(data) : null;
}

function erroSemPermissaoOuNaoEncontrado(): Error {
  return new Error(
    'Item não encontrado ou sem permissão para editar. Confira se você é owner/manager e se o SQL metodo360_painel_rls.sql foi aplicado no Supabase.',
  );
}

function validarMissao(numero: number) {
  if (!Number.isInteger(numero) || numero < 1 || numero > 7) {
    throw new Error('Missão deve ser um número entre 1 e 7.');
  }
}

export async function listarChecklistMetodo360(missaoNumero?: number): Promise<Metodo360ChecklistItemRow[]> {
  if (missaoNumero != null) validarMissao(missaoNumero);

  let query = supabase
    .from('metodo360_checklist_itens')
    .select(SELECT_COM_VIDEO)
    .order('missao_numero')
    .order('ordem')
    .order('created_at');

  if (missaoNumero != null) {
    query = query.eq('missao_numero', missaoNumero);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Metodo360ChecklistItemRow[];
}

async function proximaOrdemMissao(missaoNumero: number): Promise<number> {
  const { data, error } = await supabase
    .from('metodo360_checklist_itens')
    .select('ordem')
    .eq('missao_numero', missaoNumero)
    .order('ordem', { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  const max = data?.[0]?.ordem;
  return (typeof max === 'number' ? max : 0) + 1;
}

export async function criarChecklistMetodo360(
  input: CriarMetodo360ChecklistItemInput,
): Promise<Metodo360ChecklistItemRow> {
  validarMissao(input.missao_numero);
  const nome = input.nome.trim();
  if (!nome) throw new Error('Nome do item é obrigatório.');

  const ordem = input.ordem ?? (await proximaOrdemMissao(input.missao_numero));
  const agora = new Date().toISOString();

  const { data, error } = await supabase
    .from('metodo360_checklist_itens')
    .insert({
      missao_numero: input.missao_numero,
      nome,
      tela_referencia: input.tela_referencia?.trim() || null,
      suporte_video_id: input.suporte_video_id || null,
      criterio_verificacao: input.criterio_verificacao?.trim() || null,
      ordem,
      ativo: input.ativo ?? true,
      updated_at: agora,
    } as never)
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  const row = await buscarChecklistItemPorId(`${data.id}`);
  if (!row) throw new Error('Item criado, mas não foi possível recarregar.');
  return row;
}

export async function atualizarChecklistMetodo360(
  id: string,
  input: AtualizarMetodo360ChecklistItemInput,
): Promise<Metodo360ChecklistItemRow> {
  if (input.missao_numero != null) validarMissao(input.missao_numero);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.nome !== undefined) {
    const nome = input.nome.trim();
    if (!nome) throw new Error('Nome do item é obrigatório.');
    patch.nome = nome;
  }
  if (input.missao_numero !== undefined) patch.missao_numero = input.missao_numero;
  if (input.tela_referencia !== undefined) patch.tela_referencia = input.tela_referencia?.trim() || null;
  if (input.criterio_verificacao !== undefined) patch.criterio_verificacao = input.criterio_verificacao?.trim() || null;
  if (input.suporte_video_id !== undefined) patch.suporte_video_id = input.suporte_video_id || null;
  if (input.ordem !== undefined) patch.ordem = input.ordem;
  if (input.ativo !== undefined) patch.ativo = input.ativo;

  const { data, error } = await supabase
    .from('metodo360_checklist_itens')
    .update(patch as never)
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw erroSemPermissaoOuNaoEncontrado();

  const row = await buscarChecklistItemPorId(id);
  if (!row) throw new Error('Item atualizado, mas não foi possível recarregar.');
  return row;
}

export async function desativarChecklistMetodo360(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('metodo360_checklist_itens')
    .update({ ativo: false, updated_at: new Date().toISOString() } as never)
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw erroSemPermissaoOuNaoEncontrado();
}

export async function reativarChecklistMetodo360(id: string): Promise<Metodo360ChecklistItemRow> {
  return atualizarChecklistMetodo360(id, { ativo: true });
}

export async function moverChecklistMetodo360(
  item: Metodo360ChecklistItemRow,
  direcao: 'up' | 'down',
  irmaos: Metodo360ChecklistItemRow[],
): Promise<void> {
  const ativos = irmaos
    .filter((i) => i.ativo !== false)
    .sort((a, b) => a.ordem - b.ordem || `${a.created_at}`.localeCompare(`${b.created_at}`));

  const idx = ativos.findIndex((i) => i.id === item.id);
  if (idx < 0) return;

  const alvoIdx = direcao === 'up' ? idx - 1 : idx + 1;
  const alvo = ativos[alvoIdx];
  if (!alvo) return;

  const ordemItem = item.ordem;
  const ordemAlvo = alvo.ordem;

  await Promise.all([
    atualizarChecklistMetodo360(item.id, { ordem: ordemAlvo }),
    atualizarChecklistMetodo360(alvo.id, { ordem: ordemItem }),
  ]);
}
