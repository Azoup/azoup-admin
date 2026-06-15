import { supabase } from '@/src/lib/supabase';
import type {
  AdminBillingSettingsRow,
  AdminCouponRow,
  InserirCupomAdminInput,
  PlanoAssinaturaRow,
} from '@/src/types/azoup';

export function montarLinhaAdminCoupon(input: InserirCupomAdminInput): Omit<AdminCouponRow, 'id' | 'created_at' | 'updated_at'> {
  const amountCentavos = input.amount_off_centavos != null ? Number(input.amount_off_centavos) : null;
  const percentOff = input.percent_off != null ? Number(input.percent_off) : null;
  const usaValorFixo = amountCentavos != null && amountCentavos > 0 && (percentOff == null || percentOff <= 0);

  if (!input.codigo.trim()) throw new Error('Código é obrigatório');
  if (usaValorFixo && (!amountCentavos || amountCentavos <= 0)) {
    throw new Error('Informe um valor fixo válido em centavos.');
  }
  if (!usaValorFixo && (!percentOff || percentOff <= 0)) {
    throw new Error('Informe um desconto percentual válido.');
  }

  const planIds = [...new Set(input.aplicavel_planos_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id)))];
  if (!planIds.length) throw new Error('Selecione ao menos um plano.');

  return {
    code: input.codigo.trim().toUpperCase(),
    plan_id: planIds[0],
    aplicavel_planos_ids: planIds,
    discount_type: usaValorFixo ? 'amount' : 'percent',
    discount_value: usaValorFixo ? amountCentavos! / 100 : percentOff!,
    duration: input.duration,
    duration_in_months: input.duration === 'repeating' ? input.duration_in_months ?? 3 : null,
    redeem_by: input.redeem_by?.trim() ? input.redeem_by.trim() : null,
    max_redemptions: input.max_redemptions ?? null,
    stripe_coupon_id: input.stripe_coupon_id,
    stripe_promotion_code_id: input.stripe_promotion_code_id,
    active: true,
    created_by_admin: input.created_by_admin ?? null,
  };
}

export async function obterBillingSettings(): Promise<AdminBillingSettingsRow | null> {
  const { data, error } = await supabase.from('admin_billing_settings').select('*').limit(1).maybeSingle();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return (data as AdminBillingSettingsRow) ?? null;
}

export async function atualizarTrialDias(dias: number): Promise<void> {
  const atual = await obterBillingSettings();
  if (atual?.id) {
    const { error } = await supabase
      .from('admin_billing_settings')
      .update({ trial_dias_padrao: dias, updated_at: new Date().toISOString() } as never)
      .eq('id', atual.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from('admin_billing_settings').insert({
    trial_dias_padrao: dias,
    updated_at: new Date().toISOString(),
  } as never);
  if (error) throw new Error(error.message);
}

export async function listarPlanos(): Promise<PlanoAssinaturaRow[]> {
  const { data, error } = await supabase.from('planos_assinatura').select('*').order('nome');
  if (error) throw new Error(error.message);
  return (data ?? []) as PlanoAssinaturaRow[];
}

export async function listarCuponsAdmin(): Promise<AdminCouponRow[]> {
  const { data, error } = await supabase.from('admin_coupons').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminCouponRow[];
}

export async function inserirCupomAdmin(input: InserirCupomAdminInput): Promise<AdminCouponRow> {
  const row = montarLinhaAdminCoupon(input);
  const { data, error } = await supabase.from('admin_coupons').insert(row as never).select('*').single();
  if (error) throw new Error(error.message);
  return data as AdminCouponRow;
}
