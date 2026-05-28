import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, TextInput } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { registrarAuditoria } from '@/src/services/audit';
import { inserirCupomAdmin, listarCuponsAdmin, listarPlanos } from '@/src/services/repos/billing-repo';
import { criarCupomStripe } from '@/src/services/stripe-admin-api';

export default function CouponsScreen() {
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

      await registrarAuditoria(adminProfile?.id, {
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
      <View style={styles.wrap}>
        <Text style={styles.warn}>Sem permissão para criar cupons.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
      data={cuponsQuery.data ?? []}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Text style={styles.title}>Cupons (Stripe + `admin_coupons`)</Text>
          <Text style={styles.sub}>
            Cupons são criados apenas no Stripe para novas compras/checkout — não alteram assinaturas existentes. Combine com restrições do próprio Stripe/promotion code.
          </Text>

          <TextInput placeholder="Código exibido ao cliente" value={codigo} onChangeText={setCodigo} style={styles.input} />
          <TextInput placeholder="Nome interno (opcional)" value={nome} onChangeText={setNome} style={styles.input} />

          <Text style={styles.label}>Desconto percentual (ex.: 20)</Text>
          <TextInput placeholder="percent_off" value={percent} onChangeText={setPercent} keyboardType="decimal-pad" style={styles.input} />

          <Text style={styles.label}>Ou valor fixo em centavos</Text>
          <TextInput placeholder="amount_off_centavos" value={amountOff} onChangeText={setAmountOff} keyboardType="number-pad" style={styles.input} />

          <Text style={styles.label}>Duração</Text>
          <View style={styles.row}>
            {(['once', 'repeating', 'forever'] as const).map((d) => (
              <Pressable key={d} style={[styles.chip, duration === d && styles.chipOn]} onPress={() => setDuration(d)}>
                <Text style={[styles.chipLabel, duration === d && styles.chipLabelOn]}>{d}</Text>
              </Pressable>
            ))}
          </View>

          {duration === 'repeating' ? (
            <TextInput placeholder="Meses repetindo" value={months} onChangeText={setMonths} keyboardType="number-pad" style={styles.input} />
          ) : null}

          <TextInput placeholder="Máximo de usos (opcional)" value={maxRedemptions} onChangeText={setMaxRedemptions} keyboardType="number-pad" style={styles.input} />
          <TextInput placeholder="Validade ISO (opcional) ex.: 2026-12-31" value={redeemBy} onChangeText={setRedeemBy} style={styles.input} />

          <View style={[styles.rowBetween, { alignItems: 'center' }]}>
            <Text style={{ flex: 1, fontWeight: '700' }}>Priorizar apenas novos pagadores (Stripe restriction)</Text>
            <Switch value={novasOnly} onValueChange={setNovasOnly} />
          </View>

          <Text style={styles.label}>Restringir a price IDs específicos (opcional)</Text>
          {priceOptions.length ? (
            priceOptions.map((p) => (
              <Pressable key={p.price} style={styles.planRow} onPress={() => togglePrice(p.price)}>
                <Text style={{ fontWeight: '700' }}>{selectedPriceIds.includes(p.price) ? '☑' : '☐'} </Text>
                <Text style={{ flex: 1 }}>
                  {p.label} · {p.price}
                </Text>
              </Pressable>
            ))
          ) : (
            <Text style={styles.meta}>Nenhum `stripe_price_id` encontrado nos planos — cadastre no núcleo Azoup.</Text>
          )}

          <Pressable style={styles.btn} disabled={mutation.isPending} onPress={() => mutation.mutate()}>
            <Text style={styles.btnLabel}>{mutation.isPending ? 'Criando…' : 'Criar cupom no Stripe'}</Text>
          </Pressable>

          {mutation.error ? <Text style={styles.err}>{(mutation.error as Error).message}</Text> : null}

          <Text style={[styles.title, { marginTop: 18 }]}>Cupons recentes</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{item.codigo_promocional ?? item.id}</Text>
          <Text style={styles.meta}>Stripe coupon: {item.stripe_coupon_id ?? '—'}</Text>
          <Text style={styles.meta}>Promotion code: {item.stripe_promotion_code_id ?? '—'}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '800' },
  sub: { opacity: 0.78, lineHeight: 20 },
  label: { fontWeight: '700', marginTop: 6 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rowBetween: { flexDirection: 'row', gap: 12 },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#cbd5e1', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999 },
  chipOn: { backgroundColor: '#111827' },
  chipLabel: { fontWeight: '700', opacity: 0.75 },
  chipLabelOn: { color: '#fff', opacity: 1 },
  btn: { backgroundColor: '#16a34a', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  btnLabel: { color: '#fff', fontWeight: '900' },
  err: { color: '#b91c1c', fontWeight: '700' },
  warn: { color: '#b45309', fontWeight: '800' },
  planRow: { flexDirection: 'row', gap: 8, paddingVertical: 8 },
  meta: { opacity: 0.78 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#00000022',
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
    gap: 6,
  },
  cardTitle: { fontWeight: '800', fontSize: 16 },
});
