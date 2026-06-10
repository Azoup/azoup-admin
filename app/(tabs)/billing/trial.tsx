import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import { registrarAuditoria } from '@/src/services/audit';
import { atualizarTrialDias, obterBillingSettings } from '@/src/services/repos/billing-repo';

export default function TrialSettingsScreen() {
  const { theme } = useTheme();
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
      <Screen>
        <Text style={{ color: theme.warning, fontWeight: '700' }}>Seu papel não pode alterar billing.</Text>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <PageHeader
        title="Dias de trial padrão"
        subtitle="Persistido em admin_billing_settings. O app principal deve ler esse valor ao criar assinaturas."
      />

      {isLoading ? <Text style={{ color: theme.textMuted }}>Carregando…</Text> : null}

      <FormField label="Dias de teste" helper="Ex.: 14">
        <FormInput keyboardType="number-pad" placeholder="14" value={dias} onChangeText={setDias} />
      </FormField>

      <PrimaryButton
        label={mutation.isPending ? 'Salvando…' : 'Salvar'}
        loading={mutation.isPending}
        onPress={() => mutation.mutate()}
      />

      {mutation.error ? <Text style={{ color: theme.error }}>{(mutation.error as Error).message}</Text> : null}
    </Screen>
  );
}
