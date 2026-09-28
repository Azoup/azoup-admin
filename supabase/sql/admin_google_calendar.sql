-- Google Calendar da empresa (agenda única) + cache de eventos no painel ADM.
-- Execute no SQL Editor do Supabase (requer painel_admin_ativo).

create table if not exists public.admin_google_calendar_conexao (
  id smallint primary key default 1 check (id = 1),
  google_account_email text,
  refresh_token text,
  access_token text,
  expires_at timestamptz,
  calendar_id text,
  calendar_summary text,
  connected_by_admin text,
  connected_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.admin_google_calendar_conexao is
  'Conexão OAuth singleton da agenda Google da empresa. Tokens só via service role na edge function.';

create table if not exists public.admin_google_agendamentos (
  id uuid primary key default gen_random_uuid(),
  google_event_id text not null,
  calendar_id text not null,
  titulo text not null default '',
  descricao text,
  inicio timestamptz not null,
  fim timestamptz not null,
  all_day boolean not null default false,
  participantes jsonb not null default '[]'::jsonb,
  html_link text,
  status text,
  cliente_id uuid references public.clientes_azoup(id) on delete set null,
  match_tipo text not null default 'nenhum'
    check (match_tipo in ('email_auto', 'manual', 'nenhum')),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (google_event_id)
);

create index if not exists idx_admin_google_agendamentos_inicio
  on public.admin_google_agendamentos (inicio);

create index if not exists idx_admin_google_agendamentos_cliente
  on public.admin_google_agendamentos (cliente_id, inicio)
  where cliente_id is not null;

comment on table public.admin_google_agendamentos is
  'Cache local dos eventos do Google Calendar, com vínculo opcional ao cliente Azoup.';

alter table public.admin_google_calendar_conexao enable row level security;
alter table public.admin_google_agendamentos enable row level security;

drop policy if exists painel_admin_gcal_conexao_select on public.admin_google_calendar_conexao;
drop policy if exists painel_admin_gcal_conexao_write on public.admin_google_calendar_conexao;
drop policy if exists painel_admin_gcal_eventos_select on public.admin_google_agendamentos;
drop policy if exists painel_admin_gcal_eventos_insert on public.admin_google_agendamentos;
drop policy if exists painel_admin_gcal_eventos_update on public.admin_google_agendamentos;
drop policy if exists painel_admin_gcal_eventos_delete on public.admin_google_agendamentos;

-- Cliente do painel só lê status (sem tokens). Tokens ficam na edge com service role.
create policy painel_admin_gcal_conexao_select
on public.admin_google_calendar_conexao
for select
to authenticated
using (public.painel_admin_ativo());

create policy painel_admin_gcal_eventos_select
on public.admin_google_agendamentos
for select
to authenticated
using (public.painel_admin_ativo());

create policy painel_admin_gcal_eventos_insert
on public.admin_google_agendamentos
for insert
to authenticated
with check (public.painel_admin_ativo());

create policy painel_admin_gcal_eventos_update
on public.admin_google_agendamentos
for update
to authenticated
using (public.painel_admin_ativo())
with check (public.painel_admin_ativo());

create policy painel_admin_gcal_eventos_delete
on public.admin_google_agendamentos
for delete
to authenticated
using (public.painel_admin_ativo());

grant select on table public.admin_google_calendar_conexao to authenticated;
grant select, insert, update, delete on table public.admin_google_agendamentos to authenticated;
