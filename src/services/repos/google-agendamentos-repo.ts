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

/** Agendamentos ainda sem cliente, do mais próximo para os passados. */
export async function listarEventosSemCliente(): Promise<GoogleAgendaEvento[]> {
  const { data, error } = await supabase
    .from('admin_google_agendamentos')
    .select('id,google_event_id,calendar_id,titulo,descricao,inicio,fim,status,cliente_id,match_tipo,participantes')
    .is('cliente_id', null)
    .order('inicio', { ascending: true })
    .limit(300);
  if (error) {
    if (/admin_google_agendamentos|schema cache|does not exist/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  const agora = Date.now();
  const lista = ((data ?? []) as GoogleAgendaEvento[]).filter((ev) => `${ev.status ?? ''}` !== 'cancelled');
  const futuros = lista.filter((ev) => Date.parse(ev.inicio) >= agora);
  const passados = lista.filter((ev) => Date.parse(ev.inicio) < agora).reverse();
  return [...futuros, ...passados];
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

export type ReuniaoSemRegistro = {
  id: string;
  clienteId: string;
  clienteNome: string;
  titulo: string;
  inicio: string;
};

/** Reuniões da agenda que já aconteceram e não têm registro no mesmo dia. */
export async function listarReunioesPassadasSemRegistro(): Promise<ReuniaoSemRegistro[]> {
  const agora = new Date();
  const desde = new Date(agora.getTime() - 90 * 86_400_000).toISOString();
  const ate = agora.toISOString();

  const { data: eventos, error } = await supabase
    .from('admin_google_agendamentos')
    .select('id,titulo,inicio,status,cliente_id,cliente:clientes_azoup(id,nome)')
    .not('cliente_id', 'is', null)
    .gte('inicio', desde)
    .lt('inicio', ate)
    .order('inicio', { ascending: false })
    .limit(500);
  if (error) {
    if (/admin_google_agendamentos|schema cache|does not exist/i.test(error.message)) return [];
    throw new Error(error.message);
  }

  let registros: { cliente_id?: string | null; created_at?: string | null; avulsa?: boolean | null }[] = [];
  const comAvulsa = await supabase
    .from('admin_cliente_reunioes')
    .select('cliente_id,created_at,avulsa')
    .gte('created_at', desde)
    .limit(2000);
  if (comAvulsa.error && /avulsa/i.test(comAvulsa.error.message)) {
    const semAvulsa = await supabase
      .from('admin_cliente_reunioes')
      .select('cliente_id,created_at')
      .gte('created_at', desde)
      .limit(2000);
    if (semAvulsa.error) {
      if (/admin_cliente_reunioes|schema cache/i.test(semAvulsa.error.message)) return [];
      throw new Error(semAvulsa.error.message);
    }
    registros = (semAvulsa.data ?? []) as typeof registros;
  } else if (comAvulsa.error) {
    if (/admin_cliente_reunioes|schema cache/i.test(comAvulsa.error.message)) return [];
    throw new Error(comAvulsa.error.message);
  } else {
    registros = (comAvulsa.data ?? []) as typeof registros;
  }

  const cobertas = new Set<string>();
  for (const row of registros) {
    if (row.avulsa) continue;
    const clienteId = `${row.cliente_id ?? ''}`.trim();
    const dia = dataCalendarioBrasil(row.created_at);
    if (clienteId && dia) cobertas.add(`${clienteId}|${dia}`);
  }

  const saida: ReuniaoSemRegistro[] = [];
  for (const row of (eventos ?? []) as Array<{
    id?: string;
    titulo?: string | null;
    inicio?: string | null;
    status?: string | null;
    cliente_id?: string | null;
    cliente?: { nome?: string | null } | { nome?: string | null }[] | null;
  }>) {
    if (`${row.status ?? ''}` === 'cancelled') continue;
    const clienteId = `${row.cliente_id ?? ''}`.trim();
    const inicio = `${row.inicio ?? ''}`.trim();
    const dia = dataCalendarioBrasil(inicio);
    if (!clienteId || !inicio || !dia || cobertas.has(`${clienteId}|${dia}`)) continue;
    const cliente = Array.isArray(row.cliente) ? row.cliente[0] : row.cliente;
    const nome = `${cliente?.nome ?? ''}`.trim() || 'Cliente';
    saida.push({
      id: `${row.id ?? ''}`,
      clienteId,
      clienteNome: nome,
      titulo: `${row.titulo ?? ''}`.trim() || 'Reunião',
      inicio,
    });
  }
  return saida.filter((item) => item.id);
}
