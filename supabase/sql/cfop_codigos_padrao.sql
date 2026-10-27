-- Catálogo de CFOP do sistema. O painel grava aqui; cada cliente recebe uma cópia em cfop_codigos.
-- Execute no SQL Editor do Supabase (requer painel_admin_ativo).

create table if not exists public.cfop_codigos_padrao (
  codigo text primary key,
  descricao text not null,
  ativo boolean not null default true,
  updated_by_admin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cfop_codigos_padrao_codigo_chk check (codigo ~ '^[0-9]{4,10}$'),
  constraint cfop_codigos_padrao_descricao_chk check (char_length(btrim(descricao)) between 1 and 255)
);

create index if not exists idx_cfop_codigos_padrao_ativo
  on public.cfop_codigos_padrao (ativo, codigo);

comment on table public.cfop_codigos_padrao is
  'CFOP padrão do Confec. Incluir/editar no painel replica para todos os clientes.';

alter table public.cfop_codigos_padrao enable row level security;

grant select on table public.cfop_codigos_padrao to authenticated;

drop policy if exists painel_cfop_padrao_select on public.cfop_codigos_padrao;
create policy painel_cfop_padrao_select
on public.cfop_codigos_padrao
for select
to authenticated
using (public.painel_admin_ativo());

insert into public.cfop_codigos_padrao (codigo, descricao, ativo)
select trim(codigo), min(trim(descricao)), bool_or(coalesce(ativo, true))
from public.cfop_codigos
where codigo ~ '^[0-9]{4,10}$'
group by trim(codigo)
on conflict (codigo) do nothing;

create or replace function public.painel_aplicar_cfop_padrao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.cfop_codigos (cliente_id, codigo, descricao, ativo, updated_at)
  select c.id, new.codigo, new.descricao, new.ativo, now()
  from public.clientes_azoup c
  on conflict (cliente_id, codigo) do update
    set descricao = excluded.descricao,
        ativo = excluded.ativo,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cfop_padrao_aplicar on public.cfop_codigos_padrao;
create trigger trg_cfop_padrao_aplicar
after insert or update on public.cfop_codigos_padrao
for each row execute function public.painel_aplicar_cfop_padrao();

create or replace function public.painel_cfop_padrao_novo_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.cfop_codigos (cliente_id, codigo, descricao, ativo)
  select new.id, p.codigo, p.descricao, p.ativo
  from public.cfop_codigos_padrao p
  on conflict (cliente_id, codigo) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_cfop_padrao_novo_cliente on public.clientes_azoup;
create trigger trg_cfop_padrao_novo_cliente
after insert on public.clientes_azoup
for each row execute function public.painel_cfop_padrao_novo_cliente();

revoke all on function public.painel_aplicar_cfop_padrao() from public;
revoke all on function public.painel_cfop_padrao_novo_cliente() from public;

notify pgrst, 'reload schema';
