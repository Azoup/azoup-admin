import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ChipSelect } from '@/components/ui/ChipSelect';
import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { BackLink } from '@/components/ui/BackLink';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Text } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import { registrarAuditoria } from '@/src/services/audit';
import {
  contarUsosCupomAsaas,
  inserirCupomAdmin,
  listarCuponsAdmin,
  listarPlanos,
} from '@/src/services/repos/billing-repo';
import { criarCupomStripe } from '@/src/services/stripe-admin-api';
import {
  dataBrParaYmd,
  dataHojeBrasil,
  formatBRLFromReais,
  mascaraDataBR,
  rotuloDuracaoCupom,
  rotuloValidadeCupom,
} from '@/src/utils/format';
import { stripePriceIdDoPlano, stripeProductIdDoPlano } from '@/src/utils/plano-stripe';
import type { AdminCouponRow } from '@/src/types/azoup';

type AbaCupom = 'stripe' | 'asaas';
type TipoDesconto = 'percent' | 'amount';

function validarRedeemByLocal(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const ymd = dataBrParaYmd(raw);
  if (!ymd) {
    return 'Data "Válido até" inválida. Use DD/MM/AAAA (ex.: 31/12/2026).';
  }
  if (ymd < dataHojeBrasil()) {
    return 'A data "Válido até" precisa ser hoje ou uma data futura.';
  }
  return null;
}

function redeemByYmd(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  return dataBrParaYmd(raw);
}

