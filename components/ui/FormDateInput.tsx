import React, { createElement, useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';

import { FormInput } from '@/components/ui/FormInput';
import { useTheme } from '@/src/contexts/ThemeContext';
import { FORM_CONTROL_HEIGHT } from '@/src/styles/formInputStyles';

type Props = {
  value: string;
  onChange: (value: string) => void;
  hasError?: boolean;
};

export function FormDateInput({ value, onChange, hasError }: Props) {
  const { theme } = useTheme();
  const webStyle = useMemo(
    () => ({
      height: FORM_CONTROL_HEIGHT,
      borderRadius: 8,
      border: `1px solid ${hasError ? theme.error : theme.borderInput}`,
      padding: '0 12px',
      fontSize: 15,
      width: '100%',
      boxSizing: 'border-box' as const,
      backgroundColor: theme.surface,
      color: theme.text,
    }),
    [theme, hasError],
  );

  if (Platform.OS === 'web') {
    return createElement('input', {
      type: 'date',
      value: value || '',
      onChange: (e: { target: { value: string } }) => onChange(e.target.value),
      style: webStyle,
    });
  }

  return (
    <FormInput
      value={value}
      onChangeText={onChange}
      placeholder="AAAA-MM-DD"
      keyboardType="numbers-and-punctuation"
      hasError={hasError}
      style={styles.native}
    />
  );
}

const styles = StyleSheet.create({
  native: { fontVariant: ['tabular-nums'] },
});
