import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { FormDateInput } from '@/components/ui/FormDateInput';
import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Text } from '@/components/Themed';
import { useAdminAuth } from '@/src/contexts/AdminAuthContext';
import { useTheme } from '@/src/contexts/ThemeContext';
import { salvarFichaAcompanhamento } from '@/src/services/repos/kanban-acompanhamento-repo';
import { criarPendenciasReuniao, listarUsuariosDoCliente } from '@/src/services/repos/reunioes-repo';
import type { AcompanhamentoCliente } from '@/src/utils/acompanhamento';
import { dataHojeBrasil } from '@/src/utils/format';

const AVATAR = '#FF7A1A';

type LinhaPendencia = { id: string; texto: string; dataRetorno: string };

function linhaVazia(): LinhaPendencia {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, texto: '', dataRetorno: '' };
}

type Props = {
  cliente: AcompanhamentoCliente | null;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export function RegistrarReuniaoModal({ cliente, visible, onClose, onSaved }: Props) {
  const { theme } = useTheme();
  const { adminProfile, session, papel } = useAdminAuth();
  const podeAlterarData = papel === 'owner';
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [assuntos, setAssuntos] = useState('');
  const [proximaAcao, setProximaAcao] = useState('');
  const [dataRegistro, setDataRegistro] = useState(dataHojeBrasil);
  const [linhas, setLinhas] = useState<LinhaPendencia[]>([linhaVazia()]);
  const [erro, setErro] = useState<string | null>(null);

  const usuariosQ = useQuery({
    queryKey: ['usuarios_cliente', cliente?.id],
    queryFn: () => listarUsuariosDoCliente(cliente!.id),
    enabled: visible && Boolean(cliente?.id),
  });

  useEffect(() => {
    if (!visible) return;
    setSelecionados([]);
    setAssuntos('');
    setProximaAcao('');
    setDataRegistro(dataHojeBrasil());
    setLinhas([linhaVazia()]);
    setErro(null);
  }, [visible, cliente?.id]);

  function alternar(id: string) {
    setSelecionados((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }

  const salvarMutation = useMutation({
    mutationFn: async () => {
      if (!cliente) throw new Error('Cliente inválido.');
      if (!selecionados.length) throw new Error('Selecione ao menos um participante.');
      if (podeAlterarData && !/^\d{4}-\d{2}-\d{2}$/.test(dataRegistro.trim())) {
        throw new Error('Informe a data do registro.');
      }
      const criadas = await criarPendenciasReuniao({
        clienteId: cliente.id,
        empresaNome: cliente.empresa_nome?.trim() || cliente.nome,
        assuntos,
        proximaAcao,
        participanteIds: selecionados,
        adminEmail: adminProfile?.email ?? session?.user?.email ?? null,
        dataRegistro: podeAlterarData ? dataRegistro : null,
        pendencias: linhas.map((linha) => ({ texto: linha.texto, dataRetorno: linha.dataRetorno })),
      });
      const primeiraData = criadas.map((item) => item.data_retorno).sort()[0] ?? null;
      try {
        await salvarFichaAcompanhamento({
          clienteId: cliente.id,
          coluna: cliente.coluna,
          adminEmail: adminProfile?.email ?? session?.user?.email ?? null,
          ultimaReuniao: cliente.ultima_reuniao,
          proximaReuniao: primeiraData,
          pendenciasAbertas: cliente.pendencias_abertas,
          ultimaDificuldade: cliente.ultima_dificuldade,
          proximaAcao: proximaAcao.trim() || cliente.proxima_acao,
        });
      } catch {
        // A reunião já foi gravada. A ficha do card é complementar.
      }
      return criadas;
    },
    onSuccess: () => {
      setErro(null);
      onSaved();
      onClose();
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao salvar reunião'),
  });

  const usuarios = usuariosQ.data ?? [];

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.background, zIndex: 2 }]}>
          <View style={styles.colunas}>
            <View style={[styles.painel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.tituloRow}>
                <View style={styles.icone}>
                  <FontAwesome name="users" size={14} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 16 }}>Participantes</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                    Selecione entre os usuários do cliente — sem digitação
                  </Text>
                </View>
                <Pressable onPress={onClose} hitSlop={8}>
                  <FontAwesome name="times" size={16} color={theme.textMuted} />
                </Pressable>
              </View>

              <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                {usuariosQ.isLoading ? (
                  <ActivityIndicator color={theme.cadastroAction} />
                ) : usuariosQ.error ? (
                  <Text style={{ color: theme.error }}>
                    {(usuariosQ.error as Error).message.includes('usuarios')
                      ? 'Execute supabase/sql/admin_cliente_reunioes.sql no Supabase para listar os usuários do cliente.'
                      : (usuariosQ.error as Error).message}
                  </Text>
                ) : usuarios.length === 0 ? (
                  <Text style={{ color: theme.textMuted }}>Nenhum usuário vinculado a este cliente.</Text>
                ) : (
                  usuarios.map((usuario) => {
                    const marcado = selecionados.includes(usuario.id);
                    return (
                      <Pressable
                        key={usuario.id}
                        onPress={() => alternar(usuario.id)}
                        style={[
                          styles.participante,
                          {
                            borderColor: marcado ? AVATAR : theme.border,
                            backgroundColor: marcado ? theme.surfaceMuted : theme.background,
                          },
                        ]}
                      >
                        <FontAwesome
                          name={marcado ? 'check-square' : 'square-o'}
                          size={18}
                          color={marcado ? AVATAR : theme.textMuted}
                        />
                        <Text style={{ color: theme.headerText, fontWeight: marcado ? '800' : '600', flex: 1 }}>
                          {usuario.nome}
                        </Text>
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            </View>

            <ScrollView
              style={[styles.painel, { backgroundColor: theme.surface, borderColor: theme.border, maxHeight: 640 }]}
              contentContainerStyle={{ gap: 10 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 16 }}>Registro da reunião</Text>
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                {cliente?.empresa_nome?.trim() || cliente?.nome || 'Cliente'}
              </Text>

              {podeAlterarData ? (
                <FormField label="Data do registro">
                  <FormDateInput value={dataRegistro} onChange={setDataRegistro} />
                </FormField>
              ) : null}

              <FormField label="Assuntos tratados">
                <FormInput
                  value={assuntos}
                  onChangeText={setAssuntos}
                  multiline
                  placeholder="O que foi tratado na reunião"
                  style={styles.area}
                />
              </FormField>
              <FormField label="Próxima ação">
                <FormInput
                  value={proximaAcao}
                  onChangeText={setProximaAcao}
                  multiline
                  placeholder="Próximo passo combinado"
                  style={styles.area}
                />
              </FormField>

              {linhas.map((linha, index) => (
                <View key={linha.id} style={[styles.pendenciaBloco, { borderColor: theme.border }]}>
                  <View style={styles.pendenciaTopo}>
                    <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700', flex: 1 }}>
                      Pendência {linhas.length > 1 ? index + 1 : ''}
                    </Text>
                    {linhas.length > 1 ? (
                      <Pressable
                        hitSlop={8}
                        onPress={() => setLinhas((atual) => atual.filter((item) => item.id !== linha.id))}
                      >
                        <Text style={{ color: theme.error, fontWeight: '700', fontSize: 12 }}>Remover</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={styles.pendenciaLinha}>
                    <FormField label="Pendências geradas">
                      <FormInput
                        value={linha.texto}
                        onChangeText={(texto) =>
                          setLinhas((atual) => atual.map((item) => (item.id === linha.id ? { ...item, texto } : item)))
                        }
                        multiline
                        placeholder="O que fica em aberto para o cliente"
                        style={styles.areaPendencia}
                      />
                    </FormField>
                    <FormField label="Data do retorno">
                      <FormDateInput
                        value={linha.dataRetorno}
                        onChange={(dataRetorno) =>
                          setLinhas((atual) =>
                            atual.map((item) => (item.id === linha.id ? { ...item, dataRetorno } : item)),
                          )
                        }
                      />
                    </FormField>
                  </View>
                </View>
              ))}

              <Pressable
                onPress={() => setLinhas((atual) => [...atual, linhaVazia()])}
                style={({ pressed }) => [styles.adicionar, { borderColor: theme.cadastroAction, opacity: pressed ? 0.85 : 1 }]}
              >
                <FontAwesome name="plus" size={12} color={theme.cadastroAction} />
                <Text style={{ color: theme.cadastroAction, fontWeight: '800', fontSize: 13 }}>Adicionar pendência</Text>
              </Pressable>

              {erro ? <Text style={{ color: theme.error }}>{erro}</Text> : null}

              <PrimaryButton
                label="SALVAR REUNIÃO"
                loading={salvarMutation.isPending}
                onPress={() => {
                  setErro(null);
                  salvarMutation.mutate();
                }}
              />
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
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
  sheet: { width: '100%', maxWidth: 920 },
  colunas: { flexDirection: 'row', gap: 12, alignItems: 'stretch', flexWrap: 'wrap' },
  painel: { flexGrow: 1, flexBasis: 320, borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  tituloRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  icone: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: AVATAR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  participante: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  area: { minHeight: 64, textAlignVertical: 'top' },
  areaPendencia: { height: 120, minHeight: 120, textAlignVertical: 'top', paddingTop: 10 },
  pendenciaBloco: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
  pendenciaTopo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pendenciaLinha: { gap: 8 },
  adicionar: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
