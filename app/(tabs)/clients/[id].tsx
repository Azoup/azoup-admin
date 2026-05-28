import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { registrarAuditoria } from '@/src/services/audit';
import {
  montarVisaoCliente,
  resolverLimitesEfetivos,
  upsertLimitesOverride,
  type LimitesEffectivos,
} from '@/src/services/repos/clientes-repo';
import { obterAssinaturaStripe } from '@/src/services/stripe-admin-api';
import { formatBRLFromCentavos, formatBRLFromReais, formatDateBR } from '@/src/utils/format';

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { adminProfile, canEditLimits } = useAdminAuth();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['cliente_azoup_admin', id],
    queryFn: () => montarVisaoCliente(id),
    enabled: Boolean(id),
  });

  const efetivos = useMemo(() => (data ? resolverLimitesEfetivos(data) : null), [data]);

  const [limU, setLimU] = useState('');
  const [limE, setLimE] = useState('');
  const [limS, setLimS] = useState('');
  const [limT, setLimT] = useState('');
  const [motivo, setMotivo] = useState('');
  const [stripeJson, setStripeJson] = useState<string | null>(null);

  useEffect(() => {
    if (!efetivos) return;
    setLimU(efetivos.usuarios != null ? String(efetivos.usuarios) : '');
    setLimE(efetivos.empresas != null ? String(efetivos.empresas) : '');
    setLimS(efetivos.armazenamento_gb != null ? String(efetivos.armazenamento_gb) : '');
  }, [efetivos]);

  useEffect(() => {
    setLimT('');
    setMotivo('');
  }, [id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const valores: LimitesEffectivos = {
        usuarios: limU === '' ? null : Number(limU),
        empresas: limE === '' ? null : Number(limE),
        armazenamento_gb: limS === '' ? null : Number(limS),
        tokens_ia_mes: limT === '' ? null : Number(limT),
      };
      const anterior = data?.limites_override ?? null;
      const { novo, persistidoEmAssinaturaCliente, assinaturaAtualizada } = await upsertLimitesOverride({
        clienteId: id,
        adminUserId: adminProfile?.id,
        valores,
        motivo: motivo || undefined,
      });

      await registrarAuditoria(adminProfile?.id, {
        acao: 'LIMITES_OVERRIDE_UPSERT',
        entidade: persistidoEmAssinaturaCliente ? 'assinaturas_clientes' : 'assinatura_limites_override',
        entidade_id: persistidoEmAssinaturaCliente ? String(assinaturaAtualizada?.id ?? id) : id,
        valores_anteriores: persistidoEmAssinaturaCliente
          ? ((data?.assinatura as unknown as Record<string, unknown> | null) ?? {})
          : ((anterior as Record<string, unknown> | null) ?? {}),
        valores_novos: persistidoEmAssinaturaCliente
          ? ((assinaturaAtualizada as unknown as Record<string, unknown> | null) ?? {})
          : ((novo as unknown as Record<string, unknown> | null) ?? {}),
      });

      return { novo, persistidoEmAssinaturaCliente };
    },
    onSuccess: async () => {
      setLimT('');
      await qc.invalidateQueries({ queryKey: ['cliente_azoup_admin', id] });
      await qc.invalidateQueries({ queryKey: ['clientes_azoup_admin'] });
    },
  });

  async function loadStripe() {
    setStripeJson(null);
    const sid = data?.assinatura?.stripe_subscription_id;
    if (!sid) {
      setStripeJson('Sem stripe_subscription_id na assinatura.');
      return;
    }
    try {
      const res = await obterAssinaturaStripe({ stripe_subscription_id: sid });
      setStripeJson(JSON.stringify(res.subscription, null, 2));
    } catch (e) {
      setStripeJson((e as Error).message);
    }
  }

  if (!id) return <Text>Cliente inválido.</Text>;

  if (isLoading) return <Text style={styles.pad}>Carregando cliente…</Text>;
  if (error || !data) return <Text style={[styles.pad, styles.err]}>{(error as Error)?.message ?? 'Erro'}</Text>;

  const nome =
    data.nome_fantasia ?? data.nome ?? data.razao_social ?? data.email ?? `Cliente ${data.id.slice(0, 8)}`;

  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Text style={styles.title}>{nome}</Text>
      <Text style={styles.meta}>Contato: {data.telefone ?? data.celular ?? '—'}</Text>
      <Text style={styles.meta}>E-mail: {data.email ?? '—'}</Text>

      <View style={styles.sep} />

      <Text style={styles.section}>Assinatura</Text>
      <Text style={styles.meta}>Status: {data.assinatura?.status ?? '—'}</Text>
      <Text style={styles.meta}>Início: {formatDateBR(data.assinatura?.data_inicio)}</Text>
      <Text style={styles.meta}>Dias como assinante: {data.dias_como_assinante ?? 0}</Text>
      <Text style={styles.meta}>
        Valor atual:{' '}
        {data.assinatura?.valor_atual_centavos != null
          ? formatBRLFromCentavos(data.assinatura.valor_atual_centavos)
          : data.assinatura?.valor_mensal_atual != null
            ? formatBRLFromReais(data.assinatura.valor_mensal_atual)
            : formatBRLFromCentavos(data.plano?.valor_mensal_centavos)}
      </Text>
      <Text style={styles.meta}>
        Adicionais (assinatura): usuários {data.assinatura?.usuarios_adicionais ?? data.assinatura?.usuarios_extras ?? 0} · empresas{' '}
        {data.assinatura?.empresas_adicionais ?? data.assinatura?.empresas_extras ?? 0}
      </Text>
      <Text style={styles.meta}>Stripe subscription: {data.assinatura?.stripe_subscription_id ?? '—'}</Text>

      <Pressable style={styles.secondaryBtn} onPress={loadStripe}>
        <Text style={styles.secondaryLabel}>Carregar status detalhado (Stripe)</Text>
      </Pressable>
      {stripeJson ? (
        <Text selectable style={styles.mono}>
          {stripeJson}
        </Text>
      ) : null}

      <View style={styles.sep} />

      <Text style={styles.section}>Financeiro recente</Text>
      <Text style={styles.meta}>Cobranças falhas (histórico): {data.cobrancas_falhas ?? 0}</Text>
      {data.meses_em_aberto?.length ? (
        <Text style={styles.warn}>Meses com fatura aberta/falha: {data.meses_em_aberto.join(', ')}</Text>
      ) : (
        <Text style={styles.meta}>Sem meses em aberto detectados no histórico local.</Text>
      )}

      {(data.historico_faturas ?? []).slice(0, 12).map((f) => (
        <Text key={f.id} style={styles.meta}>
          {formatDateBR(f.periodo_inicio ?? f.created_at)} · {f.status} · {formatBRLFromCentavos(f.valor_centavos)}
        </Text>
      ))}

      <View style={styles.sep} />

      <Text style={styles.section}>Limites efetivos (plano + override)</Text>
      <Text style={styles.meta}>Usuários (override/plano ou assinatura): {efetivos?.usuarios ?? '—'}</Text>
      <Text style={styles.meta}>Empresas (override/plano ou assinatura): {efetivos?.empresas ?? '—'}</Text>
      <Text style={styles.meta}>Armazenamento (GB): {efetivos?.armazenamento_gb ?? '—'}</Text>
      <Text style={styles.meta}>Limite IA mensal (credito_ia_limite_mensal): {efetivos?.tokens_ia_mes ?? '—'}</Text>
      <Text style={styles.meta}>Saldo plano IA (credito_ia_saldo_plano): {data.assinatura?.credito_ia_saldo_plano ?? '—'}</Text>
      <Text style={styles.meta}>Créditos IA extra (credito_ia_extra): {data.assinatura?.credito_ia_extra ?? 0}</Text>
      <Text style={styles.meta}>Ref. mês IA (credito_ia_mes_ref): {data.assinatura?.credito_ia_mes_ref ?? '—'}</Text>

      <View style={styles.sep} />

      <Text style={styles.section}>Personalização de limites (sem mudar plano Stripe)</Text>
      {!canEditLimits ? (
        <Text style={styles.warn}>Seu papel não permite edição.</Text>
      ) : (
        <>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            placeholder="usuarios_adicionais (absoluto na assinatura; vazio = não alterar)"
            value={limU}
            onChangeText={setLimU}
          />
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            placeholder="empresas_adicionais (absoluto na assinatura; vazio = não alterar)"
            value={limE}
            onChangeText={setLimE}
          />
          <TextInput style={styles.input} keyboardType="decimal-pad" placeholder="Armazenamento GB" value={limS} onChangeText={setLimS} />
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            placeholder="Somar em credito_ia_extra (incremento; vazio = não alterar)"
            value={limT}
            onChangeText={setLimT}
          />
          <TextInput style={styles.input} placeholder="Motivo da alteração (auditoria)" value={motivo} onChangeText={setMotivo} />

          <Pressable style={styles.primaryBtn} disabled={saveMutation.isPending} onPress={() => saveMutation.mutate()}>
            <Text style={styles.primaryLabel}>{saveMutation.isPending ? 'Salvando…' : 'Salvar override'}</Text>
          </Pressable>

          {saveMutation.isError ? (
            <Text selectable style={styles.err}>
              {(saveMutation.error as Error).message}
            </Text>
          ) : null}

          <Pressable style={styles.secondaryBtn} onPress={() => refetch()}>
            <Text style={styles.secondaryLabel}>Recarregar</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, gap: 8, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700' },
  section: { marginTop: 8, fontSize: 16, fontWeight: '700' },
  meta: { opacity: 0.82 },
  sep: { height: 1, backgroundColor: '#00000022', marginVertical: 12 },
  err: { color: '#b91c1c' },
  warn: { color: '#b45309', fontWeight: '600' },
  mono: { fontFamily: 'SpaceMono', fontSize: 11, opacity: 0.85 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
  },
  primaryBtn: { marginTop: 12, backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  primaryLabel: { color: '#fff', fontWeight: '700' },
  secondaryBtn: {
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#cbd5e1',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryLabel: { fontWeight: '700', opacity: 0.85 },
});
