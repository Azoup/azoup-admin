import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, View } from 'react-native';

import { BackLink } from '@/components/ui/BackLink';
import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { FormSelect } from '@/components/ui/FormSelect';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Text } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import { registrarAuditoria } from '@/src/services/audit';
import { buscarEnderecoPorCep } from '@/src/services/cep-service';
import { buscarDadosCnpj } from '@/src/services/cnpj-service';
import { listarPlanos, obterBillingSettings } from '@/src/services/repos/billing-repo';
import {
  inserirPreCadastro,
  listarPreCadastros,
  rotuloStatusPreCadastro,
} from '@/src/services/repos/pre-cadastro-repo';
import { formatBRLFromReais, formatDateTimeBR, mascaraReaisBR, parseReaisBR } from '@/src/utils/format';
import {
  linkConvitePreCadastro,
  precoConciliacaoDeSettings,
  precoEcommerceDeSettings,
  precoEmpresaDoPlano,
  precoPdvDeSettings,
  quotePreCadastro,
  valorAnualEfetivo,
  valorMensalEfetivo,
} from '@/src/utils/pre-cadastro-quote';

function soDigitos(value: string): string {
  return value.replace(/\D/g, '');
}

function maskCpf(value: string): string {
  const d = soDigitos(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function maskCnpj(value: string): string {
  const d = soDigitos(value).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function maskPhone(value: string): string {
  const d = soDigitos(value).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function maskCep(value: string): string {
  const d = soDigitos(value).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function parseQty(raw: string): number {
  const n = Math.floor(Number(soDigitos(raw) || raw.trim() || '0'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

async function copiarTexto(texto: string): Promise<void> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(texto);
    return;
  }
  throw new Error('Não foi possível copiar automaticamente. Selecione o link e copie manualmente.');
}

export default function PreCadastroAsaasScreen() {
  const { theme } = useTheme();
  const qc = useQueryClient();
  const { adminProfile, canManageBilling } = useAdminAuth();

  const [nomeDono, setNomeDono] = useState('');
  const [cpf, setCpf] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');

  const [cnpj, setCnpj] = useState('');
  const [razaoSocial, setRazaoSocial] = useState('');
  const [nomeFantasia, setNomeFantasia] = useState('');
  const [cepEmpresa, setCepEmpresa] = useState('');
  const [ruaEmpresa, setRuaEmpresa] = useState('');
  const [numeroEmpresa, setNumeroEmpresa] = useState('');
  const [bairroEmpresa, setBairroEmpresa] = useState('');
  const [cidadeEmpresa, setCidadeEmpresa] = useState('');
  const [estadoEmpresa, setEstadoEmpresa] = useState('');
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const ultimoCnpjBuscado = useRef('');
  const ultimoCepBuscado = useRef('');

  const [planoId, setPlanoId] = useState<string | null>(null);
  const [usuariosAdicionais, setUsuariosAdicionais] = useState('0');
  const [empresasAdicionais, setEmpresasAdicionais] = useState('0');
  const [pdvAssentos, setPdvAssentos] = useState('0');
  const [ecommerceLojas, setEcommerceLojas] = useState('0');
  const [conciliacaoContas, setConciliacaoContas] = useState('0');

  const [overrideMensal, setOverrideMensal] = useState('');
  const [overrideAnual, setOverrideAnual] = useState('');
  const [linkGerado, setLinkGerado] = useState<string | null>(null);

  const preencherPorCnpj = useCallback(async (cnpjValue: string) => {
    if (!canManageBilling) return;
    const digits = soDigitos(cnpjValue);
    if (digits.length !== 14) return;
    if (digits === ultimoCnpjBuscado.current) return;

    setBuscandoCnpj(true);
    try {
      const data = await buscarDadosCnpj(digits);
      if (!data) return;
      ultimoCnpjBuscado.current = digits;
      setRazaoSocial(data.razaoSocial);
      setNomeFantasia(data.nomeFantasia || data.razaoSocial);
      if (data.cep) {
        setCepEmpresa(maskCep(data.cep));
        ultimoCepBuscado.current = soDigitos(data.cep);
      }
      if (data.logradouro) setRuaEmpresa(data.logradouro);
      if (data.numero) setNumeroEmpresa(data.numero);
      if (data.bairro) setBairroEmpresa(data.bairro);
      if (data.municipio) setCidadeEmpresa(data.municipio);
      if (data.uf) setEstadoEmpresa(data.uf.slice(0, 2));
      setTelefone((atual) => (soDigitos(atual).length ? atual : data.telefone ? maskPhone(data.telefone) : atual));
      setEmail((atual) => (atual.trim() ? atual : data.email || ''));
    } catch (err) {
      Alert.alert(
        'CNPJ',
        err instanceof Error
          ? err.message
          : 'Não conseguimos buscar os dados deste CNPJ. Preencha manualmente.',
      );
    } finally {
      setBuscandoCnpj(false);
    }
  }, [canManageBilling]);

  const preencherPorCep = useCallback(async (cepValue: string) => {
    if (!canManageBilling) return;
    const digits = soDigitos(cepValue);
    if (digits.length !== 8) return;
    if (digits === ultimoCepBuscado.current) return;

    setBuscandoCep(true);
    try {
      const data = await buscarEnderecoPorCep(digits);
      if (!data) return;
      ultimoCepBuscado.current = digits;
      if (data.rua) setRuaEmpresa(data.rua);
      if (data.bairro) setBairroEmpresa(data.bairro);
      if (data.cidade) setCidadeEmpresa(data.cidade);
      if (data.estado) setEstadoEmpresa(data.estado.slice(0, 2));
    } catch (err) {
      Alert.alert(
        'CEP',
        err instanceof Error ? err.message : 'Não foi possível buscar o CEP. Preencha o endereço manualmente.',
      );
    } finally {
      setBuscandoCep(false);
    }
  }, [canManageBilling]);

  function onChangeCnpj(raw: string) {
    const masked = maskCnpj(raw);
    setCnpj(masked);
    const digits = soDigitos(masked);
    if (digits.length < 14) {
      ultimoCnpjBuscado.current = '';
      return;
    }
    void preencherPorCnpj(digits);
  }

  function onChangeCep(raw: string) {
    const masked = maskCep(raw);
    setCepEmpresa(masked);
    const digits = soDigitos(masked);
    if (digits.length < 8) {
      ultimoCepBuscado.current = '';
      return;
    }
    void preencherPorCep(digits);
  }

  const planosQuery = useQuery({ queryKey: ['planos_assinatura'], queryFn: listarPlanos });
  const settingsQuery = useQuery({ queryKey: ['admin_billing_settings'], queryFn: obterBillingSettings });
  const listaQuery = useQuery({ queryKey: ['admin_pre_cadastros'], queryFn: () => listarPreCadastros(40) });

  const planosAtivos = useMemo(
    () => (planosQuery.data ?? []).filter((p) => p.ativo !== false && !`${p.nome ?? ''}`.toLowerCase().includes('trial')),
    [planosQuery.data],
  );

  const planoOptions = useMemo(() => planosAtivos.map((p) => String(p.id)), [planosAtivos]);
  const planoLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of planosAtivos) {
      const base = Number(p.preco_base) || 0;
      map[String(p.id)] = `${p.nome ?? p.id} · ${formatBRLFromReais(base)}`;
    }
    return map;
  }, [planosAtivos]);

  const planoSelecionado = useMemo(
    () => planosAtivos.find((p) => String(p.id) === planoId) ?? null,
    [planosAtivos, planoId],
  );

  const quote = useMemo(() => {
    if (!planoSelecionado) return null;
    const settings = settingsQuery.data;
    return quotePreCadastro({
      planoNome: planoSelecionado.nome,
      precoBase: Number(planoSelecionado.preco_base) || 0,
      precoUsuario: Number(planoSelecionado.preco_usuario_adicional) || 0,
      precoEmpresa: precoEmpresaDoPlano(planoSelecionado),
      precoPdv: precoPdvDeSettings(settings),
      precoEcommerce: precoEcommerceDeSettings(settings),
      precoConciliacao: precoConciliacaoDeSettings(settings),
      usuariosAdicionais: parseQty(usuariosAdicionais),
      empresasAdicionais: parseQty(empresasAdicionais),
      pdvAssentos: parseQty(pdvAssentos),
      ecommerceLojas: parseQty(ecommerceLojas),
      conciliacaoContas: parseQty(conciliacaoContas),
      descontoAnualPercent: Number(settings?.desconto_plano_anual_percent) || 0,
    });
  }, [
    planoSelecionado,
    settingsQuery.data,
    usuariosAdicionais,
    empresasAdicionais,
    pdvAssentos,
    ecommerceLojas,
    conciliacaoContas,
  ]);

  const mensalOverrideNum = useMemo(() => {
    if (!overrideMensal.trim()) return null;
    return parseReaisBR(overrideMensal);
  }, [overrideMensal]);

  const anualOverrideNum = useMemo(() => {
    if (!overrideAnual.trim()) return null;
    return parseReaisBR(overrideAnual);
  }, [overrideAnual]);

  const mensalEfetivo = quote ? valorMensalEfetivo(quote.totalMensal, mensalOverrideNum) : 0;
  const anualEfetivo = quote ? valorAnualEfetivo(quote.totalAnual, anualOverrideNum) : 0;
  const mensalAnualEfetivo = round2(anualEfetivo / 12);

  const salvarMutation = useMutation({
    mutationFn: async () => {
      if (!canManageBilling) throw new Error('Sem permissão para gerar pré-cadastro.');
      if (!planoSelecionado || !quote) throw new Error('Selecione um plano.');
      if (overrideMensal.trim() && mensalOverrideNum == null) {
        throw new Error('Override mensal inválido. Use formato 1.234,56.');
      }
      if (overrideAnual.trim() && anualOverrideNum == null) {
        throw new Error('Override anual inválido. Use formato 1.234,56.');
      }
      if (quote.bloqueio === 'abaixo_minimo_asaas' && mensalEfetivo > 0 && mensalEfetivo < 5) {
        throw new Error('Valor mensal abaixo do mínimo ASAAS (R$ 5,00). Ajuste o pacote ou o override.');
      }

      const row = await inserirPreCadastro({
        plano_id: Number(planoSelecionado.id),
        usuarios_adicionais: parseQty(usuariosAdicionais),
        empresas_adicionais: parseQty(empresasAdicionais),
        pdv_assentos: parseQty(pdvAssentos),
        ecommerce_lojas: parseQty(ecommerceLojas),
        conciliacao_contas: parseQty(conciliacaoContas),
        valor_mensal_calculado: quote.totalMensal,
        valor_mensal_override: mensalOverrideNum,
        valor_anual_calculado: quote.totalAnual,
        valor_anual_override: anualOverrideNum,
        desconto_anual_percent_usado: quote.descontoAnualPercent,
        nome_dono: nomeDono.trim() || null,
        cpf: soDigitos(cpf) || null,
        email: email.trim(),
        telefone: soDigitos(telefone) || null,
        cnpj: soDigitos(cnpj) || null,
        razao_social: razaoSocial.trim() || null,
        nome_fantasia: nomeFantasia.trim() || null,
        cep_empresa: soDigitos(cepEmpresa) || null,
        rua_empresa: ruaEmpresa.trim() || null,
        numero_empresa: numeroEmpresa.trim() || null,
        bairro_empresa: bairroEmpresa.trim() || null,
        cidade_empresa: cidadeEmpresa.trim() || null,
        estado_empresa: estadoEmpresa.trim().toUpperCase() || null,
        criado_por_admin: adminProfile?.email ?? null,
        status: 'link_gerado',
      });

      await registrarAuditoria(
        { id: adminProfile?.id, email: adminProfile?.email },
        {
          acao: 'PRE_CADASTRO_ASAAS_CRIAR',
          entidade: 'admin_pre_cadastros',
          entidade_id: row.id,
          valores_anteriores: {},
          valores_novos: {
            token: row.token,
            plano_id: row.plano_id,
            email: row.email,
            valor_mensal: valorMensalEfetivo(row.valor_mensal_calculado, row.valor_mensal_override),
          },
        },
      );

      return row;
    },
    onSuccess: (row) => {
      const link = linkConvitePreCadastro(row.token);
      setLinkGerado(link);
      qc.invalidateQueries({ queryKey: ['admin_pre_cadastros'] });
      Alert.alert('Pré-cadastro salvo', 'Link gerado. Envie ao cliente.');
    },
    onError: (err: Error) => {
      Alert.alert('Erro', err.message || 'Não foi possível salvar o pré-cadastro.');
    },
  });

  return (
    <Screen scroll>
      <BackLink href="/billing" label="Cobrança" />
      <PageHeader
        title="Pré-cadastro ASAAS"
        subtitle="Preencha o que já tiver, escolha plano e módulos, ajuste o preço se quiser e gere o link do Confec."
      />

      <ScreenCard style={{ gap: 12 }}>
        <SectionTitle>Titular / primeiro login</SectionTitle>
        <FormField label="Nome do dono">
          <FormInput value={nomeDono} onChangeText={setNomeDono} placeholder="Nome completo" editable={canManageBilling} />
        </FormField>
        <FormField label="CPF">
          <FormInput value={cpf} onChangeText={(v) => setCpf(maskCpf(v))} placeholder="000.000.000-00" keyboardType="number-pad" editable={canManageBilling} />
        </FormField>
        <FormField label="Celular">
          <FormInput value={telefone} onChangeText={(v) => setTelefone(maskPhone(v))} placeholder="(00) 00000-0000" keyboardType="phone-pad" editable={canManageBilling} />
        </FormField>
        <FormField label="E-mail (login)" required>
          <FormInput
            value={email}
            onChangeText={setEmail}
            placeholder="cliente@empresa.com"
            keyboardType="email-address"
            autoCapitalize="none"
            editable={canManageBilling}
          />
        </FormField>
      </ScreenCard>

      <ScreenCard style={{ gap: 12, marginTop: 12 }}>
        <SectionTitle>Empresa</SectionTitle>
        <FormField
          label="CNPJ"
          helper={buscandoCnpj ? 'Buscando dados na Receita…' : 'Ao completar 14 dígitos, preenchemos razão social e endereço.'}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <FormInput
                value={cnpj}
                onChangeText={onChangeCnpj}
                onBlur={() => void preencherPorCnpj(cnpj)}
                placeholder="00.000.000/0000-00"
                keyboardType="number-pad"
                editable={canManageBilling && !buscandoCnpj}
              />
            </View>
            {buscandoCnpj ? <ActivityIndicator color={theme.cadastroAction} /> : null}
          </View>
        </FormField>
        <FormField label="Razão social">
          <FormInput value={razaoSocial} onChangeText={setRazaoSocial} editable={canManageBilling} />
        </FormField>
        <FormField label="Nome fantasia">
          <FormInput value={nomeFantasia} onChangeText={setNomeFantasia} editable={canManageBilling} />
        </FormField>
        <FormField
          label="CEP"
          helper={buscandoCep ? 'Buscando endereço…' : 'Ao completar 8 dígitos, preenchemos logradouro, bairro, cidade e UF.'}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <FormInput
                value={cepEmpresa}
                onChangeText={onChangeCep}
                onBlur={() => void preencherPorCep(cepEmpresa)}
                placeholder="00000-000"
                keyboardType="number-pad"
                editable={canManageBilling && !buscandoCep}
              />
            </View>
            {buscandoCep ? <ActivityIndicator color={theme.cadastroAction} /> : null}
          </View>
        </FormField>
        <FormField label="Logradouro">
          <FormInput value={ruaEmpresa} onChangeText={setRuaEmpresa} editable={canManageBilling} />
        </FormField>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <FormField label="Número">
              <FormInput value={numeroEmpresa} onChangeText={setNumeroEmpresa} editable={canManageBilling} />
            </FormField>
          </View>
          <View style={{ flex: 1 }}>
            <FormField label="UF">
              <FormInput
                value={estadoEmpresa}
                onChangeText={(v) => setEstadoEmpresa(v.toUpperCase().slice(0, 2))}
                placeholder="SP"
                autoCapitalize="characters"
                editable={canManageBilling}
              />
            </FormField>
          </View>
        </View>
        <FormField label="Bairro">
          <FormInput value={bairroEmpresa} onChangeText={setBairroEmpresa} editable={canManageBilling} />
        </FormField>
        <FormField label="Cidade">
          <FormInput value={cidadeEmpresa} onChangeText={setCidadeEmpresa} editable={canManageBilling} />
        </FormField>
      </ScreenCard>

      <ScreenCard style={{ gap: 12, marginTop: 12 }}>
        <SectionTitle>Pacote Confec</SectionTitle>
        <FormField label="Plano" required>
          <FormSelect
            options={planoOptions}
            value={planoId}
            onChange={setPlanoId}
            labels={planoLabels}
            placeholder={planosQuery.isLoading ? 'Carregando planos…' : 'Selecione o plano'}
            disabled={!canManageBilling || planosQuery.isLoading}
          />
        </FormField>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <View style={{ minWidth: 140, flex: 1 }}>
            <FormField label="Usuários adicionais">
              <FormInput value={usuariosAdicionais} onChangeText={setUsuariosAdicionais} keyboardType="number-pad" editable={canManageBilling} />
            </FormField>
          </View>
          <View style={{ minWidth: 140, flex: 1 }}>
            <FormField label="Empresas adicionais">
              <FormInput value={empresasAdicionais} onChangeText={setEmpresasAdicionais} keyboardType="number-pad" editable={canManageBilling} />
            </FormField>
          </View>
          <View style={{ minWidth: 140, flex: 1 }}>
            <FormField label="Assentos PDV">
              <FormInput value={pdvAssentos} onChangeText={setPdvAssentos} keyboardType="number-pad" editable={canManageBilling} />
            </FormField>
          </View>
          <View style={{ minWidth: 140, flex: 1 }}>
            <FormField label="Lojas e-commerce">
              <FormInput value={ecommerceLojas} onChangeText={setEcommerceLojas} keyboardType="number-pad" editable={canManageBilling} />
            </FormField>
          </View>
          <View style={{ minWidth: 140, flex: 1 }}>
            <FormField label="Contas conciliação">
              <FormInput value={conciliacaoContas} onChangeText={setConciliacaoContas} keyboardType="number-pad" editable={canManageBilling} />
            </FormField>
          </View>
        </View>
      </ScreenCard>

      <ScreenCard style={{ gap: 12, marginTop: 12 }}>
        <SectionTitle>Valores</SectionTitle>
        {!quote ? (
          <Text style={{ color: theme.textMuted }}>Selecione um plano para ver a cotação.</Text>
        ) : (
          <>
            {quote.linhas.map((linha) => (
              <Text key={linha.codigo} style={{ color: theme.textMuted }}>
                {linha.quantidade}× {linha.rotulo} · {formatBRLFromReais(linha.unitario)} = {formatBRLFromReais(linha.total)}
              </Text>
            ))}
            <Text style={{ fontWeight: '700', color: theme.headerText, marginTop: 4 }}>
              Mensal calculado: {formatBRLFromReais(quote.totalMensal)}
            </Text>
            <FormField label="Override mensal (opcional)">
              <FormInput
                value={overrideMensal}
                onChangeText={(v) => setOverrideMensal(mascaraReaisBR(v))}
                placeholder={formatBRLFromReais(quote.totalMensal).replace('R$\u00a0', '').replace('R$ ', '')}
                keyboardType="decimal-pad"
                editable={canManageBilling}
              />
            </FormField>
            <Text style={{ color: theme.textMuted }}>
              Mensal efetivo: {formatBRLFromReais(mensalEfetivo)}
              {quote.descontoAnualPercent > 0
                ? ` · Anual (${quote.descontoAnualPercent}%): ${formatBRLFromReais(quote.mensalComDescontoAnual)}/mês · ano ${formatBRLFromReais(quote.totalAnual)}`
                : ` · Anual (sem desconto): ${formatBRLFromReais(quote.totalAnual)}`}
            </Text>
            <FormField label="Override anual total (opcional)">
              <FormInput
                value={overrideAnual}
                onChangeText={(v) => setOverrideAnual(mascaraReaisBR(v))}
                placeholder={formatBRLFromReais(quote.totalAnual).replace('R$\u00a0', '').replace('R$ ', '')}
                keyboardType="decimal-pad"
                editable={canManageBilling}
              />
            </FormField>
            <Text style={{ fontWeight: '700', color: theme.headerText }}>
              Anual efetivo: {formatBRLFromReais(anualEfetivo)} ({formatBRLFromReais(mensalAnualEfetivo)}/mês)
            </Text>
            {quote.bloqueio ? (
              <Text style={{ color: theme.error }}>Aviso: abaixo do mínimo ASAAS (R$ 5,00).</Text>
            ) : null}
          </>
        )}

        <PrimaryButton
          label={salvarMutation.isPending ? 'Salvando…' : 'Salvar e gerar link'}
          loading={salvarMutation.isPending}
          onPress={() => salvarMutation.mutate()}
          disabled={!canManageBilling || !planoId}
        />
        {!canManageBilling ? (
          <Text style={{ color: theme.textMuted }}>Somente owner/manager com tela Cobrança pode gerar link.</Text>
        ) : null}

        {linkGerado ? (
          <View style={{ gap: 8, marginTop: 8 }}>
            <Text style={{ fontWeight: '700', color: theme.headerText }}>Link do cliente</Text>
            <Text selectable style={{ color: theme.cadastroAction }}>
              {linkGerado}
            </Text>
            <Pressable
              onPress={async () => {
                try {
                  await copiarTexto(linkGerado);
                  Alert.alert('Copiado', 'Link copiado para a área de transferência.');
                } catch (e) {
                  Alert.alert('Copiar', e instanceof Error ? e.message : 'Falha ao copiar.');
                }
              }}>
              <Text style={{ color: theme.cadastroAction, fontWeight: '700' }}>Copiar link</Text>
            </Pressable>
            <Text style={{ color: theme.textMuted, fontSize: 13 }}>
              Após pagar, login = e-mail acima · senha inicial 12345678 (Confec deve exigir troca).
            </Text>
          </View>
        ) : null}
      </ScreenCard>

      <ScreenCard style={{ gap: 10, marginTop: 12 }}>
        <SectionTitle>Últimos pré-cadastros</SectionTitle>
        {listaQuery.isLoading ? <Text style={{ color: theme.textMuted }}>Carregando…</Text> : null}
        {listaQuery.error ? (
          <Text style={{ color: theme.error }}>
            {(listaQuery.error as Error).message || 'Falha ao listar. Rode a migration admin_pre_cadastros no Supabase.'}
          </Text>
        ) : null}
        {(listaQuery.data ?? []).map((item) => {
          const link = linkConvitePreCadastro(item.token);
          const mensal = valorMensalEfetivo(Number(item.valor_mensal_calculado), item.valor_mensal_override);
          return (
            <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10, gap: 4 }}>
              <Text style={{ fontWeight: '700', color: theme.headerText }}>
                {item.nome_dono || item.email} · {rotuloStatusPreCadastro(item.status)}
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                {item.email} · mensal {formatBRLFromReais(mensal)} · {formatDateTimeBR(item.criado_em)}
              </Text>
              <Pressable
                onPress={async () => {
                  try {
                    await copiarTexto(link);
                    Alert.alert('Copiado', 'Link copiado.');
                  } catch {
                    setLinkGerado(link);
                  }
                }}>
                <Text style={{ color: theme.cadastroAction, fontSize: 13 }}>{link}</Text>
              </Pressable>
            </View>
          );
        })}
        {!listaQuery.isLoading && !(listaQuery.data ?? []).length ? (
          <Text style={{ color: theme.textMuted }}>Nenhum pré-cadastro ainda.</Text>
        ) : null}
      </ScreenCard>
    </Screen>
  );
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
