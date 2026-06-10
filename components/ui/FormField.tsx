import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FormLabel } from './FormLabel';
import { useTheme } from '@/src/contexts/ThemeContext';

type Props = {
  label: string;
  required?: boolean;
  helper?: string;
  error?: string | null;
  children?: React.ReactNode;
};

export function FormField({ label, required, helper, error, children }: Props) {
  const { theme } = useTheme();

  return (
    <View style={styles.wrap}>
      <FormLabel required={required}>{label}</FormLabel>
      {children}
      {error ? <Text style={[styles.helper, { color: theme.error }]}>{error}</Text> : null}
      {!error && helper ? <Text style={[styles.helper, { color: theme.textMuted }]}>{helper}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 0 },
  helper: { fontSize: 12, marginTop: 4, lineHeight: 18 },
});
