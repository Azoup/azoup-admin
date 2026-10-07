-- Mensagens prontas enviadas pelo acompanhamento para o contato do cliente na Digisac.
-- Execute no SQL Editor do Supabase (requer painel_admin_ativo).

create table if not exists public.admin_digisac_mensagens_prontas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.admin_digisac_mensagens_prontas is
  'Textos prontos (título e descrição) enviados ao contato do cliente na Digisac.';

grant select, insert, update, delete on table public.admin_digisac_mensagens_prontas to authenticated;

alter table public.admin_digisac_mensagens_prontas enable row level security;

drop policy if exists painel_admin_digisac_prontas_select on public.admin_digisac_mensagens_prontas;
drop policy if exists painel_admin_digisac_prontas_insert on public.admin_digisac_mensagens_prontas;
drop policy if exists painel_admin_digisac_prontas_update on public.admin_digisac_mensagens_prontas;
drop policy if exists painel_admin_digisac_prontas_delete on public.admin_digisac_mensagens_prontas;

create policy painel_admin_digisac_prontas_select
on public.admin_digisac_mensagens_prontas
for select
to authenticated
using (public.painel_admin_ativo());

create policy painel_admin_digisac_prontas_insert
on public.admin_digisac_mensagens_prontas
for insert
to authenticated
with check (public.painel_admin_ativo());

create policy painel_admin_digisac_prontas_update
on public.admin_digisac_mensagens_prontas
for update
to authenticated
using (public.painel_admin_ativo())
with check (public.painel_admin_ativo());

create policy painel_admin_digisac_prontas_delete
on public.admin_digisac_mensagens_prontas
for delete
to authenticated
using (public.painel_admin_ativo());
