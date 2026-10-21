import { statusConexaoGoogle, type GoogleAgendaEvento } from '@/src/services/google-calendar-api';
import { supabase } from '@/src/lib/supabase';
import { listarRegistrosManuaisNoPeriodo } from '@/src/services/repos/reunioes-repo';
import { dataCalendarioBrasil, dataHojeBrasil, somarDiasYmd } from '@/src/utils/format';
import { cobertasDeRegistrosManuais, eventoAgendaSemRegistro } from '@/src/utils/reuniao-sem-registro';

export type { GoogleAgendaEvento };

function normalizarEvento(row: GoogleAgendaEvento & { cliente?: GoogleAgendaEvento['cliente'] | GoogleAgendaEvento['cliente'][] }): GoogleAgendaEvento {
  const cliente = Array.isArray(row.cliente) ? (row.cliente[0] ?? null) : (row.cliente ?? null);
  return { ...row, cliente };
}

const SELECT_EVENTO_AGENDA =
  'id,google_event_id,calendar_id,titulo,descricao,inicio,fim,all_day,status,match_tipo,participantes,html_link,cliente_id,cliente:clientes_azoup(id,nome,email)';

/** Eventos do mês a partir do cache local. Não chama o Google. */
export async function listarEventosAgendaCache(inicio: string, fim: string, calendarId?: string | null): Promise<GoogleAgendaEvento[]> {
  const pagina = 500;
  const lista: GoogleAgendaEvento[] = [];
  for (let from = 0; from < 8000; from += pagina) {
    let q = supabase
      .from('admin_google_agendamentos')
      .select(SELECT_EVENTO_AGENDA)
      .gte('inicio', inicio)
      .lt('inicio', fim)
      .order('inicio', { ascending: true })
      .range(from, from + pagina - 1);
    if (calendarId) q = q.eq('calendar_id', calendarId);
    const { data, error } = await q;
    if (error) {
      if (/admin_google_agendamentos|schema cache|does not exist/i.test(error.message)) return [];
      throw new Error(error.message);
    }
    const rows = ((data ?? []) as Array<GoogleAgendaEvento & { cliente?: GoogleAgendaEvento['cliente'] | GoogleAgendaEvento['cliente'][] }>)
      .map(normalizarEvento)
      .filter((ev) => `${ev.status ?? ''}` !== 'cancelled');
    lista.push(...rows);
    if ((data ?? []).length < pagina) break;
  }
  return lista;
}

/** A lista Sem cliente começa neste dia e segue para frente. */
export const AGENDA_SEM_CLIENTE_DESDE = '2026-09-01T00:00:00-03:00';

/** Agendamentos ainda sem cliente, de setembro de 2026 em diante. */
export async function listarEventosSemCliente(): Promise<GoogleAgendaEvento[]> {
  const pagina = 500;
  const lista: GoogleAgendaEvento[] = [];
  for (let from = 0; from < 4000; from += pagina) {
    const { data, error } = await supabase
      .from('admin_google_agendamentos')
      .select('id,google_event_id,calendar_id,titulo,descricao,inicio,fim,status,cliente_id,match_tipo,participantes')
      .is('cliente_id', null)
      .gte('inicio', AGENDA_SEM_CLIENTE_DESDE)
      .order('inicio', { ascending: true })
      .range(from, from + pagina - 1);
    if (error) {
      if (/admin_google_agendamentos|schema cache|does not exist/i.test(error.message)) return [];
      throw new Error(error.message);
    }
    const rows = ((data ?? []) as GoogleAgendaEvento[]).filter((ev) => `${ev.status ?? ''}` !== 'cancelled');
    lista.push(...rows);
    if ((data ?? []).length < pagina) break;
  }
  const agora = Date.now();
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
  clienteEmail: string;
  clienteTelefone: string;
  titulo: string;
  descricao: string;
  inicio: string;
  fim: string;
  diaInteiro: boolean;
  vinculo: 'email_auto' | 'manual' | 'nenhum';
  participantes: string[];
  linkAgenda: string;
};

function textoParticipantes(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  const saida: string[] = [];
  for (const item of valor) {
    if (typeof item === 'string') {
      const email = item.trim();
      if (email) saida.push(email);
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const pessoa = item as { email?: string; displayName?: string | null };
    const email = `${pessoa.email ?? ''}`.trim();
    const nome = `${pessoa.displayName ?? ''}`.trim();
    if (nome && email) saida.push(`${nome} (${email})`);
    else if (nome || email) saida.push(nome || email);
  }
  return [...new Set(saida)];
}

/** Reuniões da agenda que já começaram e não têm registro manual no mesmo dia. */
export async function listarReunioesPassadasSemRegistro(): Promise<ReuniaoSemRegistro[]> {
  let calendarId: string | null = null;
  try {
    const status = await statusConexaoGoogle();
    if (!status.connected) return [];
    calendarId = status.calendar_id ?? null;
  } catch {
    return [];
  }

  const hoje = dataHojeBrasil();
  const desde = `${somarDiasYmd(hoje, -90)}T00:00:00-03:00`;
  const ate = `${somarDiasYmd(hoje, 1)}T00:00:00-03:00`;
  const [eventos, registros] = await Promise.all([
    listarEventosAgendaCache(desde, ate, calendarId),
    listarRegistrosManuaisNoPeriodo(desde, ate),
  ]);
  const cobertas = cobertasDeRegistrosManuais(registros);
  const agora = Date.now();
  const saida: ReuniaoSemRegistro[] = [];
  for (const ev of eventos) {
    if (!eventoAgendaSemRegistro(ev, cobertas, agora)) continue;
    const clienteId = `${ev.cliente_id ?? ''}`.trim();
    const nome = `${ev.cliente?.nome ?? ''}`.trim() || (clienteId ? 'Cliente' : 'Sem cliente vinculado');
    const vinculo = ev.match_tipo === 'email_auto' || ev.match_tipo === 'manual' ? ev.match_tipo : 'nenhum';
    saida.push({
      id: `${ev.id ?? ''}`,
      clienteId: clienteId || '__sem_cliente__',
      clienteNome: nome,
      clienteEmail: `${ev.cliente?.email ?? ''}`.trim(),
      clienteTelefone: `${ev.cliente?.telefone ?? ''}`.trim(),
      titulo: `${ev.titulo ?? ''}`.trim() || 'Reunião',
      descricao: `${ev.descricao ?? ''}`.trim(),
      inicio: ev.inicio,
      fim: `${ev.fim ?? ''}`.trim(),
      diaInteiro: Boolean(ev.all_day),
      vinculo,
      participantes: textoParticipantes(ev.participantes),
      linkAgenda: `${ev.html_link ?? ''}`.trim(),
    });
  }
  return saida.filter((item) => item.id).sort((a, b) => (a.inicio < b.inicio ? 1 : -1));
}
