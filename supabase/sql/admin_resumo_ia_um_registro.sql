-- Garante no máximo 1 resumo de IA por cliente e dia.
-- 1) Remove duplicados existentes (mantém o mais antigo).
-- 2) Índice único para impedir nova corrida entre admins / geradores.

with marcados as (
  select id,
    row_number() over (
      partition by
        cliente_id,
        coalesce(
          data_registro,
          (created_at at time zone 'America/Sao_Paulo')::date
        )
      order by created_at asc, id asc
    ) as n
  from public.admin_cliente_reunioes
  where gerado_ia is true
    and coalesce(avulsa, false) = false
)
delete from public.admin_cliente_reunioes r
using marcados m
where r.id = m.id
  and m.n > 1;

update public.admin_cliente_reunioes
set data_registro = (created_at at time zone 'America/Sao_Paulo')::date
where gerado_ia is true
  and data_registro is null;

create unique index if not exists idx_admin_cliente_reunioes_ia_dia
  on public.admin_cliente_reunioes (cliente_id, data_registro)
  where gerado_ia is true
    and coalesce(avulsa, false) = false
    and data_registro is not null;

comment on index public.idx_admin_cliente_reunioes_ia_dia is
  'No máximo um registro gerado_ia por cliente e dia (não avulso).';
