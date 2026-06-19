import type { ComponentProps } from 'react';
import type FontAwesome from '@expo/vector-icons/FontAwesome';

import { ADMIN_SCREENS, type AdminScreenKey } from '@/src/constants/admin-screens';

export type AdminNavItem = {
  key: AdminScreenKey;
  label: string;
  href: string;
  icon: ComponentProps<typeof FontAwesome>['name'];
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_SCREENS.map((screen) => {
  const href =
    screen.key === 'dashboard'
      ? '/'
      : screen.key === 'config_suporte'
        ? '/config-suporte'
        : `/${screen.key}`;

  const icon: ComponentProps<typeof FontAwesome>['name'] =
    screen.key === 'dashboard'
      ? 'dashboard'
      : screen.key === 'clients'
        ? 'users'
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
                  : 'shield';

  return { key: screen.key, label: screen.label, href, icon };
});

export function rotaAdminAtiva(pathname: string, href: string): boolean {
  const path = pathname.replace(/^\/\(tabs\)/, '').replace(/\/$/, '') || '/';
  const alvo = href.replace(/\/$/, '') || '/';

  if (alvo === '/') return path === '/' || path === '/index' || path === '';
  return path === alvo || path.startsWith(`${alvo}/`);
}
