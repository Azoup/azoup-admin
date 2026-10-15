import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { useTheme } from '@/src/contexts/ThemeContext';

type Props = PressableProps & {
  label: string;
  loading?: boolean;
  variant?: 'action' | 'danger';
  compact?: boolean;
};

export function PrimaryButton({ label, loading, disabled, variant = 'action', compact, style, ...rest }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  const bg = variant === 'danger' ? theme.error : theme.cadastroAction;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.btn,
        compact && styles.compact,
        { backgroundColor: bg, opacity: disabled || loading ? 0.55 : pressed ? 0.9 : 1 },
        style,
      ]}
      disabled={disabled || loading}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={theme.cadastroActionText} />
      ) : (
        <Text style={[styles.label, compact && styles.compactLabel, { color: theme.cadastroActionText }]}>{label}</Text>
      )}
    </Pressable>
  );
}

function getStyles(theme: ReturnType<typeof useTheme>['theme']) {
  return StyleSheet.create({
    btn: {
      minHeight: 40,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    compact: { minHeight: 32, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    label: { fontWeight: '800', fontSize: 15 },
    compactLabel: { fontSize: 13 },
  });
}
