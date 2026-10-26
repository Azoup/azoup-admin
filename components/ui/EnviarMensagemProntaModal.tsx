import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Text } from '@/components/Themed';
import { useTheme } from '@/src/contexts/ThemeContext';
import { enviarMensagemProntaDigisac } from '@/src/services/digisac-historico-api';
import { listarMensagensProntasDigisac } from '@/src/services/repos/digisac-mensagens-prontas-repo';
import {
  formatarTelefoneDigisac,
  listarTelefonesDigisac,
} from '@/src/services/repos/digisac-telefones-repo';

export function EnviarMensagemProntaModal({
  clienteId,
  clienteNome,
  telefoneCadastro,
  visible,
  onClose,
}: {
  clienteId: string;
  clienteNome: string;
  telefoneCadastro?: string | null;
  visible: boolean;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const [escolhaId, setEscolhaId] = useState<string | null>(null);
  const [destinoId, setDestinoId] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const q = useQuery({
    queryKey: ['digisac_mensagens_prontas'],
    queryFn: listarMensagensProntasDigisac,
    enabled: visible,
  });
  const extrasQ = useQuery({
    queryKey: ['admin_digisac_telefones', clienteId],
    queryFn: () => listarTelefonesDigisac(clienteId),
    enabled: visible && Boolean(clienteId),
  });
  const destinos = useMemo(() => {
    const lista: { id: string; titulo: string; telefone: string }[] = [];
    const cadastro = `${telefoneCadastro ?? ''}`.trim();
    if (cadastro) {
      lista.push({
        id: 'cadastro',
        titulo: 'Cadastro',
        telefone: cadastro,
      });
    }
    for (const extra of extrasQ.data ?? []) {
      lista.push({
        id: extra.id,
        titulo: extra.descricao.trim() || 'Contato extra',
        telefone: extra.telefone,
      });
    }
    return lista;
  }, [extrasQ.data, telefoneCadastro]);
  const escolherDestino = destinos.length > 1;
  const destino = destinos.find((item) => item.id === destinoId) ?? null;
  const enviar = useMutation({
    mutationFn: ({ mensagem, extraId }: { mensagem: string; extraId: string | null }) =>
      enviarMensagemProntaDigisac(clienteId, mensagem, extraId),
  });
  const mensagens = q.data ?? [];
  const escolha = mensagens.find((item) => item.id === escolhaId) ?? null;

  useEffect(() => {
    if (!visible) {
      setEscolhaId(null);
      setDestinoId(null);
      setTexto('');
    }
  }, [visible]);

  useEffect(() => {
    setDestinoId(null);
  }, [clienteId]);

  useEffect(() => {
    if (!visible || destinoId || !destinos.length) return;
    setDestinoId(destinos[0].id);
  }, [visible, destinos, destinoId]);

  function fechar() {
    enviar.reset();
    setEscolhaId(null);
    setDestinoId(null);
    setTexto('');
    onClose();
  }

  function escolher(id: string, descricao: string) {
    enviar.reset();
    setEscolhaId(id);
    setTexto(descricao);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={fechar}>
      <View style={[styles.overlay, { justifyContent: 'center', padding: 24 }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={fechar} />
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 14,
            padding: 16,
            gap: 12,
            maxWidth: 560,
            width: '100%',
            alignSelf: 'center',
            maxHeight: '80%',
          }}
        >
          <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 16 }}>Enviar mensagem</Text>
          <Text style={{ color: theme.textMuted, fontSize: 13 }}>
            {escolha
              ? `Edite se quiser. A alteração vale só para ${clienteNome} neste envio.`
              : `Escolha uma mensagem pronta para enviar a ${clienteNome}.`}
          </Text>
          {escolherDestino ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '800' }}>Enviar para</Text>
              {extrasQ.isLoading ? <ActivityIndicator color={theme.cadastroAction} /> : null}
              {destinos.map((item) => {
                const ativo = (destinoId ?? destinos[0]?.id) === item.id;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      enviar.reset();
                      setDestinoId(item.id);
                    }}
                    style={{
                      borderWidth: 1,
                      borderColor: ativo ? theme.cadastroAction : theme.border,
                      backgroundColor: ativo ? theme.surfaceMuted : theme.surface,
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      gap: 2,
                    }}
                  >
                    <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 13 }}>{item.titulo}</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                      {formatarTelefoneDigisac(item.telefone)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : destino ? (
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>
              {destino.titulo}: {formatarTelefoneDigisac(destino.telefone)}
            </Text>
          ) : null}
          {enviar.isSuccess ? (
            <Text style={{ color: theme.success, fontWeight: '700' }}>Mensagem enviada no Digisac.</Text>
          ) : null}
          {enviar.isError ? (
            <Text style={{ color: theme.error }}>
              {enviar.error instanceof Error ? enviar.error.message : 'Erro ao enviar'}
            </Text>
          ) : null}
          {q.isLoading ? <ActivityIndicator color={theme.cadastroAction} /> : null}
          {q.isError ? (
            <Text style={{ color: theme.error }}>
              {q.error instanceof Error ? q.error.message : 'Erro ao carregar mensagens'}
            </Text>
          ) : null}
          {!q.isLoading && !mensagens.length ? (
            <Text style={{ color: theme.textMuted }}>
              Nenhuma mensagem pronta. Cadastre em Config. Suporte.
            </Text>
          ) : null}
          {escolha ? (
            <FormField label={escolha.titulo}>
              <FormInput
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                value={texto}
                onChangeText={setTexto}
                style={{ minHeight: 140, paddingTop: 10 }}
              />
            </FormField>
          ) : null}
          <ScrollView style={{ maxHeight: escolha ? 160 : 360 }} contentContainerStyle={{ gap: 8 }}>
            {mensagens.map((item) => {
              const ativo = item.id === escolhaId;
              return (
                <Pressable
                  key={item.id}
                  disabled={enviar.isPending}
                  onPress={() => escolher(item.id, item.descricao)}
                  style={({ hovered, pressed }) => ({
                    borderWidth: 1,
                    borderColor: ativo || hovered || pressed ? theme.cadastroAction : theme.border,
                    borderRadius: 10,
                    padding: 12,
                    gap: 4,
                    opacity: enviar.isPending ? 0.6 : 1,
                  })}
                >
                  <Text style={{ color: theme.headerText, fontWeight: '800' }}>{item.titulo}</Text>
                  {ativo ? null : (
                    <Text style={{ color: theme.textMuted, fontSize: 12 }} numberOfLines={3}>
                      {item.descricao}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
          {escolha ? (
            <PrimaryButton
              label={enviar.isPending ? 'Enviando…' : destino ? `Enviar para ${destino.titulo}` : 'Enviar'}
              loading={enviar.isPending}
              disabled={!texto.trim() || enviar.isPending || !destino}
              onPress={() => {
                if (!destino) return;
                enviar.mutate({
                  mensagem: texto.trim(),
                  extraId: destino.id === 'cadastro' ? null : destino.id,
                });
              }}
            />
          ) : null}
          <Pressable onPress={fechar} hitSlop={6}>
            <Text style={{ color: theme.textMuted, fontWeight: '700' }}>Fechar</Text>
          </Pressable>
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
});
