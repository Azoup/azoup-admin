-- Remove a lista "Aprovados" do Kanban Confec.
-- Cards (se houver) vão para "em-andamento"; posições das colunas restantes são recompactadas.

update public.confec_kanban_cards
set status = 'em-andamento',
    updated_at = now()
where status = 'aprovados';

delete from public.confec_kanban_columns
where slug = 'aprovados';

with ordenadas as (
  select id, row_number() over (order by position, title) - 1 as nova_posicao
  from public.confec_kanban_columns
)
update public.confec_kanban_columns c
set position = ordenadas.nova_posicao
from ordenadas
where c.id = ordenadas.id;
