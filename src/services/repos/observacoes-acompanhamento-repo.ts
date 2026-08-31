import { supabase } from '@/src/lib/supabase';
import type { AdminAcompanhamentoObservacaoRow } from '@/src/types/azoup';

const CHUNK = 200;

export async function contarObservacoesAcompanhamento(
  clienteIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!clienteIds.length) return map;

  for (let i = 0; i < clienteIds.length; i += CHUNK) {
    const chunk = clienteIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('admin_acompanhamento_observacoes')
      .select('cliente_id')
      .in('cliente_id', chunk);

    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const id = (row as { cliente_id: string }).cliente_id;
      map.set(id, (map.get(id) ?? 0) + 1);
    }
  }
  return map;
}

export async function listarObservacoesAcompanhamento(
  clienteId: string,
): Promise<AdminAcompanhamentoObservacaoRow[]> {
  const { data, error } = await supabase
    .from('admin_acompanhamento_observacoes')
    .select('id,cliente_id,observacao,admin_email,created_at')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);
  return (data ?? []) as AdminAcompanhamentoObservacaoRow[];
}

export async function criarObservacaoAcompanhamento(params: {
  clienteId: string;
  observacao: string;
  adminEmail?: string | null;
}): Promise<AdminAcompanhamentoObservacaoRow> {
  const observacao = params.observacao.trim();
  if (!observacao) throw new Error('Informe a observação.');
  if (!params.clienteId) throw new Error('Cliente inválido.');

  const { data, error } = await supabase
    .from('admin_acompanhamento_observacoes')
    .insert({
      cliente_id: params.clienteId,
      observacao,
      admin_email: params.adminEmail ?? null,
    } as never)
    .select('id,cliente_id,observacao,admin_email,created_at')
    .single();

  if (error) throw new Error(error.message);
  return data as AdminAcompanhamentoObservacaoRow;
}
