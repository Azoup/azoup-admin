-- Descrição do contato extra (de quem é o telefone) e permissão de update.
alter table public.admin_digisac_telefones
  add column if not exists descricao text;

comment on column public.admin_digisac_telefones.descricao is
  'Nome ou papel da pessoa deste telefone extra (ex.: João, financeiro).';

grant select, insert, update, delete on table public.admin_digisac_telefones to authenticated;

drop policy if exists painel_admin_digisac_telefones_update on public.admin_digisac_telefones;
create policy painel_admin_digisac_telefones_update
on public.admin_digisac_telefones
for update
to authenticated
using (public.painel_admin_ativo())
with check (public.painel_admin_ativo());

notify pgrst, 'reload schema';
