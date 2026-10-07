import type { GoogleAgendaEvento } from '@/src/services/google-calendar-api';
import { supabase } from '@/src/lib/supabase';
import { dataCalendarioBrasil } from '@/src/utils/format';

export type { GoogleAgendaEvento };

/** Eventos já sincronizados e vinculados a este cliente. Não chama o Google de novo. */
export async function listarAgendaDoCliente(clienteId: string): Promise<GoogleAgendaEvento[]> {
  if (!clienteId) return [];
  const inicio = new Date(Date.now() - 180 * 86_400_000).toISOString();
  const fim = new Date(Date.now() + 180 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('admin_google_agendamentos')
    .select('id,google_event_id,calendar_id,titulo,descricao,inicio,fim,status,cliente_id,match_tipo')
    .eq('cliente_id', clienteId)
    .gte('inicio', inicio)
    .lte('inicio', fim)
    .order('inicio', { ascending: true });
  if (error) {
    if (/admin_google_agendamentos|schema cache|does not exist/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as GoogleAgendaEvento[]).filter((ev) => `${ev.status ?? ''}` !== 'cancelled');
}

/** Próximo início (YYYY-MM-DD) por cliente a partir do cache Google. */
export async function listarProximasReunioesGoogle(clienteIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!clienteIds.length) return map;

  const agora = new Date().toISOString();
  const CHUNK = 200;
  for (let i = 0; i < clienteIds.length; i += CHUNK) {
    const chunk = clienteIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('admin_google_agendamentos')
      .select('cliente_id,inicio')
      .in('cliente_id', chunk)
      .gte('inicio', agora)
      .order('inicio', { ascending: true });

    if (error) {
      if (/admin_google_agendamentos|schema cache|does not exist/i.test(error.message)) {
        return map;
      }
      throw new Error(error.message);
    }

    for (const row of (data ?? []) as { cliente_id?: string | null; inicio?: string | null }[]) {
      const cid = `${row.cliente_id ?? ''}`;
      if (!cid || map.has(cid) || !row.inicio) continue;
      const ymd = dataCalendarioBrasil(row.inicio);
      if (ymd) map.set(cid, ymd);
    }
  }
  return map;
}
