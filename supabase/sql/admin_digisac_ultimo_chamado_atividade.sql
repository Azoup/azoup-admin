-- Último contato Digisac considera inicio e fim (atividade em ticket aberto/fechado).

create or replace function public.painel_datas_ultimo_chamado(p_ids uuid[])
returns table (cliente_id uuid, dia text)
language sql
stable
security definer
set search_path = public
as $$
  select ch.cliente_id,
         to_char(ch.atividade at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as dia
  from (
    select distinct on (cliente_id)
           cliente_id,
           greatest(inicio, coalesce(fim, inicio)) as atividade
    from public.admin_digisac_chamados
    where cliente_id = any (p_ids)
      and inicio is not null
    order by cliente_id, greatest(inicio, coalesce(fim, inicio)) desc
  ) ch
  where public.painel_admin_ativo();
$$;

revoke all on function public.painel_datas_ultimo_chamado(uuid[]) from public;
grant execute on function public.painel_datas_ultimo_chamado(uuid[]) to authenticated;

create or replace function public.painel_refletir_ultimo_chamado()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  marcador constant text := 'Contato pelo último chamado da Digisac';
begin
  update public.admin_cliente_conversas c
  set data_conversa = d.dia,
      hora_conversa = d.hora
  from (
    select cliente_id,
           (atividade at time zone 'America/Sao_Paulo')::date as dia,
           (atividade at time zone 'America/Sao_Paulo')::time as hora
    from (
      select distinct on (cliente_id)
             cliente_id,
             greatest(inicio, coalesce(fim, inicio)) as atividade
      from public.admin_digisac_chamados
      where inicio is not null
      order by cliente_id, greatest(inicio, coalesce(fim, inicio)) desc
    ) recente
  ) d
  where c.cliente_id = d.cliente_id
    and c.descricao = marcador
    and (c.data_conversa is distinct from d.dia or c.hora_conversa is distinct from d.hora);

  insert into public.admin_cliente_conversas (cliente_id, data_conversa, hora_conversa, descricao)
  select d.cliente_id, d.dia, d.hora, marcador
  from (
    select cliente_id,
           (atividade at time zone 'America/Sao_Paulo')::date as dia,
           (atividade at time zone 'America/Sao_Paulo')::time as hora
    from (
      select distinct on (cliente_id)
             cliente_id,
             greatest(inicio, coalesce(fim, inicio)) as atividade
      from public.admin_digisac_chamados
      where inicio is not null
      order by cliente_id, greatest(inicio, coalesce(fim, inicio)) desc
    ) recente
  ) d
  where not exists (
    select 1
    from public.admin_cliente_conversas c
    where c.cliente_id = d.cliente_id
      and c.descricao = marcador
  );
end;
$$;

revoke all on function public.painel_refletir_ultimo_chamado() from public;
grant execute on function public.painel_refletir_ultimo_chamado() to service_role;

notify pgrst, 'reload schema';
