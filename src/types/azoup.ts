/**
 * Tipos alinhados ao mapa `AZOUP_TABELAS_IA.md`.
 * Ajuste nomes de colunas aqui se o schema SQL real do Azoup usar variantes
 * (ex.: snake_case diferente); os repositórios centralizam os selects.
 */

export type AdminPapel = 'owner' | 'manager' | 'viewer';

export interface AdminUserRow {
  id: string;
  user_id?: string;
  email?: string | null;
  nome?: string | null;
  papel?: AdminPapel;
  role?: AdminPapel;
  ativo?: boolean;
  active?: boolean;
  /** Telas do painel ADM liberadas para o login (vazio = padrão do role). */
  telas_acesso?: string[] | null;
  created_at?: string;
}

/** Cadastro principal de tenants — alinhado ao `CREATE TABLE clientes_azoup` do Azoup. */
export interface ClienteAzoupRow {
  id: string;
  created_at?: string | null;
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
  cep?: string | null;
  rua?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade_id?: number | null;
  estado?: string | null;
  cpf?: string | null;
  qtde_user?: number | null;
  pais_codigo?: string | null;
  credito_plano?: number | null;
  credito_extra?: number | null;
  credito_ia_mes_ref?: string | null;
  stripe_customer_id?: string | null;
  aceitou_termos?: boolean | null;
  aceitou_termos_em?: string | null;
  empresas_extra?: number | null;
  usuarios_extra?: number | null;
  /** Compat com telas/legado */
  razao_social?: string | null;
  nome_fantasia?: string | null;
  celular?: string | null;
  documento?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface PlanoAssinaturaRow {
  id: string | number;
  nome?: string | null;
  slug?: string | null;
  descricao?: string | null;
  stripe_product_id?: string | null;
  /** Preço mensal base no Stripe (schema Azoup). */
  stripe_price_id_base?: string | null;
  /** Alias legado em alguns ambientes. */
  stripe_price_id?: string | null;
  valor_mensal_centavos?: number | null;
  /** Schema Azoup (`setup_plans.sql`). */
  usuarios_inclusos?: number | null;
  empresas_incluidas?: number | null;
  armazenamento_gb?: number | null;
  credito_ia_mensal?: number | null;
  limite_usuarios?: number | null;
  limite_empresas?: number | null;
  limite_armazenamento_gb?: number | null;
  limite_tokens_ia_mes?: number | null;
  /** Schema Azoup (`setup_plans.sql`). */
  preco_base?: number | string | null;
  preco_usuario_adicional?: number | string | null;
  preco_cnpj_adicional?: number | string | null;
  limite_nfe_mensal?: number | null;
  limite_empresas_enterprise?: number | null;
  tem_upgrades?: boolean | null;
  is_enterprise?: boolean | null;
  ativo?: boolean | null;
  exibir_para_clientes?: boolean | null;
  requer_cliente_logado?: boolean | null;
  stripe_price_id_usuario_adicional?: string | null;
  stripe_price_id_empresa_adicional?: string | null;
  criado_em?: string | null;
  atualizado_em?: string | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export type CriarPlanoAdminInput = {
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

export type AssinaturaStatus =
  | 'ativa'
  | 'trial'
  | 'past_due'
  | 'cancelada'
  | 'incompleta'
  | string;

export interface AssinaturaClienteRow {
  /** `serial` no Postgres — pode vir como number. */
  id: number | string;
  cliente_id: string;
  plano_id?: number | string | null;
  status?: AssinaturaStatus | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  trial_fim?: string | null;
  cancel_at_period_end?: boolean | null;
  /** Schema atual (`assinaturas_clientes`). */
  usuarios_adicionais?: number | null;
  empresas_adicionais?: number | null;
  credito_ia_limite_mensal?: number | null;
  credito_ia_saldo_plano?: number | null;
  credito_ia_extra?: number | null;
  credito_ia_mes_ref?: string | null;
  valor_mensal_atual?: number | null;
  data_ultima_cobranca?: string | null;
  data_proxima_cobranca?: string | null;
  criado_em?: string | null;
  atualizado_em?: string | null;
  stripe_status?: string | null;
  periodo_inicio?: string | null;
  periodo_fim?: string | null;
  trial_utilizado?: boolean | null;
  is_enterprise?: boolean | null;
  stripe_item_id_base?: string | null;
  stripe_item_id_usuario_adicional?: string | null;
  stripe_item_id_empresa_adicional?: string | null;
  /** Compat legado / nomes antigos */
  usuarios_extras?: number | null;
  empresas_extras?: number | null;
  valor_atual_centavos?: number | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export type HistoricoFaturaStatus = 'pago' | 'aberto' | 'falhou' | 'reembolsado' | string;

export interface HistoricoFaturaRow {
  id: string;
  cliente_id?: string | null;
  assinatura_id?: string | null;
  stripe_invoice_id?: string | null;
  valor_centavos?: number | null;
  moeda?: string | null;
  status?: HistoricoFaturaStatus | null;
  periodo_inicio?: string | null;
  periodo_fim?: string | null;
  data_vencimento?: string | null;
  data_pagamento?: string | null;
  tentativa_falha?: number | null;
  created_at?: string | null;
  [key: string]: unknown;
}

export interface AssinaturaLimitesOverrideRow {
  id: string;
  cliente_id: string;
  /** Schema painel ADM (`migration_painel_adm_billing.sql`) */
  usuarios_limite_override?: number | null;
  empresas_limite_override?: number | null;
  armazenamento_gb_override?: number | null;
  credito_ia_override?: number | null;
  active?: boolean | null;
  updated_by_admin?: string | null;
  /** Legado / variantes */
  limite_usuarios?: number | null;
  limite_empresas?: number | null;
  limite_armazenamento_gb?: number | null;
  limite_tokens_ia_mes?: number | null;
  atualizado_em?: string | null;
  atualizado_por_admin_id?: string | null;
  motivo?: string | null;
  [key: string]: unknown;
}

export interface AdminBillingSettingsRow {
  id?: string;
  trial_dias_padrao?: number | null;
  stripe_webhook_secret_rotacao?: string | null;
  metadata?: Record<string, unknown> | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface AdminCouponRow {
  id: string;
  code: string;
  plan_id: number;
  /** Todos os planos vinculados; plan_id = primeiro item. */
  aplicavel_planos_ids?: number[] | null;
  discount_type: 'percent' | 'amount';
  discount_value: number;
  duration: 'once' | 'repeating' | 'forever' | string;
  duration_in_months?: number | null;
  redeem_by?: string | null;
  max_redemptions?: number | null;
  stripe_coupon_id: string;
  stripe_promotion_code_id: string;
  active: boolean;
  created_by_admin?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type InserirCupomAdminInput = {
  codigo: string;
  percent_off?: number | null;
  amount_off_centavos?: number | null;
  duration: 'once' | 'repeating' | 'forever';
  duration_in_months?: number;
  max_redemptions?: number | null;
  redeem_by?: string | null;
  aplicavel_planos_ids: number[];
  stripe_coupon_id: string;
  stripe_promotion_code_id: string;
  created_by_admin?: string | null;
};

export interface AdminClienteConversaRow {
  id: string;
  cliente_id: string;
  data_conversa: string;
  /** Horário em que a conversa ocorreu (HH:MM ou HH:MM:SS). */
  hora_conversa?: string | null;
  descricao: string;
  admin_email?: string | null;
  created_at?: string | null;
}

export interface AdminClienteMensagemDiariaRow {
  cliente_id: string;
  data_marcacao: string;
  admin_email?: string | null;
  updated_at?: string | null;
}

export interface AdminAuditLogRow {
  id: string;
  admin_email?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  admin_user_id?: string | null;
  admin_id?: string | null;
  user_id?: string | null;
  created_by?: string | null;
  created_by_admin_id?: string | null;
  acao?: string | null;
  entidade?: string | null;
  entidade_id?: string | null;
  valores_anteriores?: Record<string, unknown> | null;
  valores_novos?: Record<string, unknown> | null;
  ip?: string | null;
  user_agent?: string | null;
  created_at?: string | null;
  /** Compat: alguns schemas podem usar nomes em inglês */
  action?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  details?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
  dados?: Record<string, unknown> | null;
}

export interface ClienteMarketingUtmRow {
  id: string;
  cliente_id: string;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  capturado_em?: string | null;
  atualizado_em?: string | null;
  clientes_azoup?: Pick<ClienteAzoupRow, 'nome' | 'email'> | null;
}

export interface SuporteVideoRow {
  id: string;
  titulo: string;
  youtube_url: string;
  categoria: string;
  ordem?: number | null;
  ativo?: boolean | null;
  created_by_admin?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type CriarSuporteVideoInput = {
  titulo: string;
  youtube_url: string;
  categoria: string;
  created_by_admin?: string | null;
};

export interface CreditoIaGastoAgg {
  cliente_id: string;
  total_tokens?: number | null;
  total_requisicoes?: number | null;
}

/** Visão agregada para telas administrativas. */
export type ClienteMetricasUso = {
  empresas_cadastradas: number | null;
  produtos_cadastrados: number | null;
  vendas: number | null;
  ordens_producao: number | null;
  /** NF-e geradas (número atribuído, não canceladas). */
  notas_fiscais_emitidas: number | null;
  /** Último login em auth.users dos usuários do tenant; senão última atividade em venda/produto/OP. */
  ultimo_acesso: string | null;
  ultimo_acesso_fonte?: 'auth' | 'atividade' | null;
};

export interface EmpresaAzoupRow {
  id: string;
  cliente_id: string;
  razao_social: string;
  nome_fantasia?: string | null;
  cnpj?: string | null;
  empresa_matriz?: boolean | null;
  ativo?: boolean | null;
  created_at?: string | null;
}

export interface ClienteAzoupAdminView extends ClienteAzoupRow {
  plano?: PlanoAssinaturaRow | null;
  assinatura?: AssinaturaClienteRow | null;
  limites_override?: AssinaturaLimitesOverrideRow | null;
  historico_faturas?: HistoricoFaturaRow[];
  dias_como_assinante?: number;
  meses_em_aberto?: string[];
  cobrancas_falhas?: number;
  metricas_uso?: ClienteMetricasUso | null;
  /** Razão social / nome fantasia da empresa matriz (`empresas.empresa_matriz = true`). */
  empresa_matriz_nome?: string | null;
  empresa_matriz_cnpj?: string | null;
  /** Mensagem/contato marcado como enviado hoje (reset automático a cada dia). */
  mensagem_enviada_hoje?: boolean;
}
