-- RLS completo do painel ADM (auditoria + override de limites).
-- Execute UMA VEZ no SQL Editor do Supabase.
-- Corrige "permission denied for table users" (políticas antigas consultavam auth.users).

-- ---------------------------------------------------------------------------
-- Helper: valida admin pelo e-mail do JWT (não acessa auth.users)
-- ---------------------------------------------------------------------------
create or replace function public.painel_admin_ativo(roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users au
    where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and coalesce(au.active, true) = true
      and (roles is null or au.role = any (roles))
  );
$$;

revoke all on function public.painel_admin_ativo(text[]) from public;
grant execute on function public.painel_admin_ativo(text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_audit_logs
-- ---------------------------------------------------------------------------
alter table public.admin_audit_logs enable row level security;

drop policy if exists "deny_all_admin_audit_logs" on public.admin_audit_logs;
drop policy if exists painel_admin_audit_select on public.admin_audit_logs;
drop policy if exists painel_admin_audit_insert on public.admin_audit_logs;

create policy painel_admin_audit_select
on public.admin_audit_logs
for select
to authenticated
using (public.painel_admin_ativo());

create policy painel_admin_audit_insert
on public.admin_audit_logs
for insert
to authenticated
with check (public.painel_admin_ativo());

-- ---------------------------------------------------------------------------
-- assinatura_limites_override
-- ---------------------------------------------------------------------------
alter table public.assinatura_limites_override enable row level security;

drop policy if exists "deny_all_assinatura_limites_override" on public.assinatura_limites_override;
drop policy if exists painel_admin_override_select on public.assinatura_limites_override;
drop policy if exists painel_admin_override_insert on public.assinatura_limites_override;
drop policy if exists painel_admin_override_update on public.assinatura_limites_override;

create policy painel_admin_override_select
on public.assinatura_limites_override
for select
to authenticated
using (public.painel_admin_ativo());

create policy painel_admin_override_insert
on public.assinatura_limites_override
for insert
to authenticated
with check (public.painel_admin_ativo(array['owner', 'manager']::text[]));

create policy painel_admin_override_update
on public.assinatura_limites_override
for update
to authenticated
using (public.painel_admin_ativo(array['owner', 'manager']::text[]))
with check (public.painel_admin_ativo(array['owner', 'manager']::text[]));
