import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

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
import {
  resolverIntervaloPeriodo,
  type PeriodoFiltroPreset,
} from '@/src/utils/clientes-filtro';
import { dataCalendarioBrasil, formatDateTimeBR, formatYmdBR } from '@/src/utils/format';

const TODAS = '__todas__';

const PERIODOS = ['mes_atual', 'mes_passado', '7d', '30d', 'hoje', 'todos'] as const satisfies readonly PeriodoFiltroPreset[];

const PERIODO_LABELS: Record<(typeof PERIODOS)[number], string> = {
  mes_atual: 'Este mês',
  mes_passado: 'Mês passado',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  hoje: 'Hoje',
  todos: 'Todo o histórico',
};

function bullets(texto: string | null | undefined): string[] {
  return `${texto ?? ''}`
    .split(/\n+/)
    .map((linha) => linha.replace(/^[•\-\*]\s*/, '').trim())
    .filter(Boolean);
}

export default function NotasAtualizacaoScreen() {
  const { theme } = useTheme();
  const { canAccessScreen } = useAdminAuth();
  const qc = useQueryClient();
  const pode = canAccessScreen('notas_atualizacao') || canAccessScreen('kanban_confec');
  const [busca, setBusca] = useState('');
  const [secao, setSecao] = useState<string>(TODAS);
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]>('mes_atual');
  const [detalhe, setDetalhe] = useState<ConfecCard | null>(null);
  const [editando, setEditando] = useState(false);
  const [editLinha, setEditLinha] = useState('');
  const [editDetalhe, setEditDetalhe] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const fecharDetalhe = () => {
    setDetalhe(null);
    setEditando(false);
    setErro(null);
  };

  const q = useQuery({
    queryKey: ['confec_notas_publicadas'],
    queryFn: listarNotasPublicadasConfec,
    enabled: pode,
  });

  const intervalo = useMemo(
    () =>
      resolverIntervaloPeriodo({
        busca: '',
        status: 'todos',
        periodoPreset: periodo,
        dataInicio: null,
        dataFim: null,
      }),
    [periodo],
  );

  const filtradas = useMemo(() => {
    const texto = busca.trim().toLowerCase();
    return (q.data ?? []).filter((card) => {
      const dia = dataCalendarioBrasil(card.completed_at) ?? '';
      if (intervalo) {
        if (dia < intervalo.inicio || dia > intervalo.fim) return false;
      }
      if (secao !== TODAS && card.secao !== secao) return false;
      if (!texto) return true;
      const blob = `${card.nota_linha ?? ''} ${card.nota_detalhe ?? ''} ${card.tela ?? ''} ${card.title} ${card.secao ?? ''}`.toLowerCase();
      return blob.includes(texto);
    });
  }, [q.data, busca, secao, intervalo]);

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
      setEditando(false);
      setDetalhe((atual) =>
        atual ? { ...atual, nota_linha: editLinha.trim(), nota_detalhe: editDetalhe.trim() } : null,
      );
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
        setDetalhe((atual) =>
          atual
            ? {
                ...atual,
                nota_linha: nota.linha,
                nota_detalhe: nota.detalhe,
                nota_gerada_em: nota.nota_gerada_em ?? atual.nota_gerada_em,
              }
            : null,
        );
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
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.documento}>
          <PageHeader
            title="Notas de atualização"
            subtitle="Changelog do Confec — o que foi publicado a partir dos tickets finalizados."
          />

          <View style={[styles.filtros, { borderColor: theme.border }]}>
            <View style={styles.filtroBusca}>
              <FormInput value={busca} onChangeText={setBusca} placeholder="Buscar melhoria, tela ou seção" />
            </View>
            <View style={styles.filtroSelect}>
              <FormSelect
                options={[TODAS, ...CONFEC_SECOES]}
                value={secao}
                onChange={setSecao}
                labels={{ [TODAS]: 'Todas as seções' }}
              />
            </View>
            <View style={styles.filtroSelect}>
              <FormSelect options={PERIODOS} value={periodo} onChange={setPeriodo} labels={PERIODO_LABELS} />
            </View>
          </View>

          <View style={styles.resumo}>
            <Text style={{ color: theme.textMuted, fontSize: 13 }}>
              {q.isLoading
                ? 'Carregando…'
                : filtradas.length === 0
                  ? 'Nenhuma atualização neste período'
                  : `${filtradas.length} atualizaç${filtradas.length === 1 ? 'ão' : 'ões'} · ${PERIODO_LABELS[periodo]}`}
            </Text>
          </View>

          {erro && !detalhe ? <Text style={{ color: theme.error }}>{erro}</Text> : null}
          {q.isLoading ? <ActivityIndicator color={theme.cadastroAction} style={{ marginTop: 24 }} /> : null}
          {q.error ? <Text style={{ color: theme.error }}>{(q.error as Error).message}</Text> : null}

          {!q.isLoading && filtradas.length === 0 ? (
            <View style={[styles.vazio, { borderColor: theme.border }]}>
              <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 16 }}>Sem novidades publicadas</Text>
              <Text style={{ color: theme.textMuted, lineHeight: 20 }}>
                Quando um ticket for concluído em Finalizados com seção e tela, a nota aparece aqui.
              </Text>
            </View>
          ) : null}

          {porSecao.map(([nomeSecao, cards]) => (
            <View key={nomeSecao} style={styles.secaoBloco}>
              <View style={styles.secaoCabecalho}>
                <Text style={[styles.secaoTitulo, { color: theme.headerText }]}>{nomeSecao}</Text>
                <View style={[styles.secaoLinha, { backgroundColor: theme.border }]} />
                <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700' }}>{cards.length}</Text>
              </View>

              <View>
                {cards.map((card, indice) => (
                  <Pressable
                    key={card.id}
                    onPress={() => {
                      setDetalhe(card);
                      setEditando(false);
                      setEditLinha(card.nota_linha ?? '');
                      setEditDetalhe(card.nota_detalhe ?? '');
                      setErro(null);
                    }}
                    style={({ pressed }) => [
                      styles.entrada,
                      {
                        borderBottomColor: theme.border,
                        borderBottomWidth: indice === cards.length - 1 ? 0 : StyleSheet.hairlineWidth,
                        opacity: pressed ? 0.72 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.entradaData, { color: theme.textMuted }]}>
                      {formatYmdBR(dataCalendarioBrasil(card.completed_at))}
                    </Text>
                    <View style={styles.entradaCorpo}>
                      <Text style={[styles.entradaTitulo, { color: theme.headerText }]}>
                        {card.nota_linha || card.title}
                      </Text>
                      {bullets(card.nota_detalhe)
                        .slice(0, 3)
                        .map((linha) => (
                          <Text key={linha} style={[styles.bullet, { color: theme.text }]}>
                            • {linha}
                          </Text>
                        ))}
                      <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
                        {card.tela || 'Sem tela'}
                        {card.tela_nova ? ' · tela nova' : ''} · #{numeroTicket(card.ticket_number)}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <Modal visible={detalhe != null} animationType="fade" transparent onRequestClose={fecharDetalhe}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={fecharDetalhe} />
          {detalhe ? (
            <ScrollView style={styles.modal} keyboardShouldPersistTaps="handled">
              <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 }}>
                  {detalhe.secao || 'Sem seção'} · {formatDateTimeBR(detalhe.completed_at)}
                </Text>
                <Text style={{ color: theme.headerText, fontWeight: '900', fontSize: 20, lineHeight: 26 }}>
                  {detalhe.nota_linha || detalhe.title}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                  {detalhe.tela || 'Sem tela'}
                  {detalhe.tela_nova ? ' · tela nova' : ''} · #{numeroTicket(detalhe.ticket_number)}
                </Text>

                {editando ? (
                  <>
                    <FormField label="Linha da nota">
                      <FormInput value={editLinha} onChangeText={setEditLinha} multiline style={styles.areaCurta} />
                    </FormField>
                    <FormField label="Detalhe">
                      <FormInput value={editDetalhe} onChangeText={setEditDetalhe} multiline style={styles.area} />
                    </FormField>
                  </>
                ) : (
                  <View style={{ gap: 8, marginTop: 4 }}>
                    {bullets(detalhe.nota_detalhe).length > 0 ? (
                      bullets(detalhe.nota_detalhe).map((linha) => (
                        <Text key={linha} style={{ color: theme.text, fontSize: 15, lineHeight: 22 }}>
                          • {linha}
                        </Text>
                      ))
                    ) : (
                      <Text style={{ color: theme.textMuted }}>Sem detalhe publicado.</Text>
                    )}
                  </View>
                )}

                {erro ? <Text style={{ color: theme.error }}>{erro}</Text> : null}

                {editando ? (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
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
                ) : (
                  <PrimaryButton compact label="Editar" onPress={() => setEditando(true)} style={{ marginTop: 4 }} />
                )}
              </View>
            </ScrollView>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48, alignItems: 'center' },
  documento: { width: '100%', maxWidth: 820, gap: 8 },
  filtros: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filtroBusca: { flex: 1.6, minWidth: 200 },
  filtroSelect: { width: 190, minWidth: 160 },
  resumo: { paddingTop: 4, paddingBottom: 8 },
  vazio: {
    marginTop: 12,
    paddingVertical: 28,
    paddingHorizontal: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  secaoBloco: { marginTop: 18, gap: 4 },
  secaoCabecalho: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  secaoTitulo: { fontSize: 13, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
  secaoLinha: { flex: 1, height: StyleSheet.hairlineWidth },
  entrada: { flexDirection: 'row', gap: 16, paddingVertical: 16, alignItems: 'flex-start' },
  entradaData: { width: 96, fontSize: 12, fontWeight: '700', paddingTop: 3 },
  entradaCorpo: { flex: 1, gap: 3, minWidth: 0 },
  entradaTitulo: { fontSize: 16, fontWeight: '800', lineHeight: 22 },
  bullet: { fontSize: 13, lineHeight: 19, opacity: 0.92 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modal: { width: '100%', maxWidth: 560, maxHeight: '90%' },
  modalCard: { borderWidth: 1, borderRadius: 16, padding: 20, gap: 10 },
  areaCurta: { minHeight: 64, height: 64, textAlignVertical: 'top', paddingTop: 10 },
  area: { minHeight: 140, height: 140, textAlignVertical: 'top', paddingTop: 10 },
});
