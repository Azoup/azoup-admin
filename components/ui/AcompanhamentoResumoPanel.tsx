import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import {
  carregarUsoResumo,
  listarTreinouResumo,
  salvarTreinouResumo,
} from '@/src/services/repos/acompanhamento-resumo-repo';
import {
  listarTicketsAbertosPorCliente,
  numeroTicket,
  type TicketConfecAberto,
} from '@/src/services/repos/confec-kanban-repo';
import {
  RESUMO_SECAO_CONFEC,
  RESUMO_SECAO_LABEL,
  RESUMO_SECOES,
  TREINOU_LABEL,
  TREINOU_STATUS,
  textoUsoSecao,
  type ResumoSecaoId,
  type TreinouStatus,
} from '@/src/utils/acompanhamento-resumo';

type Props = {
  clienteId: string;
  clienteNome?: string | null;
};

function ticketsDaSecao(tickets: TicketConfecAberto[], secao: ResumoSecaoId): TicketConfecAberto[] {
  const alvo = RESUMO_SECAO_CONFEC[secao];
  return tickets.filter((t) => `${t.secao ?? ''}`.trim() === alvo);
}

function proximoTreinou(atual: TreinouStatus): TreinouStatus {
  const idx = TREINOU_STATUS.indexOf(atual);
  return TREINOU_STATUS[(idx + 1) % TREINOU_STATUS.length] ?? 'nao_treinou';
}

function TextoTickets({ tickets }: { tickets: TicketConfecAberto[] }) {
  const { theme } = useTheme();
  if (!tickets.length) {
    return <Text style={{ color: theme.textMuted, fontSize: 12 }}>—</Text>;
  }
  return (
    <View style={{ gap: 2 }}>
      {tickets.map((t) => (
        <Text key={t.id} style={{ color: theme.cadastroAction, fontWeight: '700', fontSize: 12 }}>
          #{numeroTicket(t.ticket_number)}
          {t.titulo ? ` · ${t.titulo}` : ''}
        </Text>
      ))}
    </View>
  );
}

