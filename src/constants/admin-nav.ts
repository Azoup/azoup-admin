import type { ComponentProps } from 'react';
import type FontAwesome from '@expo/vector-icons/FontAwesome';

import { ADMIN_SCREENS, type AdminScreenKey } from '@/src/constants/admin-screens';

export type AdminNavItem = {
  key: AdminScreenKey;
  label: string;
  href: string;
  icon: ComponentProps<typeof FontAwesome>['name'];
  group: 'visao' | 'gestao' | 'config';
};

export type AdminNavGroupDef = {
  id: AdminNavItem['group'];
  title: string;
};

export const ADMIN_NAV_GROUPS: AdminNavGroupDef[] = [
  { id: 'visao', title: 'Visão geral' },
  { id: 'gestao', title: 'Gestão' },
  { id: 'config', title: 'Configurações' },
];

export const ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_SCREENS.map((screen) => {
  const href =
    screen.key === 'dashboard'
      ? '/(tabs)'
      : screen.key === 'config_suporte'
        ? '/(tabs)/config-suporte'
        : screen.key === 'metodo360'
          ? '/(tabs)/metodo360'
          : screen.key === 'acompanhamento'
            ? '/(tabs)/acompanhamento'
            : `/(tabs)/${screen.key}`;

  const icon: ComponentProps<typeof FontAwesome>['name'] =
    screen.key === 'dashboard'
      ? 'dashboard'
      : screen.key === 'clients'
        ? 'users'
        : screen.key === 'acompanhamento'
          ? 'heartbeat'
          : screen.key === 'conversas'
            ? 'comments'
            : screen.key === 'billing'
              ? 'credit-card'
              : screen.key === 'audit'
                ? 'history'
                : screen.key === 'marketing'
                  ? 'bullhorn'
                  : screen.key === 'config_suporte'
                    ? 'youtube-play'
                    : screen.key === 'metodo360'
                      ? 'graduation-cap'
                      : 'shield';

  const group: AdminNavItem['group'] =
    screen.key === 'dashboard' ||
    screen.key === 'clients' ||
    screen.key === 'acompanhamento' ||
    screen.key === 'conversas'
      ? 'visao'
      : screen.key === 'billing' || screen.key === 'marketing' || screen.key === 'audit'
        ? 'gestao'
        : 'config';

  return { key: screen.key, label: screen.label, href, icon, group };
});

export function rotaAdminAtiva(pathname: string, href: string): boolean {
  const norm = (raw: string) => {
    const p = raw.replace(/^\/\(tabs\)/, '').replace(/\/$/, '');
    return p || '/';
  };

  const path = norm(pathname);
  const alvo = norm(href);

  if (alvo === '/') return path === '/' || path === '/index';
  return path === alvo || path.startsWith(`${alvo}/`);
}
