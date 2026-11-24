/** Espelho de Confec `billingQuote.quoteSubscription` + desconto anual (preview no painel). */

export const ASAAS_MIN_BRL = 5;
export const PRECO_PDV_DEFAULT = 97;
export const PRECO_ECOMMERCE_DEFAULT = 97;
export const PRECO_EMPRESA_FALLBACK = 199;
export const CONFEC_CONVITE_BASE_URL = 'https://confec.azoup.com.br/convite';

export type PreCadastroQuoteLine = {
  codigo: string;
  rotulo: string;
  quantidade: number;
  unitario: number;
  total: number;
};

export type PreCadastroQuoteInput = {
  planoNome?: string | null;
  precoBase: number;
  precoUsuario: number;
  precoEmpresa: number;
  precoPdv: number;
  precoEcommerce: number;
  precoConciliacao: number;
  usuariosAdicionais: number;
  empresasAdicionais: number;
  pdvAssentos: number;
  ecommerceLojas: number;
  conciliacaoContas: number;
  descontoAnualPercent: number;
};

export type PreCadastroQuoteResult = {
  linhas: PreCadastroQuoteLine[];
  subtotal: number;
  totalMensal: number;
  descontoAnualPercent: number;
  mensalComDescontoAnual: number;
  totalAnual: number;
  bloqueio: 'abaixo_minimo_asaas' | null;
};

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function qty(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function line(codigo: string, rotulo: string, quantidade: unknown, unitario: unknown): PreCadastroQuoteLine | null {
  const q = qty(quantidade);
  const unit = roundMoney(Number(unitario) || 0);
  if (!q || unit <= 0) return null;
  return {
    codigo,
    rotulo,
    quantidade: q,
    unitario: unit,
    total: roundMoney(q * unit),
  };
}

export function quotePreCadastro(input: PreCadastroQuoteInput): PreCadastroQuoteResult {
  const linhas = [
    line('plano', input.planoNome || 'Plano', 1, input.precoBase),
    line('usuarios', 'Usuário adicional', input.usuariosAdicionais, input.precoUsuario),
    line('empresas', 'Empresa adicional', input.empresasAdicionais, input.precoEmpresa),
    line('pdv', 'Contratar PDV', input.pdvAssentos, input.precoPdv),
    line('ecommerce', 'Loja e-commerce', input.ecommerceLojas, input.precoEcommerce),
    line('conciliacao', 'Conta de conciliação bancária', input.conciliacaoContas, input.precoConciliacao),
  ].filter((item): item is PreCadastroQuoteLine => Boolean(item));

  const subtotal = roundMoney(linhas.reduce((sum, item) => sum + item.total, 0));
  const totalMensal = subtotal;
  const percent = Math.min(100, Math.max(0, Number(input.descontoAnualPercent) || 0));
  const mensalComDescontoAnual = roundMoney(totalMensal * (1 - percent / 100));
  const totalAnual = roundMoney(mensalComDescontoAnual * 12);

  let bloqueio: 'abaixo_minimo_asaas' | null = null;
  if (totalMensal > 0 && totalMensal < ASAAS_MIN_BRL) bloqueio = 'abaixo_minimo_asaas';

  return {
    linhas,
    subtotal,
    totalMensal,
    descontoAnualPercent: percent,
    mensalComDescontoAnual,
    totalAnual,
    bloqueio,
  };
}

export function valorMensalEfetivo(calculado: number, override: number | null | undefined): number {
  if (override != null && Number.isFinite(override) && override >= 0) return roundMoney(override);
  return roundMoney(calculado);
}

export function valorAnualEfetivo(calculado: number, override: number | null | undefined): number {
  if (override != null && Number.isFinite(override) && override >= 0) return roundMoney(override);
  return roundMoney(calculado);
}

export function linkConvitePreCadastro(token: string): string {
  return `${CONFEC_CONVITE_BASE_URL}/${encodeURIComponent(token)}`;
}

export function precoPdvDeSettings(settings: { preco_pdv_assento?: unknown } | null | undefined): number {
  const n = Number(settings?.preco_pdv_assento);
  return n > 0 ? n : PRECO_PDV_DEFAULT;
}

export function precoEcommerceDeSettings(settings: { preco_ecommerce_loja?: unknown } | null | undefined): number {
  const n = Number(settings?.preco_ecommerce_loja);
  return n > 0 ? n : PRECO_ECOMMERCE_DEFAULT;
}

export function precoConciliacaoDeSettings(settings: { preco_conciliacao_conta?: unknown } | null | undefined): number {
  const n = Number(settings?.preco_conciliacao_conta);
  return n > 0 ? n : 0;
}

export function precoEmpresaDoPlano(plano: { preco_cnpj_adicional?: unknown } | null | undefined): number {
  const n = Number(plano?.preco_cnpj_adicional);
  return n > 0 ? n : PRECO_EMPRESA_FALLBACK;
}
