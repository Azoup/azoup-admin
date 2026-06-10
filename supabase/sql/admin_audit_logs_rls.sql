-- Políticas RLS para o painel administrativo gravar e ler admin_audit_logs.
-- Execute no SQL Editor do Supabase.

alter table public.admin_audit_logs enable row level security;

drop policy if exists painel_admin_audit_select on public.admin_audit_logs;
drop policy if exists painel_admin_audit_insert on public.admin_audit_logs;

-- Usuário autenticado listado em admin_users (email + active)
create policy painel_admin_audit_select
on public.admin_audit_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_users au
    inner join auth.users u on lower(u.email) = lower(au.email)
    where u.id = auth.uid()
      and coalesce(au.active, true) = true
  )
);

create policy painel_admin_audit_insert
on public.admin_audit_logs
for insert
to authenticated
with check (
  exists (
    select 1
    from public.admin_users au
    inner join auth.users u on lower(u.email) = lower(au.email)
    where u.id = auth.uid()
      and coalesce(au.active, true) = true
  )
);
