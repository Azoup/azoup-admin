-- Cupom Asaas: mesma tabela admin_coupons, sem IDs Stripe e com plano opcional.
-- Idempotente. Execute no SQL Editor ou via supabase db query --linked.

alter table public.admin_coupons
  alter column stripe_coupon_id drop not null,
  alter column stripe_promotion_code_id drop not null,
  alter column plan_id drop not null;

comment on column public.admin_coupons.stripe_coupon_id is
  'Id do cupom no Stripe. Nulo em cupom criado só para Asaas (Confec calcula o desconto).';

comment on column public.admin_coupons.stripe_promotion_code_id is
  'Id do promotion code no Stripe. Nulo em cupom criado só para Asaas.';

comment on column public.admin_coupons.plan_id is
  'Primeiro plano vinculado. Nulo = vale em qualquer plano (Confec Asaas).';
