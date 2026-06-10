import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { useTheme } from '@/src/contexts/ThemeContext';

type Props = PressableProps & {
  label: string;
  loading?: boolean;
  variant?: 'action' | 'danger';
};

export function PrimaryButton({ label, loading, disabled, variant = 'action', style, ...rest }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  const bg = variant === 'danger' ? theme.error : theme.cadastroAction;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: disabled || loading ? 0.55 : pressed ? 0.9 : 1 },
        style,
      ]}
      disabled={disabled || loading}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={theme.cadastroActionText} />
      ) : (
        <Text style={[styles.label, { color: theme.cadastroActionText }]}>{label}</Text>
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
    label: { fontWeight: '800', fontSize: 15 },
  });
}
