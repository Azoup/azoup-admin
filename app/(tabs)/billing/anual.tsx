import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { BackLink } from '@/components/ui/BackLink';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { Text } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import { registrarAuditoria } from '@/src/services/audit';
import {
  atualizarDescontoPlanoAnual,
  obterBillingSettings,
  parseDescontoPlanoAnualPercent,
} from '@/src/services/repos/billing-repo';
import { formatBRLFromReais, formatDateTimeBR } from '@/src/utils/format';

function formatarPercentual(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '0';
  return `${value}`.replace('.', ',');
}

function parseMensalidadeExemplo(raw: string): number {
  const texto = raw.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  if (!texto) return 100;
  const n = Number(texto);
  if (!Number.isFinite(n) || n < 0) throw new Error('Informe uma mensalidade de exemplo válida.');
  return n;
}

export default function DescontoPlanoAnualScreen() {
  const { theme } = useTheme();
  const qc = useQueryClient();
  const { adminProfile, canManageBilling } = useAdminAuth();
  const [percent, setPercent] = useState('');
  const [mensalidade, setMensalidade] = useState('100');

  const { data, isLoading } = useQuery({
    queryKey: ['admin_billing_settings'],
    queryFn: obterBillingSettings,
  });

  useEffect(() => {
    if (data?.desconto_plano_anual_percent != null) {
      setPercent(formatarPercentual(data.desconto_plano_anual_percent));
    }
  }, [data?.desconto_plano_anual_percent]);

  const exemplo = useMemo(() => {
    try {
      const pct = percent.trim() ? parseDescontoPlanoAnualPercent(percent) : 0;
      const mes = parseMensalidadeExemplo(mensalidade);
      const anoCheio = mes * 12;
      const desconto = anoCheio * (pct / 100);
      const total = Math.max(0, anoCheio - desconto);
      return { pct, mes, anoCheio, desconto, total, parcela: total / 12, erro: null as string | null };
    } catch (e) {
      return {
        pct: 0,
        mes: 0,
        anoCheio: 0,
        desconto: 0,
        total: 0,
        parcela: 0,
        erro: e instanceof Error ? e.message : 'Valor inválido',
      };
    }
  }, [percent, mensalidade]);

  const mutation = useMutation({
    mutationFn: async () => {
      const n = parseDescontoPlanoAnualPercent(percent);
      await atualizarDescontoPlanoAnual(n, adminProfile?.email ?? null);
      await registrarAuditoria(
        { id: adminProfile?.id, email: adminProfile?.email },
        {
          acao: 'BILLING_DESCONTO_ANUAL_UPDATE',
          entidade: 'admin_billing_settings',
          entidade_id: '1',
          valores_anteriores: { desconto_plano_anual_percent: data?.desconto_plano_anual_percent ?? null },
          valores_novos: { desconto_plano_anual_percent: n },
        },
      );
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin_billing_settings'] });
    },
  });

  if (!canManageBilling) {
    return (
      <Screen>
        <Text style={{ color: theme.warning, fontWeight: '700' }}>Seu papel não pode alterar billing.</Text>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <BackLink href="/billing" />
      <PageHeader
        title="Desconto do plano anual"
        subtitle="Percentual único para quem escolher Anual no cartão Asaas. Não vale para Stripe, nem para o mensal, nem para quem já pagou o ano."
      />

      {isLoading ? <Text style={{ color: theme.textMuted }}>Carregando…</Text> : null}

      <FormField
        label="Desconto do plano anual (%)"
        required
        helper="O desconto incide nos 12 meses do pacote (plano e adicionais). Zero mantém a opção Anual sem desconto. Cupom some nesse modo. 100% é cortesia, sem cobrança no Asaas."
      >
        <FormInput
          keyboardType="decimal-pad"
          placeholder="10"
          value={percent}
          onChangeText={setPercent}
        />
      </FormField>

      <FormField
        label="Mensalidade de exemplo (R$)"
        helper="Só para conferir o cálculo antes de salvar. Não lê os planos cadastrados."
      >
        <FormInput
          keyboardType="decimal-pad"
          placeholder="100"
          value={mensalidade}
          onChangeText={setMensalidade}
        />
      </FormField>

      <ScreenCard style={{ gap: 8 }}>
        <Text style={{ color: theme.headerText, fontWeight: '800' }}>Exemplo</Text>
        {exemplo.erro ? (
          <Text style={{ color: theme.error }}>{exemplo.erro}</Text>
        ) : (
          <>
            <Text style={{ color: theme.text, lineHeight: 22 }}>
              Pacote {formatBRLFromReais(exemplo.mes)}/mês × 12 = {formatBRLFromReais(exemplo.anoCheio)}.
            </Text>
            <Text style={{ color: theme.text, lineHeight: 22 }}>
              {exemplo.pct === 0
                ? 'Sem desconto. A opção Anual aparece pelo valor cheio.'
                : exemplo.pct === 100
                  ? 'Cortesia: o Confec não cobra no Asaas e a conta fica ativa por 12 meses.'
                  : `Desconto de ${formatarPercentual(exemplo.pct)}%: ${formatBRLFromReais(exemplo.desconto)}. Cartão: ${formatBRLFromReais(exemplo.total)}. Em 12 vezes: ${formatBRLFromReais(exemplo.parcela)} (se a conta Asaas estiver sem juros).`}
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 12, lineHeight: 18 }}>
              O cliente escolhe de 1 a 12 parcelas no Confec. Parcela abaixo de R$ 5 reduz o máximo. Total entre R$ 0,01 e R$ 4,99 é recusado. Esta tela não mexe nos juros da conta Asaas.
            </Text>
          </>
        )}
      </ScreenCard>

      <Text style={{ color: theme.textMuted, fontSize: 13 }}>
        Último salvamento:{' '}
        {data?.updated_at ? formatDateTimeBR(data.updated_at) : '—'}
        {data?.updated_by_admin ? ` · ${data.updated_by_admin}` : ''}
      </Text>

      <PrimaryButton
        label={mutation.isPending ? 'Salvando…' : 'Salvar'}
        loading={mutation.isPending}
        onPress={() => mutation.mutate()}
      />

      {mutation.isSuccess ? (
        <Text style={{ color: theme.cadastroAction, fontWeight: '700' }}>Desconto salvo. Vale no próximo checkout Anual.</Text>
      ) : null}
      {mutation.error ? <Text style={{ color: theme.error }}>{(mutation.error as Error).message}</Text> : null}
    </Screen>
  );
}
