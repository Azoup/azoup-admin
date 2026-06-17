-- Plano disponível apenas para clientes já autenticados (troca de plano / upgrade).
-- Execute no SQL Editor do Supabase se a coluna ainda não existir.

alter table public.planos_assinatura
  add column if not exists requer_cliente_logado boolean not null default false;

comment on column public.planos_assinatura.requer_cliente_logado is
  'Quando true, o plano só pode ser contratado por cliente já logado (não aparece no fluxo de signup anônimo).';
