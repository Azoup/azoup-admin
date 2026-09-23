import { supabase } from '@/src/lib/supabase';
import type { AdminAcompanhamentoKanbanRow } from '@/src/types/azoup';
import {
  isAcompanhamentoColuna,
  type AcompanhamentoColuna,
} from '@/src/utils/acompanhamento';

const CHUNK = 200;
const SELECT_BASE = 'cliente_id,coluna,ordem,admin_email,updated_at';
const SELECT_FICHA =
  'ultima_reuniao,proxima_reuniao,pendencias_abertas,ultima_dificuldade,proxima_acao';

function faltaColunaFicha(message: string): boolean {
  return /ultima_reuniao|proxima_reuniao|pendencias_abertas|ultima_dificuldade|proxima_acao|schema cache/i.test(
    message,
  );
}

async function buscarKanbanChunk(chunk: string[], colunas: string): Promise<AdminAcompanhamentoKanbanRow[]> {
  const { data, error } = await supabase.from('admin_acompanhamento_kanban').select(colunas).in('cliente_id', chunk);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AdminAcompanhamentoKanbanRow[];
}

export async function listarKanbanAcompanhamento(
  clienteIds: string[],
): Promise<Map<string, AdminAcompanhamentoKanbanRow>> {
  const map = new Map<string, AdminAcompanhamentoKanbanRow>();
  if (!clienteIds.length) return map;

  let colunas = `${SELECT_BASE},${SELECT_FICHA}`;
  for (let i = 0; i < clienteIds.length; i += CHUNK) {
    const chunk = clienteIds.slice(i, i + CHUNK);
    let rows: AdminAcompanhamentoKanbanRow[];
    try {
      rows = await buscarKanbanChunk(chunk, colunas);
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      if (colunas !== SELECT_BASE && faltaColunaFicha(message)) {
        colunas = SELECT_BASE;
        rows = await buscarKanbanChunk(chunk, colunas);
      } else {
        throw e;
      }
    }
    for (const row of rows) {
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
    .select(SELECT_BASE)
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as AdminAcompanhamentoKanbanRow;
}

export async function salvarFichaAcompanhamento(params: {
  clienteId: string;
  coluna: AcompanhamentoColuna;
  adminEmail?: string | null;
  ultimaReuniao?: string | null;
  proximaReuniao?: string | null;
  pendenciasAbertas?: number | null;
  ultimaDificuldade?: string | null;
  proximaAcao?: string | null;
}): Promise<AdminAcompanhamentoKanbanRow> {
  if (!params.clienteId) throw new Error('Cliente inválido.');
  if (!isAcompanhamentoColuna(params.coluna)) throw new Error('Coluna inválida.');

  const pendencias = Number(params.pendenciasAbertas);
  const { data, error } = await supabase
    .from('admin_acompanhamento_kanban')
    .upsert(
      {
        cliente_id: params.clienteId,
        coluna: params.coluna,
        ultima_reuniao: params.ultimaReuniao?.trim() || null,
        proxima_reuniao: params.proximaReuniao?.trim() || null,
        pendencias_abertas: Number.isFinite(pendencias) && pendencias > 0 ? Math.floor(pendencias) : 0,
        ultima_dificuldade: params.ultimaDificuldade?.trim() || null,
        proxima_acao: params.proximaAcao?.trim() || null,
        admin_email: params.adminEmail ?? null,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: 'cliente_id' },
    )
    .select(`${SELECT_BASE},${SELECT_FICHA}`)
    .single();

  if (error) {
    if (faltaColunaFicha(error.message)) {
      throw new Error('Execute supabase/sql/admin_acompanhamento_kanban.sql no Supabase para gravar a ficha do card.');
    }
    throw new Error(error.message);
  }
  return data as unknown as AdminAcompanhamentoKanbanRow;
}
