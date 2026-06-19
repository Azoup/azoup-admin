import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/src/contexts/ThemeContext';
import { FORM_CONTROL_HEIGHT, getFormInputStyles } from '@/src/styles/formInputStyles';

type Props<T extends string> = {
  options: readonly T[];
  value: T | null;
  onChange: (value: T) => void;
  placeholder?: string;
  labels?: Partial<Record<T, string>>;
  disabled?: boolean;
};

export function FormSelect<T extends string>({
  options,
  value,
  onChange,
  placeholder = 'Selecione…',
  labels,
  disabled,
}: Props<T>) {
  const { theme } = useTheme();
  const inputStyles = useMemo(() => getFormInputStyles(theme), [theme]);
  const styles = useMemo(() => getStyles(theme), [theme]);
  const [open, setOpen] = useState(false);

  const rotulo = value ? (labels?.[value] ?? value) : placeholder;

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => [
          inputStyles.input,
          styles.trigger,
          {
            opacity: disabled ? 0.55 : pressed ? 0.9 : 1,
            borderColor: open ? theme.cadastroAction : theme.border,
          },
        ]}>
        <Text style={{ color: value ? theme.text : theme.textMuted, flex: 1, fontSize: 15 }} numberOfLines={1}>
          {rotulo}
        </Text>
        <FontAwesome name={open ? 'chevron-up' : 'chevron-down'} size={12} color={theme.textMuted} />
      </Pressable>

      {open ? (
        <View style={[styles.menu, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {options.map((opt) => {
            const active = opt === value;
            return (
              <Pressable
                key={opt}
                onPress={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                style={({ pressed }) => [
                  styles.option,
                  active && { backgroundColor: `${theme.cadastroAction}18` },
                  pressed && { opacity: 0.85 },
                ]}>
                <Text style={{ color: active ? theme.cadastroAction : theme.text, fontWeight: active ? '800' : '500' }}>
                  {labels?.[opt] ?? opt}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function getStyles(theme: ReturnType<typeof useTheme>['theme']) {
  return StyleSheet.create({
    wrap: { position: 'relative', zIndex: 20 },
    trigger: {
      minHeight: FORM_CONTROL_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
    },
    menu: {
      marginTop: 4,
      borderWidth: 1,
      borderRadius: 8,
      overflow: 'hidden',
      elevation: 4,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
    },
    option: {
      paddingHorizontal: 12,
      paddingVertical: 11,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
  });
}
