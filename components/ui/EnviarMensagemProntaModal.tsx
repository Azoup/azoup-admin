import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Text } from '@/components/Themed';
import { useTheme } from '@/src/contexts/ThemeContext';
import { enviarMensagemProntaDigisac } from '@/src/services/digisac-historico-api';
import { listarMensagensProntasDigisac } from '@/src/services/repos/digisac-mensagens-prontas-repo';

export function EnviarMensagemProntaModal({
  clienteId,
  clienteNome,
  visible,
  onClose,
}: {
  clienteId: string;
  clienteNome: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const [escolhaId, setEscolhaId] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const q = useQuery({
    queryKey: ['digisac_mensagens_prontas'],
    queryFn: listarMensagensProntasDigisac,
    enabled: visible,
  });
  const enviar = useMutation({
    mutationFn: (mensagem: string) => enviarMensagemProntaDigisac(clienteId, mensagem),
  });
  const mensagens = q.data ?? [];
  const escolha = mensagens.find((item) => item.id === escolhaId) ?? null;

  useEffect(() => {
    if (visible) return;
    setEscolhaId(null);
    setTexto('');
  }, [visible]);

  function fechar() {
    enviar.reset();
    setEscolhaId(null);
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
              label={enviar.isPending ? 'Enviando…' : 'Enviar'}
              loading={enviar.isPending}
              disabled={!texto.trim() || enviar.isPending}
              onPress={() => enviar.mutate(texto.trim())}
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
