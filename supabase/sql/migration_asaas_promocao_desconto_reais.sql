-- Promoção anual: desconto em % ou valor fixo em R$ (mesmo espírito dos cupons).
-- promocao_desconto_percent continua existindo (legado + modo percentual).
-- Com tipo = amount, o Confec usa promocao_desconto_reais sobre o ano cheio.

ALTER TABLE public.admin_billing_settings
    ADD COLUMN IF NOT EXISTS promocao_desconto_tipo text NOT NULL DEFAULT 'percent',
    ADD COLUMN IF NOT EXISTS promocao_desconto_reais numeric(12, 2) NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'admin_billing_settings_promocao_desconto_tipo_check'
    ) THEN
        ALTER TABLE public.admin_billing_settings
            ADD CONSTRAINT admin_billing_settings_promocao_desconto_tipo_check
            CHECK (promocao_desconto_tipo IN ('percent', 'amount'));
    END IF;
END $$;

COMMENT ON COLUMN public.admin_billing_settings.promocao_desconto_tipo IS
    'percent = usa promocao_desconto_percent; amount = usa promocao_desconto_reais sobre o ano cheio.';

COMMENT ON COLUMN public.admin_billing_settings.promocao_desconto_reais IS
    'Valor fixo em R$ abatido do ano cheio quando promocao_desconto_tipo = amount. 0 = sem desconto.';
