import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Text } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import { registrarAuditoria } from '@/src/services/audit';
import {
  montarVisaoCliente,
  resolverLimitesEfetivos,
  upsertLimitesOverride,
  type LimitesEffectivos,
} from '@/src/services/repos/clientes-repo';
import { obterAssinaturaStripe } from '@/src/services/stripe-admin-api';
import { rotuloStatusAssinatura } from '@/src/utils/assinatura-status';
import { formatBRLFromCentavos, formatBRLFromReais, formatDateBR, formatDateTimeBR } from '@/src/utils/format';

export default function ClientDetailScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
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
  const [saveHint, setSaveHint] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const a = data.assinatura;
    setLimU(
      a?.usuarios_adicionais != null
        ? String(a.usuarios_adicionais)
        : a?.usuarios_extras != null
          ? String(a.usuarios_extras)
          : '',
    );
    setLimE(
      a?.empresas_adicionais != null
        ? String(a.empresas_adicionais)
        : a?.empresas_extras != null
          ? String(a.empresas_extras)
          : '',
    );
    setLimS(efetivos?.armazenamento_gb != null ? String(efetivos.armazenamento_gb) : '');
  }, [data, efetivos?.armazenamento_gb]);

  useEffect(() => {
    setLimT('');
    setMotivo('');
  }, [id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      setSaveHint(null);
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

      const audit = await registrarAuditoria(adminProfile?.id, {
        acao: 'LIMITES_OVERRIDE_UPSERT',
        entidade: persistidoEmAssinaturaCliente ? 'assinaturas_clientes' : 'assinatura_limites_override',
        entidade_id: persistidoEmAssinaturaCliente ? String(assinaturaAtualizada?.id ?? id) : id,
        valores_anteriores: persistidoEmAssinaturaCliente
          ? ((data?.assinatura as unknown as Record<string, unknown> | null) ?? {})
          : ((anterior as Record<string, unknown> | null) ?? {}),
        valores_novos: persistidoEmAssinaturaCliente
          ? ((assinaturaAtualizada as unknown as Record<string, unknown> | null) ?? {})
          : ((novo as Record<string, unknown> | null) ?? {}),
      });

      return { novo, persistidoEmAssinaturaCliente, audit };
    },
    onSuccess: async (result) => {
      setLimT('');
      if (result?.audit && !result.audit.ok && result.audit.reason === 'rls') {
        setSaveHint(
          'Créditos/limites salvos. O log de auditoria não foi gravado (permissão RLS em admin_audit_logs) — aplique supabase/sql/admin_audit_logs_rls.sql no Supabase.',
        );
      } else if (result?.audit && !result.audit.ok) {
        setSaveHint('Alteração salva. O log de auditoria não foi gravado (schema da tabela).');
      } else {
        setSaveHint('Alteração salva com sucesso.');
      }
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
  if (error || !data) return <Text style={[styles.pad, { color: theme.error }]}>{(error as Error)?.message ?? 'Erro'}</Text>;

  const nome =
    data.nome_fantasia ?? data.nome ?? data.razao_social ?? data.email ?? `Cliente ${data.id.slice(0, 8)}`;
  const metricas = data.metricas_uso;

  const ultimoAcessoLabel =
    metricas?.ultimo_acesso_fonte === 'auth'
      ? 'login no sistema'
      : metricas?.ultimo_acesso_fonte === 'atividade'
        ? 'atividade no ERP'
        : null;

  return (
    <Screen scroll>
      <PageHeader title={nome} subtitle={`E-mail: ${data.email ?? '—'} · ${data.telefone ?? data.celular ?? '—'}`} />

      <ScreenCard>
        <SectionTitle>Uso do sistema</SectionTitle>
        <Meta label="Último acesso" value={formatDateTimeBR(metricas?.ultimo_acesso)} />
        {ultimoAcessoLabel ? (
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>Fonte: {ultimoAcessoLabel}</Text>
        ) : null}
        <Meta
          label="Empresas cadastradas"
          value={metricas?.empresas_cadastradas != null ? String(metricas.empresas_cadastradas) : '—'}
        />
        <Meta
          label="Produtos cadastrados"
          value={metricas?.produtos_cadastrados != null ? String(metricas.produtos_cadastrados) : '—'}
        />
        <Meta label="Vendas" value={metricas?.vendas != null ? String(metricas.vendas) : '—'} />
        <Meta
          label="Ordens de produção (OPs)"
          value={metricas?.ordens_producao != null ? String(metricas.ordens_producao) : '—'}
        />
      </ScreenCard>

      <ScreenCard>
        <SectionTitle>Assinatura</SectionTitle>
        <Meta label="Status" value={rotuloStatusAssinatura(data.assinatura)} />
        <Meta label="Início" value={formatDateBR(data.assinatura?.data_inicio)} />
        <Meta label="Dias como assinante" value={String(data.dias_como_assinante ?? 0)} />
        <Meta
          label="Valor atual"
          value={
            data.assinatura?.valor_atual_centavos != null
              ? formatBRLFromCentavos(data.assinatura.valor_atual_centavos)
              : data.assinatura?.valor_mensal_atual != null
                ? formatBRLFromReais(data.assinatura.valor_mensal_atual)
                : formatBRLFromCentavos(data.plano?.valor_mensal_centavos)
          }
        />
        <Meta
          label="Adicionais"
          value={`usuários ${data.assinatura?.usuarios_adicionais ?? data.assinatura?.usuarios_extras ?? 0} · empresas ${data.assinatura?.empresas_adicionais ?? data.assinatura?.empresas_extras ?? 0}`}
        />
        <Meta label="Stripe subscription" value={data.assinatura?.stripe_subscription_id ?? '—'} />
        <SecondaryButton label="Carregar status detalhado (Stripe)" onPress={loadStripe} style={{ marginTop: 8 }} />
        {stripeJson ? (
          <Text selectable style={styles.mono}>
            {stripeJson}
          </Text>
        ) : null}
      </ScreenCard>

      <ScreenCard>
        <SectionTitle>Financeiro recente</SectionTitle>
        <Meta label="Cobranças falhas" value={String(data.cobrancas_falhas ?? 0)} />
        {data.meses_em_aberto?.length ? (
          <Text style={{ color: theme.warning, fontWeight: '600' }}>
            Meses com fatura aberta/falha: {data.meses_em_aberto.join(', ')}
          </Text>
        ) : (
          <Text style={{ color: theme.textMuted }}>Sem meses em aberto detectados no histórico local.</Text>
        )}
        {(data.historico_faturas ?? []).slice(0, 12).map((f) => (
          <Text key={f.id} style={{ color: theme.textMuted, fontSize: 13 }}>
            {formatDateBR(f.periodo_inicio ?? f.created_at)} · {f.status} · {formatBRLFromCentavos(f.valor_centavos)}
          </Text>
        ))}
      </ScreenCard>

      <ScreenCard>
        <SectionTitle>Limites efetivos (plano + override)</SectionTitle>
        <Meta label="Usuários (total)" value={String(efetivos?.usuarios ?? '—')} />
        {efetivos?.override_usuarios == null && (efetivos?.plano_usuarios != null || efetivos?.usuarios_adicionais) ? (
          <Meta
            label="Composição usuários"
            value={`plano ${efetivos?.plano_usuarios ?? 0} + adicionais ${efetivos?.usuarios_adicionais ?? 0}`}
          />
        ) : efetivos?.override_usuarios != null ? (
          <Meta label="Override usuários" value={String(efetivos.override_usuarios)} />
        ) : null}
        <Meta label="Limite empresas (contratado)" value={String(efetivos?.empresas ?? '—')} />
        {efetivos?.override_empresas == null && efetivos?.plano_empresas != null ? (
          <Meta
            label="Composição limite"
            value={`inclusas ${efetivos.plano_empresas} + adicionais ${efetivos.empresas_adicionais ?? 0}`}
          />
        ) : efetivos?.override_empresas != null ? (
          <Meta label="Override empresas" value={String(efetivos.override_empresas)} />
        ) : null}
        {efetivos?.limite_empresas_enterprise != null ? (
          <Meta label="Teto Enterprise" value={String(efetivos.limite_empresas_enterprise)} />
        ) : null}
        <Meta label="Armazenamento (GB)" value={String(efetivos?.armazenamento_gb ?? '—')} />
        <Meta label="Limite IA mensal" value={String(efetivos?.tokens_ia_mes ?? '—')} />
        <Meta label="Saldo plano IA" value={String(data.assinatura?.credito_ia_saldo_plano ?? '—')} />
        <Meta label="Créditos IA extra" value={String(data.assinatura?.credito_ia_extra ?? 0)} />
        <Meta label="Ref. mês IA" value={String(data.assinatura?.credito_ia_mes_ref ?? '—')} />
        {!data.plano?.nome && data.assinatura?.plano_id ? (
          <Text style={{ color: theme.warning, fontSize: 12 }}>
            Plano #{data.assinatura.plano_id} não carregou — confira RLS em planos_assinatura ou nomes de colunas de limite.
          </Text>
        ) : null}
      </ScreenCard>

      <ScreenCard>
        <SectionTitle>Personalização de limites</SectionTitle>
        {!canEditLimits ? (
          <Text style={{ color: theme.warning, fontWeight: '600' }}>Seu papel não permite edição.</Text>
        ) : (
          <>
            <FormField label="Usuários adicionais" helper="Valor absoluto na assinatura; vazio = não alterar">
              <FormInput keyboardType="number-pad" value={limU} onChangeText={setLimU} />
            </FormField>
            <FormField label="Empresas adicionais" helper="Valor absoluto na assinatura; vazio = não alterar">
              <FormInput keyboardType="number-pad" value={limE} onChangeText={setLimE} />
            </FormField>
            <FormField label="Armazenamento (GB)">
              <FormInput keyboardType="decimal-pad" value={limS} onChangeText={setLimS} />
            </FormField>
            <FormField label="Créditos IA extra" helper="Soma em credito_ia_extra; vazio = não alterar">
              <FormInput keyboardType="number-pad" value={limT} onChangeText={setLimT} />
            </FormField>
            <FormField label="Motivo (auditoria)">
              <FormInput value={motivo} onChangeText={setMotivo} />
            </FormField>

            <PrimaryButton
              label={saveMutation.isPending ? 'Salvando…' : 'Salvar override'}
              loading={saveMutation.isPending}
              onPress={() => saveMutation.mutate()}
            />

            {saveMutation.isError ? (
              <Text selectable style={{ color: theme.error }}>
                {(saveMutation.error as Error).message}
              </Text>
            ) : null}

            {saveHint ? (
              <Text
                selectable
                style={{
                  color: saveHint.includes('auditoria') && saveHint.includes('salvos') ? theme.warning : theme.success,
                  fontWeight: '600',
                }}>
                {saveHint}
              </Text>
            ) : null}

            <SecondaryButton label="Recarregar" onPress={() => refetch()} />
          </>
        )}
      </ScreenCard>
    </Screen>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 4 }}>
      {label}: <Text style={{ color: theme.text, fontWeight: '600' }}>{value}</Text>
    </Text>
  );
}

function getStyles(theme: ReturnType<typeof useTheme>['theme']) {
  return StyleSheet.create({
    pad: { padding: 16 },
    mono: { fontFamily: 'SpaceMono', fontSize: 11, color: theme.text, opacity: 0.85, marginTop: 8 },
  });
}
