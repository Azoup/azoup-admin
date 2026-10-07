import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ClienteSearchPicker } from '@/components/ui/ClienteSearchPicker';
import { DescricaoAgenda } from '@/components/ui/DescricaoAgenda';
import { FormDateInput } from '@/components/ui/FormDateInput';
import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { FormTimeInput } from '@/components/ui/FormTimeInput';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Text } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import {
  atualizarEventoGoogle,
  criarEventoGoogle,
  definirCalendarioGoogle,
  desconectarGoogle,
  desvincularClienteEvento,
  excluirEventoGoogle,
  iniciarOAuthGoogle,
  listarCalendariosGoogle,
  sincronizarGoogleAgenda,
  statusConexaoGoogle,
  vincularClienteEvento,
  type GoogleAgendaEvento,
} from '@/src/services/google-calendar-api';
import { listarClientesParaSelecao } from '@/src/services/repos/conversas-repo';
import { listarEventosAgendaCache, listarEventosSemCliente } from '@/src/services/repos/google-agendamentos-repo';
import type { ClienteAzoupRow } from '@/src/types/azoup';
import { descricaoTemHtml } from '@/src/utils/agenda-html';
import { dataCalendarioBrasil, dataHojeBrasil, formatDateTimeBR, formatYmdBR, somarDiasYmd } from '@/src/utils/format';

const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function ymdFromParts(y: number, m0: number, d: number): string {
  return `${y}-${`${m0 + 1}`.padStart(2, '0')}-${`${d}`.padStart(2, '0')}`;
}

function parseYmd(ymd: string): { y: number; m0: number; d: number } {
  const [y, m, d] = ymd.split('-').map(Number);
  return { y, m0: m - 1, d };
}

function diasNoMes(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

function primeiroDiaSemana(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0, 1)).getUTCDay();
}

function deslocarMes(y: number, m0: number, delta: number): { y: number; m0: number } {
  const d = new Date(Date.UTC(y, m0 + delta, 1));
  return { y: d.getUTCFullYear(), m0: d.getUTCMonth() };
}

/** Seis meses para trás e para frente, para a troca de mês não buscar de novo. */
function janelaEmTorno(y: number, m0: number): { inicio: string; fim: string } {
  const ini = deslocarMes(y, m0, -6);
  const fim = deslocarMes(y, m0, 6);
  const inicioYmd = ymdFromParts(ini.y, ini.m0, 1);
  const fimYmd = ymdFromParts(fim.y, fim.m0, diasNoMes(fim.y, fim.m0));
  return {
    inicio: `${inicioYmd}T00:00:00-03:00`,
    fim: `${somarDiasYmd(fimYmd, 1)}T00:00:00-03:00`,
  };
}

function isoLocalFromYmdHora(ymd: string, hora: string): string {
  const h = /^\d{2}:\d{2}/.test(hora) ? `${hora.slice(0, 5)}:00` : '09:00:00';
  return `${ymd}T${h}-03:00`;
}

function horaDeIso(iso?: string | null): string {
  if (!iso) return '09:00';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(iso));
  } catch {
    return '09:00';
  }
}

