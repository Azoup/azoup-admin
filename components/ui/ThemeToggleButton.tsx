import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/src/contexts/ThemeContext';

export function ThemeToggleButton() {
  const { isDark, toggleTheme, theme } = useTheme();

  return (
    <Pressable
      accessibilityLabel={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      onPress={toggleTheme}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: theme.surfaceMuted,
          borderColor: theme.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <FontAwesome name={isDark ? 'sun-o' : 'moon-o'} size={18} color={theme.cadastroAction} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
