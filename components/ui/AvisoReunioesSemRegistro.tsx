import { useQuery } from '@tanstack/react-query';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Themed';
import { useTheme } from '@/src/contexts/ThemeContext';
import { listarReunioesPassadasSemRegistro } from '@/src/services/repos/google-agendamentos-repo';
import { abrirPdfReunioesSemRegistro } from '@/src/utils/pdf-reunioes-sem-registro';
import { formatDataHoraBrasil } from '@/src/utils/format';

export function AvisoReunioesSemRegistroProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const [aberto, setAberto] = useState(false);
  const [erroPdf, setErroPdf] = useState<string | null>(null);
  const jaMostrou = useRef(false);

  const q = useQuery({
    queryKey: ['reunioes_sem_registro'],
    queryFn: listarReunioesPassadasSemRegistro,
  });

  const avisos = q.data ?? [];

  useEffect(() => {
    if (!q.isSuccess || jaMostrou.current) return;
    jaMostrou.current = true;
    if (avisos.length) setAberto(true);
  }, [q.isSuccess, avisos.length]);

  return (
    <>
      {children}
      <Modal visible={aberto && avisos.length > 0} animationType="fade" transparent onRequestClose={() => setAberto(false)}>
        <View style={styles.overlay}>
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 18 }}>Reuniões sem registro</Text>
            <Text style={{ color: theme.textMuted, fontSize: 13 }}>
              Estes clientes já tiveram reunião e ainda não têm o registro dessa reunião.
            </Text>
            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }}>
              {avisos.map((item) => (
                <View key={item.id} style={[styles.item, { borderColor: theme.border }]}>
                  <Text style={{ color: theme.headerText, fontWeight: '800' }}>{item.clienteNome}</Text>
                  <Text style={{ color: theme.cadastroAction, fontWeight: '800', fontSize: 12 }}>
                    {formatDataHoraBrasil(item.inicio)}
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 13 }}>{item.titulo}</Text>
                </View>
              ))}
            </ScrollView>
            {erroPdf ? <Text style={{ color: theme.error, fontSize: 12 }}>{erroPdf}</Text> : null}
            <View style={styles.acoes}>
              <Pressable
                onPress={() => {
                  try {
                    abrirPdfReunioesSemRegistro(avisos);
                    setErroPdf(null);
                  } catch (erro) {
                    setErroPdf(erro instanceof Error ? erro.message : 'Não foi possível gerar o PDF.');
                  }
                }}
                style={({ pressed }) => [
                  styles.fechar,
                  { flex: 1, borderWidth: 1, borderColor: theme.cadastroAction, opacity: pressed ? 0.9 : 1 },
                ]}
              >
                <Text style={{ color: theme.cadastroAction, fontWeight: '800' }}>Abrir PDF</Text>
              </Pressable>
              <Pressable
                onPress={() => setAberto(false)}
                style={({ pressed }) => [styles.fechar, { flex: 1, backgroundColor: theme.cadastroAction, opacity: pressed ? 0.9 : 1 }]}
              >
                <Text style={{ color: theme.cadastroActionText, fontWeight: '800' }}>Fechar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
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
  card: { width: '100%', maxWidth: 480, borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  item: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 2 },
  acoes: { flexDirection: 'row', gap: 8 },
  fechar: { minHeight: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
