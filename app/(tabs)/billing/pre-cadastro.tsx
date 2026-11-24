import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { BackLink } from '@/components/ui/BackLink';
import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { FormSelect } from '@/components/ui/FormSelect';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
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
import type { AdminPreCadastroRow, PlanoAssinaturaRow } from '@/src/types/azoup';
import type { AppTheme } from '@/src/theme/colors';
import { formatBRLFromReais, formatDateTimeBR, mascaraReaisBR, parseReaisBR } from '@/src/utils/format';
import { useResponsiveLayout } from '@/src/utils/responsiveLayout';
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

function clampQty(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function maskCnpjDisplay(value: string | null | undefined): string {
  const d = soDigitos(value ?? '');
  if (d.length !== 14) return value?.trim() || '—';
  return maskCnpj(d);
}

function corStatus(status: string | null | undefined, theme: AppTheme): { bg: string; fg: string } {
  switch (`${status ?? ''}`.trim()) {
    case 'pago':
      return { bg: `${theme.success}22`, fg: theme.success };
    case 'aguardando_pagamento':
    case 'preenchendo':
      return { bg: `${theme.warning}22`, fg: theme.warning };
    case 'cancelado':
    case 'expirado':
      return { bg: `${theme.error}22`, fg: theme.error };
    case 'link_gerado':
      return { bg: `${theme.cadastroAction}18`, fg: theme.cadastroAction };
    default:
      return { bg: theme.surfaceMuted, fg: theme.textMuted };
  }
}

async function copiarTexto(texto: string): Promise<void> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(texto);
    return;
  }
  throw new Error('Não foi possível copiar automaticamente. Selecione o link e copie manualmente.');
}

function QtyStepper({
  value,
  onChange,
  disabled,
  min = 0,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  min?: number;
}) {
  const { theme } = useTheme();
  const atual = clampQty(value);
  const podeMenos = !disabled && atual > min;
  const podeMais = !disabled;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Diminuir"
        disabled={!podeMenos}
        onPress={() => onChange(clampQty(atual - 1))}
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.surfaceMuted,
          borderWidth: 1,
          borderColor: theme.borderInput,
          opacity: podeMenos ? 1 : 0.4,
        }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: theme.headerText, lineHeight: 22 }}>−</Text>
      </Pressable>
      <Text style={{ minWidth: 28, textAlign: 'center', fontSize: 17, fontWeight: '800', color: theme.headerText }}>
        {atual}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Aumentar"
        disabled={!podeMais}
        onPress={() => onChange(clampQty(atual + 1))}
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.cadastroAction,
          opacity: podeMais ? 1 : 0.4,
        }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: theme.cadastroActionText, lineHeight: 22 }}>+</Text>
      </Pressable>
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  const { theme } = useTheme();
  return (
    <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.6, color: theme.textMuted, textTransform: 'uppercase' }}>
      {children}
    </Text>
  );
}

