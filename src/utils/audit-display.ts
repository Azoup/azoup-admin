import type { AdminAuditLogRow } from '@/src/types/azoup';
import { formatDateTimeBR } from '@/src/utils/format';
import { normalizarAuditLogParaExibicao } from '@/src/services/audit';

const ACAO_LABELS: Record<string, string> = {
  LIMITES_OVERRIDE_UPSERT: 'Créditos ou limites alterados',
  STRIPE_COUPON_CREATE: 'Cupom de desconto criado',
  BILLING_TRIAL_DIAS_UPDATE: 'Período de trial alterado',
};

const ENTIDADE_LABELS: Record<string, string> = {
  assinaturas_clientes: 'Assinatura do cliente',
  'assinaturas_clientes+override': 'Assinatura e limites admin',
  assinatura_limites_override: 'Limites administrativos',
  admin_billing_settings: 'Configurações de cobrança',
  admin_coupons: 'Cupom promocional',
  clientes_azoup: 'Cliente',
};

const CAMPO_LABELS: Record<string, string> = {
  credito_ia_extra: 'Crédito IA extra',
  credito_ia_limite_mensal: 'Limite mensal de IA',
  credito_ia_override: 'Crédito IA (teto admin)',
  usuarios_adicionais: 'Usuários adicionais',
  empresas_adicionais: 'Empresas adicionais',
  usuarios_limite_override: 'Limite de usuários',
  empresas_limite_override: 'Limite de empresas',
  armazenamento_gb_override: 'Armazenamento (GB)',
  trial_dias_padrao: 'Dias de trial padrão',
  code: 'Código do cupom',
  codigo: 'Código do cupom',
  codigo_promocional: 'Código promocional',
  discount_type: 'Tipo de desconto',
  discount_value: 'Valor do desconto',
  duration: 'Duração',
  duration_in_months: 'Meses de duração',
  max_redemptions: 'Máximo de resgates',
  plan_id: 'Plano principal (ID)',
  aplicavel_planos_ids: 'Planos vinculados',
  active: 'Ativo',
  percent_off: 'Desconto (%)',
  amount_off_centavos: 'Desconto (centavos)',
};

const CAMPOS_IGNORADOS = new Set([
  'id',
  'created_at',
  'updated_at',
  'created_by_admin',
  'updated_by_admin',
  'stripe_coupon_id',
  'stripe_promotion_code_id',
  'cliente_id',
]);

export type AuditAlteracaoLinha = {
  campo: string;
  de: string;
  para: string;
};

export type AuditCardView = {
  titulo: string;
  resumo: string;
  admin: string;
  dataHora: string;
  area: string;
  alteracoes: AuditAlteracaoLinha[];
};

