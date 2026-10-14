-- Quadro Kanban Confec (tickets de suporte). Separado do acompanhamento e das pendências.
-- Execute no SQL Editor do Supabase (requer painel_admin_ativo).

create sequence if not exists public.confec_kanban_ticket_number_seq;

create table if not exists public.confec_kanban_columns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  color text not null default '#94A3B8',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.confec_kanban_cards (
  id uuid primary key default gen_random_uuid(),
  ticket_number integer not null unique,
  title text not null,
  description text,
  dev_notes text,
  cliente_id uuid references public.clientes_azoup(id) on delete set null,
  analista_email text,
  desenvolvedor_email text,
  created_by_email text,
  status text not null,
  position integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.confec_kanban_labels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#94A3B8',
  created_at timestamptz not null default now()
);

create table if not exists public.confec_kanban_card_labels (
  card_id uuid not null references public.confec_kanban_cards(id) on delete cascade,
  label_id uuid not null references public.confec_kanban_labels(id) on delete cascade,
  primary key (card_id, label_id)
);

create table if not exists public.confec_kanban_card_images (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.confec_kanban_cards(id) on delete cascade,
  storage_path text not null,
  nome text,
  created_by_email text,
  created_at timestamptz not null default now()
);

create table if not exists public.confec_kanban_card_files (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.confec_kanban_cards(id) on delete cascade,
  storage_path text not null,
  nome text,
  tamanho bigint,
  mime text,
  created_by_email text,
  created_at timestamptz not null default now()
);

create table if not exists public.confec_kanban_card_comments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.confec_kanban_cards(id) on delete cascade,
  texto text not null,
  author_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kanban_card_checklist (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null,
  card_type text not null default 'confec',
  texto text not null,
  feito boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_confec_kanban_cards_status
  on public.confec_kanban_cards (status, position);

create index if not exists idx_confec_kanban_checklist_card
  on public.kanban_card_checklist (card_type, card_id, position);

create or replace function public.confec_kanban_set_ticket_number()
returns trigger
language plpgsql
as $$
begin
  if new.ticket_number is null then
    new.ticket_number := nextval('public.confec_kanban_ticket_number_seq');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists confec_kanban_ticket_number on public.confec_kanban_cards;
create trigger confec_kanban_ticket_number
before insert on public.confec_kanban_cards
for each row
execute procedure public.confec_kanban_set_ticket_number();

insert into public.confec_kanban_columns (title, slug, color, position)
values
  ('Backlog', 'backlog', '#94A3B8', 0),
  ('Analisados', 'analisados', '#4C9AFF', 1),
  ('Em andamento', 'em-andamento', '#F5C542', 2),
  ('Finalizados', 'finalizados', '#22C55E', 3)
on conflict (slug) do nothing;

alter table public.confec_kanban_columns enable row level security;
alter table public.confec_kanban_cards enable row level security;
alter table public.confec_kanban_labels enable row level security;
alter table public.confec_kanban_card_labels enable row level security;
alter table public.confec_kanban_card_images enable row level security;
alter table public.confec_kanban_card_files enable row level security;
alter table public.confec_kanban_card_comments enable row level security;
alter table public.kanban_card_checklist enable row level security;

grant select, insert, update, delete on table public.confec_kanban_columns to authenticated;
grant select, insert, update, delete on table public.confec_kanban_cards to authenticated;
grant select, insert, update, delete on table public.confec_kanban_labels to authenticated;
grant select, insert, update, delete on table public.confec_kanban_card_labels to authenticated;
grant select, insert, update, delete on table public.confec_kanban_card_images to authenticated;
grant select, insert, update, delete on table public.confec_kanban_card_files to authenticated;
grant select, insert, update, delete on table public.confec_kanban_card_comments to authenticated;
grant select, insert, update, delete on table public.kanban_card_checklist to authenticated;
grant usage, select on sequence public.confec_kanban_ticket_number_seq to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'confec_kanban_columns',
    'confec_kanban_cards',
    'confec_kanban_labels',
    'confec_kanban_card_labels',
    'confec_kanban_card_images',
    'confec_kanban_card_files',
    'confec_kanban_card_comments',
    'kanban_card_checklist'
  ]
  loop
    execute format('drop policy if exists painel_%s_select on public.%I', t, t);
    execute format('drop policy if exists painel_%s_insert on public.%I', t, t);
    execute format('drop policy if exists painel_%s_update on public.%I', t, t);
    execute format('drop policy if exists painel_%s_delete on public.%I', t, t);
    execute format(
      'create policy painel_%s_select on public.%I for select to authenticated using (public.painel_admin_ativo())',
      t, t
    );
    execute format(
      'create policy painel_%s_insert on public.%I for insert to authenticated with check (public.painel_admin_ativo())',
      t, t
    );
    execute format(
      'create policy painel_%s_update on public.%I for update to authenticated using (public.painel_admin_ativo()) with check (public.painel_admin_ativo())',
      t, t
    );
  end loop;
