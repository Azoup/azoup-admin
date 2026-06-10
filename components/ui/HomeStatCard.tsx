import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/src/contexts/ThemeContext';

type Props = {
  title: string;
  value: string;
  icon?: React.ComponentProps<typeof FontAwesome>['name'];
  delta?: string;
  deltaUp?: boolean;
  width?: string | number;
};

export function HomeStatCard({ title, value, icon = 'bar-chart', delta, deltaUp, width }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);

  return (
    <View style={[styles.card, width != null ? { width } : null]}>
      <View style={styles.top}>
        <View style={[styles.iconWrap, { backgroundColor: theme.surfaceMuted }]}>
          <FontAwesome name={icon} size={16} color={theme.cadastroAction} />
        </View>
        {delta ? (
          <Text style={[styles.delta, { color: deltaUp ? theme.success : theme.error }]}>
            {deltaUp ? '↑' : '↓'} {delta}
          </Text>
        ) : null}
      </View>
      <Text style={styles.label}>{title}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function getStyles(theme: ReturnType<typeof useTheme>['theme']) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 14,
      gap: 6,
      minWidth: 140,
    },
    top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    iconWrap: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: { fontSize: 12, fontWeight: '700', color: theme.textMuted },
    value: { fontSize: 22, fontWeight: '900', color: theme.headerText },
    delta: { fontSize: 11, fontWeight: '800' },
  });
}
