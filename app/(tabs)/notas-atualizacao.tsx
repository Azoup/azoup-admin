import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { FormDateInput } from '@/components/ui/FormDateInput';
import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { FormSelect } from '@/components/ui/FormSelect';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Text } from '@/components/Themed';
import { CONFEC_SECOES, type ConfecSecao } from '@/src/constants/confec-notas';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import { gerarESalvarNotaConfec } from '@/src/services/confec-notas-api';
import {
  atualizarNotaPublicadaConfec,
  listarNotasPublicadasConfec,
  numeroTicket,
  type ConfecCard,
} from '@/src/services/repos/confec-kanban-repo';
import { dataCalendarioBrasil, dataHojeBrasil, formatDateTimeBR, formatYmdBR } from '@/src/utils/format';

const TODAS = '__todas__';

export default function NotasAtualizacaoScreen() {
  const { theme } = useTheme();
  const { canAccessScreen } = useAdminAuth();
  const qc = useQueryClient();
  const pode = canAccessScreen('notas_atualizacao') || canAccessScreen('kanban_confec');
  const [busca, setBusca] = useState('');
  const [secao, setSecao] = useState<string>(TODAS);
  const [de, setDe] = useState(`${dataHojeBrasil().slice(0, 7)}-01`);
  const [ate, setAte] = useState(dataHojeBrasil());
  const [detalhe, setDetalhe] = useState<ConfecCard | null>(null);
  const [editLinha, setEditLinha] = useState('');
  const [editDetalhe, setEditDetalhe] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['confec_notas_publicadas'],
    queryFn: listarNotasPublicadasConfec,
    enabled: pode,
  });

  const filtradas = useMemo(() => {
    const texto = busca.trim().toLowerCase();
    return (q.data ?? []).filter((card) => {
      const dia = dataCalendarioBrasil(card.completed_at) ?? '';
      if (de && dia < de) return false;
      if (ate && dia > ate) return false;
      if (secao !== TODAS && card.secao !== secao) return false;
      if (!texto) return true;
      const blob = `${card.nota_linha ?? ''} ${card.nota_detalhe ?? ''} ${card.tela ?? ''} ${card.title} ${card.secao ?? ''}`.toLowerCase();
      return blob.includes(texto);
    });
  }, [q.data, busca, secao, de, ate]);

  const porSecao = useMemo(() => {
    const map = new Map<string, ConfecCard[]>();
    for (const card of filtradas) {
      const chave = card.secao || 'Outros';
      const lista = map.get(chave) ?? [];
      lista.push(card);
      map.set(chave, lista);
    }
    const ordem = [...CONFEC_SECOES];
    return [...map.entries()].sort((a, b) => {
      const ia = ordem.indexOf(a[0] as ConfecSecao);
      const ib = ordem.indexOf(b[0] as ConfecSecao);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a[0].localeCompare(b[0], 'pt-BR');
    });
  }, [filtradas]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!detalhe) return;
      await atualizarNotaPublicadaConfec({
        id: detalhe.id,
        notaLinha: editLinha,
        notaDetalhe: editDetalhe,
      });
    },
    onSuccess: () => {
      setErro(null);
      setDetalhe(null);
      void qc.invalidateQueries({ queryKey: ['confec_notas_publicadas'] });
      void qc.invalidateQueries({ queryKey: ['confec_kanban'] });
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao salvar a nota'),
  });

  const regenerar = useMutation({
    mutationFn: async () => {
      if (!detalhe) return;
      return gerarESalvarNotaConfec({
        cardId: detalhe.id,
        secao: detalhe.secao ?? undefined,
        tela: detalhe.tela ?? undefined,
        telaNova: detalhe.tela_nova,
      });
    },
    onSuccess: (nota) => {
      if (nota) {
        setEditLinha(nota.linha);
        setEditDetalhe(nota.detalhe);
      }
      setErro(null);
      void qc.invalidateQueries({ queryKey: ['confec_notas_publicadas'] });
      void qc.invalidateQueries({ queryKey: ['confec_kanban'] });
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao regenerar a nota'),
  });

  if (!pode) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: theme.background }}>
        <Text style={{ color: theme.warning, fontWeight: '800' }}>Seu perfil não tem acesso às Notas de atualização.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        <PageHeader
          title="Notas de atualização"
          subtitle="Publicadas a partir dos tickets Finalizados do Kanban Confec. Pensadas para o cliente."
        />
        <View style={styles.barra}>
          <View style={{ flex: 1.4, minWidth: 200 }}>
            <FormInput value={busca} onChangeText={setBusca} placeholder="Buscar na nota, tela ou título" />
          </View>
          <View style={{ width: 180 }}>
            <FormSelect
              options={[TODAS, ...CONFEC_SECOES]}
              value={secao}
              onChange={setSecao}
              labels={{ [TODAS]: 'Todas as seções' }}
            />
          </View>
          <View style={{ width: 150 }}>
            <FormDateInput value={de} onChange={setDe} />
          </View>
          <View style={{ width: 150 }}>
            <FormDateInput value={ate} onChange={setAte} />
          </View>
        </View>
        {erro ? <Text style={{ color: theme.error }}>{erro}</Text> : null}
        {q.isLoading ? <ActivityIndicator color={theme.cadastroAction} /> : null}
        {q.error ? <Text style={{ color: theme.error }}>{(q.error as Error).message}</Text> : null}
        {!q.isLoading && filtradas.length === 0 ? (
          <Text style={{ color: theme.textMuted }}>Nenhuma nota publicada neste período.</Text>
        ) : null}
        {porSecao.map(([nomeSecao, cards]) => (
          <View key={nomeSecao} style={{ gap: 8 }}>
            <Text style={{ color: theme.headerText, fontWeight: '900', fontSize: 16 }}>{nomeSecao}</Text>
            {cards.map((card) => (
              <Pressable
                key={card.id}
                onPress={() => {
                  setDetalhe(card);
                  setEditLinha(card.nota_linha ?? '');
                  setEditDetalhe(card.nota_detalhe ?? '');
                  setErro(null);
                }}
                style={({ pressed }) => [
                  styles.item,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}
              >
                <View style={styles.itemTopo}>
                  <Text style={{ color: theme.textMuted, fontWeight: '700', fontSize: 12 }}>
                    {formatYmdBR(dataCalendarioBrasil(card.completed_at))}
                  </Text>
                  <View
                    style={[
                      styles.chipTela,
                      {
                        borderColor: card.tela_nova ? theme.cadastroAction : theme.border,
                        backgroundColor: card.tela_nova ? `${theme.cadastroAction}22` : theme.surfaceMuted,
                      },
                    ]}
                  >
                    <Text style={{ color: card.tela_nova ? theme.cadastroAction : theme.textMuted, fontWeight: '800', fontSize: 11 }}>
                      {card.tela_nova ? 'Nova · ' : ''}
                      {card.tela || 'Sem tela'}
                    </Text>
                  </View>
                </View>
                <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 15, lineHeight: 21 }}>
                  {card.nota_linha || card.title}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                  #{numeroTicket(card.ticket_number)} · toque para ver detalhes
                </Text>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>

      <Modal visible={detalhe != null} animationType="fade" transparent onRequestClose={() => setDetalhe(null)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setDetalhe(null)} />
          {detalhe ? (
            <ScrollView style={styles.modal} keyboardShouldPersistTaps="handled">
              <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={{ color: theme.headerText, fontWeight: '900', fontSize: 18 }}>
                  #{numeroTicket(detalhe.ticket_number)} {detalhe.title}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                  {detalhe.secao || 'Sem seção'} · {detalhe.tela || 'Sem tela'}
                  {detalhe.tela_nova ? ' (tela nova)' : ''} · {formatDateTimeBR(detalhe.completed_at)}
                </Text>
                <FormField label="Linha da nota">
                  <FormInput value={editLinha} onChangeText={setEditLinha} multiline style={styles.areaCurta} />
                </FormField>
                <FormField label="Detalhe">
                  <FormInput value={editDetalhe} onChangeText={setEditDetalhe} multiline style={styles.area} />
                </FormField>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                  Origem no Kanban — problema: {detalhe.description || '—'}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>Solução DEV: {detalhe.dev_notes || '—'}</Text>
                {erro ? <Text style={{ color: theme.error }}>{erro}</Text> : null}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <PrimaryButton
                    compact
                    label={salvar.isPending ? 'Salvando…' : 'Salvar'}
                    loading={salvar.isPending}
                    style={{ flex: 1 }}
                    onPress={() => salvar.mutate()}
                  />
                  <PrimaryButton
                    compact
                    label={regenerar.isPending ? 'Gerando…' : 'Regenerar IA'}
                    loading={regenerar.isPending}
                    style={{ flex: 1 }}
                    onPress={() => regenerar.mutate()}
                  />
                </View>
              </View>
            </ScrollView>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  barra: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  item: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  itemTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  chipTela: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modal: { width: '100%', maxWidth: 560, maxHeight: '90%' },
  modalCard: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  areaCurta: { minHeight: 64, height: 64, textAlignVertical: 'top', paddingTop: 10 },
  area: { minHeight: 140, height: 140, textAlignVertical: 'top', paddingTop: 10 },
});
