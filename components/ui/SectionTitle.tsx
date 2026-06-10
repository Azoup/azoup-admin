import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useTheme } from '@/src/contexts/ThemeContext';

type Props = {
  children: string;
};

export function SectionTitle({ children }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  return <Text style={styles.title}>{children}</Text>;
}

function getStyles(theme: ReturnType<typeof useTheme>['theme']) {
  return StyleSheet.create({
    title: {
      marginTop: 8,
      marginBottom: 6,
      fontSize: 17,
      fontWeight: '800',
      color: theme.headerText,
    },
  });
}
