export type AppTheme = {
  mode: 'light' | 'dark';
  primary: string;
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textMuted: string;
  border: string;
  borderInput: string;
  cadastroAction: string;
  cadastroActionText: string;
  sidebarBg: string;
  error: string;
  success: string;
  warning: string;
  focusRing: string;
  tabBarBg: string;
  tabIconDefault: string;
  tabIconSelected: string;
  cardShadow: string;
  inputBg: string;
  headerText: string;
};

/** Tema claro — CTAs pós-login em azul (`cadastroAction`). */
export const lightTheme: AppTheme = {
  mode: 'light',
  primary: '#0B1F3A',
  background: '#F4F7FB',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF3FA',
  text: '#0F172A',
  textMuted: '#5B6B84',
  border: '#D7E0EC',
  borderInput: '#C5D2E3',
  cadastroAction: '#1565C0',
  cadastroActionText: '#FFFFFF',
  sidebarBg: '#0B1F3A',
  error: '#C62828',
  success: '#0F9D58',
  warning: '#E65100',
  focusRing: '#1565C0',
  tabBarBg: '#FFFFFF',
  tabIconDefault: '#7F8CA4',
  tabIconSelected: '#1565C0',
  cardShadow: 'rgba(11, 31, 58, 0.08)',
  inputBg: '#FFFFFF',
  headerText: '#0B1F3A',
};

/** Tema escuro — CTAs em laranja Azoup (`cadastroAction`). */
export const darkTheme: AppTheme = {
  mode: 'dark',
  primary: '#FF7A1A',
  background: '#0B1F3A',
  surface: '#122B4D',
  surfaceMuted: '#0F2440',
  text: '#EAF0FF',
  textMuted: '#95A4C0',
  border: '#1A355D',
  borderInput: '#25466F',
  cadastroAction: '#FF7A1A',
  cadastroActionText: '#FFFFFF',
  sidebarBg: '#071526',
  error: '#EF5350',
  success: '#4ADE80',
  warning: '#FFB74D',
  focusRing: '#FF7A1A',
  tabBarBg: '#122B4D',
  tabIconDefault: '#95A4C0',
  tabIconSelected: '#FF7A1A',
  cardShadow: 'rgba(0, 0, 0, 0.35)',
  inputBg: '#0F2440',
  headerText: '#EAF0FF',
};

export const THEME_STORAGE_KEY = 'azoup-theme-mode';