function rotuloAcao(codigo: string): string {
  return ACAO_LABELS[codigo] ?? codigo.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

function rotuloEntidade(codigo: string): string {
  if (codigo === 'singleton' || codigo === '—') return 'Configuração geral';
  return ENTIDADE_LABELS[codigo] ?? 'Registro administrativo';
}

function rotuloCampo(chave: string): string {
  return CAMPO_LABELS[chave] ?? chave.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function formatValorAudit(chave: string, valor: unknown): string {
  if (valor == null || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  if (chave === 'discount_type') {
    if (valor === 'percent') return 'Percentual';
    if (valor === 'amount') return 'Valor fixo';
  }
  if (chave === 'duration') {
    const map: Record<string, string> = {
      once: 'Uma vez',
      repeating: 'Recorrente',
      forever: 'Permanente',
    };
    return map[`${valor}`] ?? `${valor}`;
  }
  if (typeof valor === 'number' && !Number.isNaN(valor)) {
    return Number.isInteger(valor) ? `${valor}` : valor.toLocaleString('pt-BR');
  }
  if (typeof valor === 'object') return '—';
  return `${valor}`;
}

function chavesRelevantes(antes: Record<string, unknown> | null, depois: Record<string, unknown> | null): string[] {
  const keys = new Set<string>();
  for (const k of Object.keys(antes ?? {})) keys.add(k);
  for (const k of Object.keys(depois ?? {})) keys.add(k);
  return [...keys]
    .filter((k) => !CAMPOS_IGNORADOS.has(k))
    .sort((a, b) => rotuloCampo(a).localeCompare(rotuloCampo(b), 'pt-BR'));
}

function montarAlteracoes(
  antes: Record<string, unknown> | null,
  depois: Record<string, unknown> | null,
  acao: string,
): AuditAlteracaoLinha[] {
  const a = antes ?? {};
  const d = depois ?? {};
  const linhas: AuditAlteracaoLinha[] = [];

  for (const chave of chavesRelevantes(antes, depois)) {
    const vAntes = a[chave];
    const vDepois = d[chave];
    const strAntes = formatValorAudit(chave, vAntes);
    const strDepois = formatValorAudit(chave, vDepois);

    if (Object.keys(a).length === 0 && Object.keys(d).length > 0) {
      linhas.push({ campo: rotuloCampo(chave), de: '—', para: strDepois });
      continue;
    }

    if (strAntes === strDepois) continue;
    linhas.push({ campo: rotuloCampo(chave), de: strAntes, para: strDepois });
  }

  if (!linhas.length && acao === 'STRIPE_COUPON_CREATE' && d.code) {
    linhas.push({ campo: 'Código do cupom', de: '—', para: formatValorAudit('code', d.code) });
  }

  return linhas;
}

function montarResumo(acao: string, entidade: string, alteracoes: AuditAlteracaoLinha[]): string {
  if (acao === 'LIMITES_OVERRIDE_UPSERT') {
    const credito = alteracoes.find((l) => l.campo.toLowerCase().includes('crédito') || l.campo.toLowerCase().includes('ia'));
    if (credito) return `Crédito ou limite de IA atualizado (${credito.de} → ${credito.para}).`;
    if (alteracoes.length === 1) {
      const l = alteracoes[0];
      return `${l.campo} alterado de ${l.de} para ${l.para}.`;
    }
    if (alteracoes.length > 1) return `${alteracoes.length} limites ou créditos foram ajustados neste cliente.`;
    return 'Limites ou créditos do cliente foram atualizados.';
  }
  if (acao === 'BILLING_TRIAL_DIAS_UPDATE') {
    const trial = alteracoes.find((l) => l.campo.includes('trial'));
    if (trial) return `Trial padrão alterado de ${trial.de} para ${trial.para} dias.`;
    return 'Configuração do período de trial foi alterada.';
  }
  if (acao === 'STRIPE_COUPON_CREATE') {
    const codigo = alteracoes.find((l) => l.campo.toLowerCase().includes('código'));
    return codigo ? `Novo cupom "${codigo.para}" cadastrado no Stripe.` : 'Novo cupom promocional cadastrado.';
  }
  if (alteracoes.length === 1) {
    const l = alteracoes[0];
    return `${l.campo}: ${l.de} → ${l.para}.`;
  }
  if (alteracoes.length > 1) return `${alteracoes.length} informações foram alteradas em ${rotuloEntidade(entidade).toLowerCase()}.`;
  return `Alteração registrada em ${rotuloEntidade(entidade).toLowerCase()}.`;
}

export function formatarAuditLogParaCard(item: AdminAuditLogRow): AuditCardView {
  const n = normalizarAuditLogParaExibicao(item);
  const alteracoes = montarAlteracoes(n.antes, n.depois, n.acao);

  const admin =
    item.admin_email ??
    (item.payload as Record<string, unknown> | undefined)?.admin_email?.toString() ??
    item.admin_user_id ??
    item.admin_id ??
    'Administrador';

  return {
    titulo: rotuloAcao(n.acao),
    resumo: montarResumo(n.acao, n.entidade, alteracoes),
    admin: `${admin}`,
    dataHora: formatDateTimeBR(item.created_at),
    area: rotuloEntidade(n.entidade),
    alteracoes,
  };
}
