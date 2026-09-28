import { useQuery } from '@tanstack/react-query';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { usePathname } from 'expo-router';

import { Text } from '@/components/Themed';
import { useTheme } from '@/src/contexts/ThemeContext';
import { listarReunioes, type ReuniaoClienteRow } from '@/src/services/repos/reunioes-repo';
import { dataHojeBrasil, formatYmdBR, somarDiasYmd } from '@/src/utils/format';

const AvisoRetornoContext = createContext<() => void>(() => {});

function diasAte(prazo: string, hoje: string): number {
  const [ya, ma, da] = prazo.split('-').map(Number);
  const [yb, mb, db] = hoje.split('-').map(Number);
  return Math.round((Date.UTC(ya, ma - 1, da) - Date.UTC(yb, mb - 1, db)) / 86_400_000);
}

function pendenciasParaAvisar(rows: ReuniaoClienteRow[]): ReuniaoClienteRow[] {
  const hoje = dataHojeBrasil();
  const limite = somarDiasYmd(hoje, 3);
  return rows
    .filter((row) => {
      if (row.concluida) return false;
      if (!`${row.pendencia ?? ''}`.trim()) return false;
      const prazo = `${row.data_retorno ?? ''}`.slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(prazo) && prazo <= limite;
    })
    .sort((a, b) => `${a.data_retorno}`.localeCompare(`${b.data_retorno}`));
}

export function useAvisoAoAbrirPopup(visible: boolean) {
  const abrir = useContext(AvisoRetornoContext);
  useEffect(() => {
    if (visible) abrir();
  }, [visible, abrir]);
}

export function AvisoRetornoProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);

  const q = useQuery({
    queryKey: ['admin_cliente_reunioes', 'avisos-retorno'],
    queryFn: listarReunioes,
  });

  const avisos = useMemo(() => pendenciasParaAvisar(q.data ?? []), [q.data]);
  const hoje = dataHojeBrasil();

  const abrir = useCallback(() => {
    if (avisos.length) setAberto(true);
  }, [avisos.length]);

  useEffect(() => {
    abrir();
  }, [pathname, abrir]);

  return (
    <AvisoRetornoContext.Provider value={abrir}>
      {children}
      <Modal visible={aberto && avisos.length > 0} animationType="fade" transparent onRequestClose={() => setAberto(false)}>
        <View style={styles.overlay}>
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={{ color: theme.headerText, fontWeight: '800', fontSize: 18 }}>Retornos de pendências</Text>
            <Text style={{ color: theme.textMuted, fontSize: 13 }}>
              Aparece enquanto a pendência não for para Concluída. Inclui atraso e o que vence em até 3 dias.
            </Text>
            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }}>
              {avisos.map((item) => {
                const prazo = `${item.data_retorno}`.slice(0, 10);
                const dias = diasAte(prazo, hoje);
                const atrasada = dias < 0;
                const rotulo = atrasada
                  ? `Atrasada há ${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'dia' : 'dias'}`
                  : dias === 0
                    ? 'Vence hoje'
                    : `Faltam ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
                return (
                  <View key={item.id} style={[styles.item, { borderColor: atrasada ? '#F07167' : theme.border }]}>
                    <Text style={{ color: atrasada ? '#F07167' : theme.cadastroAction, fontWeight: '800', fontSize: 12 }}>
                      {rotulo} · {formatYmdBR(prazo)}
                    </Text>
                    <Text style={{ color: theme.headerText, fontWeight: '800' }}>{item.pendencia}</Text>
                    {item.empresa_nome?.trim() ? (
                      <Text style={{ color: theme.textMuted, fontSize: 13 }}>{item.empresa_nome}</Text>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
            <Pressable
              onPress={() => setAberto(false)}
              style={({ pressed }) => [styles.fechar, { backgroundColor: theme.cadastroAction, opacity: pressed ? 0.9 : 1 }]}
            >
              <Text style={{ color: theme.cadastroActionText, fontWeight: '800' }}>Fechar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </AvisoRetornoContext.Provider>
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
  fechar: { minHeight: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
