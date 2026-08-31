-- Coluna do Kanban de acompanhamento por cliente (painel ADM).
-- Sem registro = cliente fica em "fila_espera".
-- Execute no SQL Editor do Supabase (requer painel_admin_ativo).

create table if not exists public.admin_acompanhamento_kanban (
  cliente_id uuid primary key references public.clientes_azoup(id) on delete cascade,
  coluna text not null
    check (coluna in ('fila_espera', 'urgentes', 'precisa_ajuda', 'pode_esperar', 'esta_usando')),
  ordem integer not null default 0,
  admin_email text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_admin_acompanhamento_kanban_coluna
  on public.admin_acompanhamento_kanban (coluna, ordem);

comment on table public.admin_acompanhamento_kanban is
  'Posição manual do cliente no Kanban de acompanhamento (fila + tags).';

alter table public.admin_acompanhamento_kanban enable row level security;

drop policy if exists painel_admin_acompanhamento_kanban_select on public.admin_acompanhamento_kanban;
drop policy if exists painel_admin_acompanhamento_kanban_insert on public.admin_acompanhamento_kanban;
drop policy if exists painel_admin_acompanhamento_kanban_update on public.admin_acompanhamento_kanban;
drop policy if exists painel_admin_acompanhamento_kanban_delete on public.admin_acompanhamento_kanban;

create policy painel_admin_acompanhamento_kanban_select
on public.admin_acompanhamento_kanban
for select
to authenticated
using (public.painel_admin_ativo());

create policy painel_admin_acompanhamento_kanban_insert
on public.admin_acompanhamento_kanban
for insert
to authenticated
with check (public.painel_admin_ativo());

create policy painel_admin_acompanhamento_kanban_update
on public.admin_acompanhamento_kanban
for update
to authenticated
using (public.painel_admin_ativo())
with check (public.painel_admin_ativo());

create policy painel_admin_acompanhamento_kanban_delete
on public.admin_acompanhamento_kanban
for delete
to authenticated
using (public.painel_admin_ativo());