function parseReais(valor: string): number | null {
  const limpo = valor.trim().replace(/\s/g, '').replace(',', '.');
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function rotuloPlanos(item: AdminCouponRow): string {
  const ids = item.aplicavel_planos_ids?.length ? item.aplicavel_planos_ids : item.plan_id != null ? [item.plan_id] : [];
  if (!ids.length) return 'Qualquer plano';
  return `Planos: ${ids.join(', ')}`;
}

function temStripe(item: AdminCouponRow): boolean {
  return Boolean(`${item.stripe_coupon_id ?? ''}`.trim());
}

export default function CouponsScreen() {
  const { theme } = useTheme();
  const qc = useQueryClient();
  const { adminProfile, canManageBilling } = useAdminAuth();
  const [aba, setAba] = useState<AbaCupom>('stripe');

  const planosQuery = useQuery({ queryKey: ['planos_assinatura'], queryFn: listarPlanos });
  const cuponsQuery = useQuery({ queryKey: ['admin_coupons'], queryFn: listarCuponsAdmin });

  const [codigo, setCodigo] = useState('');
  const [nome, setNome] = useState('');
  const [percent, setPercent] = useState('');
  const [amountOff, setAmountOff] = useState('');
  const [amountReais, setAmountReais] = useState('');
  const [tipoDesconto, setTipoDesconto] = useState<TipoDesconto>('percent');
  const [duration, setDuration] = useState<'once' | 'repeating' | 'forever'>('once');
  const [months, setMonths] = useState('3');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [redeemBy, setRedeemBy] = useState('');
  const [novasOnly, setNovasOnly] = useState(true);
  const [selectedPlanIds, setSelectedPlanIds] = useState<number[]>([]);

  const planOptions = useMemo(() => {
    return (planosQuery.data ?? [])
      .map((p) => ({
        id: Number(p.id),
        label: `${p.nome ?? p.id}`,
        price: stripePriceIdDoPlano(p),
        product: stripeProductIdDoPlano(p),
      }))
      .filter((p) => Number.isFinite(p.id));
  }, [planosQuery.data]);

  const cuponsFiltrados = useMemo(() => {
    const todos = cuponsQuery.data ?? [];
    if (aba === 'stripe') return todos.filter(temStripe);
    return todos.filter((item) => !temStripe(item));
  }, [aba, cuponsQuery.data]);

  const idsAsaas = useMemo(() => (aba === 'asaas' ? cuponsFiltrados.map((c) => c.id) : []), [aba, cuponsFiltrados]);

  const usosAsaasQ = useQuery({
    queryKey: ['assinatura_cupons_usos', idsAsaas.join(',')],
    queryFn: async () => {
      const map = new Map<string, number | null>();
      await Promise.all(
        idsAsaas.map(async (id) => {
          map.set(id, await contarUsosCupomAsaas(id));
        }),
      );
      return map;
    },
    enabled: aba === 'asaas' && idsAsaas.length > 0,
  });

  const togglePlan = (planId: number) => {
    setSelectedPlanIds((prev) =>
      prev.includes(planId) ? prev.filter((id) => id !== planId) : [...prev, planId],
    );
  };

  function limparForm() {
    setCodigo('');
    setNome('');
    setPercent('');
    setAmountOff('');
    setAmountReais('');
    setMonths('3');
    setMaxRedemptions('');
    setRedeemBy('');
    setSelectedPlanIds([]);
  }

  const stripeMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        codigo: codigo.trim(),
        nome: nome.trim() || undefined,
        percent_off: percent.trim() ? Number(percent) : undefined,
        amount_off_centavos: amountOff.trim() ? Number(amountOff) : undefined,
        currency: 'brl',
        duration,
        duration_in_months: duration === 'repeating' ? Number(months || '3') : undefined,
        max_redemptions: maxRedemptions.trim() ? Number(maxRedemptions) : undefined,
        redeem_by: redeemByYmd(redeemBy),
        apenas_novas_assinaturas: novasOnly,
      };

      if (!payload.codigo) throw new Error('Código é obrigatório');
      if (!selectedPlanIds.length) throw new Error('Selecione ao menos um plano vinculado ao cupom.');

      const erroData = validarRedeemByLocal(redeemBy);
      if (erroData) throw new Error(erroData);

      const planosSel = planOptions.filter((p) => selectedPlanIds.includes(p.id));
      const semStripe = planosSel.filter((p) => !p.product && !p.price);
      if (semStripe.length) {
        throw new Error(
          `Planos sem Stripe (stripe_product_id ou stripe_price_id_base): ${semStripe.map((p) => p.label).join(', ')}`,
        );
      }

      const productIds = [...new Set(planosSel.map((p) => p.product).filter(Boolean) as string[])];
      const priceIds = [...new Set(planosSel.map((p) => p.price).filter(Boolean) as string[])];

      const payloadStripe = {
        ...payload,
        aplicavel_product_ids: productIds.length ? productIds : undefined,
        aplicavel_price_ids: priceIds.length ? priceIds : undefined,
      };

      const stripe = await criarCupomStripe(payloadStripe);
      const coupon = stripe.coupon as { id?: string; percent_off?: number; amount_off?: number };
      const promo = stripe.promotion_code as { id?: string; code?: string };

      if (!coupon.id || !promo.id) throw new Error('Stripe não retornou IDs do cupom ou promotion code.');

      const dbRow = await inserirCupomAdmin({
        codigo: promo.code ?? payload.codigo,
        percent_off: coupon.percent_off ?? payload.percent_off ?? null,
        amount_off_centavos: coupon.amount_off ?? payload.amount_off_centavos ?? null,
        duration,
        duration_in_months: duration === 'repeating' ? Number(months || '3') : undefined,
        max_redemptions: payload.max_redemptions ?? null,
        redeem_by: payload.redeem_by,
        aplicavel_planos_ids: selectedPlanIds,
        stripe_coupon_id: coupon.id,
        stripe_promotion_code_id: promo.id,
        created_by_admin: adminProfile?.email ?? null,
      });

      await registrarAuditoria({ id: adminProfile?.id, email: adminProfile?.email }, {
        acao: 'STRIPE_COUPON_CREATE',
        entidade: 'admin_coupons',
        entidade_id: dbRow.id,
        valores_anteriores: {},
        valores_novos: dbRow as unknown as Record<string, unknown>,
      });

      return dbRow;
    },
    onSuccess: async () => {
      limparForm();
      await qc.invalidateQueries({ queryKey: ['admin_coupons'] });
    },
  });

  const asaasMutation = useMutation({
    mutationFn: async () => {
      const codigoLimpo = codigo.trim();
      if (!codigoLimpo) throw new Error('Código é obrigatório');

      const erroData = validarRedeemByLocal(redeemBy);
      if (erroData) throw new Error(erroData);

      if (duration === 'repeating') {
        const meses = Number(months);
        if (!Number.isFinite(meses) || meses <= 0) throw new Error('Informe quantos meses o desconto vale.');
      }

      const percentOff = tipoDesconto === 'percent' ? Number(percent.trim()) : null;
      const reais = tipoDesconto === 'amount' ? parseReais(amountReais) : null;
      if (tipoDesconto === 'percent' && (!percentOff || percentOff <= 0 || percentOff > 100)) {
        throw new Error('Informe um percentual entre 0,01 e 100.');
      }
      if (tipoDesconto === 'amount' && reais == null) {
        throw new Error('Informe o valor do desconto em reais.');
      }

      const max = maxRedemptions.trim() ? Number(maxRedemptions) : null;
      if (maxRedemptions.trim() && (!Number.isFinite(max) || (max ?? 0) <= 0)) {
        throw new Error('Máximo de usos precisa ser um número positivo.');
      }

      const dbRow = await inserirCupomAdmin({
        codigo: codigoLimpo,
        percent_off: tipoDesconto === 'percent' ? percentOff : null,
        amount_off_reais: tipoDesconto === 'amount' ? reais : null,
        duration,
        duration_in_months: duration === 'repeating' ? Number(months) : undefined,
        max_redemptions: max,
        redeem_by: redeemByYmd(redeemBy),
        aplicavel_planos_ids: selectedPlanIds,
        created_by_admin: adminProfile?.email ?? null,
      });

      await registrarAuditoria({ id: adminProfile?.id, email: adminProfile?.email }, {
        acao: 'ASAAS_COUPON_CREATE',
        entidade: 'admin_coupons',
        entidade_id: dbRow.id,
        valores_anteriores: {},
        valores_novos: dbRow as unknown as Record<string, unknown>,
      });

      return dbRow;
    },
    onSuccess: async () => {
      limparForm();
      await qc.invalidateQueries({ queryKey: ['admin_coupons'] });
    },
  });

  const salvando = aba === 'stripe' ? stripeMutation.isPending : asaasMutation.isPending;
  const erroMutacao = aba === 'stripe' ? stripeMutation.error : asaasMutation.error;

  if (!canManageBilling) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: theme.background }}>
        <Text style={{ color: theme.warning, fontWeight: '800' }}>Sem permissão para criar cupons.</Text>
      </View>
    );
  }

  const formPlanos = (
    <FormField
      label="Planos vinculados"
      required={aba === 'stripe'}
      helper={
        aba === 'stripe'
          ? 'Selecione um ou mais planos. Gravado em aplicavel_planos_ids; o primeiro vira plan_id.'
          : 'Opcional. Vazio = vale em qualquer plano. Preenchido = só nesses planos.'
      }
    >
      {planOptions.length ? (
        planOptions.map((p) => (
          <Pressable key={p.id} style={styles.planRow} onPress={() => togglePlan(p.id)}>
            <Text style={{ fontWeight: '700', color: theme.cadastroAction }}>
              {selectedPlanIds.includes(p.id) ? '☑' : '☐'}
            </Text>
            <Text style={{ flex: 1, color: theme.text }}>
              {p.label} · plan_id {p.id}
              {aba === 'stripe' ? (p.price ? ` · ${p.price}` : ' · sem stripe_price_id_base') : ''}
            </Text>
          </Pressable>
        ))
      ) : (
        <Text style={{ color: theme.textMuted }}>Nenhum plano cadastrado em planos_assinatura.</Text>
      )}
    </FormField>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
      data={cuponsFiltrados}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <BackLink href="/billing" />
          <PageHeader
            title="Cupons Stripe / Asaas"
            subtitle="Stripe cria o cupom no Stripe. Asaas grava só em admin_coupons — o Confec calcula o desconto e manda o valor já com desconto."
          />

          <ChipSelect
            options={['stripe', 'asaas'] as const}
            value={aba}
            onChange={setAba}
            labels={{ stripe: 'Stripe', asaas: 'Asaas' }}
          />

          {aba === 'stripe' ? (
            <ScreenCard style={{ gap: 12 }}>
              <FormField label="Código promocional" required>
                <FormInput placeholder="CODIGO10" value={codigo} onChangeText={setCodigo} />
              </FormField>
              <FormField label="Nome interno">
                <FormInput placeholder="Opcional" value={nome} onChangeText={setNome} />
              </FormField>
              <FormField label="Desconto percentual" helper="Ex.: 20">
                <FormInput placeholder="percent_off" value={percent} onChangeText={setPercent} keyboardType="decimal-pad" />
              </FormField>
              <FormField label="Ou valor fixo (centavos)">
                <FormInput placeholder="amount_off_centavos" value={amountOff} onChangeText={setAmountOff} keyboardType="number-pad" />
              </FormField>
              <FormField label="Duração">
                <ChipSelect options={['once', 'repeating', 'forever'] as const} value={duration} onChange={setDuration} />
              </FormField>
              {duration === 'repeating' ? (
                <FormField label="Meses repetindo">
                  <FormInput placeholder="3" value={months} onChangeText={setMonths} keyboardType="number-pad" />
                </FormField>
              ) : null}
              <FormField label="Máximo de usos">
                <FormInput placeholder="Opcional" value={maxRedemptions} onChangeText={setMaxRedemptions} keyboardType="number-pad" />
              </FormField>
              <FormField
                label="Válido até"
                helper="Opcional. Formato DD/MM/AAAA (ex.: 31/12/2026). Precisa ser hoje ou data futura."
              >
                <FormInput
                  placeholder="31/12/2026"
                  value={redeemBy}
                  onChangeText={(v) => setRedeemBy(mascaraDataBR(v))}
                  keyboardType="number-pad"
                  maxLength={10}
                />
              </FormField>

              <FormField
                label="Apenas novos pagadores"
                helper="Restringe o cupom a clientes que nunca concluíram um pagamento no Stripe."
              >
                <ChipSelect
                  options={['sim', 'nao'] as const}
                  value={novasOnly ? 'sim' : 'nao'}
                  onChange={(v) => setNovasOnly(v === 'sim')}
                  labels={{ sim: 'Sim', nao: 'Não' }}
                />
              </FormField>

              {formPlanos}

              <PrimaryButton
                label={salvando ? 'Criando…' : 'Criar cupom no Stripe'}
                loading={salvando}
                onPress={() => stripeMutation.mutate()}
              />
              {erroMutacao ? <Text style={{ color: theme.error, fontWeight: '700' }}>{(erroMutacao as Error).message}</Text> : null}
            </ScreenCard>
          ) : (
            <ScreenCard style={{ gap: 12 }}>
              <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                O cliente digita o código no Confec. Não cria cupom no painel do Asaas. Crédito de IA não entra no cupom.
              </Text>
              <FormField label="Código promocional" required helper="Único. O Confec compara sem diferenciar maiúsculas.">
                <FormInput placeholder="CODIGO10" value={codigo} onChangeText={setCodigo} autoCapitalize="characters" />
              </FormField>
              <FormField label="Tipo de desconto" required>
                <ChipSelect
                  options={['percent', 'amount'] as const}
                  value={tipoDesconto}
                  onChange={setTipoDesconto}
                  labels={{ percent: 'Percentual', amount: 'Valor em reais' }}
                />
              </FormField>
              {tipoDesconto === 'percent' ? (
                <FormField label="Percentual" required helper="Ex.: 10 = 10%. Não passa de 100%.">
                  <FormInput placeholder="10" value={percent} onChangeText={setPercent} keyboardType="decimal-pad" />
                </FormField>
              ) : (
                <FormField label="Valor do desconto (R$)" required helper="Em reais. O total não fica negativo. Mínimo Asaas da cobrança: R$ 5,00.">
                  <FormInput placeholder="50,00" value={amountReais} onChangeText={setAmountReais} keyboardType="decimal-pad" />
                </FormField>
              )}
              <FormField label="Duração" required>
                <ChipSelect
                  options={['once', 'repeating', 'forever'] as const}
                  value={duration}
                  onChange={setDuration}
                  labels={{ once: 'Uma vez', repeating: 'Por alguns meses', forever: 'Para sempre' }}
                />
              </FormField>
              {duration === 'repeating' ? (
                <FormField label="Meses com desconto" required helper="Quantas mensalidades pagas o desconto vale.">
                  <FormInput placeholder="3" value={months} onChangeText={setMonths} keyboardType="number-pad" />
                </FormField>
              ) : null}
              <FormField label="Máximo de usos" helper="Quantas contas podem usar o código. Vazio = sem limite.">
                <FormInput placeholder="Opcional" value={maxRedemptions} onChangeText={setMaxRedemptions} keyboardType="number-pad" />
              </FormField>
              <FormField
                label="Válido até"
                helper="Data limite para usar o código pela primeira vez. Formato DD/MM/AAAA."
              >
                <FormInput
                  placeholder="31/12/2026"
                  value={redeemBy}
                  onChangeText={(v) => setRedeemBy(mascaraDataBR(v))}
                  keyboardType="number-pad"
                  maxLength={10}
                />
              </FormField>
              {formPlanos}
              <PrimaryButton
                label={salvando ? 'Criando…' : 'Criar cupom Asaas'}
                loading={salvando}
                onPress={() => asaasMutation.mutate()}
              />
              {erroMutacao ? <Text style={{ color: theme.error, fontWeight: '700' }}>{(erroMutacao as Error).message}</Text> : null}
            </ScreenCard>
          )}

          <SectionTitle>{aba === 'stripe' ? 'Cupons Stripe' : 'Cupons Asaas'}</SectionTitle>
          {!cuponsQuery.isLoading && cuponsFiltrados.length === 0 ? (
            <Text style={{ color: theme.textMuted }}>
              {aba === 'stripe' ? 'Nenhum cupom gerado no Stripe.' : 'Nenhum cupom gerado só para Asaas.'}
            </Text>
          ) : null}
        </View>
      }
      renderItem={({ item }) => {
        const usosAsaas = usosAsaasQ.data?.get(item.id);
        return (
          <ScreenCard style={{ marginTop: 10, gap: 6 }}>
            <Text style={{ fontWeight: '800', fontSize: 16, color: theme.headerText }}>{item.code ?? item.id}</Text>
            <Text style={{ color: theme.textMuted }}>
              Desconto:{' '}
              {item.discount_type === 'amount'
                ? formatBRLFromReais(Number(item.discount_value))
                : `${item.discount_value}%`}
            </Text>
            <Text style={{ color: theme.textMuted }}>{rotuloPlanos(item)}</Text>
            <Text style={{ color: theme.textMuted }}>{rotuloValidadeCupom(item.redeem_by)}</Text>
            <Text style={{ color: theme.textMuted }}>
              {rotuloDuracaoCupom(item.duration, item.duration_in_months)}
            </Text>
            <Text style={{ color: theme.textMuted }}>
              Ativo: {item.active === false ? 'não' : 'sim'}
              {item.max_redemptions != null ? ` · Máx. usos: ${item.max_redemptions}` : ' · Sem limite de usos'}
            </Text>
            {aba === 'asaas' && usosAsaas != null ? (
              <Text style={{ color: theme.textMuted }}>Usos no Confec Asaas: {usosAsaas}</Text>
            ) : null}
            {temStripe(item) ? (
              <>
                <Text style={{ color: theme.textMuted }}>Stripe coupon: {item.stripe_coupon_id}</Text>
                <Text style={{ color: theme.textMuted }}>Promotion code: {item.stripe_promotion_code_id ?? '—'}</Text>
              </>
            ) : aba === 'asaas' ? (
              <Text style={{ color: theme.textMuted }}>Só Asaas (sem cupom no Stripe)</Text>
            ) : null}
          </ScreenCard>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  planRow: { flexDirection: 'row', gap: 8, paddingVertical: 8 },
});
