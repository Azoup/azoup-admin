import { env } from '@/src/lib/env';
import { getValidAccessToken } from '@/src/lib/supabase';

const fnUrl = () => {
  const u = env.supabaseUrl.replace(/\/$/, '');
  return `${u}/functions/v1/confec-notas`;
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

export type NotaEstruturada = {
  ok: boolean;
  linha: string;
  detalhe: string;
  nota_gerada_em?: string;
};

export async function estruturarNotaConfec(params: {
  titulo: string;
  problema: string;
  solucao: string;
  secao: string;
  tela: string;
  telaNova: boolean;
}): Promise<NotaEstruturada> {
  return invoke<NotaEstruturada>('estruturar_nota', {
    titulo: params.titulo,
    problema: params.problema,
    solucao: params.solucao,
    secao: params.secao,
    tela: params.tela,
    tela_nova: params.telaNova,
  });
}

export async function gerarESalvarNotaConfec(params: {
  cardId: string;
  secao?: string;
  tela?: string;
  telaNova?: boolean;
}): Promise<NotaEstruturada> {
  return invoke<NotaEstruturada>('gerar_e_salvar', {
    card_id: params.cardId,
    secao: params.secao,
    tela: params.tela,
    tela_nova: params.telaNova,
  });
}
