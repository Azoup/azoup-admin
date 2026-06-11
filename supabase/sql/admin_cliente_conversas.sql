-- Histórico de conversas com clientes (painel ADM).
-- Execute no SQL Editor do Supabase.

create table if not exists public.admin_cliente_conversas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_azoup(id) on delete cascade,
  data_conversa date not null,
  hora_conversa time,
  descricao text not null,
  admin_email text,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_cliente_conversas_cliente
  on public.admin_cliente_conversas (cliente_id);

create index if not exists idx_admin_cliente_conversas_data
  on public.admin_cliente_conversas (data_conversa desc, created_at desc);

comment on table public.admin_cliente_conversas is
  'Registro manual de conversas/atendimentos com clientes feitos pela equipe administrativa.';

-- Requer painel_admin_ativo (criada em painel_adm_rls_all.sql ou admin_audit_logs_rls.sql)
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

alter table public.admin_cliente_conversas enable row level security;

drop policy if exists painel_admin_conversas_select on public.admin_cliente_conversas;
drop policy if exists painel_admin_conversas_insert on public.admin_cliente_conversas;

create policy painel_admin_conversas_select
on public.admin_cliente_conversas
for select
to authenticated
using (public.painel_admin_ativo());

create policy painel_admin_conversas_insert
on public.admin_cliente_conversas
for insert
to authenticated
with check (public.painel_admin_ativo());
