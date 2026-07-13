-- Congelamento de cliente no painel ADM + data para ligar/chamar de novo.
-- Execute no SQL Editor do Supabase (requer painel_admin_ativo).

create table if not exists public.admin_cliente_congelamento (
  cliente_id uuid primary key references public.clientes_azoup(id) on delete cascade,
  congelado boolean not null default true,
  data_retorno date,
  observacao text,
  admin_email text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_cliente_congelamento_retorno
  on public.admin_cliente_congelamento (congelado, data_retorno)
  where congelado = true;

comment on table public.admin_cliente_congelamento is
  'Congela o acompanhamento do cliente no painel e agenda data para chamar novamente.';

alter table public.admin_cliente_congelamento enable row level security;

drop policy if exists painel_admin_congelamento_select on public.admin_cliente_congelamento;
drop policy if exists painel_admin_congelamento_insert on public.admin_cliente_congelamento;
drop policy if exists painel_admin_congelamento_update on public.admin_cliente_congelamento;
drop policy if exists painel_admin_congelamento_delete on public.admin_cliente_congelamento;

create policy painel_admin_congelamento_select
on public.admin_cliente_congelamento
for select
to authenticated
using (public.painel_admin_ativo());

create policy painel_admin_congelamento_insert
on public.admin_cliente_congelamento
for insert
to authenticated
with check (public.painel_admin_ativo());

create policy painel_admin_congelamento_update
on public.admin_cliente_congelamento
for update
to authenticated
using (public.painel_admin_ativo())
with check (public.painel_admin_ativo());

create policy painel_admin_congelamento_delete
on public.admin_cliente_congelamento
for delete
to authenticated
using (public.painel_admin_ativo());
