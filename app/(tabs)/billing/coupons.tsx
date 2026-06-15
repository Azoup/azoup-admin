import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ChipSelect } from '@/components/ui/ChipSelect';
import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Text } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import { registrarAuditoria } from '@/src/services/audit';
import { inserirCupomAdmin, listarCuponsAdmin, listarPlanos } from '@/src/services/repos/billing-repo';
import { criarCupomStripe } from '@/src/services/stripe-admin-api';
import { rotuloDuracaoCupom, rotuloValidadeCupom } from '@/src/utils/format';
import { stripePriceIdDoPlano, stripeProductIdDoPlano } from '@/src/utils/plano-stripe';

export default function CouponsScreen() {
  const { theme } = useTheme();
  const qc = useQueryClient();
  const { adminProfile, canManageBilling } = useAdminAuth();

  const planosQuery = useQuery({ queryKey: ['planos_assinatura'], queryFn: listarPlanos });
  const cuponsQuery = useQuery({ queryKey: ['admin_coupons'], queryFn: listarCuponsAdmin });

  const [codigo, setCodigo] = useState('');
  const [nome, setNome] = useState('');
  const [percent, setPercent] = useState('');
  const [amountOff, setAmountOff] = useState('');
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

  const togglePlan = (planId: number) => {
    setSelectedPlanIds((prev) =>
      prev.includes(planId) ? prev.filter((id) => id !== planId) : [...prev, planId],
    );
  };

  const mutation = useMutation({
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
        redeem_by: redeemBy.trim() ? redeemBy.trim() : null,
        apenas_novas_assinaturas: novasOnly,
      };

      if (!payload.codigo) throw new Error('Código é obrigatório');
      if (!selectedPlanIds.length) throw new Error('Selecione ao menos um plano vinculado ao cupom.');

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
      await qc.invalidateQueries({ queryKey: ['admin_coupons'] });
    },
  });

  if (!canManageBilling) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: theme.background }}>
        <Text style={{ color: theme.warning, fontWeight: '800' }}>Sem permissão para criar cupons.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
      data={cuponsQuery.data ?? []}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <PageHeader
            title="Cupons (Stripe + admin_coupons)"
            subtitle="Cupons são criados no Stripe para novas compras/checkout — não alteram assinaturas existentes."
          />

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
            <FormField label="Válido até" helper="Opcional. Formato AAAA-MM-DD (ex.: 2026-12-31).">
              <FormInput placeholder="2026-12-31" value={redeemBy} onChangeText={setRedeemBy} />
            </FormField>

            <FormField
              label="Apenas novos pagadores"
              helper="Restringe o cupom a clientes que nunca concluíram um pagamento no Stripe.">
              <ChipSelect
                options={['sim', 'nao'] as const}
                value={novasOnly ? 'sim' : 'nao'}
                onChange={(v) => setNovasOnly(v === 'sim')}
                labels={{ sim: 'Sim', nao: 'Não' }}
              />
            </FormField>

            <FormField
              label="Planos vinculados"
              required
              helper="Selecione um ou mais planos. Gravado em aplicavel_planos_ids; o primeiro vira plan_id.">
              {planOptions.length ? (
                planOptions.map((p) => (
                  <Pressable key={p.id} style={styles.planRow} onPress={() => togglePlan(p.id)}>
                    <Text style={{ fontWeight: '700', color: theme.cadastroAction }}>
                      {selectedPlanIds.includes(p.id) ? '☑' : '☐'}
                    </Text>
                    <Text style={{ flex: 1, color: theme.text }}>
                      {p.label} · plan_id {p.id}
                      {p.price ? ` · ${p.price}` : ' · sem stripe_price_id_base'}
                    </Text>
                  </Pressable>
                ))
              ) : (
                <Text style={{ color: theme.textMuted }}>Nenhum plano cadastrado em planos_assinatura.</Text>
              )}
            </FormField>

            <PrimaryButton
              label={mutation.isPending ? 'Criando…' : 'Criar cupom no Stripe'}
              loading={mutation.isPending}
              onPress={() => mutation.mutate()}
            />
            {mutation.error ? <Text style={{ color: theme.error, fontWeight: '700' }}>{(mutation.error as Error).message}</Text> : null}
          </ScreenCard>

          <SectionTitle>Cupons recentes</SectionTitle>
        </View>
      }
      renderItem={({ item }) => (
        <ScreenCard style={{ marginTop: 10, gap: 6 }}>
          <Text style={{ fontWeight: '800', fontSize: 16, color: theme.headerText }}>{item.code ?? item.id}</Text>
          <Text style={{ color: theme.textMuted }}>
            Desconto:{' '}
            {item.discount_type === 'amount'
              ? `R$ ${Number(item.discount_value).toFixed(2)}`
              : `${item.discount_value}%`}
          </Text>
          <Text style={{ color: theme.textMuted }}>
            Planos: {(item.aplicavel_planos_ids?.length ? item.aplicavel_planos_ids : [item.plan_id]).join(', ')}
          </Text>
          <Text style={{ color: theme.textMuted }}>{rotuloValidadeCupom(item.redeem_by)}</Text>
          <Text style={{ color: theme.textMuted }}>
            {rotuloDuracaoCupom(item.duration, item.duration_in_months)}
          </Text>
          <Text style={{ color: theme.textMuted }}>Stripe coupon: {item.stripe_coupon_id ?? '—'}</Text>
          <Text style={{ color: theme.textMuted }}>Promotion code: {item.stripe_promotion_code_id ?? '—'}</Text>
        </ScreenCard>
      )}
    />
  );
}

const styles = StyleSheet.create({
  planRow: { flexDirection: 'row', gap: 8, paddingVertical: 8 },
});
