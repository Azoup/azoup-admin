-- Notas de atualização: campos no card + coluna Validação antes de Finalizados.
-- Idempotente. Requer o quadro confec já criado (admin_confec_kanban.sql).

alter table public.confec_kanban_cards
  add column if not exists secao text,
  add column if not exists tela text,
  add column if not exists tela_nova boolean not null default false,
  add column if not exists nota_linha text,
  add column if not exists nota_detalhe text,
  add column if not exists nota_gerada_em timestamptz;

create index if not exists idx_confec_kanban_cards_completed_at
  on public.confec_kanban_cards (completed_at desc nulls last);

create index if not exists idx_confec_kanban_cards_secao
  on public.confec_kanban_cards (secao)
  where secao is not null;

-- Empurra Finalizados (e o que vier depois) uma posição à frente se Validação ainda não existe.
do $$
begin
  if not exists (
    select 1 from public.confec_kanban_columns where slug = 'validacao'
  ) then
    update public.confec_kanban_columns
    set position = position + 1
    where position >= 3;
    insert into public.confec_kanban_columns (title, slug, color, position)
    values ('Validação', 'validacao', '#A78BFA', 3);
  end if;
end $$;

-- Garante Finalizados na posição 4 quando Validação existe.
update public.confec_kanban_columns
set position = 4
where slug = 'finalizados'
  and exists (select 1 from public.confec_kanban_columns where slug = 'validacao');

update public.confec_kanban_columns
set position = 3
where slug = 'validacao';
