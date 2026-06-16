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

-- ---------------------------------------------------------------------------
-- admin_cliente_conversas (histórico de conversas com clientes)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- admin_coupons (cupons criados pelo painel)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- admin_cliente_mensagem_diaria (marcação diária de mensagem enviada)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_cliente_mensagem_diaria (
  cliente_id uuid primary key references public.clientes_azoup(id) on delete cascade,
  data_marcacao date not null,
  admin_email text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_admin_cliente_mensagem_diaria_data
  on public.admin_cliente_mensagem_diaria (data_marcacao desc);

alter table public.admin_cliente_mensagem_diaria enable row level security;

drop policy if exists painel_admin_mensagem_diaria_select on public.admin_cliente_mensagem_diaria;
drop policy if exists painel_admin_mensagem_diaria_insert on public.admin_cliente_mensagem_diaria;
drop policy if exists painel_admin_mensagem_diaria_update on public.admin_cliente_mensagem_diaria;
drop policy if exists painel_admin_mensagem_diaria_delete on public.admin_cliente_mensagem_diaria;

create policy painel_admin_mensagem_diaria_select
on public.admin_cliente_mensagem_diaria
for select
to authenticated
using (public.painel_admin_ativo());

create policy painel_admin_mensagem_diaria_insert
on public.admin_cliente_mensagem_diaria
for insert
to authenticated
with check (public.painel_admin_ativo());

create policy painel_admin_mensagem_diaria_update
on public.admin_cliente_mensagem_diaria
for update
to authenticated
using (public.painel_admin_ativo())
with check (public.painel_admin_ativo());

create policy painel_admin_mensagem_diaria_delete
on public.admin_cliente_mensagem_diaria
for delete
to authenticated
using (public.painel_admin_ativo());