export function AcompanhamentoResumoPanel({ clienteId, clienteNome }: Props) {
  const { theme } = useTheme();
  const { adminProfile, session } = useAdminAuth();
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [secaoSalvando, setSecaoSalvando] = useState<ResumoSecaoId | null>(null);

  const usoQ = useQuery({
    queryKey: ['admin_cliente_resumo_uso', clienteId],
    queryFn: () => carregarUsoResumo(clienteId),
    enabled: Boolean(clienteId),
    staleTime: 60_000,
  });

  const treinouQ = useQuery({
    queryKey: ['admin_cliente_resumo_treinou', clienteId],
    queryFn: () => listarTreinouResumo(clienteId),
    enabled: Boolean(clienteId),
  });

  const ticketsQ = useQuery({
    queryKey: ['confec_tickets_abertos', clienteId],
    queryFn: () => listarTicketsAbertosPorCliente(clienteId),
    enabled: Boolean(clienteId),
  });

  const salvarTreinou = useMutation({
    mutationFn: (params: { secao: ResumoSecaoId; status: TreinouStatus }) =>
      salvarTreinouResumo({
        clienteId,
        secao: params.secao,
        status: params.status,
        adminEmail: adminProfile?.email ?? session?.user?.email ?? null,
      }),
    onMutate: (params) => {
      setSecaoSalvando(params.secao);
      setErro(null);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin_cliente_resumo_treinou', clienteId] });
      setSecaoSalvando(null);
    },
    onError: (e) => {
      setSecaoSalvando(null);
      setErro(e instanceof Error ? e.message : 'Erro ao salvar treinou');
    },
  });

  const tickets = ticketsQ.data ?? [];
  const treinouMap = treinouQ.data;
  const usoMap = usoQ.data ?? {};
  const carregando = usoQ.isLoading || treinouQ.isLoading || ticketsQ.isLoading;

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 16, flex: 1 }}>
          Resumo{clienteNome ? ` · ${clienteNome}` : ''}
        </Text>
        <Pressable
          onPress={() => {
            void qc.invalidateQueries({ queryKey: ['admin_cliente_resumo_uso', clienteId] });
            void qc.invalidateQueries({ queryKey: ['confec_tickets_abertos', clienteId] });
          }}
          style={({ pressed }) => [
            styles.botaoSec,
            { borderColor: theme.border, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={{ color: theme.cadastroAction, fontWeight: '800', fontSize: 12 }}>Atualizar uso</Text>
        </Pressable>
      </View>
      <Text style={{ color: theme.textMuted, fontSize: 12 }}>
        Uso vem do banco automaticamente. Toque em Treinou para alternar o status.
      </Text>

      {carregando ? <ActivityIndicator color={theme.cadastroAction} /> : null}
      {usoQ.isError ? <Text style={{ color: theme.error }}>{(usoQ.error as Error).message}</Text> : null}
      {treinouQ.isError ? (
        <Text style={{ color: theme.error }}>{(treinouQ.error as Error).message}</Text>
      ) : null}
      {ticketsQ.isError ? (
        <Text style={{ color: theme.error }}>{(ticketsQ.error as Error).message}</Text>
      ) : null}
      {erro ? <Text style={{ color: theme.error }}>{erro}</Text> : null}

      {!carregando ? (
        <View style={[styles.tabela, { borderColor: theme.border }]}>
          <View style={[styles.linhaCabecalho, { backgroundColor: theme.surfaceMuted, borderBottomColor: theme.border }]}>
            <Text style={[styles.celSecao, { color: theme.textMuted, fontWeight: '800' }]}>Seção</Text>
            <Text style={[styles.celTreinou, { color: theme.textMuted, fontWeight: '800' }]}>Treinou</Text>
            <Text style={[styles.celUso, { color: theme.textMuted, fontWeight: '800' }]}>Uso</Text>
            <Text style={[styles.celPend, { color: theme.textMuted, fontWeight: '800' }]}>Pendência</Text>
          </View>
          {RESUMO_SECOES.map((secao) => {
            const treinou = treinouMap?.[secao] ?? 'nao_treinou';
            const salvando = secaoSalvando === secao && salvarTreinou.isPending;
            return (
              <View
                key={secao}
                style={[styles.linha, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}
              >
                <Text style={[styles.celSecao, { color: theme.headerText, fontWeight: '800' }]}>
                  {RESUMO_SECAO_LABEL[secao]}
                </Text>
                <View style={styles.celTreinou}>
                  <Pressable
                    disabled={salvarTreinou.isPending}
                    onPress={() =>
                      salvarTreinou.mutate({ secao, status: proximoTreinou(treinou) })
                    }
                    style={({ pressed }) => [
                      styles.chipTreinou,
                      {
                        borderColor: theme.cadastroAction,
                        backgroundColor: theme.surfaceMuted,
                        opacity: pressed || salvando ? 0.7 : 1,
                      },
                    ]}
                  >
                    {salvando ? (
                      <ActivityIndicator size="small" color={theme.cadastroAction} />
                    ) : (
                      <Text style={{ color: theme.cadastroAction, fontWeight: '800', fontSize: 12 }}>
                        {TREINOU_LABEL[treinou]}
                      </Text>
                    )}
                  </Pressable>
                </View>
                <Text style={[styles.celUso, { color: theme.text, fontSize: 12, lineHeight: 17 }]}>
                  {textoUsoSecao(secao, usoMap[secao] ?? {})}
                </Text>
                <View style={styles.celPend}>
                  <TextoTickets tickets={ticketsDaSecao(tickets, secao)} />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  botaoSec: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabela: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  linhaCabecalho: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 6,
  },
  linha: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 6,
    alignItems: 'flex-start',
  },
  celSecao: { flexBasis: '18%', flexGrow: 0, flexShrink: 0, fontSize: 12 },
  celTreinou: { flexBasis: '22%', flexGrow: 0, flexShrink: 0 },
  celUso: { flex: 1, flexGrow: 1 },
  celPend: { flexBasis: '22%', flexGrow: 0, flexShrink: 1 },
  chipTreinou: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 30,
    justifyContent: 'center',
  },
});
