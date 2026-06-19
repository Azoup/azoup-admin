import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { FormCheckbox } from '@/components/ui/FormCheckbox';
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
import { atualizarOpcoesPlano, listarPlanos } from '@/src/services/repos/billing-repo';
import { criarPlanoStripe, type PlanoOpcoesFlag } from '@/src/services/stripe-admin-api';
import { formatBRLFromCentavos } from '@/src/utils/format';
import {
  planoExibirParaClientes,
  planoIsEnterprise,
  planoRequerClienteLogado,
  planoTemUpgrades,
  precoMensalCentavosDoPlano,
  stripePriceIdDoPlano,
} from '@/src/utils/plano-stripe';
import type { PlanoAssinaturaRow } from '@/src/types/azoup';

const PLANO_OPCOES_CADASTRO: Array<{ flag: PlanoOpcoesFlag; label: string; helper?: string }> = [
  { flag: 'tem_upgrades', label: 'Permite upgrades (add-ons)' },
  {
    flag: 'is_enterprise',
    label: 'Plano Enterprise (sem Stripe)',
    helper: 'Enterprise não cria produto/preço no Stripe.',
  },
  { flag: 'exibir_para_clientes', label: 'Exibir para clientes no app' },
  {
    flag: 'requer_cliente_logado',
    label: 'Requer cliente logado',
    helper: 'Só pode ser contratado por quem já tem conta (não no signup anônimo).',
  },
];

function planoFlagValue(plano: PlanoAssinaturaRow, flag: PlanoOpcoesFlag): boolean {
  switch (flag) {
    case 'exibir_para_clientes':
      return planoExibirParaClientes(plano);
    case 'requer_cliente_logado':
      return planoRequerClienteLogado(plano);
    case 'tem_upgrades':
      return planoTemUpgrades(plano);
    case 'is_enterprise':
      return planoIsEnterprise(plano);
  }
}

function parseReaisInput(raw: string): number {
  const normalizado = raw.trim().replace(/\./g, '').replace(',', '.');
  const n = Number(normalizado);
  if (!Number.isFinite(n)) throw new Error('Valor inválido');
  return n;
}

