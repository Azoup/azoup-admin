import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, StyleSheet, Switch, View } from 'react-native';

import { FormCheckbox } from '@/components/ui/FormCheckbox';
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
import { atualizarExibicaoPlano, listarPlanos } from '@/src/services/repos/billing-repo';
import { criarPlanoStripe } from '@/src/services/stripe-admin-api';
import { formatBRLFromCentavos } from '@/src/utils/format';
import {
  planoExibirParaClientes,
  precoMensalCentavosDoPlano,
  stripePriceIdDoPlano,
} from '@/src/utils/plano-stripe';

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
      void qc.invalidateQueries({ queryKey: ['planos_assinatura'] });
    },
    onError: (e) => setFormErro(e instanceof Error ? e.message : 'Erro ao criar plano'),
  });

  const exibicaoMutation = useMutation({
    mutationFn: async ({ planoId, exibir }: { planoId: number; exibir: boolean }) => {
      if (!canManageBilling) throw new Error('Sem permissão para alterar planos.');
      return atualizarExibicaoPlano(planoId, exibir);
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

              <View style={styles.switchRow}>
                <Text style={{ flex: 1, color: theme.text }}>Permite upgrades (add-ons)</Text>
                <Switch value={temUpgrades} onValueChange={setTemUpgrades} trackColor={{ true: theme.cadastroAction }} />
              </View>

              <View style={styles.switchRow}>
                <Text style={{ flex: 1, color: theme.text }}>Plano Enterprise (sem Stripe)</Text>
                <Switch value={isEnterprise} onValueChange={setIsEnterprise} trackColor={{ true: theme.cadastroAction }} />
              </View>

              <FormCheckbox
                label="Exibir para clientes no app"
                checked={exibirParaClientes}
                onCheckedChange={setExibirParaClientes}
              />

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
        const alternando =
          exibicaoMutation.isPending && exibicaoMutation.variables?.planoId === planoId;

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
              {item.is_enterprise ? ' · Enterprise' : ''}
            </Text>
            <Text style={{ color: theme.textMuted }}>Stripe price: {stripePriceIdDoPlano(item) ?? '—'}</Text>
            <Text style={{ color: theme.textMuted }}>
              Usuários {item.usuarios_inclusos ?? '—'} · Empresas {item.empresas_incluidas ?? '—'} · GB{' '}
              {item.armazenamento_gb ?? '—'} · IA {item.credito_ia_mensal ?? 0}
            </Text>

            {canManageBilling ? (
              <FormCheckbox
                label="Exibir para clientes"
                checked={exibir}
                loading={alternando}
                onCheckedChange={(v) => {
                  if (!Number.isFinite(planoId)) return;
                  exibicaoMutation.mutate({ planoId, exibir: v });
                }}
                style={{ marginTop: 4 }}
              />
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
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 36 },
  planoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
});
