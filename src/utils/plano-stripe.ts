import type { PlanoAssinaturaRow } from '@/src/types/azoup';

/** Preço recorrente base no Stripe (`stripe_price_id_base` no schema Azoup). */
export function stripePriceIdDoPlano(plano: PlanoAssinaturaRow): string | null {
  const base = `${plano.stripe_price_id_base ?? ''}`.trim();
  if (base) return base;

  const legado = `${plano.stripe_price_id ?? ''}`.trim();
  return legado || null;
}

/** Produto no Stripe (`stripe_product_id` no schema Azoup). */
export function stripeProductIdDoPlano(plano: PlanoAssinaturaRow): string | null {
  const product = `${plano.stripe_product_id ?? ''}`.trim();
  return product || null;
}

/** Valor mensal em centavos (`preco_base` em reais ou `valor_mensal_centavos` legado). */
export function precoMensalCentavosDoPlano(plano: PlanoAssinaturaRow): number | null {
  if (plano.valor_mensal_centavos != null && !Number.isNaN(Number(plano.valor_mensal_centavos))) {
    return Number(plano.valor_mensal_centavos);
  }
  const precoBase = plano.preco_base;
  if (precoBase != null && !Number.isNaN(Number(precoBase))) {
    return Math.round(Number(precoBase) * 100);
  }
  return null;
}

export function planoExibirParaClientes(plano: PlanoAssinaturaRow): boolean {
  if (typeof plano.exibir_para_clientes === 'boolean') return plano.exibir_para_clientes;
  return true;
}

export function planoRequerClienteLogado(plano: PlanoAssinaturaRow): boolean {
  return Boolean(plano.requer_cliente_logado);
}

export function planoTemUpgrades(plano: PlanoAssinaturaRow): boolean {
  return Boolean(plano.tem_upgrades);
}

export function planoIsEnterprise(plano: PlanoAssinaturaRow): boolean {
  return Boolean(plano.is_enterprise);
}
