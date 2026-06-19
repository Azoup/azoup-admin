import type { AdminPapel } from '@/src/types/azoup';

/** Chaves das abas do painel administrativo. */
export type AdminScreenKey =
  | 'dashboard'
  | 'clients'
  | 'conversas'
  | 'billing'
  | 'audit'
  | 'admins'
  | 'marketing'
  | 'config_suporte';

export type AdminScreenDef = {
  key: AdminScreenKey;
  label: string;
  /** Somente perfil owner pode receber esta tela. */
  ownerOnly?: boolean;
};

export const ADMIN_SCREENS: readonly AdminScreenDef[] = [
  { key: 'dashboard', label: 'Painel' },
  { key: 'clients', label: 'Clientes' },
  { key: 'conversas', label: 'Conversas' },
  { key: 'billing', label: 'Cobrança' },
  { key: 'audit', label: 'Auditoria' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'config_suporte', label: 'Config. Suporte' },
  { key: 'admins', label: 'Acessos', ownerOnly: true },
] as const;

export const ADMIN_SCREEN_KEYS = ADMIN_SCREENS.map((s) => s.key);

export function telasPadraoPorPapel(papel: AdminPapel): AdminScreenKey[] {
  switch (papel) {
    case 'owner':
      return [...ADMIN_SCREEN_KEYS];
    case 'manager':
      return ['dashboard', 'clients', 'conversas', 'billing', 'audit', 'marketing', 'config_suporte'];
    case 'viewer':
      return ['dashboard', 'clients', 'conversas', 'audit', 'marketing'];
    default:
      return ['dashboard'];
  }
}
