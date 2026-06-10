import React, { useMemo, useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { useTheme } from '@/src/contexts/ThemeContext';
import { FORM_CONTROL_HEIGHT, getFormInputStyles } from '@/src/styles/formInputStyles';

type Props = TextInputProps & {
  hasError?: boolean;
};

export function FormInput({ style, hasError, placeholderTextColor, onFocus, onBlur, ...rest }: Props) {
  const { theme } = useTheme();
  const formStyles = useMemo(() => getFormInputStyles(theme), [theme]);
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      placeholderTextColor={placeholderTextColor ?? theme.textMuted}
      style={[
        formStyles.input,
        focused && formStyles.inputFocused,
        hasError && { borderColor: theme.error },
        style,
      ]}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      {...rest}
    />
  );
}

export { FORM_CONTROL_HEIGHT };
