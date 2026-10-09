-- Um registro de IA por cliente e dia, sem pendência, com no máximo 3 tópicos curtos.
with marcados as (
  select id,
    row_number() over (
      partition by cliente_id, (created_at at time zone 'America/Sao_Paulo')::date
      order by
        case when length(coalesce(assuntos, '')) >= length(coalesce(pendencia, '')) then 0 else 1 end,
        created_at
    ) as n
  from public.admin_cliente_reunioes
  where gerado_ia is true
)
delete from public.admin_cliente_reunioes r
using marcados m
where r.id = m.id
  and m.n > 1;

update public.admin_cliente_reunioes r
set pendencia = '',
    proxima_acao = null,
    assuntos = coalesce((
      select string_agg('• ' || enxuta, E'\n' order by ord)
      from (
        select ord, (
          select string_agg(palavra, ' ' order by n)
          from (
            select palavra, n
            from regexp_split_to_table(trim(both ' .' from frase), '\s+') with ordinality as t(palavra, n)
            where n <= 12
          ) palavras
        ) as enxuta
        from (
          select ord, frase
          from regexp_split_to_table(
            regexp_replace(coalesce(r.assuntos, ''), E'[\\n•]+', '. ', 'g'),
            '[.!?]+'
          ) with ordinality as t(frase, ord)
          where length(trim(frase)) > 8
          order by ord
          limit 3
        ) frases
      ) topicos
      where coalesce(enxuta, '') <> ''
    ), r.assuntos)
where r.gerado_ia is true;