function EventoModal({
  visible,
  evento,
  onClose,
  onSaved,
}: {
  visible: boolean;
  evento: GoogleAgendaEvento | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { theme } = useTheme();
  const editando = Boolean(evento);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [data, setData] = useState(dataHojeBrasil);
  const [horaInicio, setHoraInicio] = useState('09:00');
  const [horaFim, setHoraFim] = useState('10:00');
  const [emails, setEmails] = useState('');
  const [cliente, setCliente] = useState<ClienteAzoupRow | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const clientesQ = useQuery({
    queryKey: ['clientes_para_selecao'],
    queryFn: listarClientesParaSelecao,
    enabled: visible,
  });

  useEffect(() => {
    if (!visible) return;
    setErro(null);
    if (evento) {
      setTitulo(evento.titulo ?? '');
      setDescricao(evento.descricao ?? '');
      setData(dataCalendarioBrasil(evento.inicio) ?? dataHojeBrasil());
      setHoraInicio(horaDeIso(evento.inicio));
      setHoraFim(horaDeIso(evento.fim));
      setEmails((evento.participantes ?? []).map((p) => p.email).filter(Boolean).join(', '));
      const c = evento.cliente;
      setCliente(c ? ({ id: c.id, nome: c.nome ?? '', email: c.email ?? null } as ClienteAzoupRow) : null);
      return;
    }
    setTitulo('');
    setDescricao('');
    setData(dataHojeBrasil());
    setHoraInicio('09:00');
    setHoraFim('10:00');
    setEmails('');
    setCliente(null);
  }, [visible, evento]);

  const salvar = useMutation({
    mutationFn: async () => {
      const participantes = emails
        .split(/[,;\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes('@'));
      const inicio = isoLocalFromYmdHora(data, horaInicio);
      const fim = isoLocalFromYmdHora(data, horaFim);
      if (editando && evento) {
        return atualizarEventoGoogle({
          google_event_id: evento.google_event_id,
          titulo,
          descricao,
          inicio,
          fim,
          participantes,
          cliente_id: cliente?.id ?? null,
        });
      }
      return criarEventoGoogle({
        titulo,
        descricao,
        inicio,
        fim,
        participantes,
        cliente_id: cliente?.id ?? null,
      });
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao salvar'),
  });

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <ScrollView
          style={{ width: '100%', maxWidth: 520, maxHeight: '90%', zIndex: 2 }}
          contentContainerStyle={{ flexGrow: 0 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 18 }}>
              {editando ? 'Editar agendamento' : 'Novo agendamento'}
            </Text>
            <FormField label="Título" required>
              <FormInput value={titulo} onChangeText={setTitulo} />
            </FormField>
            <FormField label="Data" required>
              <FormDateInput value={data} onChange={setData} />
            </FormField>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <FormField label="Início" required>
                  <FormTimeInput value={horaInicio} onChange={setHoraInicio} />
                </FormField>
              </View>
              <View style={{ flex: 1 }}>
                <FormField label="Fim" required>
                  <FormTimeInput value={horaFim} onChange={setHoraFim} />
                </FormField>
              </View>
            </View>
            <FormField label="Participantes (e-mails)">
              <FormInput
                value={emails}
                onChangeText={setEmails}
                placeholder="cliente@email.com, outro@email.com"
              />
            </FormField>
            <FormField label="Descrição">
              {descricaoTemHtml(descricao) ? (
                <DescricaoAgenda html={descricao} color={theme.text} muted={theme.textMuted} link={theme.cadastroAction} />
              ) : (
                <FormInput value={descricao} onChangeText={setDescricao} multiline style={{ minHeight: 80 }} />
              )}
            </FormField>
            <FormField label="Cliente Azoup">
              <ClienteSearchPicker
                todosClientes={clientesQ.data ?? []}
                value={cliente}
                onChange={setCliente}
                loading={clientesQ.isLoading}
              />
            </FormField>
            {erro ? <Text style={{ color: theme.error, fontWeight: '700' }}>{erro}</Text> : null}
            <PrimaryButton
              label={editando ? 'Salvar' : 'Criar no Google Agenda'}
              loading={salvar.isPending}
              onPress={() => salvar.mutate()}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function AgendamentosScreen() {
  const { theme } = useTheme();
  const { canAccessScreen, papel } = useAdminAuth();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ gcal?: string; gcal_error?: string }>();
  const isOwner = papel === 'owner';

  const hoje = dataHojeBrasil();
  const [mesRef, setMesRef] = useState(() => {
    const { y, m0 } = parseYmd(hoje);
    return { y, m0 };
  });
  const [diaSelecionado, setDiaSelecionado] = useState(hoje);
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<GoogleAgendaEvento | null>(null);
  const [vincularEvento, setVincularEvento] = useState<GoogleAgendaEvento | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [janela, setJanela] = useState(() => janelaEmTorno(mesRef.y, mesRef.m0));
  const [atualizando, setAtualizando] = useState(false);
  const syncPedido = useRef(new Set<string>());
  const syncGeracao = useRef(0);

  useEffect(() => {
    const precisa = janelaEmTorno(mesRef.y, mesRef.m0);
    setJanela((atual) => {
      if (precisa.inicio >= atual.inicio && precisa.fim <= atual.fim) return atual;
      return {
        inicio: precisa.inicio < atual.inicio ? precisa.inicio : atual.inicio,
        fim: precisa.fim > atual.fim ? precisa.fim : atual.fim,
      };
    });
  }, [mesRef]);

  const statusQ = useQuery({
    queryKey: ['google_calendar_status'],
    queryFn: statusConexaoGoogle,
    enabled: canAccessScreen('agendamentos'),
  });

  const eventosQ = useQuery({
    queryKey: ['google_calendar_eventos', janela.inicio, janela.fim, statusQ.data?.calendar_id ?? ''],
    queryFn: () => listarEventosAgendaCache(janela.inicio, janela.fim, statusQ.data?.calendar_id),
    enabled: canAccessScreen('agendamentos') && Boolean(statusQ.data?.connected),
    placeholderData: (anterior) => anterior,
    staleTime: 60_000,
  });

  const semClienteQ = useQuery({
    queryKey: ['google_eventos_sem_cliente'],
    queryFn: listarEventosSemCliente,
    enabled: canAccessScreen('agendamentos') && Boolean(statusQ.data?.connected),
  });

  useEffect(() => {
    if (!statusQ.data?.connected) return;
    const chave = `${janela.inicio}|${janela.fim}|${statusQ.data.calendar_id ?? ''}`;
    if (syncPedido.current.has(chave)) return;
    syncPedido.current.add(chave);
    const geracao = ++syncGeracao.current;
    setAtualizando(true);
    void sincronizarGoogleAgenda({ inicio: janela.inicio, fim: janela.fim })
      .then(() => {
        void qc.invalidateQueries({ queryKey: ['google_calendar_eventos'] });
        void qc.invalidateQueries({ queryKey: ['google_eventos_sem_cliente'] });
        void qc.invalidateQueries({ queryKey: ['google_proximas_reunioes'] });
      })
      .catch((e) => {
        syncPedido.current.delete(chave);
        setMsg(e instanceof Error ? e.message : 'Erro ao atualizar a agenda');
      })
      .finally(() => {
        if (syncGeracao.current === geracao) setAtualizando(false);
      });
  }, [statusQ.data?.connected, statusQ.data?.calendar_id, janela.inicio, janela.fim, qc]);

  const calendariosQ = useQuery({
    queryKey: ['google_calendar_list'],
    queryFn: listarCalendariosGoogle,
    enabled: canAccessScreen('agendamentos') && Boolean(statusQ.data?.connected) && isOwner,
  });

  useEffect(() => {
    if (params.gcal === 'connected') {
      setMsg('Google Agenda conectada.');
      void qc.invalidateQueries({ queryKey: ['google_calendar_status'] });
    }
    if (params.gcal_error) setMsg(`Erro OAuth: ${params.gcal_error}`);
  }, [params.gcal, params.gcal_error, qc]);

  const porDia = useMemo(() => {
    const map = new Map<string, GoogleAgendaEvento[]>();
    for (const ev of eventosQ.data ?? []) {
      const ymd = dataCalendarioBrasil(ev.inicio);
      if (!ymd) continue;
      const list = map.get(ymd) ?? [];
      list.push(ev);
      map.set(ymd, list);
    }
    return map;
  }, [eventosQ.data]);

  const doDia = porDia.get(diaSelecionado) ?? [];

  const conectar = useMutation({
    mutationFn: iniciarOAuthGoogle,
    onSuccess: ({ url }) => {
      if (typeof window !== 'undefined') window.location.href = url;
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : 'Erro ao conectar'),
  });

  const sync = useMutation({
    mutationFn: () => sincronizarGoogleAgenda(janela),
    onSuccess: (r) => {
      setMsg(`Sincronizado: ${r.synced} evento(s).`);
      void qc.invalidateQueries({ queryKey: ['google_calendar_eventos'] });
      void qc.invalidateQueries({ queryKey: ['google_eventos_sem_cliente'] });
      void qc.invalidateQueries({ queryKey: ['google_proximas_reunioes'] });
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : 'Erro ao sincronizar'),
  });

  const desconectar = useMutation({
    mutationFn: desconectarGoogle,
    onSuccess: () => {
      setMsg('Agenda desconectada.');
      void qc.invalidateQueries({ queryKey: ['google_calendar'] });
      void qc.invalidateQueries({ queryKey: ['google_calendar_status'] });
      void qc.invalidateQueries({ queryKey: ['google_calendar_eventos'] });
    },
  });

  const excluir = useMutation({
    mutationFn: excluirEventoGoogle,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['google_calendar_eventos'] });
      void qc.invalidateQueries({ queryKey: ['google_eventos_sem_cliente'] });
      void qc.invalidateQueries({ queryKey: ['google_proximas_reunioes'] });
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : 'Erro ao excluir'),
  });

  const clientesQ = useQuery({
    queryKey: ['clientes_para_selecao'],
    queryFn: listarClientesParaSelecao,
    enabled: Boolean(vincularEvento),
  });

  const [clienteVinculo, setClienteVinculo] = useState<ClienteAzoupRow | null>(null);
  const vincular = useMutation({
    mutationFn: async () => {
      if (!vincularEvento || !clienteVinculo) throw new Error('Selecione o cliente');
      return vincularClienteEvento(vincularEvento.id, clienteVinculo.id);
    },
    onSuccess: () => {
      setVincularEvento(null);
      setClienteVinculo(null);
      void qc.invalidateQueries({ queryKey: ['google_calendar_eventos'] });
      void qc.invalidateQueries({ queryKey: ['google_eventos_sem_cliente'] });
      void qc.invalidateQueries({ queryKey: ['google_proximas_reunioes'] });
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : 'Erro ao vincular'),
  });

  const celulas = useMemo(() => {
    const total = diasNoMes(mesRef.y, mesRef.m0);
    const offset = primeiroDiaSemana(mesRef.y, mesRef.m0);
    const cells: Array<{ ymd: string | null }> = [];
    for (let i = 0; i < offset; i++) cells.push({ ymd: null });
    for (let d = 1; d <= total; d++) cells.push({ ymd: ymdFromParts(mesRef.y, mesRef.m0, d) });
    while (cells.length % 7 !== 0) cells.push({ ymd: null });
    return cells;
  }, [mesRef]);

  const tituloMes = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(mesRef.y, mesRef.m0, 1)));

  if (!canAccessScreen('agendamentos')) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: theme.background }}>
        <Text style={{ color: theme.warning, fontWeight: '800' }}>Sem acesso a Agendamentos.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        <PageHeader
          title="Agendamentos"
          subtitle="Agenda Google da empresa — sincronizada com o painel"
          trailing={
            statusQ.data?.connected ? (
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Pressable
                  onPress={() => sync.mutate()}
                  style={({ pressed }) => [
                    styles.btnSec,
                    { borderColor: theme.cadastroAction, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Text style={{ color: theme.cadastroAction, fontWeight: '800', fontSize: 12 }}>
                    {sync.isPending ? 'Sincronizando…' : 'Sincronizar'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setEditando(null);
                    setFormAberto(true);
                  }}
                  style={({ pressed }) => [
                    styles.btnPri,
                    { backgroundColor: theme.cadastroAction, opacity: pressed ? 0.88 : 1 },
                  ]}
                >
                  <Text style={{ color: theme.cadastroActionText, fontWeight: '800', fontSize: 12 }}>Novo</Text>
                </Pressable>
              </View>
            ) : null
          }
        />

        {msg ? <Text style={{ color: theme.cadastroAction, fontWeight: '700' }}>{msg}</Text> : null}

        {statusQ.isLoading ? (
          <ActivityIndicator color={theme.cadastroAction} />
        ) : !statusQ.data?.connected ? (
          <ScreenCard style={{ gap: 10 }}>
            <SectionTitle>Conectar Google Agenda</SectionTitle>
            <Text style={{ color: theme.textMuted, fontSize: 13 }}>
              Use a conta Google da empresa. Só o perfil owner pode conectar.
            </Text>
            {isOwner ? (
              <PrimaryButton
                label={conectar.isPending ? 'Abrindo Google…' : 'Conectar Google'}
                loading={conectar.isPending}
                onPress={() => conectar.mutate()}
              />
            ) : (
              <Text style={{ color: theme.warning, fontWeight: '700' }}>Peça ao owner para conectar a agenda.</Text>
            )}
          </ScreenCard>
        ) : (
          <>
            <ScreenCard style={{ gap: 8 }}>
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                Conta: <Text style={{ fontWeight: '800', color: theme.headerText }}>{statusQ.data.google_account_email}</Text>
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                Agenda:{' '}
                <Text style={{ fontWeight: '800', color: theme.headerText }}>
                  {statusQ.data.calendar_summary || statusQ.data.calendar_id}
                </Text>
              </Text>
              {isOwner && (calendariosQ.data?.calendars?.length ?? 0) > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {(calendariosQ.data?.calendars ?? []).map((c) => {
                    const ativo = c.id === statusQ.data?.calendar_id;
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() =>
                          definirCalendarioGoogle(c.id).then(() => {
                            void qc.invalidateQueries({ queryKey: ['google_calendar_status'] });
                            void qc.invalidateQueries({ queryKey: ['google_calendar_eventos'] });
                          })
                        }
                        style={[
                          styles.chip,
                          {
                            borderColor: theme.border,
                            backgroundColor: ativo ? theme.cadastroAction : theme.surface,
                          },
                        ]}
                      >
                        <Text style={{ color: ativo ? theme.cadastroActionText : theme.textMuted, fontWeight: '700', fontSize: 12 }}>
                          {c.summary || c.id}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}
              {isOwner ? (
                <Pressable onPress={() => desconectar.mutate()} hitSlop={6}>
                  <Text style={{ color: theme.error, fontWeight: '700', fontSize: 12 }}>Desconectar</Text>
                </Pressable>
              ) : null}
            </ScreenCard>

            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 320, gap: 12 }}>
            <ScreenCard style={{ gap: 10 }}>
              <View style={styles.mesNav}>
                <Pressable
                  onPress={() =>
                    setMesRef((m) => {
                      const d = new Date(Date.UTC(m.y, m.m0 - 1, 1));
                      return { y: d.getUTCFullYear(), m0: d.getUTCMonth() };
                    })
                  }
                  hitSlop={8}
                >
                  <FontAwesome name="chevron-left" size={14} color={theme.textMuted} />
                </Pressable>
                <View style={{ alignItems: 'center', gap: 2 }}>
                  <Text style={{ color: theme.headerText, fontWeight: '800', textTransform: 'capitalize' }}>{tituloMes}</Text>
                  {atualizando || sync.isPending ? (
                    <Text style={{ color: theme.textMuted, fontSize: 11 }}>Atualizando agenda…</Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() =>
                    setMesRef((m) => {
                      const d = new Date(Date.UTC(m.y, m.m0 + 1, 1));
                      return { y: d.getUTCFullYear(), m0: d.getUTCMonth() };
                    })
                  }
                  hitSlop={8}
                >
                  <FontAwesome name="chevron-right" size={14} color={theme.textMuted} />
                </Pressable>
              </View>

              <View style={styles.semanaRow}>
                {SEMANA.map((s) => (
                  <Text key={s} style={[styles.semanaLabel, { color: theme.textMuted }]}>
                    {s}
                  </Text>
                ))}
              </View>

              <View style={styles.grade}>
                {celulas.map((cell, idx) => {
                  if (!cell.ymd) return <View key={`e-${idx}`} style={styles.celula} />;
                  const qtd = porDia.get(cell.ymd)?.length ?? 0;
                  const selecionado = cell.ymd === diaSelecionado;
                  const ehHoje = cell.ymd === hoje;
                  return (
                    <Pressable
                      key={cell.ymd}
                      onPress={() => setDiaSelecionado(cell.ymd!)}
                      style={[
                        styles.celula,
                        {
                          borderColor: selecionado ? theme.cadastroAction : theme.border,
                          backgroundColor: selecionado ? `${theme.cadastroAction}22` : theme.surface,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: ehHoje ? theme.cadastroAction : theme.headerText,
                          fontWeight: ehHoje || selecionado ? '800' : '600',
                          fontSize: 13,
                        }}
                      >
                        {Number(cell.ymd.slice(8, 10))}
                      </Text>
                      {qtd > 0 ? (
                        <Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: '700' }}>{qtd}</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </ScreenCard>

            <SectionTitle>{formatYmdBR(diaSelecionado)}</SectionTitle>
            {eventosQ.isLoading && !eventosQ.data ? (
              <ActivityIndicator color={theme.cadastroAction} />
            ) : eventosQ.isError ? (
              <Text style={{ color: theme.error, fontWeight: '700' }}>
                {eventosQ.error instanceof Error ? eventosQ.error.message : 'Erro ao carregar a agenda'}
              </Text>
            ) : doDia.length === 0 ? (
              <Text style={{ color: theme.textMuted }}>Nenhum agendamento neste dia.</Text>
            ) : (
              doDia.map((ev) => (
                <ScreenCard key={ev.id} style={{ gap: 6 }}>
                  <View style={styles.rowBetween}>
                    <Text style={{ color: theme.headerText, fontWeight: '800', flex: 1 }}>{ev.titulo}</Text>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <Pressable
                        onPress={() => {
                          setEditando(ev);
                          setFormAberto(true);
                        }}
                        hitSlop={8}
                      >
                        <FontAwesome name="pencil" size={14} color={theme.cadastroAction} />
                      </Pressable>
                      <Pressable onPress={() => excluir.mutate(ev.google_event_id)} hitSlop={8}>
                        <FontAwesome name="trash" size={14} color={theme.error} />
                      </Pressable>
                    </View>
                  </View>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                    {formatDateTimeBR(ev.inicio)} — {horaDeIso(ev.fim)}
                  </Text>
                  {ev.descricao?.trim() ? (
                    <DescricaoAgenda html={ev.descricao} color={theme.text} muted={theme.textMuted} link={theme.cadastroAction} />
                  ) : null}
                  {ev.cliente ? (
                    <Text style={{ color: theme.cadastroAction, fontSize: 12, fontWeight: '700' }}>
                      Cliente: {ev.cliente.nome}
                      {ev.match_tipo === 'email_auto' ? ' · match e-mail' : ''}
                    </Text>
                  ) : (
                    <Pressable onPress={() => setVincularEvento(ev)} hitSlop={6}>
                      <Text style={{ color: theme.warning, fontWeight: '700', fontSize: 12 }}>Vincular ao cliente</Text>
                    </Pressable>
                  )}
                  {ev.cliente_id ? (
                    <Pressable
                      onPress={() =>
                        desvincularClienteEvento(ev.id).then(() => {
                          void qc.invalidateQueries({ queryKey: ['google_calendar_eventos'] });
                          void qc.invalidateQueries({ queryKey: ['google_eventos_sem_cliente'] });
                          void qc.invalidateQueries({ queryKey: ['google_proximas_reunioes'] });
                        })
                      }
                      hitSlop={6}
                    >
                      <Text style={{ color: theme.textMuted, fontSize: 11 }}>Desvincular</Text>
                    </Pressable>
                  ) : null}
                </ScreenCard>
              ))
            )}
            </View>
            <View
              style={{
                width: 320,
                maxWidth: '100%',
                flexGrow: 1,
                gap: 8,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 16,
                padding: 12,
                backgroundColor: theme.surface,
              }}
            >
              <Text style={{ color: theme.headerText, fontWeight: '800' }}>Sem cliente</Text>
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                Vincule uma vez. Os próximos agendamentos com o mesmo e-mail entram nesse cliente.
              </Text>
              {semClienteQ.isLoading ? <ActivityIndicator color={theme.cadastroAction} /> : null}
              {semClienteQ.error ? (
                <Text style={{ color: theme.error, fontSize: 12 }}>
                  {semClienteQ.error instanceof Error ? semClienteQ.error.message : 'Erro ao listar'}
                </Text>
              ) : null}
              <ScrollView style={{ maxHeight: 640 }} contentContainerStyle={{ gap: 8 }} nestedScrollEnabled>
                {(semClienteQ.data ?? []).length === 0 && !semClienteQ.isLoading ? (
                  <Text style={{ color: theme.textMuted, fontSize: 13 }}>Nenhum agendamento sem cliente.</Text>
                ) : null}
                {(semClienteQ.data ?? []).map((ev) => (
                  <Pressable
                    key={ev.id}
                    onPress={() => {
                      setClienteVinculo(null);
                      setVincularEvento(ev);
                    }}
                    style={({ pressed }) => ({
                      borderWidth: 1,
                      borderColor: theme.border,
                      borderRadius: 10,
                      padding: 10,
                      gap: 4,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 13 }} numberOfLines={2}>
                      {ev.titulo || '(Sem título)'}
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: 12 }}>{formatDateTimeBR(ev.inicio)}</Text>
                    <Text style={{ color: theme.cadastroAction, fontWeight: '800', fontSize: 12 }}>Vincular</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
            </View>
          </>
        )}
      </ScrollView>

      <EventoModal
        visible={formAberto}
        evento={editando}
        onClose={() => {
          setFormAberto(false);
          setEditando(null);
        }}
        onSaved={() => {
          void qc.invalidateQueries({ queryKey: ['google_calendar_eventos'] });
          void qc.invalidateQueries({ queryKey: ['google_eventos_sem_cliente'] });
          void qc.invalidateQueries({ queryKey: ['google_proximas_reunioes'] });
        }}
      />

      <Modal visible={Boolean(vincularEvento)} animationType="fade" transparent onRequestClose={() => setVincularEvento(null)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setVincularEvento(null)} />
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border, zIndex: 2 }]}>
            <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 16 }}>Vincular cliente</Text>
            <Text style={{ color: theme.textMuted, fontSize: 13 }}>{vincularEvento?.titulo}</Text>
            <ClienteSearchPicker
              todosClientes={clientesQ.data ?? []}
              value={clienteVinculo}
              onChange={setClienteVinculo}
              loading={clientesQ.isLoading}
            />
            <PrimaryButton label="Vincular" loading={vincular.isPending} onPress={() => vincular.mutate()} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: { width: '100%', maxWidth: 520, borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  btnPri: { minHeight: 36, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  btnSec: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  mesNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  semanaRow: { flexDirection: 'row' },
  semanaLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700' },
  grade: { flexDirection: 'row', flexWrap: 'wrap' },
  celula: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: '14.28%',
    minHeight: 52,
    borderWidth: 1,
    padding: 6,
    justifyContent: 'space-between',
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
