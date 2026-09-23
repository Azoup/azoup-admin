-- Reunião registrada no acompanhamento vira card do Kanban de pendências.
-- A coluna (em andamento / atrasada) sai de data_retorno. Concluída é manual.
-- Participantes são usuarios já vinculados ao cliente_azoup (sem tabela nova de pessoas).
-- Execute no SQL Editor do Supabase (requer painel_admin_ativo).

create table if not exists public.admin_cliente_reunioes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_azoup(id) on delete cascade,
  empresa_nome text,
  assuntos text,
  pendencia text not null,
  proxima_acao text,
  data_retorno date not null,
  participante_ids uuid[] not null default '{}',
  concluida boolean not null default false,
  admin_email text,
  created_at timestamptz not null default now()
);

alter table public.admin_cliente_reunioes
  add column if not exists avulsa boolean not null default false;

comment on column public.admin_cliente_reunioes.avulsa is
  'true = cadastrada direto na tela de pendências; não entra como última reunião.';

create index if not exists idx_admin_cliente_reunioes_cliente
  on public.admin_cliente_reunioes (cliente_id, data_retorno);

create index if not exists idx_admin_cliente_reunioes_retorno
  on public.admin_cliente_reunioes (concluida, data_retorno);

comment on table public.admin_cliente_reunioes is
  'Reunião do acompanhamento e card de pendência. Prazo = data_retorno.';

alter table public.admin_users
  add column if not exists telas_acesso jsonb not null default '[]'::jsonb;

grant select, insert, update, delete on table public.admin_cliente_reunioes to authenticated;

create or replace function public.painel_admin_pode_excluir()
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
      and (
        au.role = 'owner'
        or coalesce(au.telas_acesso, '[]'::jsonb) ? 'excluir'
      )
  );
$$;

revoke all on function public.painel_admin_pode_excluir() from public;
grant execute on function public.painel_admin_pode_excluir() to authenticated;

alter table public.admin_cliente_reunioes enable row level security;

drop policy if exists painel_admin_reunioes_select on public.admin_cliente_reunioes;
drop policy if exists painel_admin_reunioes_insert on public.admin_cliente_reunioes;
drop policy if exists painel_admin_reunioes_update on public.admin_cliente_reunioes;
drop policy if exists painel_admin_reunioes_delete on public.admin_cliente_reunioes;

create policy painel_admin_reunioes_select
on public.admin_cliente_reunioes
for select
to authenticated
using (public.painel_admin_ativo());

create policy painel_admin_reunioes_insert
on public.admin_cliente_reunioes
for insert
to authenticated
with check (public.painel_admin_ativo());

create policy painel_admin_reunioes_update
on public.admin_cliente_reunioes
for update
to authenticated
using (public.painel_admin_ativo())
with check (public.painel_admin_ativo());

create policy painel_admin_reunioes_delete
on public.admin_cliente_reunioes
for delete
to authenticated
using (public.painel_admin_pode_excluir());

-- Admin do painel lê os usuários do cliente para a lista de participantes.
drop policy if exists painel_admin_usuarios_select on public.usuarios;
create policy painel_admin_usuarios_select
on public.usuarios
for select
to authenticated
using (public.painel_admin_ativo());
