import { Platform, StyleSheet } from 'react-native';

import type { AppTheme } from '@/src/theme/colors';

export const FORM_CONTROL_HEIGHT = 36;

export function getFormInputStyles(theme: AppTheme) {
  return StyleSheet.create({
    input: {
      height: FORM_CONTROL_HEIGHT,
      borderWidth: 1,
      borderColor: theme.borderInput,
      borderRadius: 8,
      paddingHorizontal: 12,
      fontSize: 14,
      color: theme.text,
      backgroundColor: theme.inputBg,
      ...(Platform.OS === 'web'
        ? ({
            outlineStyle: 'none',
          } as object)
        : null),
    },
    inputFocused: {
      borderColor: theme.focusRing,
      ...(Platform.OS === 'web'
        ? ({
            boxShadow: `0 0 0 2px ${theme.focusRing}33`,
          } as object)
        : null),
    },
    label: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.textMuted,
      marginBottom: 4,
    },
    required: {
      color: theme.error,
    },
    helper: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 4,
      lineHeight: 18,
    },
  });
}
