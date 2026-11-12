-- Snapshots do Resumo de acompanhamento (Treinou + Uso por seção).
-- Append-only: cada salvamento cria uma linha; a tela Resumo usa o mais recente.
-- Execute no SQL Editor do Supabase (requer painel_admin_ativo).

create table if not exists public.admin_cliente_resumo_snapshots (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_azoup(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  admin_email text,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_cliente_resumo_snapshots_cliente
  on public.admin_cliente_resumo_snapshots (cliente_id, created_at desc);

comment on table public.admin_cliente_resumo_snapshots is
  'Histórico versionado do Resumo (Treinou/Uso por seção). O mais recente é o vigente.';

comment on column public.admin_cliente_resumo_snapshots.payload is
  'JSON por seção: { treinou, uso: { campo: { quantidade, ultima_data } } }.';

grant select, insert, update, delete on table public.admin_cliente_resumo_snapshots to authenticated;

alter table public.admin_cliente_resumo_snapshots enable row level security;

drop policy if exists painel_admin_resumo_select on public.admin_cliente_resumo_snapshots;
drop policy if exists painel_admin_resumo_insert on public.admin_cliente_resumo_snapshots;
drop policy if exists painel_admin_resumo_update on public.admin_cliente_resumo_snapshots;
drop policy if exists painel_admin_resumo_delete on public.admin_cliente_resumo_snapshots;

create policy painel_admin_resumo_select
on public.admin_cliente_resumo_snapshots
for select
to authenticated
using (public.painel_admin_ativo());

create policy painel_admin_resumo_insert
on public.admin_cliente_resumo_snapshots
for insert
to authenticated
with check (public.painel_admin_ativo());

create policy painel_admin_resumo_update
on public.admin_cliente_resumo_snapshots
for update
to authenticated
using (public.painel_admin_ativo())
with check (public.painel_admin_ativo());

create policy painel_admin_resumo_delete
on public.admin_cliente_resumo_snapshots
for delete
to authenticated
using (public.painel_admin_ativo());
