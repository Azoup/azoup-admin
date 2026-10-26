import { supabase } from '@/src/lib/supabase';
import {
  atualizarDescontoPlanoAnualViaFunction,
  atualizarExibicaoPlanoStripe,
  atualizarOpcoesPlanoStripe,
  type UpdatePlanoOpcoesPayload,
} from '@/src/services/stripe-admin-api';
import type {
  AdminBillingSettingsRow,
  AdminCouponRow,
  InserirCupomAdminInput,
  PlanoAssinaturaRow,
} from '@/src/types/azoup';

export function montarLinhaAdminCoupon(input: InserirCupomAdminInput): Omit<AdminCouponRow, 'id' | 'created_at' | 'updated_at'> {
  const amountReaisInformado = input.amount_off_reais != null ? Number(input.amount_off_reais) : null;
  const amountCentavos = input.amount_off_centavos != null ? Number(input.amount_off_centavos) : null;
  const percentOff = input.percent_off != null ? Number(input.percent_off) : null;
  const valorFixoReais =
    amountReaisInformado != null && amountReaisInformado > 0
      ? amountReaisInformado
      : amountCentavos != null && amountCentavos > 0
        ? amountCentavos / 100
        : null;
  const usaValorFixo = valorFixoReais != null && valorFixoReais > 0 && (percentOff == null || percentOff <= 0);

  if (!input.codigo.trim()) throw new Error('Código é obrigatório');
  if (usaValorFixo && (!valorFixoReais || valorFixoReais <= 0)) {
    throw new Error('Informe um valor fixo válido.');
  }
  if (!usaValorFixo && (!percentOff || percentOff <= 0)) {
    throw new Error('Informe um desconto percentual válido.');
  }
  if (input.duration === 'repeating') {
    const meses = Number(input.duration_in_months);
    if (!Number.isFinite(meses) || meses <= 0) throw new Error('Informe quantos meses o desconto vale.');
  }

  const planIds = [...new Set((input.aplicavel_planos_ids ?? []).map((id) => Number(id)).filter((id) => Number.isFinite(id)))];

  return {
    code: input.codigo.trim().toUpperCase(),
    plan_id: planIds[0] ?? null,
    aplicavel_planos_ids: planIds.length ? planIds : null,
    discount_type: usaValorFixo ? 'amount' : 'percent',
    discount_value: usaValorFixo ? valorFixoReais! : percentOff!,
    duration: input.duration,
    duration_in_months: input.duration === 'repeating' ? input.duration_in_months ?? 3 : null,
    redeem_by: input.redeem_by?.trim() ? input.redeem_by.trim() : null,
    max_redemptions: input.max_redemptions ?? null,
    stripe_coupon_id: input.stripe_coupon_id?.trim() || null,
    stripe_promotion_code_id: input.stripe_promotion_code_id?.trim() || null,
    active: true,
    created_by_admin: input.created_by_admin ?? null,
  };
}

function numeroOuNulo(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizarBillingSettings(row: AdminBillingSettingsRow): AdminBillingSettingsRow {
  const trial = numeroOuNulo(row.trial_dias_padrao) ?? numeroOuNulo(row.trial_days_default);
  return {
    ...row,
    trial_dias_padrao: trial,
    trial_days_default: trial,
    desconto_plano_anual_percent: numeroOuNulo(row.desconto_plano_anual_percent) ?? 0,
    updated_by_admin: `${row.updated_by_admin ?? ''}`.trim() || null,
  };
}

/** Percentual 0–100 com até duas casas. Aceita vírgula. */
export function parseDescontoPlanoAnualPercent(raw: string): number {
  const texto = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!texto) throw new Error('Informe o desconto do plano anual.');
  if (!/^\d+(\.\d{1,2})?$/.test(texto)) {
    throw new Error('Use um número de 0 a 100, com até duas casas decimais.');
  }
  const n = Number(texto);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error('O desconto deve ser de 0 a 100.');
  }
  return Math.round(n * 100) / 100;
}

export async function obterBillingSettings(): Promise<AdminBillingSettingsRow | null> {
  const { data, error } = await supabase.from('admin_billing_settings').select('*').limit(1).maybeSingle();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data ? normalizarBillingSettings(data as AdminBillingSettingsRow) : null;
}

export async function atualizarDescontoPlanoAnual(percent: number, adminEmail?: string | null): Promise<AdminBillingSettingsRow> {
  const valor = parseDescontoPlanoAnualPercent(String(percent));
  const res = await atualizarDescontoPlanoAnualViaFunction({
    desconto_plano_anual_percent: valor,
    updated_by_admin: adminEmail?.trim() || null,
  });
  return normalizarBillingSettings(res.settings as AdminBillingSettingsRow);
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

export async function atualizarExibicaoPlano(planoId: number, exibir: boolean): Promise<PlanoAssinaturaRow> {
  const res = await atualizarExibicaoPlanoStripe(planoId, exibir);
  return res.plano as PlanoAssinaturaRow;
}

export async function atualizarOpcoesPlano(payload: UpdatePlanoOpcoesPayload): Promise<PlanoAssinaturaRow> {
  const res = await atualizarOpcoesPlanoStripe(payload);
  return res.plano as PlanoAssinaturaRow;
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

/** Usos Asaas em assinatura_cupons. Tabela do Confec: falha silenciosa se o painel não puder ler. */
export async function contarUsosCupomAsaas(adminCouponId: string): Promise<number | null> {
  const { count, error } = await supabase
    .from('assinatura_cupons')
    .select('id', { count: 'exact', head: true })
    .eq('admin_coupon_id', adminCouponId);
  if (error) return null;
  return count ?? 0;
}
