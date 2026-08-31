import { supabase } from '@/src/lib/supabase';
import type { AdminAcompanhamentoKanbanRow } from '@/src/types/azoup';
import {
  isAcompanhamentoColuna,
  type AcompanhamentoColuna,
} from '@/src/utils/acompanhamento';

const CHUNK = 200;

export async function listarKanbanAcompanhamento(
  clienteIds: string[],
): Promise<Map<string, AdminAcompanhamentoKanbanRow>> {
  const map = new Map<string, AdminAcompanhamentoKanbanRow>();
  if (!clienteIds.length) return map;

  for (let i = 0; i < clienteIds.length; i += CHUNK) {
    const chunk = clienteIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('admin_acompanhamento_kanban')
      .select('cliente_id,coluna,ordem,admin_email,updated_at')
      .in('cliente_id', chunk);

    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as AdminAcompanhamentoKanbanRow[]) {
      if (!isAcompanhamentoColuna(row.coluna)) continue;
      map.set(row.cliente_id, row);
    }
  }
  return map;
}

export async function moverClienteKanban(params: {
  clienteId: string;
  coluna: AcompanhamentoColuna;
  adminEmail?: string | null;
  ordem?: number;
}): Promise<AdminAcompanhamentoKanbanRow> {
  if (!params.clienteId) throw new Error('Cliente inválido.');
  if (!isAcompanhamentoColuna(params.coluna)) throw new Error('Coluna inválida.');

  const { data, error } = await supabase
    .from('admin_acompanhamento_kanban')
    .upsert(
      {
        cliente_id: params.clienteId,
        coluna: params.coluna,
        ordem: params.ordem ?? 0,
        admin_email: params.adminEmail ?? null,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: 'cliente_id' },
    )
    .select('cliente_id,coluna,ordem,admin_email,updated_at')
    .single();

  if (error) throw new Error(error.message);
  return data as AdminAcompanhamentoKanbanRow;
}
