-- Observações do acompanhamento por cliente (painel ADM).
-- Execute no SQL Editor do Supabase (requer painel_admin_ativo).

create table if not exists public.admin_acompanhamento_observacoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_azoup(id) on delete cascade,
  observacao text not null,
  admin_email text,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_acompanhamento_obs_cliente
  on public.admin_acompanhamento_observacoes (cliente_id, created_at desc);

comment on table public.admin_acompanhamento_observacoes is
  'Observações manuais do time no acompanhamento de clientes (usuário, data/hora e texto).';

alter table public.admin_acompanhamento_observacoes enable row level security;

drop policy if exists painel_admin_acompanhamento_obs_select on public.admin_acompanhamento_observacoes;
drop policy if exists painel_admin_acompanhamento_obs_insert on public.admin_acompanhamento_observacoes;

create policy painel_admin_acompanhamento_obs_select
on public.admin_acompanhamento_observacoes
for select
to authenticated
using (public.painel_admin_ativo());

create policy painel_admin_acompanhamento_obs_insert
on public.admin_acompanhamento_observacoes
for insert
to authenticated
with check (public.painel_admin_ativo());
