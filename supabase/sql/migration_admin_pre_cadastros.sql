-- Pré-cadastro ASAAS (painel → link Confec).
-- Idempotente. Requer painel_admin_ativo() (painel_admin_rls_helper.sql / painel_adm_rls_all.sql).

create table if not exists public.admin_pre_cadastros (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  status text not null default 'rascunho'
    check (status in (
      'rascunho',
      'link_gerado',
      'preenchendo',
      'aguardando_pagamento',
      'pago',
      'cancelado',
      'expirado'
    )),

  plano_id integer not null references public.planos_assinatura(id),
  usuarios_adicionais integer not null default 0 check (usuarios_adicionais >= 0),
  empresas_adicionais integer not null default 0 check (empresas_adicionais >= 0),
  pdv_assentos integer not null default 0 check (pdv_assentos >= 0),
  ecommerce_lojas integer not null default 0 check (ecommerce_lojas >= 0),
  conciliacao_contas integer not null default 0 check (conciliacao_contas >= 0),

  valor_mensal_calculado numeric(12, 2) not null default 0,
  valor_mensal_override numeric(12, 2) null,
  valor_anual_calculado numeric(12, 2) not null default 0,
  valor_anual_override numeric(12, 2) null,
  desconto_anual_percent_usado numeric(5, 2) not null default 0,

  -- Titular (SignUpScreen)
  nome_dono text null,
  cpf text null,
  email text not null,
  telefone text null,
  cep text null,
  rua text null,
  numero text null,
  bairro text null,
  cidade text null,
  estado text null,
  pais_codigo text null default '1058',

  -- Empresa (CompanySignUpScreen)
  cnpj text null,
  razao_social text null,
  nome_fantasia text null,
  ie text null,
  cep_empresa text null,
  rua_empresa text null,
  numero_empresa text null,
  bairro_empresa text null,
  cidade_empresa text null,
  estado_empresa text null,
  regime_tributario text null,
  apuracao_pis_cofins text null,

  cliente_id uuid null references public.clientes_azoup(id) on delete set null,
  empresa_id uuid null references public.empresas(id) on delete set null,
  assinatura_id bigint null,

  criado_por_admin text null,
  expira_em timestamptz null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists admin_pre_cadastros_status_idx
  on public.admin_pre_cadastros (status);

create index if not exists admin_pre_cadastros_email_idx
  on public.admin_pre_cadastros (lower(email));

create index if not exists admin_pre_cadastros_criado_em_idx
  on public.admin_pre_cadastros (criado_em desc);

comment on table public.admin_pre_cadastros is
  'Pré-cadastro ASAAS gerado no painel. Link Confec: /convite/{token}.';

comment on column public.admin_pre_cadastros.token is
  'Token opaco da URL do convite.';

comment on column public.admin_pre_cadastros.pdv_assentos is
  'Assentos PDV contratados (preço por assento).';

comment on column public.admin_pre_cadastros.valor_mensal_override is
  'Se preenchido, substitui valor_mensal_calculado no checkout mensal.';

comment on column public.admin_pre_cadastros.valor_anual_override is
  'Se preenchido, substitui valor_anual_calculado (total do ano).';

create or replace function public.admin_pre_cadastros_set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_admin_pre_cadastros_atualizado_em on public.admin_pre_cadastros;
create trigger trg_admin_pre_cadastros_atualizado_em
before update on public.admin_pre_cadastros
for each row
execute function public.admin_pre_cadastros_set_atualizado_em();

alter table public.admin_pre_cadastros enable row level security;

drop policy if exists painel_admin_pre_cadastros_select on public.admin_pre_cadastros;
drop policy if exists painel_admin_pre_cadastros_insert on public.admin_pre_cadastros;
drop policy if exists painel_admin_pre_cadastros_update on public.admin_pre_cadastros;
drop policy if exists painel_admin_pre_cadastros_delete on public.admin_pre_cadastros;

create policy painel_admin_pre_cadastros_select
on public.admin_pre_cadastros
for select
to authenticated
using (public.painel_admin_ativo());

create policy painel_admin_pre_cadastros_insert
on public.admin_pre_cadastros
for insert
to authenticated
with check (public.painel_admin_ativo(array['owner', 'manager']::text[]));

create policy painel_admin_pre_cadastros_update
on public.admin_pre_cadastros
for update
to authenticated
using (public.painel_admin_ativo(array['owner', 'manager']::text[]))
with check (public.painel_admin_ativo(array['owner', 'manager']::text[]));

create policy painel_admin_pre_cadastros_delete
on public.admin_pre_cadastros
for delete
to authenticated
using (public.painel_admin_ativo(array['owner']::text[]));

grant select, insert, update, delete on public.admin_pre_cadastros to authenticated;
