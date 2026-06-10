import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/src/contexts/ThemeContext';

type Props<T extends string> = {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  labels?: Partial<Record<T, string>>;
  compact?: boolean;
};

export function ChipSelect<T extends string>({ options, value, onChange, labels, compact }: Props<T>) {
  const { theme } = useTheme();
  const styles = useMemo(() => getStyles(theme, compact), [theme, compact]);

  return (
    <View style={styles.row}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={[styles.chip, active && { backgroundColor: theme.cadastroAction, borderColor: theme.cadastroAction }]}>
            <Text style={[styles.label, { color: active ? theme.cadastroActionText : theme.textMuted }]}>
              {labels?.[opt] ?? opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function getStyles(theme: ReturnType<typeof useTheme>['theme'], compact?: boolean) {
  return StyleSheet.create({
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: compact ? 4 : 8 },
    chip: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 999,
      paddingHorizontal: compact ? 8 : 12,
      paddingVertical: compact ? 4 : 8,
      backgroundColor: theme.surface,
    },
    label: { fontWeight: '700', fontSize: compact ? 11 : 13 },
  });
}
