import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { useTheme } from '@/src/contexts/ThemeContext';

type Props = PressableProps & {
  label: string;
};

export function SecondaryButton({ label, disabled, style, ...rest }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.btn,
        {
          borderColor: theme.border,
          backgroundColor: theme.surface,
          opacity: disabled ? 0.55 : pressed ? 0.88 : 1,
        },
        style,
      ]}
      disabled={disabled}
      {...rest}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

function getStyles(_theme: ReturnType<typeof useTheme>['theme']) {
  return StyleSheet.create({
    btn: {
      minHeight: 40,
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: { fontWeight: '700', fontSize: 15 },
  });
}
