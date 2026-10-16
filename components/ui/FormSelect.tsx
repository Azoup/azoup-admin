import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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
  const triggerRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number } | null>(null);

  const rotulo = value ? (labels?.[value] ?? value) : placeholder;

  function abrir() {
    if (disabled) return;
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({
        x: Math.max(8, x),
        y: y + height + 4,
        width: Math.max(width, 180),
      });
      setOpen(true);
    });
  }

  function fechar() {
    setOpen(false);
    setAnchor(null);
  }

  return (
    <View style={styles.wrap}>
      <View ref={triggerRef} collapsable={false}>
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={abrir}
          style={({ pressed }) => [
            inputStyles.input,
            styles.trigger,
            {
              opacity: disabled ? 0.55 : pressed ? 0.9 : 1,
              borderColor: open ? theme.cadastroAction : theme.border,
            },
          ]}
        >
          <Text style={{ color: value ? theme.text : theme.textMuted, flex: 1, fontSize: 14 }} numberOfLines={1}>
            {rotulo}
          </Text>
          <FontAwesome name={open ? 'chevron-up' : 'chevron-down'} size={12} color={theme.textMuted} />
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={fechar}>
        <View style={styles.modalRoot} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={fechar} accessibilityLabel="Fechar lista" />
          <View
            style={[
              styles.menu,
              {
                top: Math.max(8, anchor?.y ?? 80),
                left: Math.max(8, anchor?.x ?? 16),
                width: anchor?.width ?? 220,
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <ScrollView style={styles.menuScroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {options.map((opt) => {
                const active = opt === value;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => {
                      onChange(opt);
                      fechar();
                    }}
                    style={({ pressed }) => [
                      styles.option,
                      active && { backgroundColor: `${theme.cadastroAction}18` },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text
                      style={{ color: active ? theme.cadastroAction : theme.text, fontWeight: active ? '800' : '500', fontSize: 13 }}
                      numberOfLines={2}
                    >
                      {labels?.[opt] ?? opt}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function getStyles(theme: ReturnType<typeof useTheme>['theme']) {
  return StyleSheet.create({
    wrap: { position: 'relative' },
    trigger: {
      minHeight: FORM_CONTROL_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
    },
    modalRoot: { flex: 1 },
    menu: {
      position: 'absolute',
      maxHeight: 280,
      borderWidth: 1,
      borderRadius: 10,
      overflow: 'hidden',
      elevation: 12,
      shadowColor: '#000',
      shadowOpacity: 0.28,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      zIndex: 1000,
    },
    menuScroll: { maxHeight: 280 },
    option: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
  });
}
