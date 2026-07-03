-- Inclui categoria "Método 360" em suporte_videos (vínculo com checklist Método 360).
-- Execute no SQL Editor do Supabase.

alter table public.suporte_videos drop constraint if exists suporte_videos_categoria_check;

alter table public.suporte_videos add constraint suporte_videos_categoria_check check (
    categoria in (
        'Vendas',
        'Financeiro',
        'Produção',
        'Estoque',
        'Cadastros',
        'Configurações',
        'Método 360'
    )
);
