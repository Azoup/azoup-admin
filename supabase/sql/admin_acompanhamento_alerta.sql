-- Prazo, por coluna do acompanhamento, para o último contato ficar vermelho.
-- Execute no SQL Editor do Supabase (requer painel_admin_ativo).

create table if not exists public.admin_acompanhamento_alerta (
  coluna text primary key
    check (coluna in (
      'fila_espera',
      'primeiro_contato',
      'treinamento_acompanhamento',
      'sistema_em_uso',
      'treinamento_finalizado',
      'acompanhamento_finalizado',
      'cancelado'
    )),
  dias integer not null default 7 check (dias >= 0 and dias <= 3650),
  updated_at timestamptz not null default now()
);

alter table public.admin_acompanhamento_alerta
  drop constraint if exists admin_acompanhamento_alerta_coluna_check;

do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'admin_acompanhamento_alerta'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%coluna%'
  loop
    execute format('alter table public.admin_acompanhamento_alerta drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.admin_acompanhamento_alerta
  add constraint admin_acompanhamento_alerta_coluna_check
  check (coluna in (
    'fila_espera',
    'primeiro_contato',
    'treinamento_acompanhamento',
    'sistema_em_uso',
    'treinamento_finalizado',
    'acompanhamento_finalizado',
    'cancelado'
  ));

insert into public.admin_acompanhamento_alerta (coluna, dias)
values
  ('fila_espera', 7),
  ('primeiro_contato', 7),
  ('treinamento_acompanhamento', 7),
  ('sistema_em_uso', 7),
  ('treinamento_finalizado', 7),
  ('acompanhamento_finalizado', 7),
  ('cancelado', 7)
on conflict (coluna) do nothing;

comment on table public.admin_acompanhamento_alerta is
  'Dias sem contato para o texto do card ficar vermelho, por coluna do Kanban.';

alter table public.admin_acompanhamento_alerta enable row level security;

drop policy if exists painel_admin_acompanhamento_alerta_select on public.admin_acompanhamento_alerta;
drop policy if exists painel_admin_acompanhamento_alerta_insert on public.admin_acompanhamento_alerta;
drop policy if exists painel_admin_acompanhamento_alerta_update on public.admin_acompanhamento_alerta;

create policy painel_admin_acompanhamento_alerta_select
on public.admin_acompanhamento_alerta
for select
to authenticated
using (public.painel_admin_ativo());

create policy painel_admin_acompanhamento_alerta_insert
on public.admin_acompanhamento_alerta
for insert
to authenticated
with check (public.painel_admin_ativo());

create policy painel_admin_acompanhamento_alerta_update
on public.admin_acompanhamento_alerta
for update
to authenticated
using (public.painel_admin_ativo())
with check (public.painel_admin_ativo());
