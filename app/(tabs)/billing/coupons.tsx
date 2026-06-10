import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, View } from 'react-native';

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
  const [selectedPriceIds, setSelectedPriceIds] = useState<string[]>([]);

  const priceOptions = useMemo(() => {
    const rows = planosQuery.data ?? [];
    return rows
      .map((p) => ({ id: p.id, label: `${p.nome ?? p.id}`, price: p.stripe_price_id }))
      .filter((x) => Boolean(x.price)) as { id: string; label: string; price: string }[];
  }, [planosQuery.data]);

  const togglePrice = (priceId: string) => {
    setSelectedPriceIds((prev) => (prev.includes(priceId) ? prev.filter((x) => x !== priceId) : [...prev, priceId]));
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
        aplicavel_price_ids: selectedPriceIds.length ? selectedPriceIds : undefined,
        apenas_novas_assinaturas: novasOnly,
      };

      if (!payload.codigo) throw new Error('Código é obrigatório');

      const stripe = await criarCupomStripe(payload);
      const coupon = stripe.coupon as { id?: string; percent_off?: number; amount_off?: number };
      const promo = stripe.promotion_code as { id?: string; code?: string };

      const dbRow = await inserirCupomAdmin({
        codigo_promocional: promo.code ?? payload.codigo,
        stripe_coupon_id: coupon.id,
        stripe_promotion_code_id: promo.id,
        percent_off: coupon.percent_off ?? payload.percent_off ?? null,
        amount_off_centavos: coupon.amount_off ?? payload.amount_off_centavos ?? null,
        duracao: duration,
        max_redemptions: payload.max_redemptions ?? null,
        redeem_by: payload.redeem_by,
        aplicavel_planos_ids: (planosQuery.data ?? [])
          .filter((p) => p.stripe_price_id && selectedPriceIds.includes(String(p.stripe_price_id)))
          .map((p) => String(p.id)),
        apenas_novas_assinaturas: novasOnly,
        criado_por_admin_id: adminProfile?.id,
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
            <FormField label="Validade ISO">
              <FormInput placeholder="2026-12-31" value={redeemBy} onChangeText={setRedeemBy} />
            </FormField>

            <View style={styles.rowBetween}>
              <Text style={{ flex: 1, fontWeight: '700', color: theme.text }}>Apenas novos pagadores</Text>
              <Switch value={novasOnly} onValueChange={setNovasOnly} trackColor={{ true: theme.cadastroAction }} />
            </View>

            <SectionTitle>Restringir a price IDs</SectionTitle>
            {priceOptions.length ? (
              priceOptions.map((p) => (
                <Pressable key={p.price} style={styles.planRow} onPress={() => togglePrice(p.price)}>
                  <Text style={{ fontWeight: '700', color: theme.cadastroAction }}>
                    {selectedPriceIds.includes(p.price) ? '☑' : '☐'}
                  </Text>
                  <Text style={{ flex: 1, color: theme.text }}>
                    {p.label} · {p.price}
                  </Text>
                </Pressable>
              ))
            ) : (
              <Text style={{ color: theme.textMuted }}>Nenhum stripe_price_id encontrado nos planos.</Text>
            )}

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
          <Text style={{ fontWeight: '800', fontSize: 16, color: theme.headerText }}>{item.codigo_promocional ?? item.id}</Text>
          <Text style={{ color: theme.textMuted }}>Stripe coupon: {item.stripe_coupon_id ?? '—'}</Text>
          <Text style={{ color: theme.textMuted }}>Promotion code: {item.stripe_promotion_code_id ?? '—'}</Text>
        </ScreenCard>
      )}
    />
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  planRow: { flexDirection: 'row', gap: 8, paddingVertical: 8 },
});
