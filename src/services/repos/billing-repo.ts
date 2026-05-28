import { supabase } from '@/src/lib/supabase';
import type { AdminBillingSettingsRow, AdminCouponRow, PlanoAssinaturaRow } from '@/src/types/azoup';

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

export async function inserirCupomAdmin(row: Partial<AdminCouponRow>): Promise<AdminCouponRow> {
  const { data, error } = await supabase.from('admin_coupons').insert(row as never).select('*').single();
  if (error) throw new Error(error.message);
  return data as AdminCouponRow;
}
