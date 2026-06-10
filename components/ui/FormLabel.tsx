import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { useTheme } from '@/src/contexts/ThemeContext';

type Props = {
  children: string;
  required?: boolean;
};

export function FormLabel({ children, required }: Props) {
  const { theme } = useTheme();
  return (
    <Text style={[styles.base, { color: theme.textMuted }]}>
      {children}
      {required ? <Text style={{ color: theme.error }}> *</Text> : null}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
});
