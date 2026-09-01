import { env } from '@/src/lib/env';
import { getValidAccessToken } from '@/src/lib/supabase';

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
  /** IDs prod_xxx — restrito em applies_to.products no Stripe. */
  aplicavel_product_ids?: string[];
  /** Opcional: resolve produto via API Stripe quando product_id não veio do banco. */
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
  const token = await getValidAccessToken();
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

export type ComputeMrrResponse = {
  mrr_centavos: number;
  mrr_bruto_centavos: number;
  desconto_centavos: number;
  assinaturas_com_desconto: number;
  assinaturas_consultadas: number;
  assinaturas_com_erro: number;
};

export async function obterMrrViaFunction() {
  return invoke<ComputeMrrResponse>('compute_mrr', {});
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

export type ClienteCobrancaPayload = {
  cliente_id?: string;
  stripe_subscription_id?: string;
};

export type ClienteCobrancaResponse = {
  cobranca: {
    tem_cupom: boolean;
    cupom_codigo: string | null;
    cupom_nome: string | null;
    desconto_tipo: 'percent' | 'amount' | null;
    desconto_percentual: number | null;
    desconto_valor_centavos: number | null;
    desconto_centavos: number;
    valor_bruto_centavos: number | null;
    valor_liquido_centavos: number | null;
    duracao: string | null;
    duracao_meses: number | null;
    fonte: 'stripe' | 'local';
  };
};

export async function obterCobrancaClienteViaFunction(payload: ClienteCobrancaPayload) {
  return invoke<ClienteCobrancaResponse>('get_cliente_cobranca', payload);
}

export type AcompanhamentoClienteApiRow = {
  id: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  celular?: string | null;
  created_at?: string | null;
  empresa_nome?: string | null;
  empresa_cnpj?: string | null;
  produtos: number;
  vendas: number;
  ordens_producao: number;
  clientes_cadastrados: number;
  fornecedores_cadastrados: number;
  plano_id?: string | null;
  plano_nome?: string | null;
  assinatura_status?: string | null;
  trial_fim?: string | null;
  data_inicio?: string | null;
  data_renovacao?: string | null;
  valor_mensal_atual?: number | null;
};

export async function obterAcompanhamentoViaFunction() {
  return invoke<{ clientes: AcompanhamentoClienteApiRow[] }>('list_acompanhamento', {});
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

export type PlanoOpcoesFlag =
  | 'exibir_para_clientes'
  | 'tem_upgrades'
  | 'is_enterprise'
  | 'requer_cliente_logado';

export type UpdatePlanoOpcoesPayload = {
  plano_id: number;
} & Partial<Record<PlanoOpcoesFlag, boolean>>;

export type CreatePlanoPayload = {
  nome: string;
  descricao?: string | null;
  preco_base_reais: number;
  usuarios_inclusos: number;
  empresas_incluidas?: number;
  armazenamento_gb: number;
  limite_nfe_mensal?: number | null;
  limite_empresas_enterprise?: number | null;
  credito_ia_mensal?: number;
  preco_usuario_adicional?: number;
  preco_cnpj_adicional?: number;
  tem_upgrades?: boolean;
  is_enterprise?: boolean;
  exibir_para_clientes?: boolean;
  requer_cliente_logado?: boolean;
};

export async function criarPlanoStripe(payload: CreatePlanoPayload) {
  return invoke<{ plano: Record<string, unknown> }>('create_plano', payload);
}

export async function atualizarExibicaoPlanoStripe(planoId: number, exibirParaClientes: boolean) {
  return atualizarOpcoesPlanoStripe({ plano_id: planoId, exibir_para_clientes: exibirParaClientes });
}

export async function atualizarOpcoesPlanoStripe(payload: UpdatePlanoOpcoesPayload) {
  return invoke<{ plano: Record<string, unknown> }>('update_plano_opcoes', payload);
}
