import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { SuporteVideoCard } from '@/components/ui/SuporteVideoCard';
import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { FormSelect } from '@/components/ui/FormSelect';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
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
import {
  excluirMensagemProntaDigisac,
  listarMensagensProntasDigisac,
  salvarMensagemProntaDigisac,
} from '@/src/services/repos/digisac-mensagens-prontas-repo';
import { SUPORTE_VIDEO_CATEGORIAS, type SuporteVideoCategoria } from '@/src/constants/suporte-video-categorias';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import { registrarAuditoria } from '@/src/services/audit';
import {
  criarSuporteVideo,
  excluirSuporteVideo,
  listarSuporteVideos,
} from '@/src/services/repos/suporte-videos-repo';

type PainelId = 'digisac' | 'prontas' | 'alerta' | 'videos';

function PainelConfig({
  titulo,
  resumo,
  aberto,
  onPress,
  children,
}: {
  titulo: string;
  resumo: string;
  aberto: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.surface,
        overflow: 'hidden',
      }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ expanded: aberto }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 16,
          opacity: pressed ? 0.82 : 1,
        })}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: theme.headerText, fontWeight: '700', fontSize: 15 }}>{titulo}</Text>
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>{resumo}</Text>
        </View>
        <FontAwesome name={aberto ? 'chevron-up' : 'chevron-down'} size={12} color={theme.textMuted} />
      </Pressable>
      <View
        style={
          aberto
            ? {
                gap: 12,
                paddingHorizontal: 16,
                paddingBottom: 16,
                borderTopWidth: 1,
                borderTopColor: theme.border,
              }
            : { display: 'none' }
        }
        accessibilityElementsHidden={!aberto}
      >
        {children}
      </View>
    </View>
  );
}

function DigisacBoasVindasConfig({ aberto, onPress }: { aberto: boolean; onPress: () => void }) {
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
  const rascunho = useRef(false);

  useEffect(() => {
    if (!q.data || rascunho.current) return;
    setHabilitado(q.data.habilitado);
    setMensagem(q.data.mensagem);
  }, [q.data, aberto]);

  useEffect(() => {
    if (!aberto || rascunho.current) return;
    void qc.invalidateQueries({ queryKey: ['digisac_boas_vindas'] });
  }, [aberto, qc]);

  const salvar = useMutation({
    mutationFn: async () => {
      const anterior = q.data ?? null;
      const proximo = { habilitado, mensagem };
      const salvo = await salvarDigisacBoasVindas(proximo);
      await registrarAuditoria(
        { id: adminProfile?.id, email: adminProfile?.email },
        {
          acao: 'DIGISAC_BOAS_VINDAS_UPDATE',
          entidade: 'admin_digisac_boas_vindas',
          valores_anteriores: (anterior ?? null) as unknown as Record<string, unknown> | null,
          valores_novos: salvo as unknown as Record<string, unknown>,
        },
      );
      return salvo;
    },
    onSuccess: (salvo) => {
      rascunho.current = false;
      setHabilitado(salvo.habilitado);
      setMensagem(salvo.mensagem);
      qc.setQueryData(['digisac_boas_vindas'], salvo);
      setErro(null);
      setOk('Mensagem automática salva.');
    },
    onError: (e) => {
      setOk(null);
      setErro(e instanceof Error ? e.message : 'Erro ao salvar a mensagem');
    },
  });

  return (
    <PainelConfig
      titulo="Mensagem automática"
      resumo={q.isLoading ? 'Carregando…' : habilitado ? 'Ligada para clientes novos' : 'Desligada'}
      aberto={aberto}
      onPress={onPress}
    >
      <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 12 }}>
        Quando ligada, todo cliente novo recebe esta mensagem no telefone cadastrado. O contato entra na conexão e no departamento Azoup Confec.
      </Text>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: habilitado }}
        onPress={() => {
          rascunho.current = true;
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
            rascunho.current = true;
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
    </PainelConfig>
  );
}

