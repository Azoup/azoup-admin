import { supabase } from '@/src/lib/supabase';

export type MensagemProntaDigisac = {
  id: string;
  titulo: string;
  descricao: string;
};

function tabelaAusente(message: string): boolean {
  return /admin_digisac_mensagens_prontas|schema cache/i.test(message);
}

const SQL = 'Execute supabase/sql/admin_digisac_mensagens_prontas.sql no Supabase.';

export async function listarMensagensProntasDigisac(): Promise<MensagemProntaDigisac[]> {
  const { data, error } = await supabase
    .from('admin_digisac_mensagens_prontas')
    .select('id, titulo, descricao')
    .order('titulo', { ascending: true });
  if (error) {
    if (tabelaAusente(error.message)) throw new Error(SQL);
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => ({
    id: `${(row as { id?: string }).id ?? ''}`,
    titulo: `${(row as { titulo?: string }).titulo ?? ''}`.trim(),
    descricao: `${(row as { descricao?: string }).descricao ?? ''}`.trim(),
  })).filter((row) => row.id && row.titulo && row.descricao);
}

export async function salvarMensagemProntaDigisac(input: {
  id?: string | null;
  titulo: string;
  descricao: string;
}): Promise<void> {
  const titulo = input.titulo.trim();
  const descricao = input.descricao.trim();
  if (!titulo) throw new Error('Informe o título.');
  if (!descricao) throw new Error('Informe a descrição.');
  const agora = new Date().toISOString();
  const payload = { titulo, descricao, updated_at: agora };
  const query = input.id
    ? supabase.from('admin_digisac_mensagens_prontas').update(payload).eq('id', input.id)
    : supabase.from('admin_digisac_mensagens_prontas').insert(payload);
  const { error } = await query;
  if (error) {
    if (tabelaAusente(error.message)) throw new Error(SQL);
    throw new Error(error.message);
  }
}

export async function excluirMensagemProntaDigisac(id: string): Promise<void> {
  const { error } = await supabase.from('admin_digisac_mensagens_prontas').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
