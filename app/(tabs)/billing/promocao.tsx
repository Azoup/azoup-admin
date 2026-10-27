import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { FormCheckbox } from '@/components/ui/FormCheckbox';
import { FormDateInput } from '@/components/ui/FormDateInput';
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
  atualizarPromocaoPlanos,
  montarPromocaoPlanos,
  obterBillingSettings,
  parseDescontoPlanoAnualPercent,
  parseMesesAteCobranca,
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

export default function PromocaoPlanosAnuaisScreen() {
  const { theme } = useTheme();
  const qc = useQueryClient();
  const { adminProfile, canManageBilling } = useAdminAuth();
  const [ativa, setAtiva] = useState(false);
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [nome, setNome] = useState('');
  const [percent, setPercent] = useState('0');
  const [meses, setMeses] = useState('0');
  const [imagemUrl, setImagemUrl] = useState('');
  const [mensalidade, setMensalidade] = useState('100');

  const { data, isLoading } = useQuery({
    queryKey: ['admin_billing_settings'],
    queryFn: obterBillingSettings,
  });

  useEffect(() => {
    if (!data) return;
    setAtiva(Boolean(data.promocao_ativa));
    setInicio(data.promocao_inicio ?? '');
    setFim(data.promocao_fim ?? '');
    setNome(data.promocao_nome ?? '');
    setPercent(formatarPercentual(data.promocao_desconto_percent));
    setMeses(String(data.promocao_meses_ate_cobranca ?? 0));
    setImagemUrl(data.promocao_imagem_url ?? '');
  }, [data]);

  const exemplo = useMemo(() => {
    try {
      const pct = percent.trim() ? parseDescontoPlanoAnualPercent(percent) : 0;
      const gratis = meses.trim() ? parseMesesAteCobranca(meses) : 0;
      const mes = parseMensalidadeExemplo(mensalidade);
      const anoCheio = mes * 12;
      const desconto = anoCheio * (pct / 100);
      const total = Math.max(0, anoCheio - desconto);
      return { pct, gratis, mes, anoCheio, desconto, total, parcela: total / 12, erro: null as string | null };
    } catch (e) {
      return {
        pct: 0,
        gratis: 0,
        mes: 0,
        anoCheio: 0,
        desconto: 0,
        total: 0,
        parcela: 0,
        erro: e instanceof Error ? e.message : 'Valor inválido',
      };
    }
  }, [percent, meses, mensalidade]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = montarPromocaoPlanos({
        ativa,
        inicio,
        fim,
        nome,
        desconto: percent,
        meses,
        imagemUrl,
      });
      await atualizarPromocaoPlanos(payload, adminProfile?.email ?? null);
      await registrarAuditoria(
        { id: adminProfile?.id, email: adminProfile?.email },
        {
          acao: 'BILLING_PROMOCAO_UPDATE',
          entidade: 'admin_billing_settings',
          entidade_id: '1',
          valores_anteriores: {
            promocao_ativa: data?.promocao_ativa ?? null,
            promocao_inicio: data?.promocao_inicio ?? null,
            promocao_fim: data?.promocao_fim ?? null,
            promocao_nome: data?.promocao_nome ?? null,
            promocao_desconto_percent: data?.promocao_desconto_percent ?? null,
            promocao_meses_ate_cobranca: data?.promocao_meses_ate_cobranca ?? null,
            promocao_imagem_url: data?.promocao_imagem_url ?? null,
          },
          valores_novos: { ...payload },
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
        title="Promoção de planos anuais"
        subtitle="Campanha única da página /planos/asaas/promocao. Não altera o desconto anual da tela normal, nem o Stripe, nem quem já entrou na promoção."
      />

      {isLoading ? <Text style={{ color: theme.textMuted }}>Carregando…</Text> : null}

      <FormCheckbox label="Promoção ativa" checked={ativa} onCheckedChange={setAtiva} />

      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 160 }}>
          <FormField label="Início" helper="Vazio não limita o começo. Fuso de Brasília.">
            <FormDateInput value={inicio} onChange={setInicio} />
          </FormField>
        </View>
        <View style={{ flex: 1, minWidth: 160 }}>
          <FormField label="Fim" helper="Último dia inclusive. Vazio não limita o fim.">
            <FormDateInput value={fim} onChange={setFim} />
          </FormField>
        </View>
      </View>

      <FormField label="Nome da promoção" required={ativa} helper="Título grande da página pública. Obrigatório com a promoção ligada.">
        <FormInput placeholder="Black Friday" value={nome} onChangeText={setNome} />
      </FormField>

      <FormField
        label="Desconto (%)"
        required
        helper="Vale só nos 12 meses pagos do pacote (plano e adicionais). Os meses grátis não entram nesse desconto. 100% é cortesia, sem cobrança no Asaas."
      >
        <FormInput keyboardType="decimal-pad" placeholder="20" value={percent} onChangeText={setPercent} />
      </FormField>

      <FormField
        label="Meses grátis antes de cobrar o ano"
        required
        helper="0 cobra na hora. 2, para quem assina em novembro, deixa novembro e dezembro sem cobrança e em janeiro cobra os 12 meses seguintes. A conta é a partir da data de cada cadastro."
      >
        <FormInput keyboardType="number-pad" placeholder="0" value={meses} onChangeText={setMeses} />
      </FormField>

      <FormField
        label="URL da imagem de fundo"
        helper="https:// pública. Vazio tira o fundo especial."
      >
        <FormInput
          placeholder="https://exemplo.com/fundo.jpg"
          value={imagemUrl}
          onChangeText={setImagemUrl}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </FormField>

      <FormField
        label="Mensalidade de exemplo (R$)"
        helper="Só para conferir o cálculo antes de salvar. Não lê os planos cadastrados."
      >
        <FormInput keyboardType="decimal-pad" placeholder="100" value={mensalidade} onChangeText={setMensalidade} />
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
                ? 'Sem desconto nos 12 meses pagos.'
                : exemplo.pct === 100
                  ? 'Cortesia dos 12 meses pagos: o Confec não cobra no Asaas.'
                  : `Desconto de ${formatarPercentual(exemplo.pct)}%: ${formatBRLFromReais(exemplo.desconto)}. Cartão: ${formatBRLFromReais(exemplo.total)}. Em 12 vezes: ${formatBRLFromReais(exemplo.parcela)} (se a conta Asaas estiver sem juros).`}
            </Text>
            <Text style={{ color: theme.text, lineHeight: 22 }}>
              {exemplo.gratis === 0
                ? 'O ano é cobrado no cartão na hora do cadastro.'
                : `${exemplo.gratis} ${exemplo.gratis === 1 ? 'mês grátis' : 'meses grátis'} antes da cobrança. Quem assina agora usa esse período sem pagar; depois o cartão cobra os 12 meses.`}
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 12, lineHeight: 18 }}>
              O cliente escolhe de 1 a 12 parcelas no Confec (só dos 12 meses pagos). Parcela abaixo de R$ 5 reduz o máximo. Total entre R$ 0,01 e R$ 4,99 é recusado. Esta tela não mexe nos juros da conta Asaas.
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
        <Text style={{ color: theme.cadastroAction, fontWeight: '700' }}>
          Promoção salva. Vale no próximo cadastro em /planos/asaas/promocao.
        </Text>
      ) : null}
      {mutation.error ? <Text style={{ color: theme.error }}>{(mutation.error as Error).message}</Text> : null}
    </Screen>
  );
}
