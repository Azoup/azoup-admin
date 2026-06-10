import { darkTheme, lightTheme } from '@/src/theme/colors';

/** Tokens legados — prefira `useTheme().theme` em código novo. */
export const ui = {
  navy: lightTheme.primary,
  navySoft: '#122B4D',
  orange: lightTheme.cadastroAction,
  orangeSoft: '#FFE8D6',
  bg: lightTheme.background,
  card: lightTheme.surface,
  text: lightTheme.text,
  muted: lightTheme.textMuted,
  border: lightTheme.border,
  danger: lightTheme.error,
  success: lightTheme.success,
};

export { darkTheme, lightTheme };
