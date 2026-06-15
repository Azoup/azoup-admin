import { env } from '@/src/lib/env';
import { supabase } from '@/src/lib/supabase';

const fnUrl = () => {
  const u = env.supabaseUrl.replace(/\/$/, '');
  return `${u}/functions/v1/admin-stripe`;
};

export type CreateCouponPayload = {
  codigo: string;
  nome?: string;
  percent_off?: number;
  amount_off_centavos?: number;
  currency?: string;
  duration: 'once' | 'repeating' | 'forever';
  duration_in_months?: number;
  max_redemptions?: number;
  redeem_by?: string | null;
  aplicavel_price_ids?: string[];
  apenas_novas_assinaturas?: boolean;
};

export type StripeSubscriptionPayload = {
  stripe_subscription_id: string;
};

export type AdminAccessPayload = {
  email: string;
  role: 'owner' | 'manager' | 'viewer';
  active: boolean;
  password: string;
  telas_acesso: string[];
};

async function authorizedHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sessão administrativa ausente');
  if (!env.supabaseAnonKey) throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY ausente');
  return {
    Authorization: `Bearer ${token}`,
    /** Obrigatório para `functions/v1/*` no Supabase (sem isso o gateway costuma responder 400/401). */
    apikey: env.supabaseAnonKey,
    'Content-Type': 'application/json',
  };
}

async function invoke<T>(op: string, payload: unknown): Promise<T> {
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
    throw new Error(`admin-stripe (${res.status}): ${msg}`);
  }
  return body as T;
}

export async function criarCupomStripe(payload: CreateCouponPayload) {
  return invoke<{ coupon: Record<string, unknown>; promotion_code: Record<string, unknown> }>('create_coupon', payload);
}

export async function obterAssinaturaStripe(payload: StripeSubscriptionPayload) {
  return invoke<{ subscription: Record<string, unknown> }>('get_subscription', payload);
}

export async function obterAdminProfileViaFunction() {
  return invoke<{ admin_profile: Record<string, unknown> }>('get_admin_profile', {});
}

export async function listarAdminsViaFunction() {
  return invoke<{ admins: Record<string, unknown>[] }>('list_admin_users', {});
}

export async function criarAdminLoginViaFunction(payload: AdminAccessPayload) {
  return invoke<{ admin: Record<string, unknown> }>('create_admin_login', payload);
}

export type UpdateAdminPayload = {
  id: string;
  role: 'owner' | 'manager' | 'viewer';
  active: boolean;
  telas_acesso: string[];
};

export async function atualizarAdminViaFunction(payload: UpdateAdminPayload) {
  return invoke<{ admin: Record<string, unknown> }>('update_admin_user', payload);
}

export type ClienteMetricasPayload = {
  cliente_id: string;
};

export type ClienteMetricasResponse = {
  metricas: {
    empresas_cadastradas: number;
    produtos_cadastrados: number;
    vendas: number;
    ordens_producao: number;
    notas_fiscais_emitidas: number;
    ultimo_acesso: string | null;
    ultimo_acesso_fonte: 'auth' | 'atividade' | null;
  };
};

export async function obterMetricasClienteViaFunction(payload: ClienteMetricasPayload) {
  return invoke<ClienteMetricasResponse>('get_cliente_metricas', payload);
}

export type RegisterAuditLogPayload = {
  acao: string;
  entidade?: string | null;
  entidade_id?: string | number | null;
  valores_anteriores?: Record<string, unknown> | null;
  valores_novos?: Record<string, unknown> | null;
};

export async function registrarAuditoriaViaFunction(payload: RegisterAuditLogPayload) {
  return invoke<{ ok: boolean; id?: string | null }>('register_audit_log', payload);
}
