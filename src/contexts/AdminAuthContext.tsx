import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/src/lib/supabase';
import { obterAdminProfileViaFunction } from '@/src/services/stripe-admin-api';
import type { AdminPapel, AdminUserRow } from '@/src/types/azoup';

type AdminAuthState = {
  session: Session | null;
  adminProfile: AdminUserRow | null;
  /** Bloqueia UI só no boot ou quando ainda não há perfil para o usuário logado. */
  loading: boolean;
  adminError: string | null;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  papel: AdminPapel | null;
  canEditLimits: boolean;
  canManageBilling: boolean;
  canManageAdmins: boolean;
  canViewAudit: boolean;
};

const AdminAuthContext = createContext<AdminAuthState | undefined>(undefined);

/** Eventos do Supabase ao voltar para a aba — não devem refazer validação nem spinner. */
const AUTH_EVENTS_SEM_RELOAD = new Set(['TOKEN_REFRESHED', 'USER_UPDATED', 'INITIAL_SESSION']);

function derivePermissions(papel: AdminPapel | null) {
  return {
    canEditLimits: papel === 'owner' || papel === 'manager',
    canManageBilling: papel === 'owner' || papel === 'manager',
    canManageAdmins: papel === 'owner',
    canViewAudit: papel === 'owner' || papel === 'manager' || papel === 'viewer',
  };
}

function isAtivo(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const v = value.toLowerCase().trim();
    return v === '1' || v === 'true' || v === 'ativo';
  }
  return false;
}

async function fetchAdminProfileResilient(
  _userId: string,
  email?: string | null,
): Promise<{ profile: AdminUserRow | null; error: string | null }> {
  if (!email) {
    return { profile: null, error: 'Usuário autenticado sem e-mail no token' };
  }

  try {
    const viaFn = await obterAdminProfileViaFunction();
    const row = viaFn.admin_profile as unknown as AdminUserRow | undefined;
    if (!row) return { profile: null, error: 'Admin não encontrado em admin_users' };
    const ativo = (row as unknown as Record<string, unknown>).active ?? (row as unknown as Record<string, unknown>).ativo;
    if (!isAtivo(ativo)) return { profile: null, error: 'Admin encontrado porém inativo' };
    return { profile: row, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha no fallback admin-stripe';
    return { profile: null, error: msg };
  }
}

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminUserRow | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [adminLoading, setAdminLoading] = useState(false);

  const loadedUserIdRef = useRef<string | null>(null);
  const adminProfileRef = useRef<AdminUserRow | null>(null);

  useEffect(() => {
    adminProfileRef.current = adminProfile;
  }, [adminProfile]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const s = data.session ?? null;
      setSession(s);
      if (s?.user?.id) {
        setAdminLoading(true);
      } else {
        setAdminLoading(false);
        loadedUserIdRef.current = null;
      }
      setSessionLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);

      if (!next?.user?.id) {
        loadedUserIdRef.current = null;
        adminProfileRef.current = null;
        setAdminProfile(null);
        setAdminError(null);
        setAdminLoading(false);
        return;
      }

      const uid = next.user.id;

      if (AUTH_EVENTS_SEM_RELOAD.has(event)) {
        setAdminLoading(false);
        return;
      }

      if (loadedUserIdRef.current === uid && adminProfileRef.current) {
        setAdminLoading(false);
        return;
      }

      if (event === 'SIGNED_IN' && loadedUserIdRef.current === uid) {
        setAdminLoading(false);
        return;
      }

      setAdminLoading(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
      new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`Tempo esgotado (${ms / 1000}s) ao validar acesso administrativo.`)), ms);
        p.then(
          (v) => {
            clearTimeout(t);
            resolve(v);
          },
          (e) => {
            clearTimeout(t);
            reject(e);
          },
        );
      });

    async function loadAdmin() {
      const userId = session?.user?.id;
      if (!userId) {
        setAdminProfile(null);
        setAdminError(null);
        setAdminLoading(false);
        loadedUserIdRef.current = null;
        return;
      }

      if (loadedUserIdRef.current === userId && adminProfileRef.current) {
        setAdminLoading(false);
        return;
      }

      setAdminLoading(true);
      try {
        const result = await withTimeout(fetchAdminProfileResilient(userId, session.user.email), 25_000);
        if (!cancelled) {
          setAdminProfile(result.profile);
          adminProfileRef.current = result.profile;
          loadedUserIdRef.current = result.profile ? userId : null;
          const finalError = result.profile ? null : result.error ?? 'Sem diagnóstico retornado';
          setAdminError(finalError);
          if (!result.profile) {
            console.warn('[admin-auth] acesso negado', {
              email: session.user.email,
              reason: finalError,
            });
          }
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Falha ao validar acesso administrativo';
          setAdminProfile(null);
          adminProfileRef.current = null;
          loadedUserIdRef.current = null;
          setAdminError(msg);
          console.warn('[admin-auth]', msg);
        }
      } finally {
        if (!cancelled) setAdminLoading(false);
      }
    }

    loadAdmin();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, session?.user?.email]);

  const signIn = useCallback(async (email: string, password: string) => {
    loadedUserIdRef.current = null;
    adminProfileRef.current = null;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? new Error(error.message) : null };
  }, []);

  const signOut = useCallback(async () => {
    loadedUserIdRef.current = null;
    adminProfileRef.current = null;
    await supabase.auth.signOut();
    setAdminProfile(null);
    setAdminError(null);
    setAdminLoading(false);
  }, []);

  const papel = (adminProfile?.role ?? adminProfile?.papel ?? null) as AdminPapel | null;
  const perms = derivePermissions(papel);

  const loading =
    sessionLoading || (Boolean(session?.user?.id) && adminLoading && !adminProfile);

  const value = useMemo(
    () => ({
      session,
      adminProfile,
      loading,
      adminError,
      signIn,
      signOut,
      papel,
      ...perms,
    }),
    [session, adminProfile, loading, adminError, signIn, signOut, papel],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth deve estar dentro de AdminAuthProvider');
  return ctx;
}
