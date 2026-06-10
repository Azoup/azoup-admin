import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ADMIN_SCREENS, type AdminScreenKey } from '@/src/constants/admin-screens';
import { useTheme } from '@/src/contexts/ThemeContext';
import type { AdminPapel } from '@/src/types/azoup';

type Props = {
  value: AdminScreenKey[];
  onChange: (next: AdminScreenKey[]) => void;
  role: AdminPapel;
};

export function AdminScreenAccessPicker({ value, onChange, role }: Props) {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);

  const toggle = (key: AdminScreenKey, disabled: boolean) => {
    if (disabled) return;
    if (value.includes(key)) {
      if (value.length === 1) return;
      onChange(value.filter((k) => k !== key));
      return;
    }
    onChange([...value, key]);
  };

  return (
    <View style={styles.wrap}>
      {ADMIN_SCREENS.map((screen) => {
        const disabled = Boolean(screen.ownerOnly && role !== 'owner');
        const active = value.includes(screen.key);
        return (
          <Pressable
            key={screen.key}
            disabled={disabled}
            onPress={() => toggle(screen.key, disabled)}
            style={[
              styles.chip,
              {
                borderColor: theme.border,
                backgroundColor: active ? theme.cadastroAction : theme.surface,
                opacity: disabled ? 0.4 : 1,
              },
            ]}>
            <Text style={[styles.label, { color: active ? theme.cadastroActionText : theme.textMuted }]}>
              {active ? '✓ ' : ''}
              {screen.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function getStyles(_theme: ReturnType<typeof useTheme>['theme']) {
  return StyleSheet.create({
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    label: { fontWeight: '700', fontSize: 12 },
  });
}
