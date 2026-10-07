-- E-mails aprendidos ao vincular um agendamento. Os próximos com o mesmo e-mail entram no cliente.
-- Execute no SQL Editor do Supabase (requer painel_admin_ativo).

create table if not exists public.admin_google_cliente_emails (
  email text primary key,
  cliente_id uuid not null references public.clientes_azoup(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_google_cliente_emails_cliente
  on public.admin_google_cliente_emails (cliente_id);

comment on table public.admin_google_cliente_emails is
  'E-mail do convidado associado ao cliente quando um agendamento é vinculado à mão.';

alter table public.admin_google_cliente_emails enable row level security;

drop policy if exists painel_admin_gcal_emails_select on public.admin_google_cliente_emails;

create policy painel_admin_gcal_emails_select
on public.admin_google_cliente_emails
for select
to authenticated
using (public.painel_admin_ativo());

grant select on table public.admin_google_cliente_emails to authenticated;
