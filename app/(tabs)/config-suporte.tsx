import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { SuporteVideoCard } from '@/components/ui/SuporteVideoCard';
import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { FormSelect } from '@/components/ui/FormSelect';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Text } from '@/components/Themed';
import { SUPORTE_VIDEO_CATEGORIAS, type SuporteVideoCategoria } from '@/src/constants/suporte-video-categorias';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import { registrarAuditoria } from '@/src/services/audit';
import {
  criarSuporteVideo,
  excluirSuporteVideo,
  listarSuporteVideos,
} from '@/src/services/repos/suporte-videos-repo';

export default function ConfigSuporteScreen() {
  const { theme } = useTheme();
  const qc = useQueryClient();
  const { adminProfile, canAccessScreen, canManageBilling } = useAdminAuth();

  const podeGerenciar = canAccessScreen('config_suporte') && canManageBilling;

  const [titulo, setTitulo] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [categoria, setCategoria] = useState<SuporteVideoCategoria | null>(null);
  const [formErro, setFormErro] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['suporte_videos'],
    queryFn: listarSuporteVideos,
    enabled: canAccessScreen('config_suporte'),
  });

  const criarMutation = useMutation({
    mutationFn: async () => {
      if (!podeGerenciar) throw new Error('Sem permissão para cadastrar vídeos.');
      if (!categoria) throw new Error('Selecione a categoria.');

      const video = await criarSuporteVideo({
        titulo,
        youtube_url: youtubeUrl,
        categoria,
        created_by_admin: adminProfile?.email ?? null,
      });

      await registrarAuditoria({ id: adminProfile?.id, email: adminProfile?.email }, {
        acao: 'SUPORTE_VIDEO_CREATE',
        entidade: 'suporte_videos',
        entidade_id: video.id,
        valores_anteriores: {},
        valores_novos: video as unknown as Record<string, unknown>,
      });

      return video;
    },
    onSuccess: () => {
      setTitulo('');
      setYoutubeUrl('');
      setCategoria(null);
      setFormErro(null);
      void qc.invalidateQueries({ queryKey: ['suporte_videos'] });
    },
    onError: (e) => setFormErro(e instanceof Error ? e.message : 'Erro ao salvar vídeo'),
  });

  const excluirMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!podeGerenciar) throw new Error('Sem permissão para remover vídeos.');
      await excluirSuporteVideo(id);
      await registrarAuditoria({ id: adminProfile?.id, email: adminProfile?.email }, {
        acao: 'SUPORTE_VIDEO_DELETE',
        entidade: 'suporte_videos',
        entidade_id: id,
        valores_anteriores: {},
        valores_novos: {},
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['suporte_videos'] }),
  });

  const videos = q.data ?? [];

  if (!canAccessScreen('config_suporte')) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: theme.background }}>
        <Text style={{ color: theme.warning, fontWeight: '800' }}>Seu perfil não tem acesso a Config. Suporte.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
      data={videos}
      keyExtractor={(item) => item.id}
      refreshing={q.isRefetching}
      onRefresh={() => q.refetch()}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 4 }}>
          <PageHeader
            title="Config. Suporte"
            subtitle="Cadastre vídeos do YouTube por categoria para o suporte no app Azoup."
          />

          {podeGerenciar ? (
            <ScreenCard style={{ gap: 12 }}>
              <SectionTitle>Novo vídeo</SectionTitle>

              <FormField label="Título" required>
                <FormInput value={titulo} onChangeText={setTitulo} placeholder="Ex.: Como emitir NF-e de venda" />
              </FormField>

              <FormField label="Link do YouTube" required helper="Cole a URL completa do vídeo (youtube.com ou youtu.be).">
                <FormInput
                  value={youtubeUrl}
                  onChangeText={setYoutubeUrl}
                  placeholder="https://www.youtube.com/watch?v=..."
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </FormField>

              <FormField label="Categoria" required>
                <FormSelect
                  options={SUPORTE_VIDEO_CATEGORIAS}
                  value={categoria}
                  onChange={setCategoria}
                  placeholder="Selecione a categoria"
                />
              </FormField>

              {formErro ? <Text style={{ color: theme.error, fontWeight: '700' }}>{formErro}</Text> : null}
              {criarMutation.isError ? (
                <Text style={{ color: theme.error, fontWeight: '700' }}>{(criarMutation.error as Error).message}</Text>
              ) : null}

              <PrimaryButton
                label={criarMutation.isPending ? 'Salvando…' : 'Adicionar vídeo'}
                loading={criarMutation.isPending}
                onPress={() => {
                  setFormErro(null);
                  criarMutation.mutate();
                }}
              />
            </ScreenCard>
          ) : (
            <Text style={{ color: theme.textMuted }}>Seu perfil só pode visualizar os vídeos cadastrados.</Text>
          )}

          <SectionTitle>Vídeos cadastrados ({videos.length})</SectionTitle>
        </View>
      }
      ListEmptyComponent={
        q.isLoading ? (
          <Text style={{ color: theme.textMuted }}>Carregando vídeos…</Text>
        ) : q.error ? (
          <Text style={{ color: theme.error }}>{(q.error as Error).message}</Text>
        ) : (
          <Text style={{ color: theme.textMuted }}>Nenhum vídeo cadastrado ainda.</Text>
        )
      }
      renderItem={({ item }) => (
        <SuporteVideoCard
          video={item}
          onExcluir={
            podeGerenciar
              ? () => {
                  excluirMutation.mutate(item.id);
                }
              : undefined
          }
          excluindo={excluirMutation.isPending && excluirMutation.variables === item.id}
        />
      )}
    />
  );
}
