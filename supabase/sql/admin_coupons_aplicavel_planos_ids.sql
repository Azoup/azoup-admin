-- Vários planos por cupom: admin_coupons.aplicavel_planos_ids
-- plan_id permanece como o primeiro plano (compatibilidade / FK).

alter table public.admin_coupons
  add column if not exists aplicavel_planos_ids integer[] null;

comment on column public.admin_coupons.aplicavel_planos_ids is
  'IDs em planos_assinatura aos quais o cupom se aplica. plan_id = primeiro da lista.';

update public.admin_coupons
set aplicavel_planos_ids = array[plan_id]
where aplicavel_planos_ids is null;
