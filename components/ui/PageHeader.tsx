import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/src/contexts/ThemeContext';

type Props = {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
};

export function PageHeader({ title, subtitle, trailing }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);

  return (
    <View style={styles.wrap}>
      <View style={styles.textCol}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </View>
  );
}

function getStyles(theme: ReturnType<typeof useTheme>['theme']) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 12,
    },
    textCol: { flex: 1, gap: 4 },
    title: { fontSize: 24, fontWeight: '900', color: theme.headerText },
    sub: { fontSize: 14, lineHeight: 20, color: theme.textMuted },
  });
}
