import { env } from '@/src/lib/env';
import { getValidAccessToken } from '@/src/lib/supabase';

const fnUrl = () => {
  const u = env.supabaseUrl.replace(/\/$/, '');
  return `${u}/functions/v1/digisac-historico`;
};

export type DigisacChamado = {
  id: string;
  protocolo: string | null;
  assunto: string | null;
  aberto: boolean;
  inicio: string | null;
  fim: string | null;
};

export type DigisacChamadosSituacao = 'ok' | 'sem_telefone' | 'sem_contato' | 'sem_chamados';

export type DigisacChamadosResposta = {
  situacao: DigisacChamadosSituacao;
  chamados: DigisacChamado[];
};

export type DigisacMensagem = {
  id: string;
  texto: string;
  deEquipe: boolean;
  em: string | null;
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

export async function listarChamadosDigisac(clienteId: string) {
  return invoke<DigisacChamadosResposta>('listar_chamados', { clienteId });
}

export async function enviarMensagemProntaDigisac(clienteId: string, texto: string) {
  return invoke<{ ok: boolean }>('enviar_mensagem_pronta', { clienteId, texto });
}

export async function listarMensagensDigisac(clienteId: string, ticketId: string) {
  return invoke<{ mensagens: DigisacMensagem[] }>('listar_mensagens', { clienteId, ticketId });
}

export async function sincronizarUltimosChamadosDigisac() {
  let ultimo: { atualizados: number; contatos: Record<string, string>; pendentes?: number } = {
    atualizados: 0,
    contatos: {},
    pendentes: 1,
  };
  for (let volta = 0; volta < 4 && (ultimo.pendentes ?? 0) > 0; volta += 1) {
    const lote = await invoke<{ atualizados: number; contatos: Record<string, string>; pendentes?: number }>(
      'sincronizar_ultimos_chamados',
    );
    ultimo = {
      atualizados: ultimo.atualizados + (lote.atualizados ?? 0),
      contatos: { ...ultimo.contatos, ...(lote.contatos ?? {}) },
      pendentes: lote.pendentes ?? 0,
    };
  }
  return ultimo;
}