function parseInteiroInput(raw: string, campo: string, obrigatorio = true): number {
  const t = raw.trim();
  if (!t) {
    if (!obrigatorio) return 0;
    throw new Error(`${campo} é obrigatório`);
  }
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${campo} inválido`);
  return n;
}

export default function PlansScreen() {
  const { theme } = useTheme();
  const qc = useQueryClient();
  const { adminProfile, canManageBilling } = useAdminAuth();

  const planosQuery = useQuery({ queryKey: ['planos_assinatura'], queryFn: listarPlanos });

  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [precoBase, setPrecoBase] = useState('');
  const [usuariosInclusos, setUsuariosInclusos] = useState('1');
  const [empresasIncluidas, setEmpresasIncluidas] = useState('1');
  const [armazenamentoGb, setArmazenamentoGb] = useState('5');
  const [limiteNfe, setLimiteNfe] = useState('');
  const [creditoIa, setCreditoIa] = useState('0');
  const [precoUsuarioAdicional, setPrecoUsuarioAdicional] = useState('0');
  const [precoEmpresaAdicional, setPrecoEmpresaAdicional] = useState('0');
  const [limiteEmpresasEnterprise, setLimiteEmpresasEnterprise] = useState('10');
  const [temUpgrades, setTemUpgrades] = useState(false);
  const [isEnterprise, setIsEnterprise] = useState(false);
  const [exibirParaClientes, setExibirParaClientes] = useState(false);
  const [requerClienteLogado, setRequerClienteLogado] = useState(false);
  const [formErro, setFormErro] = useState<string | null>(null);

  const criarMutation = useMutation({
    mutationFn: async () => {
      if (!canManageBilling) throw new Error('Sem permissão para gerenciar planos.');

      const payload = {
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        preco_base_reais: isEnterprise ? 0 : parseReaisInput(precoBase),
        usuarios_inclusos: parseInteiroInput(usuariosInclusos, 'Usuários inclusos'),
        empresas_incluidas: parseInteiroInput(empresasIncluidas, 'Empresas inclusas'),
        armazenamento_gb: parseInteiroInput(armazenamentoGb, 'Armazenamento (GB)'),
        limite_nfe_mensal: limiteNfe.trim() ? parseInteiroInput(limiteNfe, 'Limite NF-e mensal') : null,
        limite_empresas_enterprise: limiteEmpresasEnterprise.trim()
          ? parseInteiroInput(limiteEmpresasEnterprise, 'Limite empresas enterprise')
          : 10,
        credito_ia_mensal: parseInteiroInput(creditoIa, 'Crédito IA', false),
        preco_usuario_adicional: parseReaisInput(precoUsuarioAdicional || '0'),
        preco_cnpj_adicional: parseReaisInput(precoEmpresaAdicional || '0'),
        tem_upgrades: temUpgrades,
        is_enterprise: isEnterprise,
        exibir_para_clientes: exibirParaClientes,
        requer_cliente_logado: requerClienteLogado,
      };

      if (!payload.nome) throw new Error('Nome do plano é obrigatório.');

      const res = await criarPlanoStripe(payload);
      const plano = res.plano;

      await registrarAuditoria({ id: adminProfile?.id, email: adminProfile?.email }, {
        acao: 'PLANO_CREATE',
        entidade: 'planos_assinatura',
        entidade_id: plano.id as string | number,
        valores_anteriores: {},
        valores_novos: plano as Record<string, unknown>,
      });

      return plano;
    },
    onSuccess: () => {
      setFormErro(null);
      setNome('');
      setDescricao('');
      setPrecoBase('');
      setUsuariosInclusos('1');
      setEmpresasIncluidas('1');
      setArmazenamentoGb('5');
      setLimiteNfe('');
      setCreditoIa('0');
      setPrecoUsuarioAdicional('0');
      setPrecoEmpresaAdicional('0');
      setLimiteEmpresasEnterprise('10');
      setTemUpgrades(false);
      setIsEnterprise(false);
      setExibirParaClientes(false);
      setRequerClienteLogado(false);
      void qc.invalidateQueries({ queryKey: ['planos_assinatura'] });
    },
    onError: (e) => setFormErro(e instanceof Error ? e.message : 'Erro ao criar plano'),
  });

  const opcoesMutation = useMutation({
    mutationFn: async ({
      planoId,
      flag,
      value,
    }: {
      planoId: number;
      flag: PlanoOpcoesFlag;
      value: boolean;
    }) => {
      if (!canManageBilling) throw new Error('Sem permissão para alterar planos.');
      return atualizarOpcoesPlano({ plano_id: planoId, [flag]: value });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['planos_assinatura'] }),
  });

  const planos = planosQuery.data ?? [];

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
      data={planos}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 4 }}>
          <BackLink href="/billing" />
          <PageHeader
            title="Planos Azoup"
            subtitle="Crie planos no banco e no Stripe. Marque quais aparecem para os clientes no app."
          />

          {canManageBilling ? (
            <ScreenCard style={{ gap: 10 }}>
              <SectionTitle>Novo plano</SectionTitle>

              <FormField label="Nome *">
                <FormInput value={nome} onChangeText={setNome} placeholder="Ex.: Profissional" />
              </FormField>

              <FormField label="Descrição">
                <FormInput
                  value={descricao}
                  onChangeText={setDescricao}
                  placeholder="Texto exibido na vitrine de planos"
                  multiline
                />
              </FormField>

              <FormField label={isEnterprise ? 'Preço mensal (R$)' : 'Preço mensal (R$) *'}>
                <FormInput
                  value={precoBase}
                  onChangeText={setPrecoBase}
                  placeholder="199,90"
                  keyboardType="decimal-pad"
                  editable={!isEnterprise}
                />
              </FormField>

              <View style={styles.row2}>
                <View style={styles.col}>
                  <FormField label="Usuários inclusos *">
                    <FormInput value={usuariosInclusos} onChangeText={setUsuariosInclusos} keyboardType="number-pad" />
                  </FormField>
                </View>
                <View style={styles.col}>
                  <FormField label="Empresas inclusas">
                    <FormInput value={empresasIncluidas} onChangeText={setEmpresasIncluidas} keyboardType="number-pad" />
                  </FormField>
                </View>
              </View>

              <View style={styles.row2}>
                <View style={styles.col}>
                  <FormField label="Armazenamento (GB) *">
                    <FormInput value={armazenamentoGb} onChangeText={setArmazenamentoGb} keyboardType="number-pad" />
                  </FormField>
                </View>
                <View style={styles.col}>
                  <FormField label="Limite NF-e/mês" helper="Vazio = ilimitado">
                    <FormInput value={limiteNfe} onChangeText={setLimiteNfe} keyboardType="number-pad" placeholder="200" />
                  </FormField>
                </View>
              </View>

              <View style={styles.row2}>
                <View style={styles.col}>
                  <FormField label="Crédito IA mensal">
                    <FormInput value={creditoIa} onChangeText={setCreditoIa} keyboardType="number-pad" />
                  </FormField>
                </View>
                <View style={styles.col}>
                  <FormField label="Limite empresas (Enterprise)">
                    <FormInput
                      value={limiteEmpresasEnterprise}
                      onChangeText={setLimiteEmpresasEnterprise}
                      keyboardType="number-pad"
                    />
                  </FormField>
                </View>
              </View>

              <View style={styles.row2}>
                <View style={styles.col}>
                  <FormField label="Preço usuário adicional (R$)">
                    <FormInput
                      value={precoUsuarioAdicional}
                      onChangeText={setPrecoUsuarioAdicional}
                      keyboardType="decimal-pad"
                    />
                  </FormField>
                </View>
                <View style={styles.col}>
                  <FormField
                    label="Preço empresa adicional (R$)"
                    helper={temUpgrades ? undefined : 'Ative upgrades para criar o preço no Stripe'}>
                    <FormInput
                      value={precoEmpresaAdicional}
                      onChangeText={setPrecoEmpresaAdicional}
                      keyboardType="decimal-pad"
                    />
                  </FormField>
                </View>
              </View>

              <View style={{ gap: 4 }}>
                <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 4 }}>Opções do plano</Text>
                {PLANO_OPCOES_CADASTRO.map((opcao) => {
                  const checked =
                    opcao.flag === 'tem_upgrades'
                      ? temUpgrades
                      : opcao.flag === 'is_enterprise'
                        ? isEnterprise
                        : opcao.flag === 'exibir_para_clientes'
                          ? exibirParaClientes
                          : requerClienteLogado;

                  const onCheckedChange = (v: boolean) => {
                    if (opcao.flag === 'tem_upgrades') setTemUpgrades(v);
                    else if (opcao.flag === 'is_enterprise') setIsEnterprise(v);
                    else if (opcao.flag === 'exibir_para_clientes') setExibirParaClientes(v);
                    else setRequerClienteLogado(v);
                  };

                  return (
                    <View key={opcao.flag}>
                      <FormCheckbox label={opcao.label} checked={checked} onCheckedChange={onCheckedChange} />
                      {opcao.helper ? (
                        <Text style={{ color: theme.textMuted, fontSize: 12, marginLeft: 34, marginTop: -2 }}>
                          {opcao.helper}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>

              {formErro ? <Text style={{ color: theme.error }}>{formErro}</Text> : null}
              {criarMutation.isError ? (
                <Text style={{ color: theme.error }}>{(criarMutation.error as Error).message}</Text>
              ) : null}

              <PrimaryButton
                label="Criar plano (banco + Stripe)"
                loading={criarMutation.isPending}
                onPress={() => {
                  setFormErro(null);
                  criarMutation.mutate();
                }}
              />
            </ScreenCard>
          ) : (
            <Text style={{ color: theme.textMuted }}>Seu perfil só pode visualizar os planos.</Text>
          )}

          <SectionTitle>Planos cadastrados ({planos.length})</SectionTitle>
        </View>
      }
      ListEmptyComponent={
        planosQuery.isLoading ? (
          <Text style={{ color: theme.textMuted }}>Carregando…</Text>
        ) : planosQuery.error ? (
          <Text style={{ color: theme.error }}>{(planosQuery.error as Error).message}</Text>
        ) : (
          <Text style={{ color: theme.textMuted }}>Nenhum plano cadastrado.</Text>
        )
      }
      renderItem={({ item }) => {
        const centavos = precoMensalCentavosDoPlano(item);
        const exibir = planoExibirParaClientes(item);
        const planoId = Number(item.id);
        const alternandoFlag = opcoesMutation.isPending ? opcoesMutation.variables?.flag : null;
        const alternandoPlanoId = opcoesMutation.isPending ? opcoesMutation.variables?.planoId : null;

        return (
          <ScreenCard style={{ marginBottom: 12, gap: 6 }}>
            <View style={styles.planoHeader}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: theme.headerText, flex: 1 }}>
                {item.nome ?? item.id}
              </Text>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: exibir ? `${theme.cadastroAction}22` : `${theme.textMuted}22` },
                ]}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: exibir ? theme.cadastroAction : theme.textMuted }}>
                  {exibir ? 'Visível' : 'Oculto'}
                </Text>
              </View>
            </View>

            {item.descricao ? <Text style={{ color: theme.textMuted }}>{item.descricao}</Text> : null}

            <Text style={{ color: theme.textMuted }}>
              Preço mensal: {centavos != null ? formatBRLFromCentavos(centavos) : '—'}
              {planoIsEnterprise(item) ? ' · Enterprise' : ''}
            </Text>
            <Text style={{ color: theme.textMuted }}>Stripe price: {stripePriceIdDoPlano(item) ?? '—'}</Text>
            <Text style={{ color: theme.textMuted }}>
              Usuários {item.usuarios_inclusos ?? '—'} · Empresas {item.empresas_incluidas ?? '—'} · GB{' '}
              {item.armazenamento_gb ?? '—'} · IA {item.credito_ia_mensal ?? 0}
            </Text>

            {canManageBilling ? (
              <View style={{ gap: 2, marginTop: 6 }}>
                <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 2 }}>Opções do plano</Text>
                {PLANO_OPCOES_CADASTRO.map((opcao) => {
                  const checked = planoFlagValue(item, opcao.flag);
                  const alternando = alternandoPlanoId === planoId && alternandoFlag === opcao.flag;

                  return (
                    <FormCheckbox
                      key={opcao.flag}
                      label={opcao.label}
                      checked={checked}
                      loading={alternando}
                      onCheckedChange={(v) => {
                        if (!Number.isFinite(planoId)) return;
                        opcoesMutation.mutate({ planoId, flag: opcao.flag, value: v });
                      }}
                    />
                  );
                })}
                {opcoesMutation.isError && alternandoPlanoId === planoId ? (
                  <Text style={{ color: theme.error, fontSize: 12 }}>
                    {(opcoesMutation.error as Error).message}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </ScreenCard>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row2: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  planoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
});
