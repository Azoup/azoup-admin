-- Marcação diária de "mensagem enviada" na listagem de clientes (painel ADM).
-- O reset é automático: só conta quando data_marcacao = hoje (America/Sao_Paulo no app).
-- Execute no SQL Editor do Supabase (requer painel_admin_ativo em painel_adm_rls_all.sql).

create table if not exists public.admin_cliente_mensagem_diaria (
  cliente_id uuid primary key references public.clientes_azoup(id) on delete cascade,
  data_marcacao date not null,
  admin_email text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_admin_cliente_mensagem_diaria_data
  on public.admin_cliente_mensagem_diaria (data_marcacao desc);

comment on table public.admin_cliente_mensagem_diaria is
  'Controle diário de contato/mensagem enviada ao cliente pela equipe administrativa.';

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
