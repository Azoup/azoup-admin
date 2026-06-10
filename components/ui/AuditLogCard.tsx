import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Themed';
import { ScreenCard } from '@/components/ui/ScreenCard';
import { useTheme } from '@/src/contexts/ThemeContext';
import type { AuditCardView } from '@/src/utils/audit-display';

type Props = {
  view: AuditCardView;
};

export function AuditLogCard({ view }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);

  return (
    <ScreenCard style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.titulo}>{view.titulo}</Text>
        <View style={[styles.badge, { backgroundColor: theme.surfaceAlt ?? theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.badgeText, { color: theme.textMuted }]}>{view.area}</Text>
        </View>
      </View>

      <Text style={[styles.resumo, { color: theme.text }]}>{view.resumo}</Text>

      <Text style={[styles.meta, { color: theme.textMuted }]}>
        {view.dataHora} · por {view.admin}
      </Text>

      {view.alteracoes.length > 0 ? (
        <View style={[styles.alteracoesBox, { borderColor: theme.border, backgroundColor: theme.surfaceAlt ?? theme.surface }]}>
          <Text style={[styles.alteracoesTitulo, { color: theme.headerText }]}>O que mudou</Text>
          {view.alteracoes.map((linha) => (
            <View key={`${linha.campo}-${linha.de}-${linha.para}`} style={styles.linha}>
              <Text style={[styles.campo, { color: theme.textMuted }]}>{linha.campo}</Text>
              <Text style={[styles.valores, { color: theme.text }]}>
                <Text style={styles.valorAntes}>{linha.de}</Text>
                <Text style={{ color: theme.textMuted }}> → </Text>
                <Text style={[styles.valorNovo, { color: theme.cadastroAction }]}>{linha.para}</Text>
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScreenCard>
  );
}

function getStyles(theme: ReturnType<typeof useTheme>['theme']) {
  return StyleSheet.create({
    card: { marginBottom: 12, gap: 10 },
    header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
    titulo: { flex: 1, fontWeight: '800', fontSize: 16, color: theme.headerText },
    badge: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    badgeText: { fontSize: 11, fontWeight: '700' },
    resumo: { fontSize: 14, lineHeight: 20 },
    meta: { fontSize: 12 },
    alteracoesBox: {
      borderWidth: 1,
      borderRadius: 10,
      padding: 12,
      gap: 10,
    },
    alteracoesTitulo: { fontWeight: '800', fontSize: 13 },
    linha: { gap: 2 },
    campo: { fontSize: 12, fontWeight: '600' },
    valores: { fontSize: 14, lineHeight: 20 },
    valorAntes: { textDecorationLine: 'line-through', opacity: 0.75 },
    valorNovo: { fontWeight: '800' },
  });
}