end $$;

create policy painel_confec_kanban_columns_delete
on public.confec_kanban_columns for delete to authenticated
using (public.painel_admin_pode_excluir());

create policy painel_confec_kanban_cards_delete
on public.confec_kanban_cards for delete to authenticated
using (public.painel_admin_pode_excluir());

create policy painel_confec_kanban_labels_delete
on public.confec_kanban_labels for delete to authenticated
using (public.painel_admin_pode_excluir());

create policy painel_confec_kanban_card_labels_delete
on public.confec_kanban_card_labels for delete to authenticated
using (public.painel_admin_ativo());

create policy painel_confec_kanban_card_images_delete
on public.confec_kanban_card_images for delete to authenticated
using (public.painel_admin_ativo());

create policy painel_confec_kanban_card_files_delete
on public.confec_kanban_card_files for delete to authenticated
using (public.painel_admin_ativo());

create policy painel_kanban_card_checklist_delete
on public.kanban_card_checklist for delete to authenticated
using (public.painel_admin_ativo());

drop policy if exists painel_confec_kanban_card_comments_update on public.confec_kanban_card_comments;
create policy painel_confec_kanban_card_comments_update
on public.confec_kanban_card_comments for update to authenticated
using (
  public.painel_admin_ativo()
  and lower(author_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
)
with check (
  public.painel_admin_ativo()
  and lower(author_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

create policy painel_confec_kanban_card_comments_delete
on public.confec_kanban_card_comments for delete to authenticated
using (
  public.painel_admin_pode_excluir()
  or lower(author_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

create or replace function public.painel_admins_ativos()
returns table (email text)
language sql
stable
security definer
set search_path = public
as $$
  select au.email
  from public.admin_users au
  where public.painel_admin_ativo()
    and coalesce(au.active, true) = true
    and coalesce(au.email, '') <> ''
  order by au.email;
$$;

revoke all on function public.painel_admins_ativos() from public;
grant execute on function public.painel_admins_ativos() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('confec-kanban-files', 'confec-kanban-files', true, 5368709120)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists confec_kanban_files_select on storage.objects;
drop policy if exists confec_kanban_files_insert on storage.objects;
drop policy if exists confec_kanban_files_delete on storage.objects;

create policy confec_kanban_files_select
on storage.objects for select
to public
using (bucket_id = 'confec-kanban-files');

create policy confec_kanban_files_insert
on storage.objects for insert
to authenticated
with check (bucket_id = 'confec-kanban-files' and public.painel_admin_ativo());

create policy confec_kanban_files_delete
on storage.objects for delete
to authenticated
using (bucket_id = 'confec-kanban-files' and public.painel_admin_ativo());

do $$
declare
  t text;
begin
  foreach t in array array[
    'confec_kanban_columns',
    'confec_kanban_cards',
    'confec_kanban_labels',
    'confec_kanban_card_labels',
    'confec_kanban_card_images',
    'confec_kanban_card_files',
    'confec_kanban_card_comments',
    'kanban_card_checklist'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
    end;
  end loop;
end $$;
