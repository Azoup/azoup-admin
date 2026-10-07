-- Relação cliente ↔ chamado Digisac e telefones extras da mesma empresa.
-- Execute no SQL Editor do Supabase (requer painel_admin_ativo).
-- Os chamados gravados são somente do departamento Azoup Confec.

create table if not exists public.admin_digisac_telefones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_azoup(id) on delete cascade,
  telefone text not null,
  created_at timestamptz not null default now(),
  unique (cliente_id, telefone)
);

create index if not exists idx_admin_digisac_telefones_cliente
  on public.admin_digisac_telefones (cliente_id);

comment on table public.admin_digisac_telefones is
  'Telefones extras do cliente que também chamam na Digisac pela mesma empresa.';

create table if not exists public.admin_digisac_chamados (
  cliente_id uuid not null references public.clientes_azoup(id) on delete cascade,
  ticket_id text not null,
  contact_id text,
  protocolo text,
  assunto text,
  aberto boolean not null default false,
  inicio timestamptz,
  fim timestamptz,
  department_id text,
  updated_at timestamptz not null default now(),
  primary key (cliente_id, ticket_id)
);

create index if not exists idx_admin_digisac_chamados_ticket
  on public.admin_digisac_chamados (ticket_id);

create index if not exists idx_admin_digisac_chamados_inicio
  on public.admin_digisac_chamados (inicio desc);

comment on table public.admin_digisac_chamados is
  'Chamados da Digisac do departamento Azoup Confec ligados ao cliente, para o histórico e relatórios.';

grant select, insert, delete on table public.admin_digisac_telefones to authenticated;
grant select on table public.admin_digisac_chamados to authenticated;

alter table public.admin_digisac_telefones enable row level security;
alter table public.admin_digisac_chamados enable row level security;

drop policy if exists painel_admin_digisac_telefones_select on public.admin_digisac_telefones;
drop policy if exists painel_admin_digisac_telefones_insert on public.admin_digisac_telefones;
drop policy if exists painel_admin_digisac_telefones_delete on public.admin_digisac_telefones;
drop policy if exists painel_admin_digisac_chamados_select on public.admin_digisac_chamados;

create policy painel_admin_digisac_telefones_select
on public.admin_digisac_telefones
for select
to authenticated
using (public.painel_admin_ativo());

create policy painel_admin_digisac_telefones_insert
on public.admin_digisac_telefones
for insert
to authenticated
with check (public.painel_admin_ativo());

create policy painel_admin_digisac_telefones_delete
on public.admin_digisac_telefones
for delete
to authenticated
using (public.painel_admin_ativo());

create policy painel_admin_digisac_chamados_select
on public.admin_digisac_chamados
for select
to authenticated
using (public.painel_admin_ativo());
