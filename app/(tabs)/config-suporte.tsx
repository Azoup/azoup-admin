import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { SuporteVideoCard } from '@/components/ui/SuporteVideoCard';
import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { FormSelect } from '@/components/ui/FormSelect';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Text } from '@/components/Themed';
import { ACOMPANHAMENTO_COLUNAS } from '@/src/utils/acompanhamento';
import {
  listarAlertaContato,
  salvarAlertaContato,
  type AlertaContatoPorColuna,
} from '@/src/services/repos/acompanhamento-alerta-repo';
import {
  lerDigisacBoasVindas,
  salvarDigisacBoasVindas,
} from '@/src/services/repos/digisac-boas-vindas-repo';
import { SUPORTE_VIDEO_CATEGORIAS, type SuporteVideoCategoria } from '@/src/constants/suporte-video-categorias';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import { registrarAuditoria } from '@/src/services/audit';
import {
  criarSuporteVideo,
  excluirSuporteVideo,
  listarSuporteVideos,
} from '@/src/services/repos/suporte-videos-repo';

function DigisacBoasVindasConfig() {
  const { theme } = useTheme();
  const qc = useQueryClient();
  const { adminProfile } = useAdminAuth();
  const q = useQuery({
    queryKey: ['digisac_boas_vindas'],
    queryFn: lerDigisacBoasVindas,
  });
  const [habilitado, setHabilitado] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const editou = useRef(false);

  useEffect(() => {
    if (!q.data || editou.current) return;
    setHabilitado(q.data.habilitado);
    setMensagem(q.data.mensagem);
  }, [q.data]);

  const salvar = useMutation({
    mutationFn: async () => {
      const anterior = q.data ?? null;
      const proximo = { habilitado, mensagem };
      await salvarDigisacBoasVindas(proximo);
      await registrarAuditoria(
        { id: adminProfile?.id, email: adminProfile?.email },
        {
          acao: 'DIGISAC_BOAS_VINDAS_UPDATE',
          entidade: 'admin_digisac_boas_vindas',
          valores_anteriores: (anterior ?? null) as unknown as Record<string, unknown> | null,
          valores_novos: proximo as unknown as Record<string, unknown>,
        },
      );
    },
    onSuccess: () => {
      setErro(null);
      setOk('Mensagem automática salva.');
      void qc.invalidateQueries({ queryKey: ['digisac_boas_vindas'] });
    },
    onError: (e) => {
      setOk(null);
      setErro(e instanceof Error ? e.message : 'Erro ao salvar a mensagem');
    },
  });

  return (
    <ScreenCard style={{ gap: 12 }}>
      <SectionTitle>Mensagem automática Digisac</SectionTitle>
      <Text style={{ color: theme.textMuted, fontSize: 13 }}>
        Quando ligada, todo cliente novo recebe esta mensagem no telefone cadastrado. O contato entra na conexão e no departamento Azoup Confec.
      </Text>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: habilitado }}
        onPress={() => {
          editou.current = true;
          setHabilitado((atual) => !atual);
          setOk(null);
        }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          minHeight: 52,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: habilitado ? theme.cadastroAction : theme.border,
          backgroundColor: habilitado ? theme.cadastroAction : theme.surface,
          opacity: pressed ? 0.88 : 1,
        })}
      >
        <Text style={{ color: habilitado ? theme.cadastroActionText : theme.text, fontWeight: '800', flex: 1 }}>
          Enviar mensagem automática
        </Text>
        <Text style={{ color: habilitado ? theme.cadastroActionText : theme.textMuted, fontWeight: '800', fontSize: 13 }}>
          {habilitado ? 'LIGADA' : 'DESLIGADA'}
        </Text>
      </Pressable>
      <FormField label="Mensagem" helper="Enviada exatamente como estiver escrita.">
        <FormInput
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          value={mensagem}
          onChangeText={(valor) => {
            setMensagem(valor);
            setOk(null);
          }}
          placeholder="Olá, seja bem-vindo à Azoup."
          style={{ minHeight: 120, paddingTop: 10 }}
        />
      </FormField>
      <PrimaryButton
        label={salvar.isPending ? 'Salvando…' : 'Salvar mensagem'}
        loading={salvar.isPending}
        disabled={q.isLoading}
        onPress={() => salvar.mutate()}
      />
      {q.isLoading ? <Text style={{ color: theme.textMuted }}>Carregando mensagem…</Text> : null}
      {erro ? <Text style={{ color: theme.error }}>{erro}</Text> : null}
      {ok ? <Text style={{ color: theme.success, fontWeight: '700' }}>{ok}</Text> : null}
    </ScreenCard>
  );
}

function AlertaContatoConfig() {
  const { theme } = useTheme();
  const qc = useQueryClient();
  const { adminProfile } = useAdminAuth();
  const q = useQuery({
    queryKey: ['acompanhamento_alerta_contato'],
    queryFn: listarAlertaContato,
  });
  const [dias, setDias] = useState<AlertaContatoPorColuna | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (q.data) setDias(q.data);
  }, [q.data]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!dias) throw new Error('Aguarde o carregamento dos prazos.');
      const anterior = q.data ?? null;
      await salvarAlertaContato(dias);
      await registrarAuditoria(
        { id: adminProfile?.id, email: adminProfile?.email },
        {
          acao: 'ACOMPANHAMENTO_ALERTA_UPDATE',
          entidade: 'admin_acompanhamento_alerta',
          valores_anteriores: anterior,
          valores_novos: dias,
        },
      );
    },
    onSuccess: () => {
      setErro(null);
      setOk('Prazos salvos.');
      void qc.invalidateQueries({ queryKey: ['acompanhamento_alerta_contato'] });
    },
    onError: (e) => {
      setOk(null);
      setErro(e instanceof Error ? e.message : 'Erro ao salvar prazos');
    },
  });

  return (
    <ScreenCard style={{ gap: 12 }}>
      <SectionTitle>Alerta de último contato</SectionTitle>
      <Text style={{ color: theme.textMuted, fontSize: 13 }}>
        Por coluna do acompanhamento. O texto do card fica branco e só fica vermelho quando o último contato passar dessa quantidade de dias.
      </Text>
      {q.isLoading || !dias ? <Text style={{ color: theme.textMuted }}>Carregando prazos…</Text> : null}
      {dias
        ? ACOMPANHAMENTO_COLUNAS.map((coluna) => (
            <FormField key={coluna.key} label={coluna.label} helper="Dias sem contato">
              <FormInput
                keyboardType="number-pad"
                value={String(dias[coluna.key])}
                onChangeText={(valor) => {
                  const n = Number(valor.replace(/\D/g, ''));
                  setDias((atual) => (atual ? { ...atual, [coluna.key]: Number.isFinite(n) ? n : 0 } : atual));
                  setOk(null);
                }}
              />
            </FormField>
          ))
        : null}
      <PrimaryButton
        label={salvar.isPending ? 'Salvando…' : 'Salvar prazos'}
        loading={salvar.isPending}
        disabled={!dias}
        onPress={() => salvar.mutate()}
      />
      {erro ? <Text style={{ color: theme.error }}>{erro}</Text> : null}
      {ok ? <Text style={{ color: theme.success, fontWeight: '700' }}>{ok}</Text> : null}
    </ScreenCard>
  );
}

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
            subtitle="Prazos do acompanhamento, mensagem da Digisac e vídeos do YouTube para o suporte no app Azoup."
          />
          <DigisacBoasVindasConfig />
          <AlertaContatoConfig />

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
