-- Visibilidade de planos na vitrine do app Azoup (signup / troca de plano).
-- O app cliente deve listar: WHERE exibir_para_clientes = true AND ativo = true
-- Execute no SQL Editor do Supabase.

alter table public.planos_assinatura
  add column if not exists exibir_para_clientes boolean not null default true;

comment on column public.planos_assinatura.exibir_para_clientes is
  'Quando true, o plano aparece na seleção de planos para novos clientes no app Azoup.';
