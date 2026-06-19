import { supabase } from '@/src/lib/supabase';
import type { CriarSuporteVideoInput, SuporteVideoRow } from '@/src/types/azoup';
import { isSuporteVideoCategoria } from '@/src/constants/suporte-video-categorias';
import { isYoutubeUrlValida } from '@/src/utils/youtube';

export async function listarSuporteVideos(): Promise<SuporteVideoRow[]> {
  const { data, error } = await supabase
    .from('suporte_videos')
    .select('*')
    .order('categoria')
    .order('ordem')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as SuporteVideoRow[];
}

export async function criarSuporteVideo(input: CriarSuporteVideoInput): Promise<SuporteVideoRow> {
  const titulo = input.titulo.trim();
  const youtube_url = input.youtube_url.trim();
  const categoria = input.categoria.trim();

  if (!titulo) throw new Error('Informe o título do vídeo.');
  if (!youtube_url) throw new Error('Informe o link do YouTube.');
  if (!isYoutubeUrlValida(youtube_url)) throw new Error('Link do YouTube inválido.');
  if (!isSuporteVideoCategoria(categoria)) throw new Error('Selecione uma categoria válida.');

  const agora = new Date().toISOString();
  const { data, error } = await supabase
    .from('suporte_videos')
    .insert({
      titulo,
      youtube_url,
      categoria,
      ativo: true,
      created_by_admin: input.created_by_admin ?? null,
      created_at: agora,
      updated_at: agora,
    } as never)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as SuporteVideoRow;
}

export async function excluirSuporteVideo(id: string): Promise<void> {
  const { error } = await supabase.from('suporte_videos').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
