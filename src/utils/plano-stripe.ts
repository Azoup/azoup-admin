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