export default function PreCadastroAsaasScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  const { horizontalPadding, contentMaxWidth } = useResponsiveLayout();
  const qc = useQueryClient();
  const { adminProfile, canManageBilling } = useAdminAuth();

  const [modalAberto, setModalAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [linkGerado, setLinkGerado] = useState<string | null>(null);

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
  const [usuariosAdicionais, setUsuariosAdicionais] = useState(0);
  const [empresasAdicionais, setEmpresasAdicionais] = useState(0);
  const [pdvAssentos, setPdvAssentos] = useState(0);
  const [ecommerceLojas, setEcommerceLojas] = useState(0);
  const [conciliacaoContas, setConciliacaoContas] = useState(0);
  const [overrideMensal, setOverrideMensal] = useState('');
  const [overrideAnual, setOverrideAnual] = useState('');

  const planosQuery = useQuery({ queryKey: ['planos_assinatura'], queryFn: listarPlanos });
  const settingsQuery = useQuery({ queryKey: ['admin_billing_settings'], queryFn: obterBillingSettings });
  const listaQuery = useQuery({ queryKey: ['admin_pre_cadastros'], queryFn: () => listarPreCadastros(80) });

  const limparForm = useCallback(() => {
    setNomeDono('');
    setCpf('');
    setTelefone('');
    setEmail('');
    setCnpj('');
    setRazaoSocial('');
    setNomeFantasia('');
    setCepEmpresa('');
    setRuaEmpresa('');
    setNumeroEmpresa('');
    setBairroEmpresa('');
    setCidadeEmpresa('');
    setEstadoEmpresa('');
    setPlanoId(null);
    setUsuariosAdicionais(0);
    setEmpresasAdicionais(0);
    setPdvAssentos(0);
    setEcommerceLojas(0);
    setConciliacaoContas(0);
    setOverrideMensal('');
    setOverrideAnual('');
    setLinkGerado(null);
    ultimoCnpjBuscado.current = '';
    ultimoCepBuscado.current = '';
  }, []);

  useEffect(() => {
    if (!modalAberto) return;
    limparForm();
  }, [modalAberto, limparForm]);

  const preencherPorCep = useCallback(
    async (cepValue: string, opts?: { forcar?: boolean; soSeFaltarRua?: boolean }) => {
      if (!canManageBilling) return;
      const digits = soDigitos(cepValue);
      if (digits.length !== 8) return;
      if (!opts?.forcar && digits === ultimoCepBuscado.current) return;

      setBuscandoCep(true);
      try {
        const data = await buscarEnderecoPorCep(digits);
        if (!data) return;
        ultimoCepBuscado.current = digits;
        if (data.rua) {
          if (opts?.soSeFaltarRua) {
            setRuaEmpresa((atual) => (atual.trim() ? atual : data.rua));
          } else {
            setRuaEmpresa(data.rua);
          }
        }
        if (data.bairro) {
          if (opts?.soSeFaltarRua) {
            setBairroEmpresa((atual) => (atual.trim() ? atual : data.bairro));
          } else {
            setBairroEmpresa(data.bairro);
          }
        }
        if (data.cidade) {
          if (opts?.soSeFaltarRua) {
            setCidadeEmpresa((atual) => (atual.trim() ? atual : data.cidade));
          } else {
            setCidadeEmpresa(data.cidade);
          }
        }
        if (data.estado) {
          if (opts?.soSeFaltarRua) {
            setEstadoEmpresa((atual) => (atual.trim() ? atual : data.estado.slice(0, 2)));
          } else {
            setEstadoEmpresa(data.estado.slice(0, 2));
          }
        }
      } catch (err) {
        if (opts?.soSeFaltarRua) return;
        Alert.alert(
          'CEP',
          err instanceof Error ? err.message : 'Não foi possível buscar o CEP. Preencha o endereço manualmente.',
        );
      } finally {
        setBuscandoCep(false);
      }
    },
    [canManageBilling],
  );

  const preencherPorCnpj = useCallback(
    async (cnpjValue: string) => {
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
        if (data.cep) setCepEmpresa(maskCep(data.cep));
        if (data.logradouro) setRuaEmpresa(data.logradouro);
        if (data.numero) setNumeroEmpresa(data.numero);
        if (data.bairro) setBairroEmpresa(data.bairro);
        if (data.municipio) setCidadeEmpresa(data.municipio);
        if (data.uf) setEstadoEmpresa(data.uf.slice(0, 2));
        setTelefone((atual) => (soDigitos(atual).length ? atual : data.telefone ? maskPhone(data.telefone) : atual));
        setEmail((atual) => (atual.trim() ? atual : data.email || ''));

        // Se a Receita não trouxe a rua, completa pelo CEP (ViaCEP).
        const cepDigits = soDigitos(data.cep);
        if (cepDigits.length === 8 && !`${data.logradouro ?? ''}`.trim()) {
          ultimoCepBuscado.current = '';
          await preencherPorCep(cepDigits, { forcar: true, soSeFaltarRua: true });
        } else if (cepDigits.length === 8) {
          ultimoCepBuscado.current = cepDigits;
        }
      } catch (err) {
        Alert.alert(
          'CNPJ',
          err instanceof Error ? err.message : 'Não conseguimos buscar os dados deste CNPJ. Preencha manualmente.',
        );
      } finally {
        setBuscandoCnpj(false);
      }
    },
    [canManageBilling, preencherPorCep],
  );

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

  const planosPorId = useMemo(() => {
    const map = new Map<number, PlanoAssinaturaRow>();
    for (const p of planosQuery.data ?? []) {
      map.set(Number(p.id), p);
    }
    return map;
  }, [planosQuery.data]);

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
      usuariosAdicionais: clampQty(usuariosAdicionais),
      empresasAdicionais: clampQty(empresasAdicionais),
      pdvAssentos: clampQty(pdvAssentos),
      ecommerceLojas: clampQty(ecommerceLojas),
      conciliacaoContas: clampQty(conciliacaoContas),
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

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const itens = listaQuery.data ?? [];
    if (!q) return itens;
    const qDigits = soDigitos(q);
    return itens.filter((item) => {
      const blob = `${item.nome_dono ?? ''} ${item.email ?? ''} ${item.razao_social ?? ''} ${item.nome_fantasia ?? ''} ${item.cnpj ?? ''} ${item.status ?? ''}`.toLowerCase();
      if (blob.includes(q)) return true;
      if (qDigits.length >= 3 && soDigitos(`${item.cnpj ?? ''}${item.telefone ?? ''}${item.cpf ?? ''}`).includes(qDigits)) {
        return true;
      }
      return false;
    });
  }, [busca, listaQuery.data]);

  const resumoLista = useMemo(() => {
    const itens = listaQuery.data ?? [];
    let linkGeradoCount = 0;
    let pagos = 0;
    let pendentes = 0;
    for (const item of itens) {
      if (item.status === 'pago') pagos += 1;
      else if (item.status === 'link_gerado') linkGeradoCount += 1;
      else if (item.status === 'aguardando_pagamento' || item.status === 'preenchendo') pendentes += 1;
    }
    return { total: itens.length, linkGeradoCount, pagos, pendentes };
  }, [listaQuery.data]);

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
        usuarios_adicionais: clampQty(usuariosAdicionais),
        empresas_adicionais: clampQty(empresasAdicionais),
        pdv_assentos: clampQty(pdvAssentos),
        ecommerce_lojas: clampQty(ecommerceLojas),
        conciliacao_contas: clampQty(conciliacaoContas),
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
      Alert.alert('Pré-cadastro salvo', 'Link gerado. Copie e envie ao cliente.');
    },
    onError: (err: Error) => {
      Alert.alert('Erro', err.message || 'Não foi possível salvar o pré-cadastro.');
    },
  });

  async function copiarLink(link: string) {
    try {
      await copiarTexto(link);
      Alert.alert('Copiado', 'Link copiado para a área de transferência.');
    } catch (e) {
      Alert.alert('Copiar', e instanceof Error ? e.message : 'Falha ao copiar.');
    }
  }

  function renderCard({ item }: { item: AdminPreCadastroRow }) {
    const link = linkConvitePreCadastro(item.token);
    const mensal = valorMensalEfetivo(Number(item.valor_mensal_calculado), item.valor_mensal_override);
    const status = corStatus(item.status, theme);
    const planoNome = planosPorId.get(Number(item.plano_id))?.nome ?? `Plano #${item.plano_id}`;
    const titulo = item.razao_social || item.nome_fantasia || item.nome_dono || item.email;

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {titulo}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {item.email}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: status.bg }]}>
            <Text style={[styles.badgeText, { color: status.fg }]}>{rotuloStatusPreCadastro(item.status)}</Text>
          </View>
        </View>

        <View style={styles.cardGrid}>
          <View style={styles.cardStat}>
            <Text style={styles.statLabel}>Plano</Text>
            <Text style={styles.statValue} numberOfLines={1}>
              {planoNome}
            </Text>
          </View>
          <View style={styles.cardStat}>
            <Text style={styles.statLabel}>Mensal</Text>
            <Text style={styles.statValue}>{formatBRLFromReais(mensal)}</Text>
          </View>
          <View style={styles.cardStat}>
            <Text style={styles.statLabel}>CNPJ</Text>
            <Text style={styles.statValue}>{maskCnpjDisplay(item.cnpj)}</Text>
          </View>
          <View style={styles.cardStat}>
            <Text style={styles.statLabel}>Criado</Text>
            <Text style={styles.statValue}>{formatDateTimeBR(item.criado_em)}</Text>
          </View>
        </View>

        {(item.usuarios_adicionais > 0 ||
          item.empresas_adicionais > 0 ||
          item.pdv_assentos > 0 ||
          item.ecommerce_lojas > 0 ||
          item.conciliacao_contas > 0) && (
          <Text style={styles.cardExtras}>
            {[
              item.usuarios_adicionais > 0 ? `+${item.usuarios_adicionais} usuário(s)` : null,
              item.empresas_adicionais > 0 ? `+${item.empresas_adicionais} empresa(s)` : null,
              item.pdv_assentos > 0 ? `${item.pdv_assentos} PDV` : null,
              item.ecommerce_lojas > 0 ? `${item.ecommerce_lojas} e-com` : null,
              item.conciliacao_contas > 0 ? `${item.conciliacao_contas} conciliação` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        )}

        <View style={styles.cardActions}>
          <Pressable
            onPress={() => void copiarLink(link)}
            style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.85 : 1 }]}>
            <FontAwesome name="copy" size={13} color={theme.cadastroAction} />
            <Text style={styles.actionBtnText}>Copiar link</Text>
          </Pressable>
          {Platform.OS === 'web' ? (
            <Pressable
              onPress={() => {
                if (typeof window !== 'undefined') window.open(link, '_blank', 'noopener,noreferrer');
              }}
              style={({ pressed }) => [styles.actionBtnGhost, { opacity: pressed ? 0.85 : 1 }]}>
              <FontAwesome name="external-link" size={13} color={theme.textMuted} />
              <Text style={[styles.actionBtnText, { color: theme.textMuted }]}>Abrir</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <FlatList
        data={filtrados}
        keyExtractor={(item) => item.id}
        renderItem={renderCard}
        refreshControl={
          <RefreshControl
            refreshing={listaQuery.isFetching && !listaQuery.isLoading}
            onRefresh={() => listaQuery.refetch()}
            tintColor={theme.cadastroAction}
          />
        }
        contentContainerStyle={{
          paddingHorizontal: horizontalPadding,
          paddingBottom: 40,
          maxWidth: contentMaxWidth,
          width: '100%',
          alignSelf: 'center',
          gap: 12,
        }}
        ListHeaderComponent={
          <View style={{ gap: 14, paddingTop: 8 }}>
            <BackLink href="/billing" label="Cobrança" />
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <PageHeader
                  title="Pré-cadastro ASAAS"
                  subtitle="Consulte convites gerados e crie novos links para o Confec."
                />
              </View>
              {canManageBilling ? (
                <Pressable
                  onPress={() => setModalAberto(true)}
                  style={({ pressed }) => [styles.novoBtn, { opacity: pressed ? 0.9 : 1 }]}>
                  <FontAwesome name="plus" size={14} color={theme.cadastroActionText} />
                  <Text style={styles.novoBtnText}>Novo</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.metricsRow}>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{resumoLista.total}</Text>
                <Text style={styles.metricLabel}>Total</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{resumoLista.linkGeradoCount}</Text>
                <Text style={styles.metricLabel}>Link gerado</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{resumoLista.pendentes}</Text>
                <Text style={styles.metricLabel}>Em andamento</Text>
              </View>
              <View style={styles.metric}>
                <Text style={[styles.metricValue, { color: theme.success }]}>{resumoLista.pagos}</Text>
                <Text style={styles.metricLabel}>Pagos</Text>
              </View>
            </View>

            <FormInput
              value={busca}
              onChangeText={setBusca}
              placeholder="Buscar por nome, e-mail, CNPJ ou status…"
              autoCapitalize="none"
            />
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            {listaQuery.isLoading ? (
              <ActivityIndicator color={theme.cadastroAction} />
            ) : listaQuery.error ? (
              <Text style={{ color: theme.error, textAlign: 'center' }}>
                {(listaQuery.error as Error).message ||
                  'Falha ao listar. Rode a migration admin_pre_cadastros no Supabase.'}
              </Text>
            ) : (
              <>
                <FontAwesome name="inbox" size={28} color={theme.textMuted} />
                <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 16, marginTop: 8 }}>
                  Nenhum pré-cadastro
                </Text>
                <Text style={{ color: theme.textMuted, textAlign: 'center', lineHeight: 20 }}>
                  {busca.trim()
                    ? 'Nenhum resultado para essa busca.'
                    : 'Crie o primeiro convite pelo botão Novo.'}
                </Text>
              </>
            )}
          </View>
        }
      />

      <Modal visible={modalAberto} animationType="fade" transparent onRequestClose={() => setModalAberto(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 18 }}>Novo pré-cadastro</Text>
                <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                  Preencha o que já tiver. O cliente completa o resto no link.
                </Text>
              </View>
              <Pressable
                hitSlop={10}
                onPress={() => setModalAberto(false)}
                style={styles.closeBtn}
                accessibilityLabel="Fechar">
                <FontAwesome name="times" size={16} color={theme.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              style={{ flexGrow: 0, maxHeight: Platform.OS === 'web' ? 640 : 520 }}
              contentContainerStyle={{ gap: 16, paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled">
              <View style={styles.modalBlock}>
                <SectionLabel>Titular / login</SectionLabel>
                <FormField label="Nome do dono">
                  <FormInput value={nomeDono} onChangeText={setNomeDono} placeholder="Nome completo" />
                </FormField>
                <FormField label="CPF">
                  <FormInput
                    value={cpf}
                    onChangeText={(v) => setCpf(maskCpf(v))}
                    placeholder="000.000.000-00"
                    keyboardType="number-pad"
                  />
                </FormField>
                <FormField label="Celular">
                  <FormInput
                    value={telefone}
                    onChangeText={(v) => setTelefone(maskPhone(v))}
                    placeholder="(00) 00000-0000"
                    keyboardType="phone-pad"
                  />
                </FormField>
                <FormField label="E-mail (login)" required>
                  <FormInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="cliente@empresa.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </FormField>
              </View>

              <View style={styles.modalBlock}>
                <SectionLabel>Empresa</SectionLabel>
                <FormField
                  label="CNPJ"
                  helper={buscandoCnpj ? 'Buscando dados na Receita…' : 'Ao completar, preenche razão social e endereço.'}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <FormInput
                        value={cnpj}
                        onChangeText={onChangeCnpj}
                        onBlur={() => void preencherPorCnpj(cnpj)}
                        placeholder="00.000.000/0000-00"
                        keyboardType="number-pad"
                        editable={!buscandoCnpj}
                      />
                    </View>
                    {buscandoCnpj ? <ActivityIndicator color={theme.cadastroAction} /> : null}
                  </View>
                </FormField>
                <FormField label="Razão social">
                  <FormInput value={razaoSocial} onChangeText={setRazaoSocial} />
                </FormField>
                <FormField label="Nome fantasia">
                  <FormInput value={nomeFantasia} onChangeText={setNomeFantasia} />
                </FormField>
                <FormField
                  label="CEP"
                  helper={buscandoCep ? 'Buscando endereço…' : 'Completa logradouro, bairro, cidade e UF.'}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <FormInput
                        value={cepEmpresa}
                        onChangeText={onChangeCep}
                        onBlur={() => void preencherPorCep(cepEmpresa)}
                        placeholder="00000-000"
                        keyboardType="number-pad"
                        editable={!buscandoCep}
                      />
                    </View>
                    {buscandoCep ? <ActivityIndicator color={theme.cadastroAction} /> : null}
                  </View>
                </FormField>
                <FormField label="Logradouro">
                  <FormInput value={ruaEmpresa} onChangeText={setRuaEmpresa} />
                </FormField>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <FormField label="Número">
                      <FormInput value={numeroEmpresa} onChangeText={setNumeroEmpresa} />
                    </FormField>
                  </View>
                  <View style={{ flex: 1 }}>
                    <FormField label="UF">
                      <FormInput
                        value={estadoEmpresa}
                        onChangeText={(v) => setEstadoEmpresa(v.toUpperCase().slice(0, 2))}
                        placeholder="SP"
                        autoCapitalize="characters"
                      />
                    </FormField>
                  </View>
                </View>
                <FormField label="Bairro">
                  <FormInput value={bairroEmpresa} onChangeText={setBairroEmpresa} />
                </FormField>
                <FormField label="Cidade">
                  <FormInput value={cidadeEmpresa} onChangeText={setCidadeEmpresa} />
                </FormField>
              </View>

              <View style={styles.modalBlock}>
                <SectionLabel>Pacote Confec</SectionLabel>
                <FormField label="Plano" required>
                  <FormSelect
                    options={planoOptions}
                    value={planoId}
                    onChange={setPlanoId}
                    labels={planoLabels}
                    placeholder={planosQuery.isLoading ? 'Carregando planos…' : 'Selecione o plano'}
                    disabled={planosQuery.isLoading}
                  />
                </FormField>

                {planoSelecionado ? (
                  <View style={[styles.inclusoBox, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
                    <Text style={{ fontWeight: '800', color: theme.headerText }}>Incluso no plano</Text>
                    <Text style={{ color: theme.textMuted }}>
                      {Number(planoSelecionado.usuarios_inclusos) || 0}{' '}
                      {(Number(planoSelecionado.usuarios_inclusos) || 0) === 1 ? 'usuário' : 'usuários'}
                      {' · '}
                      {Number(planoSelecionado.empresas_incluidas) || 0}{' '}
                      {(Number(planoSelecionado.empresas_incluidas) || 0) === 1 ? 'empresa' : 'empresas'}
                      {Number(planoSelecionado.armazenamento_gb) > 0
                        ? ` · ${Number(planoSelecionado.armazenamento_gb)} GB`
                        : ''}
                      {Number(planoSelecionado.credito_ia_mensal) > 0
                        ? ` · ${Number(planoSelecionado.credito_ia_mensal).toLocaleString('pt-BR')} créditos IA/mês`
                        : ''}
                    </Text>
                  </View>
                ) : null}

                <View style={{ gap: 14 }}>
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontWeight: '700', color: theme.headerText }}>Usuários adicionais</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                      Inclusos: {Number(planoSelecionado?.usuarios_inclusos) || 0}
                      {Number(planoSelecionado?.preco_usuario_adicional) > 0
                        ? ` · extra ${formatBRLFromReais(Number(planoSelecionado?.preco_usuario_adicional))}/mês`
                        : ''}
                    </Text>
                    <QtyStepper value={usuariosAdicionais} onChange={setUsuariosAdicionais} />
                  </View>
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontWeight: '700', color: theme.headerText }}>Empresas adicionais</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                      Inclusas: {Number(planoSelecionado?.empresas_incluidas) || 0}
                      {` · extra ${formatBRLFromReais(precoEmpresaDoPlano(planoSelecionado))}/mês`}
                    </Text>
                    <QtyStepper value={empresasAdicionais} onChange={setEmpresasAdicionais} />
                  </View>
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontWeight: '700', color: theme.headerText }}>Assentos PDV</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                      Inclusos: 0 · {formatBRLFromReais(precoPdvDeSettings(settingsQuery.data))}/assento/mês
                    </Text>
                    <QtyStepper value={pdvAssentos} onChange={setPdvAssentos} />
                  </View>
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontWeight: '700', color: theme.headerText }}>Lojas e-commerce</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                      Inclusas: 0 · {formatBRLFromReais(precoEcommerceDeSettings(settingsQuery.data))}/loja/mês
                    </Text>
                    <QtyStepper value={ecommerceLojas} onChange={setEcommerceLojas} />
                  </View>
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontWeight: '700', color: theme.headerText }}>Contas conciliação</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                      Inclusas: 0
                      {precoConciliacaoDeSettings(settingsQuery.data) > 0
                        ? ` · ${formatBRLFromReais(precoConciliacaoDeSettings(settingsQuery.data))}/conta/mês`
                        : ' · sem cobrança unitária configurada'}
                    </Text>
                    <QtyStepper value={conciliacaoContas} onChange={setConciliacaoContas} />
                  </View>
                </View>
              </View>

              <View style={styles.modalBlock}>
                <SectionLabel>Valores</SectionLabel>
                {!quote ? (
                  <Text style={{ color: theme.textMuted }}>Selecione um plano para ver a cotação.</Text>
                ) : (
                  <>
                    {quote.linhas.map((linha) => (
                      <Text key={linha.codigo} style={{ color: theme.textMuted }}>
                        {linha.quantidade}× {linha.rotulo} · {formatBRLFromReais(linha.unitario)} ={' '}
                        {formatBRLFromReais(linha.total)}
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
                      />
                    </FormField>
                    <Text style={{ color: theme.textMuted }}>
                      Mensal efetivo: {formatBRLFromReais(mensalEfetivo)}
                      {quote.descontoAnualPercent > 0
                        ? ` · Anual (${quote.descontoAnualPercent}%): ${formatBRLFromReais(quote.mensalComDescontoAnual)}/mês · ano ${formatBRLFromReais(quote.totalAnual)}`
                        : ` · Anual: ${formatBRLFromReais(quote.totalAnual)}`}
                    </Text>
                    <FormField label="Override anual total (opcional)">
                      <FormInput
                        value={overrideAnual}
                        onChangeText={(v) => setOverrideAnual(mascaraReaisBR(v))}
                        placeholder={formatBRLFromReais(quote.totalAnual).replace('R$\u00a0', '').replace('R$ ', '')}
                        keyboardType="decimal-pad"
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
              </View>

              {linkGerado ? (
                <View style={[styles.inclusoBox, { backgroundColor: `${theme.success}14`, borderColor: theme.success }]}>
                  <Text style={{ fontWeight: '800', color: theme.headerText }}>Link gerado</Text>
                  <Text selectable style={{ color: theme.cadastroAction }}>
                    {linkGerado}
                  </Text>
                  <Pressable onPress={() => void copiarLink(linkGerado)}>
                    <Text style={{ color: theme.cadastroAction, fontWeight: '700' }}>Copiar link</Text>
                  </Pressable>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                    Login = e-mail · senha inicial 12345678 (Confec exige troca).
                  </Text>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable
                onPress={() => setModalAberto(false)}
                style={({ pressed }) => [styles.cancelBtn, { opacity: pressed ? 0.85 : 1, borderColor: theme.border }]}>
                <Text style={{ color: theme.textMuted, fontWeight: '700' }}>
                  {linkGerado ? 'Fechar' : 'Cancelar'}
                </Text>
              </Pressable>
              {!linkGerado ? (
                <PrimaryButton
                  label={salvarMutation.isPending ? 'Salvando…' : 'Salvar e gerar link'}
                  loading={salvarMutation.isPending}
                  onPress={() => salvarMutation.mutate()}
                  disabled={!planoId}
                  style={{ flex: 1 }}
                />
              ) : (
                <PrimaryButton
                  label="Criar outro"
                  onPress={() => {
                    limparForm();
                  }}
                  style={{ flex: 1 }}
                />
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function getStyles(theme: AppTheme) {
  return StyleSheet.create({
    root: { flex: 1 },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    novoBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.cadastroAction,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 12,
      marginTop: 6,
    },
    novoBtnText: {
      color: theme.cadastroActionText,
      fontWeight: '800',
      fontSize: 14,
    },
    metricsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    metric: {
      flexGrow: 1,
      minWidth: 110,
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 12,
      paddingHorizontal: 14,
      gap: 2,
    },
    metricValue: {
      fontSize: 22,
      fontWeight: '800',
      color: theme.headerText,
    },
    metricLabel: {
      fontSize: 12,
      color: theme.textMuted,
      fontWeight: '600',
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
      gap: 12,
      ...Platform.select({
        web: { boxShadow: `0 8px 24px ${theme.cardShadow}` } as object,
        default: {
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        },
      }),
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.headerText,
    },
    cardMeta: {
      fontSize: 13,
      color: theme.textMuted,
    },
    badge: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '800',
    },
    cardGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    cardStat: {
      width: '47%',
      flexGrow: 1,
      gap: 2,
    },
    statLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    statValue: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.text,
    },
    cardExtras: {
      fontSize: 12,
      color: theme.textMuted,
    },
    cardActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingTop: 4,
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: `${theme.cadastroAction}14`,
    },
    actionBtnGhost: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: theme.surfaceMuted,
    },
    actionBtnText: {
      color: theme.cadastroAction,
      fontWeight: '700',
      fontSize: 13,
    },
    empty: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
      paddingHorizontal: 24,
      gap: 6,
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(7, 21, 38, 0.55)',
      justifyContent: 'center',
      padding: 16,
    },
    modalSheet: {
      width: '100%',
      maxWidth: 720,
      alignSelf: 'center',
      borderRadius: 18,
      borderWidth: 1,
      padding: 18,
      gap: 14,
      maxHeight: '92%',
      ...Platform.select({
        web: { boxShadow: '0 24px 64px rgba(0,0,0,0.28)' } as object,
        default: {},
      }),
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceMuted,
    },
    modalBlock: {
      gap: 10,
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background,
    },
    inclusoBox: {
      gap: 6,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
    },
    modalFooter: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
      paddingTop: 4,
    },
    cancelBtn: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
    },
  });
}
