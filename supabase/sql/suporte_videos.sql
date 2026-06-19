-- Vídeos de suporte (YouTube) exibidos no app Azoup.
-- Execute no SQL Editor do Supabase.

create table if not exists public.suporte_videos (
    id uuid primary key default gen_random_uuid(),
    titulo text not null,
    youtube_url text not null,
    categoria text not null check (
        categoria in (
            'Vendas',
            'Financeiro',
            'Produção',
            'Estoque',
            'Cadastros',
            'Configurações'
        )
    ),
    ordem integer not null default 0,
    ativo boolean not null default true,
    created_by_admin text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_suporte_videos_categoria_ordem
  on public.suporte_videos (categoria, ordem, created_at desc);

comment on table public.suporte_videos is
  'Vídeos tutoriais de suporte (YouTube) por categoria, gerenciados pelo painel ADM.';

alter table public.suporte_videos enable row level security;

drop policy if exists suporte_videos_public_select on public.suporte_videos;
drop policy if exists painel_admin_suporte_videos_select on public.suporte_videos;
drop policy if exists painel_admin_suporte_videos_insert on public.suporte_videos;
drop policy if exists painel_admin_suporte_videos_update on public.suporte_videos;
drop policy if exists painel_admin_suporte_videos_delete on public.suporte_videos;

create policy suporte_videos_public_select
on public.suporte_videos
for select
using (ativo = true);

create policy painel_admin_suporte_videos_select
on public.suporte_videos
for select
to authenticated
using (public.painel_admin_ativo());

create policy painel_admin_suporte_videos_insert
on public.suporte_videos
for insert
to authenticated
with check (public.painel_admin_ativo(array['owner', 'manager']::text[]));

create policy painel_admin_suporte_videos_update
on public.suporte_videos
for update
to authenticated
using (public.painel_admin_ativo(array['owner', 'manager']::text[]))
with check (public.painel_admin_ativo(array['owner', 'manager']::text[]));

create policy painel_admin_suporte_videos_delete
on public.suporte_videos
for delete
to authenticated
using (public.painel_admin_ativo(array['owner', 'manager']::text[]));
