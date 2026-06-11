-- Adiciona horário da conversa (para tabelas já criadas sem a coluna).
-- Execute no SQL Editor do Supabase.

alter table public.admin_cliente_conversas
  add column if not exists hora_conversa time;

comment on column public.admin_cliente_conversas.hora_conversa is
  'Horário em que a conversa/atendimento ocorreu (fuso local informado pelo admin).';
