-- Coluna do Kanban de acompanhamento por cliente (painel ADM).
-- Sem registro = cliente fica em "fila_espera".
-- Execute no SQL Editor do Supabase (requer painel_admin_ativo).

create table if not exists public.admin_acompanhamento_kanban (
  cliente_id uuid primary key references public.clientes_azoup(id) on delete cascade,
  coluna text not null
    check (coluna in (
      'fila_espera',
      'primeiro_contato',
      'treinamento_acompanhamento',
      'sistema_em_uso',
      'treinamento_finalizado',
      'acompanhamento_finalizado'
    )),
  ordem integer not null default 0,
  admin_email text,
  updated_at timestamptz not null default now()
);

alter table public.admin_acompanhamento_kanban
  add column if not exists ultima_reuniao date,
  add column if not exists proxima_reuniao date,
  add column if not exists pendencias_abertas integer not null default 0,
  add column if not exists ultima_dificuldade text,
  add column if not exists proxima_acao text;

alter table public.admin_acompanhamento_kanban
  drop constraint if exists admin_acompanhamento_kanban_coluna_check;

do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'admin_acompanhamento_kanban'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%coluna%'
  loop
    execute format('alter table public.admin_acompanhamento_kanban drop constraint %I', r.conname);
  end loop;
end $$;

update public.admin_acompanhamento_kanban
set coluna = case coluna
  when 'urgentes' then 'primeiro_contato'
  when 'precisa_ajuda' then 'treinamento_acompanhamento'
  when 'pode_esperar' then 'fila_espera'
  when 'esta_usando' then 'sistema_em_uso'
  else coluna
end
where coluna in ('urgentes', 'precisa_ajuda', 'pode_esperar', 'esta_usando');

alter table public.admin_acompanhamento_kanban
  add constraint admin_acompanhamento_kanban_coluna_check
  check (coluna in (
    'fila_espera',
    'primeiro_contato',
    'treinamento_acompanhamento',
    'sistema_em_uso',
    'treinamento_finalizado',
    'acompanhamento_finalizado'
  ));

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
