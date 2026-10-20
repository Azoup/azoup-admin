-- Congelamento de cliente no painel ADM + data para ligar/chamar de novo.
-- Execute no SQL Editor do Supabase (requer painel_admin_ativo).

create table if not exists public.admin_cliente_congelamento (
  cliente_id uuid primary key references public.clientes_azoup(id) on delete cascade,
  congelado boolean not null default true,
  data_retorno date,
  observacao text,
  admin_email text,
  congelado_em timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.admin_cliente_congelamento
  add column if not exists congelado_em timestamptz;

create table if not exists public.admin_cliente_congelamento_historico (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_azoup(id) on delete cascade,
  congelado_em timestamptz not null,
  descongelado_em timestamptz not null default now(),
  data_retorno date,
  observacao text,
  admin_email_congelou text,
  admin_email_descongelou text,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_cliente_congelamento_historico_cliente
  on public.admin_cliente_congelamento_historico (cliente_id, descongelado_em desc);

create index if not exists idx_admin_cliente_congelamento_retorno
  on public.admin_cliente_congelamento (congelado, data_retorno)
  where congelado = true;

comment on table public.admin_cliente_congelamento is
  'Congela o acompanhamento do cliente no painel e agenda data para chamar novamente.';

comment on table public.admin_cliente_congelamento_historico is
  'Períodos em que o cliente ficou congelado (início e fim), registrados ao descongelar.';

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

alter table public.admin_cliente_congelamento_historico enable row level security;

drop policy if exists painel_admin_congelamento_hist_select on public.admin_cliente_congelamento_historico;
drop policy if exists painel_admin_congelamento_hist_insert on public.admin_cliente_congelamento_historico;
drop policy if exists painel_admin_congelamento_hist_update on public.admin_cliente_congelamento_historico;
drop policy if exists painel_admin_congelamento_hist_delete on public.admin_cliente_congelamento_historico;

create policy painel_admin_congelamento_hist_select
on public.admin_cliente_congelamento_historico
for select
to authenticated
using (public.painel_admin_ativo());

create policy painel_admin_congelamento_hist_insert
on public.admin_cliente_congelamento_historico
for insert
to authenticated
with check (public.painel_admin_ativo());

create policy painel_admin_congelamento_hist_update
on public.admin_cliente_congelamento_historico
for update
to authenticated
using (public.painel_admin_ativo())
with check (public.painel_admin_ativo());

create policy painel_admin_congelamento_hist_delete
on public.admin_cliente_congelamento_historico
for delete
to authenticated
using (public.painel_admin_ativo());

grant select, insert, update, delete on table public.admin_cliente_congelamento to authenticated;
grant select, insert, update, delete on table public.admin_cliente_congelamento_historico to authenticated;
