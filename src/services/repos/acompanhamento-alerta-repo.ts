import { supabase } from '@/src/lib/supabase';
import {
  ACOMPANHAMENTO_COLUNAS,
  isAcompanhamentoColuna,
  type AcompanhamentoColuna,
} from '@/src/utils/acompanhamento';

export const ALERTA_CONTATO_PADRAO = 7;

export type AlertaContatoPorColuna = Record<AcompanhamentoColuna, number>;

export function alertaContatoPadrao(): AlertaContatoPorColuna {
  return Object.fromEntries(ACOMPANHAMENTO_COLUNAS.map((coluna) => [coluna.key, ALERTA_CONTATO_PADRAO])) as AlertaContatoPorColuna;
}

function tabelaAusente(message: string): boolean {
  return /admin_acompanhamento_alerta|schema cache/i.test(message);
}

export async function listarAlertaContato(): Promise<AlertaContatoPorColuna> {
  const mapa = alertaContatoPadrao();
  const { data, error } = await supabase.from('admin_acompanhamento_alerta').select('coluna,dias');
  if (error) {
    if (tabelaAusente(error.message)) return mapa;
    throw new Error(error.message);
  }
  for (const row of (data ?? []) as { coluna?: string; dias?: number | null }[]) {
    if (!isAcompanhamentoColuna(row.coluna)) continue;
    const dias = Number(row.dias);
    if (Number.isFinite(dias) && dias >= 0) mapa[row.coluna] = Math.floor(dias);
  }
  return mapa;
}

export async function salvarAlertaContato(mapa: AlertaContatoPorColuna): Promise<void> {
  const rows = ACOMPANHAMENTO_COLUNAS.map((coluna) => ({
    coluna: coluna.key,
    dias: Math.max(0, Math.floor(Number(mapa[coluna.key]) || 0)),
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('admin_acompanhamento_alerta').upsert(rows, { onConflict: 'coluna' });
  if (error) {
    if (tabelaAusente(error.message)) {
      throw new Error('Execute supabase/sql/admin_acompanhamento_alerta.sql no Supabase.');
    }
    throw new Error(error.message);
  }
}
