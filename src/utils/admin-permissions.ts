import {
  ADMIN_SCREENS,
  ADMIN_SCREEN_KEYS,
  type AdminScreenKey,
  telasPadraoPorPapel,
} from '@/src/constants/admin-screens';
import type { AdminPapel, AdminUserRow } from '@/src/types/azoup';

export function normalizarTelasAcesso(raw: unknown): AdminScreenKey[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is AdminScreenKey => ADMIN_SCREEN_KEYS.includes(t as AdminScreenKey));
}

export function telasEfetivasAdmin(profile: AdminUserRow | null, papel: AdminPapel | null): AdminScreenKey[] {
  const custom = normalizarTelasAcesso(profile?.telas_acesso);
  if (custom.length > 0) return custom;
  if (papel) return telasPadraoPorPapel(papel);
  return ['dashboard'];
}

export function podeAcessarTelaAdmin(
  tela: AdminScreenKey,
  profile: AdminUserRow | null,
  papel: AdminPapel | null,
): boolean {
  const def = telasEfetivasAdmin(profile, papel);
  if (!def.includes(tela)) return false;
  if (tela === 'admins') return papel === 'owner';
  return true;
}

export function rotularTelasAcesso(raw: unknown, papel?: AdminPapel | null): string {
  const keys = normalizarTelasAcesso(raw);
  const efetivas = keys.length > 0 ? keys : papel ? telasPadraoPorPapel(papel) : [];
  if (!efetivas.length) return '—';
  const labels = efetivas.map((k) => ADMIN_SCREENS.find((s) => s.key === k)?.label ?? k);
  return labels.join(', ');
}

export function validarTelasParaCriacao(telas: AdminScreenKey[], role: AdminPapel): string | null {
  if (!telas.length) return 'Selecione ao menos uma tela para o acesso.';
  if (telas.includes('admins') && role !== 'owner') {
    return 'A tela Acessos só pode ser liberada para perfil owner.';
  }
  return null;
}
