-- Telas liberadas por login administrativo (painel_adm).
-- Execute no SQL Editor do Supabase.

ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS telas_acesso jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.admin_users.telas_acesso IS
  'Lista de telas do painel ADM: dashboard, clients, billing, audit, admins. Vazio = padrão do role.';
