-- RLS para admin_coupons (painel ADM).
-- Requer painel_admin_ativo() — rode painel_adm_rls_all.sql antes, se ainda não rodou.

alter table public.admin_coupons enable row level security;

drop policy if exists "deny_all_admin_coupons" on public.admin_coupons;
drop policy if exists painel_admin_coupons_select on public.admin_coupons;
drop policy if exists painel_admin_coupons_insert on public.admin_coupons;

create policy painel_admin_coupons_select
on public.admin_coupons
for select
to authenticated
using (public.painel_admin_ativo());

create policy painel_admin_coupons_insert
on public.admin_coupons
for insert
to authenticated
with check (public.painel_admin_ativo(array['owner', 'manager']::text[]));