function MensagensProntasConfig({ aberto, onPress }: { aberto: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['digisac_mensagens_prontas'],
    queryFn: listarMensagensProntasDigisac,
  });
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const mensagens = q.data ?? [];

  function limpar() {
    setEditandoId(null);
    setTitulo('');
    setDescricao('');
  }

  const salvar = useMutation({
    mutationFn: () => salvarMensagemProntaDigisac({ id: editandoId, titulo, descricao }),
    onSuccess: () => {
      setErro(null);
      setOk(editandoId ? 'Mensagem atualizada.' : 'Mensagem cadastrada.');
      limpar();
      void qc.invalidateQueries({ queryKey: ['digisac_mensagens_prontas'] });
    },
    onError: (e) => {
      setOk(null);
      setErro(e instanceof Error ? e.message : 'Erro ao salvar a mensagem');
    },
  });

  const excluir = useMutation({
    mutationFn: excluirMensagemProntaDigisac,
    onSuccess: () => {
      setErro(null);
      setOk('Mensagem excluída.');
      void qc.invalidateQueries({ queryKey: ['digisac_mensagens_prontas'] });
    },
    onError: (e) => {
      setOk(null);
      setErro(e instanceof Error ? e.message : 'Erro ao excluir a mensagem');
    },
  });

  return (
    <PainelConfig
      titulo="Mensagens prontas"
      resumo={q.isLoading ? 'Carregando…' : mensagens.length === 1 ? '1 mensagem' : `${mensagens.length} mensagens`}
      aberto={aberto}
      onPress={onPress}
    >
      <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 12 }}>
        O título aparece na escolha. A descrição é o texto enviado ao contato do cliente na Digisac.
      </Text>
      <FormField label="Título" required>
        <FormInput value={titulo} onChangeText={setTitulo} placeholder="Ex.: Lembrete de treinamento" />
      </FormField>
      <FormField label="Descrição" required>
        <FormInput
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          value={descricao}
          onChangeText={setDescricao}
          placeholder="Texto que será enviado no WhatsApp"
          style={{ minHeight: 120, paddingTop: 10 }}
        />
      </FormField>
      <PrimaryButton
        label={salvar.isPending ? 'Salvando…' : editandoId ? 'Atualizar mensagem' : 'Cadastrar mensagem'}
        loading={salvar.isPending}
        onPress={() => salvar.mutate()}
      />
      {editandoId ? (
        <Pressable onPress={limpar} hitSlop={6}>
          <Text style={{ color: theme.textMuted, fontWeight: '700' }}>Cancelar edição</Text>
        </Pressable>
      ) : null}
      {q.isLoading ? <Text style={{ color: theme.textMuted }}>Carregando mensagens…</Text> : null}
      {erro ? <Text style={{ color: theme.error }}>{erro}</Text> : null}
      {ok ? <Text style={{ color: theme.success, fontWeight: '700' }}>{ok}</Text> : null}
      {mensagens.map((item) => (
        <View
          key={item.id}
          style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 12, gap: 6 }}
        >
          <Text style={{ color: theme.headerText, fontWeight: '800' }}>{item.titulo}</Text>
          <Text style={{ color: theme.text, fontSize: 13 }} numberOfLines={4}>
            {item.descricao}
          </Text>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Pressable
              onPress={() => {
                setEditandoId(item.id);
                setTitulo(item.titulo);
                setDescricao(item.descricao);
                setOk(null);
                setErro(null);
              }}
              hitSlop={6}
            >
              <Text style={{ color: theme.cadastroAction, fontWeight: '800', fontSize: 12 }}>Editar</Text>
            </Pressable>
            <Pressable onPress={() => excluir.mutate(item.id)} hitSlop={6} disabled={excluir.isPending}>
              <Text style={{ color: theme.error, fontWeight: '800', fontSize: 12 }}>Excluir</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </PainelConfig>
  );
}

function AlertaContatoConfig({ aberto, onPress }: { aberto: boolean; onPress: () => void }) {
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
    <PainelConfig
      titulo="Alerta de último contato"
      resumo="Dias até o texto do card ficar vermelho"
      aberto={aberto}
      onPress={onPress}
    >
      <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 12 }}>
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
    </PainelConfig>
  );
}

export default function ConfigSuporteScreen() {
  const { theme } = useTheme();
  const qc = useQueryClient();
  const { adminProfile, canAccessScreen, canManageBilling } = useAdminAuth();

  const podeGerenciar = canAccessScreen('config_suporte') && canManageBilling;

  const [painel, setPainel] = useState<PainelId | null>(null);
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

  function alternar(id: PainelId) {
    setPainel((atual) => (atual === id ? null : id));
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={theme.cadastroAction} />}
    >
      <PageHeader title="Config. Suporte" subtitle="Abra só o que for editar." />
      <DigisacBoasVindasConfig aberto={painel === 'digisac'} onPress={() => alternar('digisac')} />
      <MensagensProntasConfig aberto={painel === 'prontas'} onPress={() => alternar('prontas')} />
      <AlertaContatoConfig aberto={painel === 'alerta'} onPress={() => alternar('alerta')} />
      <PainelConfig
        titulo="Vídeos de suporte"
        resumo={q.isLoading ? 'Carregando…' : videos.length === 1 ? '1 vídeo' : `${videos.length} vídeos`}
        aberto={painel === 'videos'}
        onPress={() => alternar('videos')}
      >
        <View style={{ gap: 12, marginTop: 12 }}>
          {podeGerenciar ? (
            <>
              <FormField label="Título" required>
                <FormInput value={titulo} onChangeText={setTitulo} placeholder="Ex.: Como emitir NF-e de venda" />
              </FormField>
              <FormField label="Link do YouTube" required helper="Cole a URL completa do vídeo.">
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
            </>
          ) : (
            <Text style={{ color: theme.textMuted }}>Seu perfil só pode visualizar os vídeos cadastrados.</Text>
          )}
          {q.isLoading ? <Text style={{ color: theme.textMuted }}>Carregando vídeos…</Text> : null}
          {q.error ? <Text style={{ color: theme.error }}>{(q.error as Error).message}</Text> : null}
          {!q.isLoading && !q.error && videos.length === 0 ? (
            <Text style={{ color: theme.textMuted }}>Nenhum vídeo cadastrado ainda.</Text>
          ) : null}
          {videos.map((item) => (
            <SuporteVideoCard
              key={item.id}
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
          ))}
        </View>
      </PainelConfig>
    </ScrollView>
  );
}
