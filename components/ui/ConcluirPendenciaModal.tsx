import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Themed';
import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useTheme } from '@/src/contexts/ThemeContext';

export function ConcluirPendenciaModal({
  visible,
  pendencia,
  comentarioInicial,
  salvando,
  erro,
  onClose,
  onConfirmar,
}: {
  visible: boolean;
  pendencia: string;
  comentarioInicial?: string | null;
  salvando?: boolean;
  erro?: string | null;
  onClose: () => void;
  onConfirmar: (comentario: string) => void;
}) {
  const { theme } = useTheme();
  const [comentario, setComentario] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setComentario(`${comentarioInicial ?? ''}`.trim());
    setAviso(null);
  }, [visible, comentarioInicial]);

  function confirmar() {
    const texto = comentario.trim();
    if (!texto) {
      setAviso('Escreva um comentário para concluir.');
      return;
    }
    onConfirmar(texto);
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 18 }}>Concluir pendência</Text>
          <Text style={{ color: theme.text, fontSize: 13 }}>{pendencia}</Text>
          <FormField label="Comentário" required helper="Obrigatório para concluir. Fica salvo nesta pendência.">
            <FormInput
              value={comentario}
              onChangeText={(valor) => {
                setComentario(valor);
                setAviso(null);
              }}
              placeholder="O que foi feito ou o retorno dado"
              multiline
              style={{ minHeight: 110, height: 110, textAlignVertical: 'top', paddingTop: 10 }}
            />
          </FormField>
          {aviso || erro ? <Text style={{ color: theme.error }}>{aviso || erro}</Text> : null}
          <PrimaryButton label={salvando ? 'Salvando…' : 'Concluir'} loading={salvando} onPress={confirmar} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: { width: '100%', maxWidth: 480, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
});
