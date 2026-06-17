-- UTM de marketing por cliente (signup / landing).
-- Execute no SQL Editor do Supabase.

create table if not exists public.clientes_marketing_utm (
    id uuid primary key default gen_random_uuid(),
    cliente_id uuid not null references public.clientes_azoup(id) on delete cascade,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_content text,
    utm_term text,
    capturado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    constraint clientes_marketing_utm_cliente_id_key unique (cliente_id)
);

create index if not exists idx_clientes_marketing_utm_capturado_em
  on public.clientes_marketing_utm (capturado_em desc);

comment on table public.clientes_marketing_utm is
  'Parâmetros UTM capturados no cadastro do cliente Azoup (um registro por cliente).';

alter table public.clientes_marketing_utm enable row level security;

drop policy if exists painel_admin_marketing_utm_select on public.clientes_marketing_utm;

create policy painel_admin_marketing_utm_select
on public.clientes_marketing_utm
for select
to authenticated
using (public.painel_admin_ativo());
