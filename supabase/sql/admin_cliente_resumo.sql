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

-- Status Treinou por seção (editável na coluna Treinou; Uso vem ao vivo do banco).
create table if not exists public.admin_cliente_resumo_treinou (
  cliente_id uuid not null references public.clientes_azoup(id) on delete cascade,
  secao text not null,
  status text not null default 'nao_treinou'
    check (status in ('nao_treinou', 'em_treinamento', 'finalizado')),
  admin_email text,
  updated_at timestamptz not null default now(),
  primary key (cliente_id, secao)
);

create index if not exists idx_admin_cliente_resumo_treinou_cliente
  on public.admin_cliente_resumo_treinou (cliente_id);

comment on table public.admin_cliente_resumo_treinou is
  'Status de treinamento por seção do sistema no Resumo do acompanhamento.';

grant select, insert, update, delete on table public.admin_cliente_resumo_treinou to authenticated;

alter table public.admin_cliente_resumo_treinou enable row level security;

drop policy if exists painel_admin_resumo_treinou_select on public.admin_cliente_resumo_treinou;
drop policy if exists painel_admin_resumo_treinou_insert on public.admin_cliente_resumo_treinou;
drop policy if exists painel_admin_resumo_treinou_update on public.admin_cliente_resumo_treinou;
drop policy if exists painel_admin_resumo_treinou_delete on public.admin_cliente_resumo_treinou;

create policy painel_admin_resumo_treinou_select
on public.admin_cliente_resumo_treinou
for select
to authenticated
using (public.painel_admin_ativo());

create policy painel_admin_resumo_treinou_insert
on public.admin_cliente_resumo_treinou
for insert
to authenticated
with check (public.painel_admin_ativo());

create policy painel_admin_resumo_treinou_update
on public.admin_cliente_resumo_treinou
for update
to authenticated
using (public.painel_admin_ativo())
with check (public.painel_admin_ativo());

create policy painel_admin_resumo_treinou_delete
on public.admin_cliente_resumo_treinou
for delete
to authenticated
using (public.painel_admin_ativo());
