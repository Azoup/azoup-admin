-- Status Treinou por seção no Resumo do acompanhamento.
-- Execute no SQL Editor do Supabase (requer painel_admin_ativo).

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
