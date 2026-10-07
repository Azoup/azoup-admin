-- Mensagem automática da Digisac para cliente novo.
-- Execute no SQL Editor do Supabase (requer painel_admin_ativo).
--
-- Depois:
-- 1. Secrets: DIGISAC_BASE_URL, DIGISAC_TOKEN, DIGISAC_WEBHOOK_SECRET
-- 2. Deploy: npx supabase functions deploy digisac-boas-vindas --project-ref SEU_REF --no-verify-jwt
-- 3. Database Webhooks (INSERT) em clientes_azoup e empresas, header x-webhook-secret.
-- Detalhes em docs/digisac-boas-vindas.md

create table if not exists public.admin_digisac_boas_vindas (
  id smallint primary key default 1 check (id = 1),
  habilitado boolean not null default false,
  mensagem text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.admin_digisac_boas_vindas (id, habilitado, mensagem)
values (1, false, '')
on conflict (id) do nothing;

comment on table public.admin_digisac_boas_vindas is
  'Texto e interruptor da mensagem automática enviada na Digisac quando um cliente se cadastra.';

create table if not exists public.admin_digisac_envio (
  cliente_id uuid primary key references public.clientes_azoup(id) on delete cascade,
  contact_id text,
  protocolo text,
  status text not null check (status in ('aguardando_empresa', 'enviando', 'enviado', 'erro', 'sem_telefone')),
  erro text,
  updated_at timestamptz not null default now()
);

comment on table public.admin_digisac_envio is
  'Envio único da mensagem de boas-vindas Digisac e protocolo do chamado, por cliente.';

alter table public.admin_digisac_boas_vindas enable row level security;
alter table public.admin_digisac_envio enable row level security;

drop policy if exists painel_admin_digisac_boas_vindas_select on public.admin_digisac_boas_vindas;
drop policy if exists painel_admin_digisac_boas_vindas_insert on public.admin_digisac_boas_vindas;
drop policy if exists painel_admin_digisac_boas_vindas_update on public.admin_digisac_boas_vindas;
drop policy if exists painel_admin_digisac_envio_select on public.admin_digisac_envio;

create policy painel_admin_digisac_boas_vindas_select
on public.admin_digisac_boas_vindas
for select
to authenticated
using (public.painel_admin_ativo());

create policy painel_admin_digisac_boas_vindas_insert
on public.admin_digisac_boas_vindas
for insert
to authenticated
with check (public.painel_admin_ativo());

create policy painel_admin_digisac_boas_vindas_update
on public.admin_digisac_boas_vindas
for update
to authenticated
using (public.painel_admin_ativo())
with check (public.painel_admin_ativo());

create policy painel_admin_digisac_envio_select
on public.admin_digisac_envio
for select
to authenticated
using (public.painel_admin_ativo());

-- A edge function (service role) reivindica o envio. Painel só lê.
create or replace function public.admin_digisac_reivindicar_envio(p_cliente_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  atual text;
  atualizado timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext(p_cliente_id::text));

  select status, updated_at
  into atual, atualizado
  from public.admin_digisac_envio
  where cliente_id = p_cliente_id
  for update;

  if atual is null then
    insert into public.admin_digisac_envio (cliente_id, status)
    values (p_cliente_id, 'enviando');
    return true;
  end if;

  if atual = 'enviando' and atualizado > now() - interval '3 minutes' then
    return false;
  end if;

  if atual = 'aguardando_empresa' or atual = 'enviando' then
    update public.admin_digisac_envio
    set status = 'enviando', erro = null, updated_at = now()
    where cliente_id = p_cliente_id;
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.admin_digisac_reivindicar_envio(uuid) from public;
revoke all on function public.admin_digisac_reivindicar_envio(uuid) from anon;
revoke all on function public.admin_digisac_reivindicar_envio(uuid) from authenticated;
grant execute on function public.admin_digisac_reivindicar_envio(uuid) to service_role;
