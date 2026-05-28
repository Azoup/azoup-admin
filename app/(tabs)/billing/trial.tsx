import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { registrarAuditoria } from '@/src/services/audit';
import { atualizarTrialDias, obterBillingSettings } from '@/src/services/repos/billing-repo';

export default function TrialSettingsScreen() {
  const qc = useQueryClient();
  const { adminProfile, canManageBilling } = useAdminAuth();
  const [dias, setDias] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin_billing_settings'],
    queryFn: obterBillingSettings,
  });

  useEffect(() => {
    if (data?.trial_dias_padrao != null) setDias(String(data.trial_dias_padrao));
  }, [data?.trial_dias_padrao]);

  const mutation = useMutation({
    mutationFn: async () => {
      const n = Number(dias);
      if (!Number.isFinite(n) || n < 0) throw new Error('Informe um número válido de dias');
      await atualizarTrialDias(Math.floor(n));
      await registrarAuditoria(adminProfile?.id, {
        acao: 'BILLING_TRIAL_DIAS_UPDATE',
        entidade: 'admin_billing_settings',
        entidade_id: 'singleton',
        valores_anteriores: { trial_dias_padrao: data?.trial_dias_padrao ?? null },
        valores_novos: { trial_dias_padrao: Math.floor(n) },
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin_billing_settings'] });
    },
  });

  if (!canManageBilling) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.warn}>Seu papel não pode alterar billing.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Dias de trial padrão</Text>
      <Text style={styles.sub}>Persistido em `admin_billing_settings`. O app principal deve ler esse valor ao criar assinaturas.</Text>

      {isLoading ? <Text>Carregando…</Text> : null}

      <TextInput keyboardType="number-pad" placeholder="Ex.: 14" value={dias} onChangeText={setDias} style={styles.input} />

      <Pressable style={styles.btn} disabled={mutation.isPending} onPress={() => mutation.mutate()}>
        <Text style={styles.btnLabel}>{mutation.isPending ? 'Salvando…' : 'Salvar'}</Text>
      </Pressable>

      {mutation.error ? <Text style={styles.err}>{(mutation.error as Error).message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  sub: { opacity: 0.78, lineHeight: 20 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  btn: { backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  btnLabel: { color: '#fff', fontWeight: '800' },
  err: { color: '#b91c1c' },
  warn: { color: '#b45309', fontWeight: '700' },
});
