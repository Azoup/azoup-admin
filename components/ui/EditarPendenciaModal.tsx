import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Themed';
import { FormDateInput } from '@/components/ui/FormDateInput';
import { FormField } from '@/components/ui/FormField';
import { FormInput } from '@/components/ui/FormInput';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useTheme } from '@/src/contexts/ThemeContext';

export function EditarPendenciaModal({
  visible,
  pendenciaInicial,
  dataRetornoInicial,
  salvando,
  erro,
  onClose,
  onSalvar,
}: {
  visible: boolean;
  pendenciaInicial: string;
  dataRetornoInicial?: string | null;
  salvando?: boolean;
  erro?: string | null;
  onClose: () => void;
  onSalvar: (valor: { pendencia: string; dataRetorno: string }) => void;
}) {
  const { theme } = useTheme();
  const [pendencia, setPendencia] = useState('');
  const [dataRetorno, setDataRetorno] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setPendencia(`${pendenciaInicial ?? ''}`.trim());
    setDataRetorno(`${dataRetornoInicial ?? ''}`.slice(0, 10));
    setAviso(null);
  }, [visible, pendenciaInicial, dataRetornoInicial]);

  function confirmar() {
    const texto = pendencia.trim();
    const retorno = dataRetorno.trim();
    if (!texto) {
      setAviso('Escreva a pendência.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(retorno)) {
      setAviso('Informe a data do retorno.');
      return;
    }
    onSalvar({ pendencia: texto, dataRetorno: retorno });
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 18 }}>Editar pendência</Text>
          <FormField label="Pendência" required>
            <FormInput
              value={pendencia}
              onChangeText={(valor) => {
                setPendencia(valor);
                setAviso(null);
              }}
              placeholder="O que precisa ser feito"
              multiline
              style={{ minHeight: 88, height: 88, textAlignVertical: 'top', paddingTop: 10 }}
            />
          </FormField>
          <FormField label="Data do retorno" required>
            <FormDateInput
              value={dataRetorno}
              onChange={(valor) => {
                setDataRetorno(valor);
                setAviso(null);
              }}
            />
          </FormField>
          {aviso || erro ? <Text style={{ color: theme.error }}>{aviso || erro}</Text> : null}
          <PrimaryButton label={salvando ? 'Salvando…' : 'Salvar'} loading={salvando} onPress={confirmar} />
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
