import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';

import { Metodo360ChecklistItemCard } from '@/components/ui/Metodo360ChecklistItemCard';
import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { FormSelect } from '@/components/ui/FormSelect';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Text } from '@/components/Themed';
import { METODO360_CRITERIOS } from '@/src/constants/metodo360-criterios';
import { METODO360_MISSOES, metodo360MissaoPorNumero } from '@/src/constants/metodo360-missions';
import { METODO360_TELAS_ERP } from '@/src/constants/metodo360-telas';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import { registrarAuditoria } from '@/src/services/audit';
import {
  atualizarChecklistMetodo360,
  criarChecklistMetodo360,
  desativarChecklistMetodo360,
  listarChecklistMetodo360,
  moverChecklistMetodo360,
  reativarChecklistMetodo360,
} from '@/src/services/repos/metodo360-repo';
import { listarSuporteVideos } from '@/src/services/repos/suporte-videos-repo';

export default function Metodo360Screen() {
  const { theme } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const { adminProfile, canAccessScreen, canManageBilling } = useAdminAuth();

  const podeGerenciar = canAccessScreen('metodo360') && canManageBilling;
  const [missaoNumero, setMissaoNumero] = useState(1);
  const [mostrarInativos, setMostrarInativos] = useState(false);

  const [nome, setNome] = useState('');
  const [tela, setTela] = useState('');
  const [criterio, setCriterio] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [formErro, setFormErro] = useState<string | null>(null);
  const [itemSalvandoId, setItemSalvandoId] = useState<string | null>(null);
  const [itemRemovendoId, setItemRemovendoId] = useState<string | null>(null);

  const missao = metodo360MissaoPorNumero(missaoNumero);

  const qItens = useQuery({
    queryKey: ['metodo360_checklist', missaoNumero],
    queryFn: () => listarChecklistMetodo360(missaoNumero),
    enabled: canAccessScreen('metodo360'),
  });

  const qVideos = useQuery({
    queryKey: ['suporte_videos'],
    queryFn: listarSuporteVideos,
    enabled: canAccessScreen('metodo360'),
  });

  const videos = qVideos.data ?? [];
  const videosMetodo360 = useMemo(
    () => videos.filter((v) => v.categoria === 'Método 360' || v.ativo !== false),
    [videos],
  );

  const videoOpcoes = useMemo(
    () => [
      { id: '', label: 'Sem vídeo' },
      ...videosMetodo360.filter((v) => v.ativo !== false).map((v) => ({ id: v.id, label: `[${v.categoria}] ${v.titulo}` })),
    ],
    [videosMetodo360],
  );

  const itensVisiveis = useMemo(() => {
    const lista = qItens.data ?? [];
    if (mostrarInativos) return lista;
    return lista.filter((i) => i.ativo !== false);
  }, [qItens.data, mostrarInativos]);

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ['metodo360_checklist'] });
  };

  const criarMutation = useMutation({
    mutationFn: async () => {
      if (!podeGerenciar) throw new Error('Sem permissão para editar o Método 360.');
      const item = await criarChecklistMetodo360({
        missao_numero: missaoNumero,
        nome,
        tela_referencia: tela.trim() || null,
        criterio_verificacao: criterio.trim() || null,
        suporte_video_id: videoId || null,
      });
      await registrarAuditoria({ id: adminProfile?.id, email: adminProfile?.email }, {
        acao: 'METODO360_ITEM_CREATE',
        entidade: 'metodo360_checklist_itens',
        entidade_id: item.id,
        valores_anteriores: {},
        valores_novos: item as unknown as Record<string, unknown>,
      });
      return item;
    },
    onSuccess: () => {
      setNome('');
      setTela('');
      setCriterio('');
      setVideoId(null);
      setFormErro(null);
      invalidar();
    },
    onError: (e) => setFormErro(e instanceof Error ? e.message : 'Erro ao criar item'),
  });

  const salvarItem = async (
    id: string,
    patch: {
      nome: string;
      tela_referencia: string | null;
      criterio_verificacao: string | null;
      suporte_video_id: string | null;
    },
  ) => {
    if (!podeGerenciar) throw new Error('Sem permissão.');
    setItemSalvandoId(id);
    try {
      const anterior = (qItens.data ?? []).find((i) => i.id === id);
      const atualizado = await atualizarChecklistMetodo360(id, patch);
      await registrarAuditoria({ id: adminProfile?.id, email: adminProfile?.email }, {
        acao: 'METODO360_ITEM_UPDATE',
        entidade: 'metodo360_checklist_itens',
        entidade_id: id,
        valores_anteriores: (anterior ?? {}) as unknown as Record<string, unknown>,
        valores_novos: atualizado as unknown as Record<string, unknown>,
      });
      invalidar();
    } finally {
      setItemSalvandoId(null);
    }
  };

  const desativarItem = async (id: string) => {
    if (!podeGerenciar) throw new Error('Sem permissão.');
    setItemRemovendoId(id);
    try {
      await desativarChecklistMetodo360(id);
      await registrarAuditoria({ id: adminProfile?.id, email: adminProfile?.email }, {
        acao: 'METODO360_ITEM_DEACTIVATE',
        entidade: 'metodo360_checklist_itens',
        entidade_id: id,
        valores_anteriores: {},
        valores_novos: { ativo: false },
      });
      invalidar();
    } finally {
      setItemRemovendoId(null);
    }
  };

  const reativarItem = async (id: string) => {
    if (!podeGerenciar) throw new Error('Sem permissão.');
    setItemRemovendoId(id);
    try {
      const item = await reativarChecklistMetodo360(id);
      await registrarAuditoria({ id: adminProfile?.id, email: adminProfile?.email }, {
        acao: 'METODO360_ITEM_REACTIVATE',
        entidade: 'metodo360_checklist_itens',
        entidade_id: id,
        valores_anteriores: { ativo: false },
        valores_novos: item as unknown as Record<string, unknown>,
      });
      invalidar();
    } finally {
      setItemRemovendoId(null);
    }
  };

  const moverItem = async (item: (typeof itensVisiveis)[0], direcao: 'up' | 'down') => {
    if (!podeGerenciar) return;
    await moverChecklistMetodo360(item, direcao, qItens.data ?? []);
    invalidar();
  };

  if (!canAccessScreen('metodo360')) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: theme.background }}>
        <Text style={{ color: theme.warning, fontWeight: '800' }}>Seu perfil não tem acesso ao Método 360.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
      data={itensVisiveis}
      keyExtractor={(item) => item.id}
      refreshing={qItens.isRefetching}
      onRefresh={() => {
        void qItens.refetch();
        void qVideos.refetch();
      }}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 4 }}>
          <PageHeader
            title="Método 360"
            subtitle="Gerencie os itens do checklist de cada missão e vincule vídeos de suporte."
          />

          <ScreenCard style={{ gap: 10 }}>
            <SectionTitle>Missão</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {METODO360_MISSOES.map((m) => {
                const ativa = m.numero === missaoNumero;
                return (
                  <Pressable
                    key={m.numero}
                    onPress={() => setMissaoNumero(m.numero)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: 10,
                      backgroundColor: ativa ? theme.cadastroAction : theme.surfaceMuted,
                    }}
                  >
                    <Text style={{ fontWeight: '800', color: ativa ? '#fff' : theme.headerText, fontSize: 13 }}>
                      {m.numero}. {m.titulo}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {missao ? (
              <View style={{ gap: 6, marginTop: 4 }}>
                <Text style={{ color: theme.headerText, fontWeight: '700' }}>Objetivo</Text>
                <Text style={{ color: theme.textMuted }}>{missao.objetivo}</Text>
                <Text style={{ color: theme.headerText, fontWeight: '700', marginTop: 4 }}>Resultado esperado</Text>
                <Text style={{ color: theme.textMuted }}>{missao.resultado}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 12, fontStyle: 'italic' }}>{missao.whatsapp}</Text>
              </View>
            ) : null}
          </ScreenCard>

          {podeGerenciar ? (
            <ScreenCard style={{ gap: 12 }}>
              <SectionTitle>{`Novo item — Missão ${missaoNumero}`}</SectionTitle>

              <FormField label="Nome" required>
                <FormInput value={nome} onChangeText={setNome} placeholder="Ex.: Cadastrar primeiro cliente" />
              </FormField>

              <FormField label="Tela no ERP">
                <FormSelect
                  options={METODO360_TELAS_ERP.map((t) => t.value)}
                  labels={Object.fromEntries(METODO360_TELAS_ERP.map((t) => [t.value, t.label]))}
                  value={tela}
                  onChange={setTela}
                  placeholder="Botão Ir para…"
                />
              </FormField>

              <FormField label="Critério automático">
                <FormSelect
                  options={METODO360_CRITERIOS.map((c) => c.value)}
                  labels={Object.fromEntries(METODO360_CRITERIOS.map((c) => [c.value, c.label]))}
                  value={criterio}
                  onChange={setCriterio}
                  placeholder="Verificação no ERP"
                />
              </FormField>

              <FormField label="Vídeo de suporte">
                <FormSelect
                  options={videoOpcoes.map((v) => v.id)}
                  labels={Object.fromEntries(videoOpcoes.map((v) => [v.id, v.label]))}
                  value={videoId ?? ''}
                  onChange={(v) => setVideoId(v || null)}
                  placeholder="Vincular vídeo"
                />
              </FormField>

              <Pressable onPress={() => router.push('/(tabs)/config-suporte')}>
                <Text style={{ color: theme.cadastroAction, fontSize: 13 }}>
                  Cadastrar vídeos em Config. Suporte (categoria Método 360)
                </Text>
              </Pressable>

              {formErro ? <Text style={{ color: theme.error }}>{formErro}</Text> : null}

              <PrimaryButton
                label={criarMutation.isPending ? 'Adicionando…' : 'Adicionar item'}
                loading={criarMutation.isPending}
                onPress={() => criarMutation.mutate()}
              />
            </ScreenCard>
          ) : (
            <Text style={{ color: theme.textMuted, fontSize: 13 }}>
              Seu perfil pode visualizar o checklist, mas não editar itens.
            </Text>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <SectionTitle>{`Itens (${itensVisiveis.length})`}</SectionTitle>
            <Pressable onPress={() => setMostrarInativos((v) => !v)}>
              <Text style={{ color: theme.cadastroAction, fontSize: 13 }}>
                {mostrarInativos ? 'Ocultar desativados' : 'Mostrar desativados'}
              </Text>
            </Pressable>
          </View>

          {qItens.isLoading ? <Text style={{ color: theme.textMuted }}>Carregando itens…</Text> : null}
          {qItens.error ? (
            <Text style={{ color: theme.error }}>
              {qItens.error instanceof Error ? qItens.error.message : 'Erro ao carregar checklist'}
            </Text>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <Metodo360ChecklistItemCard
          item={item}
          videos={videosMetodo360}
          podeGerenciar={podeGerenciar}
          salvando={itemSalvandoId === item.id}
          removendo={itemRemovendoId === item.id}
          onSalvar={(patch) => salvarItem(item.id, patch)}
          onDesativar={() => desativarItem(item.id)}
          onReativar={() => reativarItem(item.id)}
          onMover={(d) => moverItem(item, d)}
        />
      )}
      ListEmptyComponent={
        !qItens.isLoading ? (
          <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 8 }}>
            Nenhum item nesta missão. {podeGerenciar ? 'Adicione o primeiro acima.' : ''}
          </Text>
        ) : null
      }
    />
  );
}
