-- RLS do Método 360 para o painel administrativo.
-- Requer tabela metodo360_checklist_itens (migration_metodo360.sql no ERP).
-- Execute no SQL Editor do Supabase.

alter table public.metodo360_checklist_itens enable row level security;

drop policy if exists metodo360_checklist_tenant_select on public.metodo360_checklist_itens;
drop policy if exists painel_admin_metodo360_select on public.metodo360_checklist_itens;
drop policy if exists painel_admin_metodo360_insert on public.metodo360_checklist_itens;
drop policy if exists painel_admin_metodo360_update on public.metodo360_checklist_itens;
drop policy if exists painodo360_checklist_select on public.metodo360_checklist_itens;

-- App tenant: somente itens ativos (se a policy já existir com outro nome, ajuste manualmente)
create policy metodo360_checklist_tenant_select
on public.metodo360_checklist_itens
for select
to authenticated
using (ativo = true);

create policy painel_admin_metodo360_select
on public.metodo360_checklist_itens
for select
to authenticated
using (public.painel_admin_ativo());

create policy painel_admin_metodo360_insert
on public.metodo360_checklist_itens
for insert
to authenticated
with check (public.painel_admin_ativo(array['owner', 'manager']::text[]));

create policy painel_admin_metodo360_update
on public.metodo360_checklist_itens
for update
to authenticated
using (public.painel_admin_ativo(array['owner', 'manager']::text[]))
with check (public.painel_admin_ativo(array['owner', 'manager']::text[]));
