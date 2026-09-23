-- Função auxiliar para políticas RLS do painel ADM.
-- admin_users tem deny_all; políticas não podem subconsultar essa tabela sem SECURITY DEFINER.
-- Execute antes (ou junto com) admin_audit_logs_rls.sql e assinatura_limites_override_rls.sql.

create or replace function public.painel_admin_ativo(roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users au
    where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and coalesce(au.active, true) = true
      and (roles is null or au.role = any (roles))
  );
$$;

revoke all on function public.painel_admin_ativo(text[]) from public;
grant execute on function public.painel_admin_ativo(text[]) to authenticated;

-- Owner sempre pode excluir. Os demais só se telas_acesso contiver "excluir".
create or replace function public.painel_admin_pode_excluir()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users au
    where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and coalesce(au.active, true) = true
      and (
        au.role = 'owner'
        or coalesce(au.telas_acesso, '[]'::jsonb) ? 'excluir'
      )
  );
$$;

revoke all on function public.painel_admin_pode_excluir() from public;
grant execute on function public.painel_admin_pode_excluir() to authenticated;
