import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { FormSelect } from '@/components/ui/FormSelect';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { Text } from '@/components/Themed';
import { METODO360_CRITERIOS } from '@/src/constants/metodo360-criterios';
import { METODO360_TELAS_ERP } from '@/src/constants/metodo360-telas';
import { useTheme } from '@/src/contexts/ThemeContext';
import type { Metodo360ChecklistItemRow, SuporteVideoRow } from '@/src/types/azoup';

type Props = {
  item: Metodo360ChecklistItemRow;
  videos: SuporteVideoRow[];
  podeGerenciar: boolean;
  onSalvar: (patch: {
    nome: string;
    tela_referencia: string | null;
    criterio_verificacao: string | null;
    suporte_video_id: string | null;
  }) => Promise<void>;
  onDesativar: () => Promise<void>;
  onReativar: () => Promise<void>;
  onMover: (direcao: 'up' | 'down') => Promise<void>;
  salvando?: boolean;
  removendo?: boolean;
};

export function Metodo360ChecklistItemCard({
  item,
  videos,
  podeGerenciar,
  onSalvar,
  onDesativar,
  onReativar,
  onMover,
  salvando,
  removendo,
}: Props) {
  const { theme } = useTheme();
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(item.nome);
  const [tela, setTela] = useState(item.tela_referencia ?? '');
  const [criterio, setCriterio] = useState(item.criterio_verificacao ?? '');
  const [videoId, setVideoId] = useState<string | null>(item.suporte_video_id ?? null);
  const [erro, setErro] = useState<string | null>(null);

  const videoOpcoes = useMemo(
    () => [
      { id: '', label: 'Sem vídeo' },
      ...videos.filter((v) => v.ativo !== false).map((v) => ({ id: v.id, label: v.titulo })),
    ],
    [videos],
  );

  const videoVinculado = item.suporte_videos;
  const inativo = item.ativo === false;

  const resetForm = () => {
    setNome(item.nome);
    setTela(item.tela_referencia ?? '');
    setCriterio(item.criterio_verificacao ?? '');
    setVideoId(item.suporte_video_id ?? null);
    setErro(null);
  };

  const salvar = async () => {
    setErro(null);
    try {
      await onSalvar({
        nome,
        tela_referencia: tela.trim() || null,
        criterio_verificacao: criterio.trim() || null,
        suporte_video_id: videoId || null,
      });
      setEditando(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar item');
    }
  };

  return (
    <ScreenCard style={{ gap: 8, opacity: inativo ? 0.65 : 1 }}>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.titleRow}>
            <Text style={{ fontWeight: '800', color: theme.headerText, flex: 1 }}>{item.nome}</Text>
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>Ordem {item.ordem}</Text>
          </View>
          {inativo ? (
            <Text style={{ color: theme.warning, fontSize: 12, fontWeight: '700' }}>Desativado</Text>
          ) : null}
          {!editando ? (
            <>
              {item.tela_referencia ? (
                <Text style={{ color: theme.textMuted, fontSize: 13 }}>Tela ERP: {item.tela_referencia}</Text>
              ) : null}
              {item.criterio_verificacao ? (
                <Text style={{ color: theme.textMuted, fontSize: 13 }}>Critério: {item.criterio_verificacao}</Text>
              ) : null}
              {videoVinculado ? (
                <Text style={{ color: theme.cadastroAction, fontSize: 13 }}>
                  <FontAwesome name="youtube-play" size={12} /> {videoVinculado.titulo}
                </Text>
              ) : (
                <Text style={{ color: theme.textMuted, fontSize: 13 }}>Sem vídeo vinculado</Text>
              )}
            </>
          ) : null}
        </View>
      </View>

      {editando ? (
        <View style={{ gap: 10 }}>
          <FormField label="Nome" required>
            <FormInput value={nome} onChangeText={setNome} />
          </FormField>
          <FormField label="Tela no ERP">
            <FormSelect
              options={METODO360_TELAS_ERP.map((t) => t.value)}
              labels={Object.fromEntries(METODO360_TELAS_ERP.map((t) => [t.value, t.label]))}
              value={tela}
              onChange={setTela}
              placeholder="Selecione a tela"
            />
          </FormField>
          <FormField label="Critério automático">
            <FormSelect
              options={METODO360_CRITERIOS.map((c) => c.value)}
              labels={Object.fromEntries(METODO360_CRITERIOS.map((c) => [c.value, c.label]))}
              value={criterio}
              onChange={setCriterio}
              placeholder="Critério"
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
          {erro ? <Text style={{ color: theme.error }}>{erro}</Text> : null}
          <View style={styles.rowBtns}>
            <PrimaryButton label={salvando ? 'Salvando…' : 'Salvar'} loading={salvando} onPress={() => void salvar()} />
            <SecondaryButton
              label="Cancelar"
              disabled={salvando}
              onPress={() => {
                resetForm();
                setEditando(false);
              }}
            />
          </View>
        </View>
      ) : null}

      {podeGerenciar ? (
        <View style={styles.acoes}>
          <View style={styles.rowBtns}>
            <SecondaryButton label={editando ? '…' : 'Editar'} disabled={editando || inativo} onPress={() => setEditando(true)} />
            {inativo ? (
              <SecondaryButton label="Reativar" disabled={removendo} onPress={() => void onReativar()} />
            ) : (
              <SecondaryButton
                label={removendo ? 'Removendo…' : 'Remover'}
                disabled={removendo}
                onPress={() => void onDesativar()}
              />
            )}
          </View>
          {!inativo ? (
            <View style={styles.ordemRow}>
              <Pressable onPress={() => void onMover('up')} style={styles.ordemBtn}>
                <FontAwesome name="arrow-up" size={14} color={theme.cadastroAction} />
              </Pressable>
              <Pressable onPress={() => void onMover('down')} style={styles.ordemBtn}>
                <FontAwesome name="arrow-down" size={14} color={theme.cadastroAction} />
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
    </ScreenCard>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  acoes: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  ordemRow: { flexDirection: 'row', gap: 6 },
  ordemBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
