-- Políticas RLS para o painel administrativo gravar e ler admin_audit_logs.
-- Execute no SQL Editor do Supabase (arquivo autocontido).

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
