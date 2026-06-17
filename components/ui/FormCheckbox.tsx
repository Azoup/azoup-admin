import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { useTheme } from '@/src/contexts/ThemeContext';

type Props = Omit<PressableProps, 'onPress'> & {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  loading?: boolean;
};

export function FormCheckbox({ label, checked, onCheckedChange, loading, disabled, style, ...rest }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: Boolean(disabled || loading) }}
      disabled={disabled || loading}
      onPress={() => onCheckedChange(!checked)}
      style={({ pressed }) => [
        styles.row,
        { opacity: disabled || loading ? 0.55 : pressed ? 0.85 : 1 },
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator size="small" color={theme.cadastroAction} style={styles.icon} />
      ) : (
        <FontAwesome
          name={checked ? 'check-square' : 'square-o'}
          size={22}
          color={checked ? theme.cadastroAction : theme.textMuted}
          style={styles.icon}
        />
      )}
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

function getStyles(theme: ReturnType<typeof useTheme>['theme']) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 },
    icon: { width: 24, textAlign: 'center' },
    label: { flex: 1, fontSize: 15 },
  });
}
