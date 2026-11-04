import { formatBRLFromReais } from '@/src/utils/format';
import type { AssinaturaClienteRow, AssinaturaCupomRow, ClienteAzoupRow } from '@/src/types/azoup';

export type ProvedorPagamentoFiltro = 'todos' | 'asaas' | 'stripe';

export function normalizarProvedor(value?: string | null): 'asaas' | 'stripe' | null {
  const v = `${value ?? ''}`.trim().toLowerCase();
  if (v === 'asaas') return 'asaas';
  if (v === 'stripe') return 'stripe';
  return null;
}

export function rotuloProvedor(cliente?: Pick<ClienteAzoupRow, 'provedor_pagamento'> | null): string {
  const p = normalizarProvedor(cliente?.provedor_pagamento);
  if (p === 'asaas') return 'ASAAS';
  if (p === 'stripe') return 'Stripe';
  return '—';
}

export function isClienteAsaas(cliente?: Pick<ClienteAzoupRow, 'provedor_pagamento'> | null): boolean {
  return normalizarProvedor(cliente?.provedor_pagamento) === 'asaas';
}

export function rotuloCicloCobranca(ciclo?: string | null): string {
  const v = `${ciclo ?? ''}`.trim().toLowerCase();
  if (v === 'mensal') return 'Mensal';
  if (v === 'anual_parcelado') return 'Anual (parcelado)';
  return '—';
}

export function rotuloBillingType(tipo?: string | null): string {
  const v = `${tipo ?? ''}`.trim().toUpperCase();
  if (v === 'CREDIT_CARD') return 'Cartão';
  if (v === 'PIX') return 'PIX';
  if (v === 'BOLETO') return 'Boleto';
  return v || '—';
}

export function temPromocaoAssinatura(assinatura?: AssinaturaClienteRow | null): boolean {
  if (!assinatura) return false;
  if (Number(assinatura.promocao_meses_gratis) > 0) return true;
  if (`${assinatura.promocao_descricao ?? ''}`.trim()) return true;
  if (`${assinatura.promocao_cobranca_em ?? ''}`.trim()) return true;
  if (`${assinatura.promocao_cobranca_status ?? ''}`.trim()) return true;
  return false;
}

export function rotuloPromocaoResumo(assinatura?: AssinaturaClienteRow | null): string {
  if (!temPromocaoAssinatura(assinatura)) return 'Não';
  const meses = Number(assinatura?.promocao_meses_gratis);
  if (Number.isFinite(meses) && meses > 0) {
    return meses === 1 ? 'Sim · 1 mês grátis' : `Sim · ${meses} meses grátis`;
  }
  const desc = `${assinatura?.promocao_descricao ?? ''}`.trim();
  return desc ? `Sim · ${desc}` : 'Sim';
}

export function rotuloCupomAssinatura(cupom?: AssinaturaCupomRow | null): string {
  if (!cupom) return '—';
  const codigo = `${cupom.code ?? ''}`.trim() || 'Cupom';
  const tipo = `${cupom.discount_type ?? ''}`.trim().toLowerCase();
  const valor = Number(cupom.discount_value);
  let desconto = '';
  if (Number.isFinite(valor)) {
    if (tipo === 'percent') desconto = ` (−${valor}%)`;
    else if (tipo === 'amount') desconto = ` (−${formatBRLFromReais(valor)})`;
  }
  return `${codigo}${desconto}`;
}

export function rotuloPacoteAssinatura(assinatura?: AssinaturaClienteRow | null): string {
  if (!assinatura) return '—';
  const partes: string[] = [];
  const pdv = Number(assinatura.pdv_assentos_contratados) || 0;
  const ecom = Number(assinatura.ecommerce_lojas_contratadas) || 0;
  const conc = Number(assinatura.conciliacao_contas_contratadas) || 0;
  const users = Number(assinatura.usuarios_adicionais ?? assinatura.usuarios_extras) || 0;
  const empresas = Number(assinatura.empresas_adicionais ?? assinatura.empresas_extras) || 0;
  if (pdv) partes.push(`${pdv} PDV`);
  if (ecom) partes.push(`${ecom} e-commerce`);
  if (conc) partes.push(`${conc} conciliação`);
  if (users) partes.push(`${users} usuário(s) extra`);
  if (empresas) partes.push(`${empresas} empresa(s) extra`);
  return partes.length ? partes.join(' · ') : '—';
}

export const MESES_COBRANCA_LABELS: Record<string, string> = {
  '': 'Cobrar na hora',
  '1': 'Janeiro',
  '2': 'Fevereiro',
  '3': 'Março',
  '4': 'Abril',
  '5': 'Maio',
  '6': 'Junho',
  '7': 'Julho',
  '8': 'Agosto',
  '9': 'Setembro',
  '10': 'Outubro',
  '11': 'Novembro',
  '12': 'Dezembro',
};
