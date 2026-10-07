import type { GoogleAgendaEvento } from '@/src/services/google-calendar-api';
import { supabase } from '@/src/lib/supabase';
import { dataCalendarioBrasil } from '@/src/utils/format';

export type { GoogleAgendaEvento };

function normalizarEvento(row: GoogleAgendaEvento & { cliente?: GoogleAgendaEvento['cliente'] | GoogleAgendaEvento['cliente'][] }): GoogleAgendaEvento {
  const cliente = Array.isArray(row.cliente) ? (row.cliente[0] ?? null) : (row.cliente ?? null);
  return { ...row, cliente };
}

/** Eventos do mês a partir do cache local. Não chama o Google. */
export async function listarEventosAgendaCache(inicio: string, fim: string, calendarId?: string | null): Promise<GoogleAgendaEvento[]> {
  let q = supabase
    .from('admin_google_agendamentos')
    .select('id,google_event_id,calendar_id,titulo,descricao,inicio,fim,status,cliente_id,match_tipo,cliente:clientes_azoup(id,nome,email)')
    .gte('inicio', inicio)
    .lt('inicio', fim)
    .order('inicio', { ascending: true });
  if (calendarId) q = q.eq('calendar_id', calendarId);
  const { data, error } = await q;
  if (error) {
    if (/admin_google_agendamentos|schema cache|does not exist/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as Array<GoogleAgendaEvento & { cliente?: GoogleAgendaEvento['cliente'] | GoogleAgendaEvento['cliente'][] }>)
    .map(normalizarEvento)
    .filter((ev) => `${ev.status ?? ''}` !== 'cancelled');
}

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

/** Próximo agendamento futuro por cliente, com data e hora. Dia inteiro volta só a data. */
export async function listarProximasReunioesGoogle(clienteIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!clienteIds.length) return map;

  const agora = new Date().toISOString();
  const CHUNK = 200;
  for (let i = 0; i < clienteIds.length; i += CHUNK) {
    const chunk = clienteIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('admin_google_agendamentos')
      .select('cliente_id,inicio,all_day,status')
      .in('cliente_id', chunk)
      .gte('inicio', agora)
      .order('inicio', { ascending: true });

    if (error) {
      if (/admin_google_agendamentos|schema cache|does not exist/i.test(error.message)) {
        return map;
      }
      throw new Error(error.message);
    }

    for (const row of (data ?? []) as {
      cliente_id?: string | null;
      inicio?: string | null;
      all_day?: boolean | null;
      status?: string | null;
    }[]) {
      const cid = `${row.cliente_id ?? ''}`;
      if (!cid || map.has(cid) || !row.inicio || `${row.status ?? ''}` === 'cancelled') continue;
      if (row.all_day) {
        const ymd = dataCalendarioBrasil(row.inicio);
        if (ymd) map.set(cid, ymd);
        continue;
      }
      map.set(cid, row.inicio);
    }
  }
  return map;
}
