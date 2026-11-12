-- Dia do registro da reunião (lançamento retroativo).
-- Execute no SQL Editor do Supabase.

alter table public.admin_cliente_reunioes
  add column if not exists data_registro date;

comment on column public.admin_cliente_reunioes.data_registro is
  'Dia do registro da reunião (calendário). Permite lançamento retroativo sem depender de alterar created_at.';

update public.admin_cliente_reunioes
set data_registro = (created_at at time zone 'America/Sao_Paulo')::date
where data_registro is null;
