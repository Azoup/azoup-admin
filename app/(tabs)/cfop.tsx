import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';

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
import { listarCfopPadrao, salvarCfopPadrao } from '@/src/services/repos/cfop-repo';
import type { CfopPadraoRow } from '@/src/types/azoup';
import { formatDateTimeBR } from '@/src/utils/format';

export default function CfopScreen() {
  const { theme } = useTheme();
  const qc = useQueryClient();
  const { adminProfile, canAccessScreen, papel } = useAdminAuth();
  const podeGerenciar = canAccessScreen('cfop') && (papel === 'owner' || papel === 'manager');

  const [codigo, setCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [editando, setEditando] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(false);

  const q = useQuery({
    queryKey: ['cfop_codigos_padrao'],
    queryFn: listarCfopPadrao,
    enabled: canAccessScreen('cfop'),
  });

  const itens = useMemo(() => {
    const termo = busca.replace(/\D/g, '');
    return (q.data ?? []).filter((item) => {
      if (!mostrarInativos && !item.ativo) return false;
      if (!termo && !busca.trim()) return true;
      const texto = `${item.codigo} ${item.descricao}`.toLowerCase();
      return texto.includes(busca.trim().toLowerCase()) || (termo && item.codigo.includes(termo));
    });
  }, [q.data, busca, mostrarInativos]);

  const limpar = () => {
    setCodigo('');
    setDescricao('');
    setAtivo(true);
    setEditando(null);
  };

  const carregar = (item: CfopPadraoRow) => {
    setEditando(item.codigo);
    setCodigo(item.codigo);
    setDescricao(item.descricao);
    setAtivo(item.ativo);
  };

  const salvar = useMutation({
    mutationFn: async () => {
      const anterior = (q.data ?? []).find((item) => item.codigo === editando) ?? null;
      const salvo = await salvarCfopPadrao({
        codigo,
        descricao,
        ativo,
        updatedByAdmin: adminProfile?.email ?? null,
      });
      await registrarAuditoria(
        { id: adminProfile?.id, email: adminProfile?.email },
        {
          acao: 'CFOP_UPSERT',
          entidade: 'cfop_codigos_padrao',
          entidade_id: salvo.codigo,
          valores_anteriores: anterior
            ? { codigo: anterior.codigo, descricao: anterior.descricao, ativo: anterior.ativo }
            : {},
          valores_novos: { codigo: salvo.codigo, descricao: salvo.descricao, ativo: salvo.ativo },
        },
      );
      return salvo;
    },
    onSuccess: async () => {
      limpar();
      await qc.invalidateQueries({ queryKey: ['cfop_codigos_padrao'] });
    },
  });

  if (!canAccessScreen('cfop')) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: theme.background }}>
        <Text style={{ color: theme.warning, fontWeight: '800' }}>Seu perfil não tem acesso ao cadastro de CFOP.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
      data={itens}
      keyExtractor={(item) => item.codigo}
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 4 }}>
          <PageHeader
            title="CFOP"
            subtitle="Cadastro padrão do Confec. Ao salvar, o código entra no dropdown fiscal de todos os clientes — inclusive os novos."
          />

          {podeGerenciar ? (
            <ScreenCard style={{ gap: 12 }}>
              <SectionTitle>{editando ? `Editar CFOP ${editando}` : 'Novo CFOP'}</SectionTitle>
              <FormField label="Código" required helper="4 a 10 dígitos. Ex.: 5102">
                <FormInput
                  value={codigo}
                  onChangeText={setCodigo}
                  placeholder="5102"
                  keyboardType="number-pad"
                  editable={!editando}
                  maxLength={10}
                />
              </FormField>
              <FormField label="Descrição" required>
                <FormInput
                  value={descricao}
                  onChangeText={setDescricao}
                  placeholder="Venda de mercadoria adquirida ou recebida de terceiros"
                />
              </FormField>
              <FormCheckbox label="Ativo no dropdown dos clientes" checked={ativo} onCheckedChange={setAtivo} />
              {salvar.error ? <Text style={{ color: theme.error }}>{(salvar.error as Error).message}</Text> : null}
              {salvar.isSuccess ? (
                <Text style={{ color: theme.cadastroAction, fontWeight: '700' }}>
                  CFOP gravado em todos os clientes.
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <PrimaryButton
                  label={salvar.isPending ? 'Salvando…' : editando ? 'Salvar alteração' : 'Adicionar CFOP'}
                  loading={salvar.isPending}
                  onPress={() => salvar.mutate()}
                />
                {editando ? (
                  <Pressable onPress={limpar} style={{ justifyContent: 'center', paddingHorizontal: 12 }}>
                    <Text style={{ color: theme.textMuted, fontWeight: '700' }}>Cancelar</Text>
                  </Pressable>
                ) : null}
              </View>
            </ScreenCard>
          ) : (
            <Text style={{ color: theme.textMuted }}>Seu papel só pode consultar os CFOPs.</Text>
          )}

          <FormField label="Buscar">
            <FormInput value={busca} onChangeText={setBusca} placeholder="Código ou descrição" />
          </FormField>
          <Pressable onPress={() => setMostrarInativos((atual) => !atual)}>
            <Text style={{ color: theme.cadastroAction, fontWeight: '700' }}>
              {mostrarInativos ? 'Ocultar inativos' : 'Mostrar inativos'}
            </Text>
          </Pressable>
          {q.isLoading ? <Text style={{ color: theme.textMuted }}>Carregando…</Text> : null}
          {q.error ? <Text style={{ color: theme.error }}>{(q.error as Error).message}</Text> : null}
        </View>
      }
      ListEmptyComponent={
        q.isLoading ? null : (
          <Text style={{ color: theme.textMuted }}>Nenhum CFOP neste filtro.</Text>
        )
      }
      renderItem={({ item }) => (
        <ScreenCard style={{ gap: 6 }}>
          <Text style={{ color: theme.headerText, fontWeight: '800' }}>
            {item.codigo} {item.ativo ? '' : '· inativo'}
          </Text>
          <Text style={{ color: theme.text, lineHeight: 20 }}>{item.descricao}</Text>
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>
            {item.updated_at ? formatDateTimeBR(item.updated_at) : '—'}
            {item.updated_by_admin ? ` · ${item.updated_by_admin}` : ''}
          </Text>
          {podeGerenciar ? (
            <Pressable onPress={() => carregar(item)}>
              <Text style={{ color: theme.cadastroAction, fontWeight: '700' }}>Editar</Text>
            </Pressable>
          ) : null}
        </ScreenCard>
      )}
    />
  );
}
