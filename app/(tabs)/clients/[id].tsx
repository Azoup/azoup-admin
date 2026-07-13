import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConversaClienteCard } from '@/components/ui/ConversaClienteCard';
import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { BackLink } from '@/components/ui/BackLink';
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
  parseLimitesFormulario,
  resolverLimitesEfetivos,
  upsertLimitesOverride,
} from '@/src/services/repos/clientes-repo';
import {
  clientePrecisaChamar,
  congelarCliente,
  descongelarCliente,
} from '@/src/services/repos/congelamento-repo';
import { listarConversasClientes } from '@/src/services/repos/conversas-repo';
import { obterAssinaturaStripe } from '@/src/services/stripe-admin-api';
import { rotuloStatusAssinatura } from '@/src/utils/assinatura-status';
import {
  dataHojeBrasil,
  formatBRLFromCentavos,
  formatBRLFromReais,
  formatDateBR,
  formatDateTimeBR,
  formatYmdBR,
} from '@/src/utils/format';

export default function ClientDetailScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { adminProfile, canEditLimits, session } = useAdminAuth();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['cliente_azoup_admin', id],
    queryFn: () => montarVisaoCliente(id),
    enabled: Boolean(id),
  });

  const conversasQ = useQuery({
    queryKey: ['admin_cliente_conversas', id],
    queryFn: () => listarConversasClientes({ clienteId: id }),
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
  const [dataRetorno, setDataRetorno] = useState('');
  const [obsCongelar, setObsCongelar] = useState('');
  const [congelarErro, setCongelarErro] = useState<string | null>(null);

  useEffect(() => {
    setLimU('');
    setLimE('');
    setLimS('');
    setLimT('');
    setMotivo('');
    setSaveHint(null);
    setCongelarErro(null);
  }, [id]);

  useEffect(() => {
    if (data?.congelamento?.congelado) {
      setDataRetorno(`${data.congelamento.data_retorno ?? ''}`.slice(0, 10));
      setObsCongelar(data.congelamento.observacao ?? '');
    } else {
      setDataRetorno('');
      setObsCongelar('');
    }
  }, [data?.congelamento?.congelado, data?.congelamento?.data_retorno, data?.congelamento?.observacao]);

  const congelarMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('Cliente inválido');
      return congelarCliente({
        clienteId: id,
        dataRetorno,
        observacao: obsCongelar,
        adminEmail: session?.user?.email ?? adminProfile?.email ?? null,
      });
    },
    onSuccess: async (row) => {
      setCongelarErro(null);
      await registrarAuditoria({ id: adminProfile?.id, email: adminProfile?.email }, {
        acao: 'CLIENTE_CONGELAR',
        entidade: 'admin_cliente_congelamento',
        entidade_id: id,
        valores_anteriores: {},
        valores_novos: row as unknown as Record<string, unknown>,
      });
      await qc.invalidateQueries({ queryKey: ['cliente_azoup_admin', id] });
      await qc.invalidateQueries({ queryKey: ['clientes_azoup_admin'] });
    },
    onError: (e) => setCongelarErro(e instanceof Error ? e.message : 'Erro ao congelar'),
  });

  const descongelarMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('Cliente inválido');
      return descongelarCliente({
        clienteId: id,
        adminEmail: session?.user?.email ?? adminProfile?.email ?? null,
      });
    },
    onSuccess: async (row) => {
      setCongelarErro(null);
      await registrarAuditoria({ id: adminProfile?.id, email: adminProfile?.email }, {
        acao: 'CLIENTE_DESCONGELAR',
        entidade: 'admin_cliente_congelamento',
        entidade_id: id,
        valores_anteriores: {},
        valores_novos: row as unknown as Record<string, unknown>,
      });
      await qc.invalidateQueries({ queryKey: ['cliente_azoup_admin', id] });
      await qc.invalidateQueries({ queryKey: ['clientes_azoup_admin'] });
    },
    onError: (e) => setCongelarErro(e instanceof Error ? e.message : 'Erro ao descongelar'),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      setSaveHint(null);
      const valores = parseLimitesFormulario(limU, limE, limS, limT);
      const anteriorAssinatura = data?.assinatura as unknown as Record<string, unknown> | null;
      const anteriorOverride = data?.limites_override as unknown as Record<string, unknown> | null;

      const { novo, persistidoEmAssinaturaCliente, assinaturaAtualizada } = await upsertLimitesOverride({
        clienteId: id,
        adminUserId: adminProfile?.id,
        valores,
        motivo: motivo || undefined,
      });

      const auditAntes: Record<string, unknown> = {};
      const auditDepois: Record<string, unknown> = {};
      if (valores.usuarios !== null) {
        auditAntes.usuarios_adicionais = anteriorAssinatura?.usuarios_adicionais ?? anteriorAssinatura?.usuarios_extras ?? null;
        auditDepois.usuarios_adicionais = assinaturaAtualizada?.usuarios_adicionais ?? valores.usuarios;
      }
      if (valores.empresas !== null) {
        auditAntes.empresas_adicionais = anteriorAssinatura?.empresas_adicionais ?? anteriorAssinatura?.empresas_extras ?? null;
        auditDepois.empresas_adicionais = assinaturaAtualizada?.empresas_adicionais ?? valores.empresas;
      }
      if (valores.tokens_ia_mes !== null) {
        auditAntes.credito_ia_extra = anteriorAssinatura?.credito_ia_extra ?? null;
        auditDepois.credito_ia_extra = assinaturaAtualizada?.credito_ia_extra ?? null;
        auditDepois.credito_ia_extra_incremento = valores.tokens_ia_mes;
      }
      if (valores.armazenamento_gb !== null) {
        auditAntes.armazenamento_gb_override =
          anteriorOverride?.armazenamento_gb_override ?? anteriorOverride?.limite_armazenamento_gb ?? null;
        auditDepois.armazenamento_gb_override =
          novo?.armazenamento_gb_override ?? novo?.limite_armazenamento_gb ?? valores.armazenamento_gb;
      }

      const audit = await registrarAuditoria(
        { id: adminProfile?.id, email: adminProfile?.email },
        {
          acao: 'LIMITES_OVERRIDE_UPSERT',
          entidade:
            persistidoEmAssinaturaCliente && valores.armazenamento_gb !== null
              ? 'assinaturas_clientes+override'
              : persistidoEmAssinaturaCliente
                ? 'assinaturas_clientes'
                : 'assinatura_limites_override',
          entidade_id: String(assinaturaAtualizada?.id ?? novo?.id ?? id),
          valores_anteriores: auditAntes,
          valores_novos: auditDepois,
        },
      );

      return { novo, persistidoEmAssinaturaCliente, audit };
    },
    onSuccess: async (result) => {
      setLimU('');
      setLimE('');
      setLimS('');
      setLimT('');
      setMotivo('');
      if (result?.audit && !result.audit.ok && result.audit.reason === 'rls') {
        setSaveHint(
          'Créditos/limites salvos. O log de auditoria não foi gravado (RLS) — execute supabase/sql/admin_audit_logs_rls.sql no Supabase e faça deploy de admin-stripe.',
        );
      } else if (result?.audit && !result.audit.ok) {
        setSaveHint(
          `Alteração salva. O log de auditoria não foi gravado (${result.audit.reason}). Execute supabase/sql/admin_audit_logs_rls.sql no Supabase.`,
        );
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
  const congelado = Boolean(data.congelamento?.congelado);
  const precisaChamar = clientePrecisaChamar(data.congelamento);

  const ultimoAcessoLabel =
    metricas?.ultimo_acesso_fonte === 'auth'
      ? 'login no sistema'
      : metricas?.ultimo_acesso_fonte === 'atividade'
        ? 'atividade no ERP'
        : null;

  return (
    <Screen scroll>
      <BackLink href="/clients" label="Voltar para clientes" />
      <PageHeader title={nome} subtitle={`E-mail: ${data.email ?? '—'} · ${data.telefone ?? data.celular ?? '—'}`} />

      <ScreenCard style={{ gap: 10 }}>
        <SectionTitle>Congelar / chamar de novo</SectionTitle>
        {congelado ? (
          <Text
            style={{
              color: precisaChamar ? theme.error : theme.cadastroAction,
              fontWeight: '800',
            }}
          >
            {precisaChamar
              ? `Hora de chamar · retorno ${formatYmdBR(data.congelamento?.data_retorno)}`
              : `Congelado até ${formatYmdBR(data.congelamento?.data_retorno)}`}
          </Text>
        ) : (
          <Text style={{ color: theme.textMuted, fontSize: 13 }}>
            Congela o acompanhamento e agenda a data para ligar novamente.
          </Text>
        )}

        <FormField label="Data para chamar" required helper="Formato AAAA-MM-DD">
          <FormInput
            value={dataRetorno}
            onChangeText={setDataRetorno}
            placeholder={dataHojeBrasil()}
            autoCapitalize="none"
          />
        </FormField>
        <FormField label="Observação">
          <FormInput
            value={obsCongelar}
            onChangeText={setObsCongelar}
            placeholder="Motivo do congelamento / o que falar na ligação"
          />
        </FormField>

        {congelarErro ? <Text style={{ color: theme.error }}>{congelarErro}</Text> : null}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <PrimaryButton
            label={congelarMutation.isPending ? 'Salvando…' : congelado ? 'Atualizar retorno' : 'Congelar cliente'}
            loading={congelarMutation.isPending}
            onPress={() => congelarMutation.mutate()}
          />
          {congelado ? (
            <SecondaryButton
              label={descongelarMutation.isPending ? 'Descongelando…' : 'Descongelar'}
              disabled={descongelarMutation.isPending}
              onPress={() => descongelarMutation.mutate()}
            />
          ) : null}
        </View>
      </ScreenCard>

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
        <Meta
          label="Notas fiscais geradas"
          value={metricas?.notas_fiscais_emitidas != null ? String(metricas.notas_fiscais_emitidas) : '—'}
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

      <ScreenCard style={{ gap: 8 }}>
        <SectionTitle>Histórico de conversas</SectionTitle>
        {conversasQ.isLoading ? (
          <Text style={{ color: theme.textMuted, fontSize: 13 }}>Carregando conversas…</Text>
        ) : conversasQ.error ? (
          <Text style={{ color: theme.textMuted, fontSize: 13 }}>
            Não foi possível carregar o histórico de conversas.
          </Text>
        ) : (conversasQ.data ?? []).length === 0 ? (
          <Text style={{ color: theme.textMuted, fontSize: 13 }}>
            Nenhuma conversa registrada para este cliente. Use a aba Conversas para adicionar.
          </Text>
        ) : (
          (conversasQ.data ?? []).map((conversa) => (
            <ConversaClienteCard key={conversa.id} conversa={conversa} modo="cliente" />
          ))
        )}
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
        <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 8 }}>
          Campos começam vazios. Preencha só o que deseja alterar — o restante permanece igual no banco.
        </Text>
        {!canEditLimits ? (
          <Text style={{ color: theme.warning, fontWeight: '600' }}>Seu papel não permite edição.</Text>
        ) : (
          <>
            <FormField label="Usuários adicionais" helper="Vazio = não alterar · preenchido = novo total na assinatura">
              <FormInput keyboardType="number-pad" value={limU} onChangeText={setLimU} placeholder="—" />
            </FormField>
            <FormField label="Empresas adicionais" helper="Vazio = não alterar · preenchido = novo total na assinatura">
              <FormInput keyboardType="number-pad" value={limE} onChangeText={setLimE} placeholder="—" />
            </FormField>
            <FormField label="Armazenamento (GB)" helper="Vazio = não alterar · preenchido = novo limite administrativo">
              <FormInput keyboardType="decimal-pad" value={limS} onChangeText={setLimS} placeholder="—" />
            </FormField>
            <FormField label="Créditos IA extra" helper="Vazio = não alterar · preenchido = soma ao saldo extra atual">
              <FormInput keyboardType="number-pad" value={limT} onChangeText={setLimT} placeholder="—" />
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
