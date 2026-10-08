import { env } from '@/src/lib/env';
import { getValidAccessToken } from '@/src/lib/supabase';

const fnUrl = () => {
  const u = env.supabaseUrl.replace(/\/$/, '');
  return `${u}/functions/v1/google-calendar`;
};

export type GoogleAgendaEvento = {
  id: string;
  google_event_id: string;
  calendar_id: string;
  titulo: string;
  descricao?: string | null;
  inicio: string;
  fim: string;
  all_day?: boolean;
  participantes?: Array<{ email?: string; displayName?: string | null }>;
  html_link?: string | null;
  status?: string | null;
  cliente_id?: string | null;
  match_tipo?: 'email_auto' | 'manual' | 'nenhum';
  cliente?: { id: string; nome?: string | null; email?: string | null } | null;
};

export type GoogleConexaoStatus = {
  connected: boolean;
  google_account_email?: string | null;
  calendar_id?: string | null;
  calendar_summary?: string | null;
  connected_by_admin?: string | null;
  connected_at?: string | null;
};

async function authorizedHeaders(): Promise<HeadersInit> {
  const token = await getValidAccessToken();
  if (!env.supabaseAnonKey) throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY ausente');
  return {
    Authorization: `Bearer ${token}`,
    apikey: env.supabaseAnonKey,
    'Content-Type': 'application/json',
  };
}

async function invoke<T>(op: string, payload: unknown = {}): Promise<T> {
  const headers = await authorizedHeaders();
  const res = await fetch(fnUrl(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ op, payload }),
  });
  const raw = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }
  if (!res.ok) {
    const msg =
      (typeof body.error === 'string' && body.error) ||
      (typeof body.message === 'string' && body.message) ||
      raw.slice(0, 400) ||
      res.statusText;
    throw new Error(msg);
  }
  return body as T;
}

export async function statusConexaoGoogle() {
  return invoke<GoogleConexaoStatus>('status_conexao');
}

export async function iniciarOAuthGoogle() {
  return invoke<{ url: string }>('oauth_start');
}

export async function desconectarGoogle() {
  return invoke<{ ok: boolean }>('desconectar');
}

export async function listarCalendariosGoogle() {
  return invoke<{
    calendars: Array<{ id: string; summary?: string; primary?: boolean }>;
    selected: string | null;
  }>('listar_calendarios');
}

export async function definirCalendarioGoogle(calendarId: string) {
  return invoke<{ ok: boolean }>('definir_calendario', { calendar_id: calendarId });
}

export async function sincronizarGoogleAgenda(janela?: { inicio?: string; fim?: string }) {
  return invoke<{ ok: boolean; synced: number }>('sincronizar', janela ?? {});
}

export async function listarEventosGoogle(params?: { inicio?: string; fim?: string }) {
  return invoke<{ eventos: GoogleAgendaEvento[] }>('listar_eventos', params ?? {});
}

export async function resumirAnotacaoReuniao(clienteId: string, data?: string | null) {
  return invoke<{
    assuntos: string;
    proxima_acao: string;
    pendencias: string[];
    google_event_id: string;
    titulo: string;
  }>('resumir_anotacao_reuniao', { clienteId, data: data ?? null });
}

export async function criarEventoGoogle(payload: {
  titulo: string;
  descricao?: string;
  inicio: string;
  fim: string;
  participantes?: string[];
  cliente_id?: string | null;
}) {
  return invoke<{ evento: GoogleAgendaEvento }>('criar_evento', payload);
}

export async function atualizarEventoGoogle(payload: {
  google_event_id: string;
  titulo: string;
  descricao?: string;
  inicio: string;
  fim: string;
  participantes?: string[];
  cliente_id?: string | null;
}) {
  return invoke<{ evento: GoogleAgendaEvento }>('atualizar_evento', payload);
}

export async function excluirEventoGoogle(googleEventId: string) {
  return invoke<{ ok: boolean }>('excluir_evento', { google_event_id: googleEventId });
}

export async function vincularClienteEvento(id: string, clienteId: string) {
  return invoke<{ evento: GoogleAgendaEvento }>('vincular_cliente', { id, cliente_id: clienteId });
}

export async function desvincularClienteEvento(id: string) {
  return invoke<{ evento: GoogleAgendaEvento }>('desvincular_cliente', { id });
}

export async function proximasReunioesGooglePorClientes(clienteIds: string[]) {
  return invoke<{ proximas: Record<string, string> }>('proximas_por_clientes', {
    cliente_ids: clienteIds,
  });
}
