-- Dia do último chamado Digisac por cliente, já no calendário de Brasília.
-- O card de acompanhamento lê esta função para não ficar na data da conversa.

create or replace function public.painel_datas_ultimo_chamado(p_ids uuid[])
returns table (cliente_id uuid, dia text)
language sql
stable
security definer
set search_path = public
as $$
  select ch.cliente_id,
         to_char(ch.inicio at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as dia
  from (
    select distinct on (cliente_id) cliente_id, inicio
    from public.admin_digisac_chamados
    where cliente_id = any (p_ids)
      and inicio is not null
    order by cliente_id, inicio desc
  ) ch
  where public.painel_admin_ativo();
$$;

revoke all on function public.painel_datas_ultimo_chamado(uuid[]) from public;
grant execute on function public.painel_datas_ultimo_chamado(uuid[]) to authenticated;

grant select on table public.admin_digisac_chamados to authenticated;

drop policy if exists painel_admin_digisac_chamados_select on public.admin_digisac_chamados;
create policy painel_admin_digisac_chamados_select
on public.admin_digisac_chamados
for select
to authenticated
using (public.painel_admin_ativo());

notify pgrst, 'reload schema';
