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
  | 'config_suporte'
  | 'metodo360'
  | 'acompanhamento'
  | 'pendencias'
  | 'excluir';

export type AdminScreenDef = {
  key: AdminScreenKey;
  label: string;
  /** Somente perfil owner pode receber esta tela. */
  ownerOnly?: boolean;
  /** Permissão gravada no usuário, sem item no menu. */
  permissao?: boolean;
};

export const ADMIN_SCREENS: readonly AdminScreenDef[] = [
  { key: 'dashboard', label: 'Painel' },
  { key: 'clients', label: 'Clientes' },
  { key: 'acompanhamento', label: 'Acompanhamento' },
  { key: 'pendencias', label: 'Pendências' },
  { key: 'conversas', label: 'Conversas' },
  { key: 'billing', label: 'Cobrança' },
  { key: 'audit', label: 'Auditoria' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'config_suporte', label: 'Config. Suporte' },
  { key: 'metodo360', label: 'Método 360' },
  { key: 'admins', label: 'Acessos', ownerOnly: true },
  { key: 'excluir', label: 'Excluir registros', permissao: true },
] as const;

export const ADMIN_SCREEN_KEYS = ADMIN_SCREENS.map((s) => s.key);

export function telasPadraoPorPapel(papel: AdminPapel): AdminScreenKey[] {
  switch (papel) {
    case 'owner':
      return [...ADMIN_SCREEN_KEYS];
    case 'manager':
      return [
        'dashboard',
        'clients',
        'acompanhamento',
        'pendencias',
        'conversas',
        'billing',
        'audit',
        'marketing',
        'config_suporte',
        'metodo360',
      ];
    case 'viewer':
      return ['dashboard', 'clients', 'acompanhamento', 'pendencias', 'conversas', 'audit', 'marketing'];
    default:
      return ['dashboard'];
  }
}
