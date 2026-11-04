-- Promoção anual: início da cobrança por mês/ano fixos (em vez de “daqui N meses”).
-- O painel grava. O Confec lê e calcula a data de cobrança por cadastro.
-- promocao_meses_ate_cobranca continua como fallback legado se mês/ano estiverem vazios.

ALTER TABLE public.admin_billing_settings
    ADD COLUMN IF NOT EXISTS promocao_cobranca_mes integer,
    ADD COLUMN IF NOT EXISTS promocao_cobranca_ano integer;

COMMENT ON COLUMN public.admin_billing_settings.promocao_cobranca_mes IS
    'Mês (1–12) em que o ano pago da promoção começa a ser cobrado. NULL = usa promocao_meses_ate_cobranca ou cobra na hora.';

COMMENT ON COLUMN public.admin_billing_settings.promocao_cobranca_ano IS
    'Ano (ex.: 2027) em que o ano pago da promoção começa a ser cobrado. NULL = usa promocao_meses_ate_cobranca ou cobra na hora.';

COMMENT ON COLUMN public.admin_billing_settings.promocao_meses_ate_cobranca IS
    'Legado: meses sem cobrança a partir de cada cadastro. Só vale se promocao_cobranca_mes/ano estiverem vazios. 0 cobra na hora.';
