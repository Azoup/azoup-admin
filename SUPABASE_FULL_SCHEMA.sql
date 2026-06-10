-- =============================================================================
-- SUPABASE FULL SCHEMA - Azoup ERP
-- Gerado automaticamente por build_full_schema.ps1
-- Data: 2026-06-10 14:57:31
--
-- COMO USAR (Supabase novo / clone para testes):
--   1. Crie um projeto Supabase vazio
--   2. SQL Editor: cole e execute este arquivo
--      (se exceder limite, use: psql ou supabase db execute -f SUPABASE_FULL_SCHEMA.sql)
--   3. Configure Auth, Storage buckets (nfe-xml, etc.) conforme backend/setup_nfe_storage.sql
--   4. Aponte EXPO_PUBLIC_SUPABASE_URL e keys no .env
--
-- NAO inclui: dados mock, scripts de limpeza, seeds por tenant especifico
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- =============================================================================
-- SOURCE: backend/table_initialization.sql
-- =============================================================================
-- Tabela para cidades
CREATE TABLE IF NOT EXISTS cidades (
  id SERIAL PRIMARY KEY,
  nome text NOT NULL,
  estado text NOT NULL
);

-- Index Ãºnico insensÃ­vel a maiÃºsculas/minÃºsculas para evitar duplicidade
CREATE UNIQUE INDEX IF NOT EXISTS unique_cidade_estado_upper ON cidades (UPPER(nome), UPPER(estado));

-- Tabela para salvar dados do cliente (apenas tela Criar Conta)
CREATE TABLE IF NOT EXISTS clientes_azoup (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  
  -- Dados do Cliente (SignUpScreen)
  nome text NOT NULL,
  email text UNIQUE NOT NULL,
  telefone text,
  cep text,
  rua text,
  numero text,
  bairro text,
  cidade_id integer REFERENCES cidades(id),
  estado text,
  cpf text UNIQUE NOT NULL,
  aceitou_termos boolean NOT NULL DEFAULT false,
  aceitou_termos_em timestamptz
);

-- Tabela para usuÃ¡rios do sistema (ligada ao cliente)
-- Se deletar o CLIENTE, o usuÃ¡rio Ã© deletado automaticamente (ON DELETE CASCADE)
-- Deletar o usuÃ¡rio NÃƒO afeta o cadastro do cliente.
CREATE TABLE IF NOT EXISTS usuarios (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  nome text NOT NULL,
  usuario text UNIQUE NOT NULL,
  senha text NOT NULL,
  ativo boolean DEFAULT true
);

-- Ativar RLS para usuarios
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

-- PolÃ­ticas para usuÃ¡rios
CREATE POLICY "Allow anonymous insert for usuarios" ON usuarios FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select for usuarios" ON usuarios FOR SELECT USING (true);

-- Ativar RLS (Row Level Security)
ALTER TABLE clientes_azoup ENABLE ROW LEVEL SECURITY;

-- PolÃ­tica simples para permitir inserÃ§Ã£o e visualizaÃ§Ã£o
CREATE POLICY "Allow anonymous insert" ON clientes_azoup FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select" ON clientes_azoup FOR SELECT USING (true);

-- Tabela para os regimes tributÃ¡rios
CREATE TABLE IF NOT EXISTS regimes_tributarios (
  id integer PRIMARY KEY,
  nome text NOT NULL UNIQUE
);

-- Inserts iniciais para regimes tributÃ¡rios com cÃ³digos oficiais na descriÃ§Ã£o
INSERT INTO regimes_tributarios (id, nome) VALUES 
(0, '0 - Simples Nacional'),
(1, '1 - MEI - Microempreendedor Individual'),
(2, '2 - Lucro Presumido'),
(3, '3 - Lucro Real')
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

-- Tabela para salvar dados da empresa
-- Se deletar o cliente, a empresa Ã© deletada (CASCADE)
CREATE TABLE IF NOT EXISTS empresas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
  regime_id uuid REFERENCES regimes_tributarios(id),
  created_at timestamptz DEFAULT now(),
  
  razao_social text NOT NULL,
  cnpj text UNIQUE NOT NULL,
  ie text,
  cep text,
  rua text,
  numero text,
  bairro text,
  cidade_id integer REFERENCES cidades(id),
  estado text
);

-- PolÃ­ticas para a tabela regimes_tributarios
ALTER TABLE regimes_tributarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public select for regimes" ON regimes_tributarios FOR SELECT USING (true);

-- PolÃ­ticas para a tabela cidades (permitir todos verem e inserirem para o fluxo de cadastro)
ALTER TABLE cidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public select for cidades" ON cidades FOR SELECT USING (true);
CREATE POLICY "Allow public insert for cidades" ON cidades FOR INSERT WITH CHECK (true);

-- Ativar RLS (Row Level Security)
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;

-- PolÃ­ticas para a tabela empresas
CREATE POLICY "Allow anonymous insert for empresas" ON empresas FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select for empresas" ON empresas FOR SELECT USING (true);


-- =============================================================================
-- SOURCE: backend/secure_database.sql
-- =============================================================================
-- 1. Alterar tabela de usuÃ¡rios para vincular com Supabase Auth
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS auth_id UUID REFERENCES auth.users(id);

-- 2. Habilitar RLS (Row Level Security) em todas as tabelas sensÃ­veis
ALTER TABLE clientes_azoup ENABLE ROW LEVEL SECURITY;
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE assinaturas_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE planos_assinatura ENABLE ROW LEVEL SECURITY;
ALTER TABLE regimes_tributarios ENABLE ROW LEVEL SECURITY;

-- 3. Criar funÃ§Ã£o auxiliar para evitar recursÃ£o no RLS
-- Esta funÃ§Ã£o Ã© SECURITY DEFINER para ignorar RLS ao buscar o cliente_id do prÃ³prio usuÃ¡rio logado
CREATE OR REPLACE FUNCTION get_my_cliente_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cliente_id FROM usuarios WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- 4. Criar PolÃ­ticas de SeguranÃ§a (Policies)

-- === Tabela: usuarios ===
DROP POLICY IF EXISTS "Usuarios podem ver seu proprio perfil" ON usuarios;
DROP POLICY IF EXISTS "Usuarios podem atualizar seu proprio perfil" ON usuarios;
DROP POLICY IF EXISTS "Permitir cadastro inicial" ON usuarios;
DROP POLICY IF EXISTS "Gerenciar usuarios do mesmo cliente" ON usuarios;
DROP POLICY IF EXISTS "Permitir auto-cadastro" ON usuarios;

-- UsuÃ¡rios podem ver e gerenciar outros usuÃ¡rios do mesmo cliente
CREATE POLICY "Gerenciar usuarios do mesmo cliente" ON usuarios
FOR ALL USING (cliente_id = get_my_cliente_id())
WITH CHECK (cliente_id = get_my_cliente_id());

-- Permitir INSERT inicial (quando o usuÃ¡rio ainda nÃ£o existe na tabela usuarios)
CREATE POLICY "Permitir auto-cadastro" ON usuarios
FOR INSERT WITH CHECK (auth.uid() = auth_id);


-- === Tabela: clientes_azoup ===
DROP POLICY IF EXISTS "Usuarios podem ver os dados do seu cliente" ON clientes_azoup;
DROP POLICY IF EXISTS "Permitir cadastro de clientes nao autenticados" ON clientes_azoup;
DROP POLICY IF EXISTS "Acesso dados do cliente" ON clientes_azoup;
DROP POLICY IF EXISTS "Permitir cadastro inicial clientes" ON clientes_azoup;

CREATE POLICY "Acesso dados do cliente" ON clientes_azoup
FOR SELECT USING (id = get_my_cliente_id());

CREATE POLICY "Permitir cadastro inicial clientes" ON clientes_azoup
FOR INSERT WITH CHECK (true);


-- === Tabela: assinaturas_clientes ===
DROP POLICY IF EXISTS "Usuarios podem ver sua assinatura" ON assinaturas_clientes;
DROP POLICY IF EXISTS "Permitir criar assinatura no cadastro" ON assinaturas_clientes;
DROP POLICY IF EXISTS "Acesso assinaturas cliente" ON assinaturas_clientes;
DROP POLICY IF EXISTS "Permitir criar assinatura inicial" ON assinaturas_clientes;

CREATE POLICY "Acesso assinaturas cliente" ON assinaturas_clientes
FOR SELECT USING (cliente_id = get_my_cliente_id());

CREATE POLICY "Permitir criar assinatura inicial" ON assinaturas_clientes
FOR INSERT WITH CHECK (true);


-- === Tabela: empresas ===
DROP POLICY IF EXISTS "Usuarios podem ver sua empresa" ON empresas;
DROP POLICY IF EXISTS "Permitir criar empresa no cadastro" ON empresas;
DROP POLICY IF EXISTS "Usuarios podem atualizar sua empresa" ON empresas;
DROP POLICY IF EXISTS "Gerenciar empresas do cliente" ON empresas;
DROP POLICY IF EXISTS "Permitir criar empresa inicial" ON empresas;

CREATE POLICY "Gerenciar empresas do cliente" ON empresas
FOR ALL USING (cliente_id = get_my_cliente_id())
WITH CHECK (cliente_id = get_my_cliente_id());

CREATE POLICY "Permitir criar empresa inicial" ON empresas
FOR INSERT WITH CHECK (true);


-- === Tabelas PÃºblicas (Leitura) ===
DROP POLICY IF EXISTS "Leitura Publica Planos" ON planos_assinatura;
DROP POLICY IF EXISTS "Leitura Publica Regimes" ON regimes_tributarios;

CREATE POLICY "Leitura Publica Planos" ON planos_assinatura FOR SELECT USING (true);
CREATE POLICY "Leitura Publica Regimes" ON regimes_tributarios FOR SELECT USING (true);


-- 5. AutomaÃ§Ã£o de Contagem de UsuÃ¡rios via Trigger
ALTER TABLE clientes_azoup ADD COLUMN IF NOT EXISTS qtde_user INT DEFAULT 0;

CREATE OR REPLACE FUNCTION update_qtde_users()
RETURNS TRIGGER 
SECURITY DEFINER
AS $$
BEGIN
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        UPDATE clientes_azoup
        SET qtde_user = (SELECT count(*) FROM usuarios WHERE cliente_id = NEW.cliente_id AND ativo = true)
        WHERE id = NEW.cliente_id;
    END IF;
    
    IF (TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.cliente_id <> NEW.cliente_id)) THEN
        UPDATE clientes_azoup
        SET qtde_user = (SELECT count(*) FROM usuarios WHERE cliente_id = OLD.cliente_id AND ativo = true)
        WHERE id = OLD.cliente_id;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_qtde_users ON usuarios;

CREATE TRIGGER trg_update_qtde_users
AFTER INSERT OR UPDATE OR DELETE ON usuarios
FOR EACH ROW
EXECUTE FUNCTION update_qtde_users();

-- Atualizar contagem inicial
UPDATE clientes_azoup c
SET qtde_user = (SELECT count(*) FROM usuarios u WHERE u.cliente_id = c.id AND u.ativo = true);


-- =============================================================================
-- SOURCE: frontend/database/migration_fix_clientes_references_clientes_azoup.sql
-- =============================================================================
-- ============================================================
-- Corrige referÃªncias Ã  tabela inexistente "clientes"
-- O cadastro inicial (SignUp + UserSignUp) usa clientes_azoup.
-- Scripts antigos (ex.: setup_plans.sql) apontavam para "clientes".
-- Rode no SQL Editor do Supabase se aparecer:
--   relation "clientes" does not exist
-- ============================================================

-- 1) assinaturas_clientes: FK para clientes_azoup
ALTER TABLE public.assinaturas_clientes
    DROP CONSTRAINT IF EXISTS assinaturas_clientes_cliente_id_fkey;

ALTER TABLE public.assinaturas_clientes
    ADD CONSTRAINT assinaturas_clientes_cliente_id_fkey
    FOREIGN KEY (cliente_id)
    REFERENCES public.clientes_azoup (id)
    ON DELETE CASCADE;

-- 2) usuarios: garantir FK para clientes_azoup (caso tenha ficado apontando para "clientes")
ALTER TABLE public.usuarios
    DROP CONSTRAINT IF EXISTS usuarios_cliente_id_fkey;

ALTER TABLE public.usuarios
    ADD CONSTRAINT usuarios_cliente_id_fkey
    FOREIGN KEY (cliente_id)
    REFERENCES public.clientes_azoup (id)
    ON DELETE CASCADE;

-- 3) Recriar funÃ§Ã£o/trigger de contagem (garante uso apenas de clientes_azoup)
CREATE OR REPLACE FUNCTION public.update_qtde_users()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        UPDATE public.clientes_azoup
        SET qtde_user = (
            SELECT count(*)::int
            FROM public.usuarios
            WHERE cliente_id = NEW.cliente_id AND ativo = true
        )
        WHERE id = NEW.cliente_id;
    END IF;

    IF (TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.cliente_id <> NEW.cliente_id)) THEN
        UPDATE public.clientes_azoup
        SET qtde_user = (
            SELECT count(*)::int
            FROM public.usuarios
            WHERE cliente_id = OLD.cliente_id AND ativo = true
        )
        WHERE id = OLD.cliente_id;
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_qtde_users ON public.usuarios;
CREATE TRIGGER trg_update_qtde_users
    AFTER INSERT OR UPDATE OR DELETE ON public.usuarios
    FOR EACH ROW
    EXECUTE FUNCTION public.update_qtde_users();


-- =============================================================================
-- SOURCE: frontend/database/migration_clientes_azoup_empresas_usuarios_extra.sql
-- =============================================================================
-- Espelho em clientes_azoup das quantidades contratadas via Stripe (addons).
-- Preencha/atualize estes campos no webhook ou fluxo de sync com a assinatura.
-- Rodar uma vez no Supabase (idempotente: IF NOT EXISTS).

ALTER TABLE public.clientes_azoup
    ADD COLUMN IF NOT EXISTS empresas_extra integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS usuarios_extra integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.clientes_azoup.empresas_extra IS
    'Quantidade de empresas adicionais contratadas (Stripe / billing), alÃ©m do que o plano inclui.';
COMMENT ON COLUMN public.clientes_azoup.usuarios_extra IS
    'Quantidade de usuÃ¡rios adicionais contratados (Stripe / billing), alÃ©m do que o plano inclui.';

-- Opcional: copiar valores atuais da assinatura ativa (mantÃ©m consistÃªncia apÃ³s criar as colunas).
-- Remova este bloco se preferir comeÃ§ar tudo em 0 e popular sÃ³ pelo Stripe.
-- Status alinhados a fetchAssinaturaAtiva no backend (billingRoutes.js).
UPDATE public.clientes_azoup c
SET
    usuarios_extra = COALESCE(a.usuarios_adicionais, 0),
    empresas_extra = COALESCE(a.empresas_adicionais, 0)
FROM (
    SELECT DISTINCT ON (cliente_id)
        cliente_id,
        usuarios_adicionais,
        empresas_adicionais
    FROM public.assinaturas_clientes
    WHERE status IN ('Ativo', 'active', 'Trial')
    ORDER BY cliente_id, data_inicio DESC NULLS LAST
) a
WHERE c.id = a.cliente_id;


-- =============================================================================
-- SOURCE: frontend/database/migration_clientes_aceite_termos.sql
-- =============================================================================
-- Marca aceite obrigatÃ³rio dos termos no cadastro inicial do cliente.
ALTER TABLE clientes_azoup
ADD COLUMN IF NOT EXISTS aceitou_termos BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS aceitou_termos_em TIMESTAMPTZ;

COMMENT ON COLUMN clientes_azoup.aceitou_termos IS
    'Indica se o cliente aceitou os Termos de Uso, PolÃ­tica de Privacidade e PolÃ­tica de Cookies.';

COMMENT ON COLUMN clientes_azoup.aceitou_termos_em IS
    'Data e hora em que o cliente aceitou os termos legais da plataforma.';



-- =============================================================================
-- SOURCE: frontend/database/migration_tipos_usuario_permissoes.sql
-- =============================================================================
-- Tipos de usuÃ¡rio com telas permitidas
create table if not exists public.tipos_usuario (
    id uuid primary key default gen_random_uuid(),
    cliente_id uuid not null references public.clientes_azoup(id) on delete cascade,
    descricao text not null,
    telas_acesso jsonb not null default '[]'::jsonb,
    ativo boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_tipos_usuario_cliente_id on public.tipos_usuario(cliente_id);
create unique index if not exists idx_tipos_usuario_cliente_descricao_un
    on public.tipos_usuario(cliente_id, lower(descricao));

-- UsuÃ¡rio passa a poder referenciar tipo e/ou permissÃµes customizadas
alter table public.usuarios
    add column if not exists tipo_usuario_id uuid null references public.tipos_usuario(id) on delete set null;

alter table public.usuarios
    add column if not exists permissoes_telas jsonb null;

create index if not exists idx_usuarios_tipo_usuario_id on public.usuarios(tipo_usuario_id);


-- =============================================================================
-- SOURCE: frontend/database/migration_usuarios_eh_admin.sql
-- =============================================================================
-- Perfis de administrador por cliente (tenant).
-- Rode no SQL Editor do Supabase (ou psql) uma vez.

ALTER TABLE public.usuarios
    ADD COLUMN IF NOT EXISTS eh_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.usuarios.eh_admin IS
    'Administrador do cliente: primeiro login do cadastro ou marcado ao criar novo usuÃ¡rio.';

-- HistÃ³rico: o primeiro usuÃ¡rio criado de cada cliente vira admin (menor created_at).
UPDATE public.usuarios u
SET eh_admin = true
WHERE u.id IN (
    SELECT DISTINCT ON (cliente_id) id
    FROM public.usuarios
    ORDER BY cliente_id, created_at ASC NULLS LAST, id ASC
);

-- Opcional: garantir que ninguÃ©m fique sem admin se o UPDATE acima nÃ£o rodou antes (idempotente).
-- Se precisar marcar manualmente um usuÃ¡rio:
-- UPDATE public.usuarios SET eh_admin = true WHERE id = 'uuid-aqui';


-- =============================================================================
-- SOURCE: frontend/database/migration_usuario_foto_perfil.sql
-- =============================================================================
-- Foto de perfil do usuÃ¡rio (URL pÃºblica no R2, pasta usuario-fotos â€” mesmo padrÃ£o de imagens de produto).

ALTER TABLE public.usuarios
    ADD COLUMN IF NOT EXISTS foto_perfil_url TEXT;

COMMENT ON COLUMN public.usuarios.foto_perfil_url IS
    'URL pÃºblica da foto de perfil (storage R2, pasta usuario-fotos).';


-- =============================================================================
-- SOURCE: frontend/database/migration_desconto_maximo_usuario.sql
-- =============================================================================
-- Desconto mÃ¡ximo permitido (%), por tipo de usuÃ¡rio e sobrescrito por usuÃ¡rio.
-- Admin (eh_admin) ignora o limite no app; colunas ainda permitem defaults para relatÃ³rios.

ALTER TABLE public.tipos_usuario
  ADD COLUMN IF NOT EXISTS desconto_maximo_percentual numeric(5, 2) NOT NULL DEFAULT 100
  CHECK (desconto_maximo_percentual >= 0 AND desconto_maximo_percentual <= 100);

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS desconto_maximo_percentual numeric(5, 2) NULL
  CHECK (desconto_maximo_percentual IS NULL OR (desconto_maximo_percentual >= 0 AND desconto_maximo_percentual <= 100));

COMMENT ON COLUMN public.tipos_usuario.desconto_maximo_percentual IS 'MÃ¡x. desconto em % que usuÃ¡rios deste tipo podem aplicar (0â€“100).';
COMMENT ON COLUMN public.usuarios.desconto_maximo_percentual IS 'Teto de desconto em % (0â€“100). NULL = sem limite (nÃ£o herda do tipo).';

-- Registros existentes: jÃ¡ recebem DEFAULT 100 em tipos_usuario.
UPDATE public.tipos_usuario
SET desconto_maximo_percentual = 100
WHERE desconto_maximo_percentual IS NULL;


-- =============================================================================
-- SOURCE: frontend/database/migration_usuario_tutorial_flags.sql
-- =============================================================================
-- Flags de tutorial por usuario/menu, sincronizadas no banco.
CREATE TABLE IF NOT EXISTS usuario_tutorial_flags (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    cliente_id UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    menu_key VARCHAR(80) NOT NULL,
    seen BOOLEAN NOT NULL DEFAULT TRUE,
    seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (usuario_id, menu_key)
);

CREATE INDEX IF NOT EXISTS idx_usuario_tutorial_flags_usuario
ON usuario_tutorial_flags(usuario_id);

CREATE INDEX IF NOT EXISTS idx_usuario_tutorial_flags_cliente
ON usuario_tutorial_flags(cliente_id);

ALTER TABLE usuario_tutorial_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso total usuario_tutorial_flags"
ON usuario_tutorial_flags
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);


-- =============================================================================
-- SOURCE: frontend/database/migration_empresas_ativo.sql
-- =============================================================================
-- Adiciona status de empresa ativa/inativa.
-- Usado para permitir inativaÃ§Ã£o em vez de exclusÃ£o quando hÃ¡ vÃ­nculos.

alter table public.empresas
    add column if not exists ativo boolean not null default true;

comment on column public.empresas.ativo is
'Status da empresa no sistema: true = ativa, false = inativa.';



-- =============================================================================
-- SOURCE: frontend/database/migration_empresas_nome_fantasia.sql
-- =============================================================================
-- Nome fantasia do emitente (formulÃ¡rio de empresas + NF-e xFant).
-- Idempotente: rodar uma vez no SQL Editor do Supabase.

ALTER TABLE public.empresas
    ADD COLUMN IF NOT EXISTS nome_fantasia TEXT;

COMMENT ON COLUMN public.empresas.nome_fantasia IS
    'Nome fantasia da empresa (emitente NF-e / exibiÃ§Ã£o no app).';


-- =============================================================================
-- SOURCE: frontend/database/migration_empresa_matriz.sql
-- =============================================================================
-- Marca uma empresa por tenant como "matriz" / padrÃ£o (filtros e preenchimentos iniciais).
-- No mÃ¡ximo uma empresa com empresa_matriz = true por cliente_id.

ALTER TABLE public.empresas
    ADD COLUMN IF NOT EXISTS empresa_matriz BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.empresas.empresa_matriz IS 'Se true, empresa padrÃ£o (matriz): sugerida nos filtros e formulÃ¡rios; apenas uma por cliente.';

-- Garante no mÃ¡ximo uma matriz por cliente
CREATE UNIQUE INDEX IF NOT EXISTS uidx_empresa_uma_matriz_por_cliente
    ON public.empresas (cliente_id)
    WHERE empresa_matriz IS TRUE;

-- Tenants que ainda nÃ£o tÃªm nenhuma matriz: marca a primeira (por razÃ£o social) como matriz
WITH first_per_client AS (
    SELECT DISTINCT ON (cliente_id) id AS empresa_id, cliente_id
    FROM public.empresas
    ORDER BY cliente_id, razao_social NULLS LAST, id
)
UPDATE public.empresas e
SET empresa_matriz = true
FROM first_per_client f
WHERE e.id = f.empresa_id
  AND NOT EXISTS (
      SELECT 1 FROM public.empresas x WHERE x.cliente_id = e.cliente_id AND x.empresa_matriz IS TRUE
  );


-- =============================================================================
-- SOURCE: frontend/database/migration_empresa_nfe_ambiente.sql
-- =============================================================================
-- Ambiente SEFAZ da NF-e por empresa (tpAmb / nota_fiscal.ambiente)
-- 1 = ProduÃ§Ã£o (notas oficiais)
-- 2 = HomologaÃ§Ã£o (testes na SEFAZ)
--
-- PRÃ‰-REQUISITO: a tabela empresas deve existir (mesmo projeto Supabase do app).
-- Se der erro "relation empresas does not exist", rode antes no SQL Editor:
--   backend/table_initialization.sql  (trecho CREATE TABLE empresas)
-- ou confira o projeto: Table Editor â†’ deve listar "empresas".
--
-- DiagnÃ³stico (rode sozinho se precisar):
--   SELECT table_schema, table_name
--   FROM information_schema.tables
--   WHERE table_name ILIKE '%empresa%'
--   ORDER BY 1, 2;
--
-- Como usar depois da migration:
--   ProduÃ§Ã£o:     UPDATE empresas SET nfe_ambiente = 1 WHERE id = '<uuid-da-empresa>';
--   HomologaÃ§Ã£o:  UPDATE empresas SET nfe_ambiente = 2 WHERE id = '<uuid-da-empresa>';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'empresas'
    ) THEN
        RAISE EXCEPTION
            'Tabela public.empresas nÃ£o existe neste banco. '
            'Use o mesmo projeto Supabase do app (EXPO_PUBLIC_SUPABASE_URL), '
            'crie a tabela com backend/table_initialization.sql e rode esta migration de novo.';
    END IF;
END $$;

ALTER TABLE empresas
    ADD COLUMN IF NOT EXISTS nfe_ambiente SMALLINT NOT NULL DEFAULT 1;

COMMENT ON COLUMN empresas.nfe_ambiente IS
    'Ambiente SEFAZ para emissÃ£o de NF-e: 1 = ProduÃ§Ã£o, 2 = HomologaÃ§Ã£o (tpAmb).';

ALTER TABLE empresas
    DROP CONSTRAINT IF EXISTS empresas_nfe_ambiente_check;

ALTER TABLE empresas
    ADD CONSTRAINT empresas_nfe_ambiente_check
    CHECK (nfe_ambiente IN (1, 2));

UPDATE empresas
SET nfe_ambiente = 1
WHERE nfe_ambiente IS NULL OR nfe_ambiente NOT IN (1, 2);


-- =============================================================================
-- SOURCE: frontend/database/migration_empresa_tipos_confeccao.sql
-- =============================================================================
-- Tipos de confecÃ§Ã£o da empresa (mÃºltipla escolha por empresa).
-- Rode no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS public.empresa_tipos_confeccao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes_azoup (id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
    tipo_codigo TEXT NOT NULL CHECK (tipo_codigo IN ('moda', 'uniforme', 'private_label', 'outro')),
    outro_descricao TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT empresa_tipos_confeccao_outro_desc_ck CHECK (
        (tipo_codigo = 'outro' AND outro_descricao IS NOT NULL AND length(trim(outro_descricao)) > 0)
        OR
        (tipo_codigo <> 'outro' AND outro_descricao IS NULL)
    )
);

-- Uma linha por opÃ§Ã£o fixa (moda, uniforme, private label) por empresa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_empresa_tipos_confeccao_empresa_tipo_fixo
    ON public.empresa_tipos_confeccao (empresa_id, tipo_codigo)
    WHERE tipo_codigo IN ('moda', 'uniforme', 'private_label');

-- Uma linha "outro" por empresa (texto em outro_descricao).
CREATE UNIQUE INDEX IF NOT EXISTS uq_empresa_tipos_confeccao_empresa_outro
    ON public.empresa_tipos_confeccao (empresa_id)
    WHERE tipo_codigo = 'outro';

CREATE INDEX IF NOT EXISTS idx_empresa_tipos_confeccao_cliente
    ON public.empresa_tipos_confeccao (cliente_id);

CREATE INDEX IF NOT EXISTS idx_empresa_tipos_confeccao_empresa
    ON public.empresa_tipos_confeccao (empresa_id);

COMMENT ON TABLE public.empresa_tipos_confeccao IS 'Segmentos de confecÃ§Ã£o por empresa (vÃ¡rias opÃ§Ãµes por empresa).';
COMMENT ON COLUMN public.empresa_tipos_confeccao.cliente_id IS 'Tenant (clientes_azoup.id), espelhado para consultas e RLS.';
COMMENT ON COLUMN public.empresa_tipos_confeccao.outro_descricao IS 'Preenchido apenas quando tipo_codigo = outro.';

-- RLS (mesmo padrÃ£o das demais tabelas do projeto: acesso liberado para authenticated).
-- PolÃ­tica adicional para anon: fluxo de cadastro inicial (CompanySignUp) antes de criar usuÃ¡rio no Auth.
ALTER TABLE public.empresa_tipos_confeccao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total empresa_tipos_confeccao" ON public.empresa_tipos_confeccao;
CREATE POLICY "Acesso total empresa_tipos_confeccao"
    ON public.empresa_tipos_confeccao
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso total empresa_tipos_confeccao anon" ON public.empresa_tipos_confeccao;
CREATE POLICY "Acesso total empresa_tipos_confeccao anon"
    ON public.empresa_tipos_confeccao
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);


-- =============================================================================
-- SOURCE: frontend/database/00_bootstrap_crm.sql
-- =============================================================================
-- CRM + config estoque â€” rodar apÃ³s table_initialization, antes de vendas/produÃ§Ã£o
-- (parte 1 de bootstrap_missing)

CREATE TABLE IF NOT EXISTS public.tipos_clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes_azoup(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tipos_clientes_cliente_id_nome_key UNIQUE (cliente_id, nome)
);

CREATE TABLE IF NOT EXISTS public.origens_clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes_azoup(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT origens_clientes_cliente_id_nome_key UNIQUE (cliente_id, nome)
);

CREATE TABLE IF NOT EXISTS public.cliente_contato_tipo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes_azoup(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT cliente_contato_tipo_cliente_id_nome_key UNIQUE (cliente_id, nome)
);

CREATE TABLE IF NOT EXISTS public.tipos_fornecedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes_azoup(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tipos_fornecedores_cliente_id_nome_key UNIQUE (cliente_id, nome)
);

CREATE TABLE IF NOT EXISTS public.origens_fornecedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes_azoup(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT origens_fornecedores_cliente_id_nome_key UNIQUE (cliente_id, nome)
);

CREATE TABLE IF NOT EXISTS public.fornecedor_contato_tipo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes_azoup(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fornecedor_contato_tipo_cliente_id_nome_key UNIQUE (cliente_id, nome)
);

CREATE TABLE IF NOT EXISTS public.clientes_cadastros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes_azoup(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    tipo_pessoa TEXT NOT NULL DEFAULT 'Juridica' CHECK (tipo_pessoa IN ('Fisica', 'Juridica')),
    cpf TEXT, cnpj TEXT, data_nascimento DATE, nome_fantasia TEXT,
    inscricao_municipal TEXT, inscricao_estadual TEXT,
    tipo_cliente_id UUID REFERENCES public.tipos_clientes(id) ON DELETE SET NULL,
    origem_cliente_id UUID REFERENCES public.origens_clientes(id) ON DELETE SET NULL,
    contribuinte BOOLEAN NOT NULL DEFAULT false,
    consumidor_final BOOLEAN NOT NULL DEFAULT false,
    simples_nacional BOOLEAN NOT NULL DEFAULT false,
    observacoes TEXT, ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clientes_cadastros_cliente_id ON public.clientes_cadastros(cliente_id);

CREATE TABLE IF NOT EXISTS public.fornecedores_cadastros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes_azoup(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    tipo_pessoa TEXT NOT NULL DEFAULT 'Juridica' CHECK (tipo_pessoa IN ('Fisica', 'Juridica')),
    cpf TEXT, cnpj TEXT, data_nascimento DATE, nome_fantasia TEXT,
    inscricao_municipal TEXT, inscricao_estadual TEXT,
    tipo_fornecedor_id UUID REFERENCES public.tipos_fornecedores(id) ON DELETE SET NULL,
    origem_fornecedor_id UUID REFERENCES public.origens_fornecedores(id) ON DELETE SET NULL,
    contribuinte BOOLEAN NOT NULL DEFAULT false,
    consumidor_final BOOLEAN NOT NULL DEFAULT false,
    simples_nacional BOOLEAN NOT NULL DEFAULT false,
    is_faccionista BOOLEAN NOT NULL DEFAULT false,
    observacoes TEXT, ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fornecedores_cadastros_cliente_id ON public.fornecedores_cadastros(cliente_id);

CREATE TABLE IF NOT EXISTS public.cliente_endereco (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cadastro_id UUID NOT NULL REFERENCES public.clientes_cadastros(id) ON DELETE CASCADE,
    cep TEXT, rua TEXT, numero TEXT, complemento TEXT, bairro TEXT,
    cidade_id INTEGER REFERENCES public.cidades(id) ON DELETE SET NULL,
    estado TEXT, pais_codigo TEXT DEFAULT '1058', tipo_endereco TEXT,
    principal BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cliente_contato (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cadastro_id UUID NOT NULL REFERENCES public.clientes_cadastros(id) ON DELETE CASCADE,
    contato TEXT, numero TEXT, email TEXT,
    tipo_contato_id UUID REFERENCES public.cliente_contato_tipo(id) ON DELETE SET NULL,
    principal BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fornecedor_endereco (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cadastro_id UUID NOT NULL REFERENCES public.fornecedores_cadastros(id) ON DELETE CASCADE,
    cep TEXT, rua TEXT, numero TEXT, complemento TEXT, bairro TEXT,
    cidade_id INTEGER REFERENCES public.cidades(id) ON DELETE SET NULL,
    estado TEXT, principal BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fornecedor_contato (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cadastro_id UUID NOT NULL REFERENCES public.fornecedores_cadastros(id) ON DELETE CASCADE,
    contato TEXT, numero TEXT, email TEXT,
    tipo_contato_id UUID REFERENCES public.fornecedor_contato_tipo(id) ON DELETE SET NULL,
    principal BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.configuracoes_estoque (
    cliente_id UUID PRIMARY KEY REFERENCES public.clientes_azoup(id) ON DELETE CASCADE,
    limite_baixo_produto INTEGER NOT NULL DEFAULT 10,
    limite_baixo_tecido NUMERIC(14,3) NOT NULL DEFAULT 5,
    limite_baixo_aviamento INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tipos_clientes','origens_clientes','cliente_contato_tipo','tipos_fornecedores','origens_fornecedores','fornecedor_contato_tipo',
    'clientes_cadastros','fornecedores_cadastros','cliente_endereco','cliente_contato','fornecedor_endereco','fornecedor_contato','configuracoes_estoque'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Acesso total %I" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Acesso total %I" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;


-- =============================================================================
-- SOURCE: backend/setup_plans.sql
-- =============================================================================
-- Tabela de Planos de Assinatura
CREATE TABLE IF NOT EXISTS planos_assinatura (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    preco_base DECIMAL(10, 2) NOT NULL,
    usuarios_inclusos INT NOT NULL,
    limite_nfe_mensal INT, -- NULL significa ilimitado
    armazenamento_gb INT NOT NULL,
    preco_usuario_adicional DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    preco_cnpj_adicional DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    credito_ia_mensal INT NOT NULL DEFAULT 0,
    tem_upgrades BOOLEAN DEFAULT FALSE,
    descricao TEXT,
    ativo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE planos_assinatura ADD COLUMN IF NOT EXISTS credito_ia_mensal INT NOT NULL DEFAULT 0;

-- Inserir alguns planos iniciais de exemplo
INSERT INTO planos_assinatura (nome, preco_base, usuarios_inclusos, limite_nfe_mensal, armazenamento_gb, preco_usuario_adicional, preco_cnpj_adicional, credito_ia_mensal, tem_upgrades, descricao)
VALUES 
('Essencial', 99.90, 1, 50, 5, 29.90, 49.90, 200, FALSE, 'Para pequenos negÃ³cios que estÃ£o comeÃ§ando.'),
('Profissional', 199.90, 3, 200, 20, 25.90, 39.90, 600, TRUE, 'Para empresas em crescimento com mais volume.'),
('Corporativo', 499.90, 10, NULL, 100, 19.90, 29.90, 2000, TRUE, 'SoluÃ§Ã£o completa para grandes operaÃ§Ãµes.');


-- Tabela de Assinaturas de Clientes
CREATE TABLE IF NOT EXISTS assinaturas_clientes (
    id SERIAL PRIMARY KEY,
    cliente_id UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    plano_id INT NOT NULL REFERENCES planos_assinatura(id),
    data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
    data_fim DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'Ativo', -- 'Ativo', 'Pendente', 'Cancelado', 'Expirado'
    valor_mensal_atual DECIMAL(10, 2),
    data_ultima_cobranca DATE,
    data_proxima_cobranca DATE,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- =============================================================================
-- SOURCE: frontend/database/migration_stripe_billing_v1.sql
-- =============================================================================
-- Stripe Billing v1
-- Adiciona colunas necessÃ¡rias para integraÃ§Ã£o com Stripe nas tabelas existentes
-- e cria tabelas de suporte para idempotÃªncia de webhooks e histÃ³rico de faturas.
-- Execute este arquivo UMA VEZ no Supabase SQL Editor.

-- ============================================================
-- planos_assinatura
-- ============================================================
ALTER TABLE planos_assinatura
    -- Colunas que podem jÃ¡ existir do setup_plans.sql original (ADD COLUMN IF NOT EXISTS Ã© seguro)
    ADD COLUMN IF NOT EXISTS tem_upgrades                    BOOLEAN      DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS descricao                       TEXT,
    ADD COLUMN IF NOT EXISTS ativo                           BOOLEAN      DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS criado_em                       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS atualizado_em                   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS preco_usuario_adicional         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS preco_cnpj_adicional            DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS credito_ia_mensal               INT          NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS limite_nfe_mensal               INT,
    -- Novas colunas desta migration
    ADD COLUMN IF NOT EXISTS empresas_incluidas              INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS limite_empresas_enterprise      INT          DEFAULT 10,
    ADD COLUMN IF NOT EXISTS stripe_product_id               VARCHAR(255),
    ADD COLUMN IF NOT EXISTS stripe_price_id_base            VARCHAR(255),
    ADD COLUMN IF NOT EXISTS stripe_price_id_usuario_adicional VARCHAR(255),
    ADD COLUMN IF NOT EXISTS stripe_price_id_empresa_adicional VARCHAR(255),
    ADD COLUMN IF NOT EXISTS is_enterprise                   BOOLEAN      DEFAULT FALSE;

COMMENT ON COLUMN planos_assinatura.empresas_incluidas IS
    'NÃºmero de empresas (CNPJs) incluÃ­das no plano sem custo adicional.';
COMMENT ON COLUMN planos_assinatura.limite_empresas_enterprise IS
    'Ao ultrapassar este nÃºmero de empresas o cliente Ã© redirecionado ao Plano Enterprise (contato manual).';
COMMENT ON COLUMN planos_assinatura.stripe_product_id IS
    'ID do produto no Stripe (prod_xxx). Preenchido pelo script stripeSetup.js.';
COMMENT ON COLUMN planos_assinatura.stripe_price_id_base IS
    'ID do preÃ§o base recorrente mensal no Stripe (price_xxx).';
COMMENT ON COLUMN planos_assinatura.stripe_price_id_usuario_adicional IS
    'ID do preÃ§o add-on por usuÃ¡rio adicional no Stripe (per-unit, mensal).';
COMMENT ON COLUMN planos_assinatura.stripe_price_id_empresa_adicional IS
    'ID do preÃ§o add-on por empresa adicional no Stripe (per-unit, mensal). DisponÃ­vel apenas no Plano 2.';
COMMENT ON COLUMN planos_assinatura.is_enterprise IS
    'True para o Plano Enterprise negociado manualmente; nÃ£o cria subscription no Stripe.';

-- ============================================================
-- assinaturas_clientes
-- ============================================================
ALTER TABLE assinaturas_clientes
    -- Colunas base que podem nÃ£o existir se setup_plans.sql nÃ£o foi executado
    ADD COLUMN IF NOT EXISTS valor_mensal_atual      DECIMAL(10,2),
    ADD COLUMN IF NOT EXISTS data_ultima_cobranca    DATE,
    ADD COLUMN IF NOT EXISTS data_proxima_cobranca   DATE,
    ADD COLUMN IF NOT EXISTS data_fim                DATE,
    ADD COLUMN IF NOT EXISTS criado_em               TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS atualizado_em           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Novas colunas desta migration
    ADD COLUMN IF NOT EXISTS stripe_subscription_id          VARCHAR(255) UNIQUE,
    ADD COLUMN IF NOT EXISTS stripe_customer_id              VARCHAR(255),
    ADD COLUMN IF NOT EXISTS stripe_status                   VARCHAR(50),
    ADD COLUMN IF NOT EXISTS usuarios_adicionais             INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS empresas_adicionais             INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS stripe_item_id_base             VARCHAR(255),
    ADD COLUMN IF NOT EXISTS stripe_item_id_usuario_adicional VARCHAR(255),
    ADD COLUMN IF NOT EXISTS stripe_item_id_empresa_adicional VARCHAR(255),
    ADD COLUMN IF NOT EXISTS is_enterprise                   BOOLEAN      DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS periodo_inicio                  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS periodo_fim                     TIMESTAMPTZ;

COMMENT ON COLUMN assinaturas_clientes.stripe_subscription_id IS
    'ID da subscription no Stripe (sub_xxx). Ãšnico por assinatura ativa.';
COMMENT ON COLUMN assinaturas_clientes.stripe_customer_id IS
    'ID do customer no Stripe (cus_xxx).';
COMMENT ON COLUMN assinaturas_clientes.stripe_status IS
    'Status da subscription sincronizado do Stripe: active, past_due, canceled, unpaid, etc.';
COMMENT ON COLUMN assinaturas_clientes.usuarios_adicionais IS
    'Quantidade de usuÃ¡rios alÃ©m dos inclusos no plano; reflete a quantity do item add-on no Stripe.';
COMMENT ON COLUMN assinaturas_clientes.empresas_adicionais IS
    'Quantidade de empresas alÃ©m das inclusas no plano; reflete a quantity do item add-on no Stripe.';
COMMENT ON COLUMN assinaturas_clientes.stripe_item_id_base IS
    'ID do subscription item do preÃ§o base (si_xxx).';
COMMENT ON COLUMN assinaturas_clientes.stripe_item_id_usuario_adicional IS
    'ID do subscription item de usuÃ¡rios adicionais (si_xxx).';
COMMENT ON COLUMN assinaturas_clientes.stripe_item_id_empresa_adicional IS
    'ID do subscription item de empresas adicionais (si_xxx). Apenas Plano 2.';
COMMENT ON COLUMN assinaturas_clientes.is_enterprise IS
    'True quando o cliente foi migrado para atendimento Enterprise manual (sem subscription Stripe).';

-- ============================================================
-- clientes_azoup
-- ============================================================
ALTER TABLE clientes_azoup
    ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255) UNIQUE;

COMMENT ON COLUMN clientes_azoup.stripe_customer_id IS
    'ID do customer no Stripe (cus_xxx). Criado na primeira subscription. Reutilizado em upgrades/downgrades.';

-- ============================================================
-- billing_webhook_events  (idempotÃªncia de webhooks Stripe)
-- ============================================================
CREATE TABLE IF NOT EXISTS billing_webhook_events (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_event_id VARCHAR(255) UNIQUE NOT NULL,
    tipo            VARCHAR(100) NOT NULL,
    payload         JSONB,
    processado      BOOLEAN      DEFAULT FALSE,
    erro            TEXT,
    criado_em       TIMESTAMPTZ  DEFAULT NOW()
);

COMMENT ON TABLE billing_webhook_events IS
    'Registro de todos os eventos Stripe recebidos via webhook. Garante processamento idempotente.';

-- ============================================================
-- historico_faturas
-- ============================================================
CREATE TABLE IF NOT EXISTS historico_faturas (
    id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id              UUID         NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    stripe_invoice_id       VARCHAR(255) UNIQUE NOT NULL,
    stripe_subscription_id  VARCHAR(255),
    valor_total             DECIMAL(10, 2),
    status                  VARCHAR(50),
    periodo_inicio          TIMESTAMPTZ,
    periodo_fim             TIMESTAMPTZ,
    pdf_url                 TEXT,
    criado_em               TIMESTAMPTZ  DEFAULT NOW()
);

COMMENT ON TABLE historico_faturas IS
    'HistÃ³rico de faturas geradas pelo Stripe, sincronizadas via webhook invoice.payment_succeeded.';

-- ============================================================
-- Atualizar planos existentes com os novos valores definitivos
-- ============================================================
-- EstratÃ©gia: UPDATE nos planos jÃ¡ existentes para preservar os IDs e as
-- referÃªncias em assinaturas_clientes (evita violaÃ§Ã£o de FK).
-- Para planos que nÃ£o existam ainda, INSERT com ON CONFLICT DO NOTHING.

-- Plano de menor preÃ§o existente â†’ Plano 1 (R$ 299/mÃªs)
-- Usa o plano de id mais baixo (ou qualquer nome antigo de entrada Ãºnica).
UPDATE planos_assinatura
SET
    nome                        = 'Plano 1',
    preco_base                  = 299.00,
    usuarios_inclusos           = 2,
    empresas_incluidas          = 1,
    limite_empresas_enterprise  = 10,
    armazenamento_gb            = 5,
    preco_usuario_adicional     = 99.00,
    preco_cnpj_adicional        = 0.00,
    credito_ia_mensal           = 2000,
    limite_nfe_mensal           = NULL,
    tem_upgrades                = TRUE,
    is_enterprise               = FALSE,
    descricao                   = 'Inclui 2 usuÃ¡rios, 1 empresa, 5 GB e 2.000 crÃ©ditos de IA/mÃªs. UsuÃ¡rio adicional: R$ 99/mÃªs.',
    ativo                       = TRUE
WHERE nome IN ('Essencial', 'Starter', 'Plano 1')
  AND id = (
      SELECT id FROM planos_assinatura
      WHERE nome IN ('Essencial', 'Starter', 'Plano 1')
      ORDER BY id ASC
      LIMIT 1
  );

-- Plano intermediÃ¡rio existente â†’ Plano 2 (R$ 499/mÃªs)
UPDATE planos_assinatura
SET
    nome                        = 'Plano 2',
    preco_base                  = 499.00,
    usuarios_inclusos           = 5,
    empresas_incluidas          = 2,
    limite_empresas_enterprise  = 10,
    armazenamento_gb            = 10,
    preco_usuario_adicional     = 89.00,
    preco_cnpj_adicional        = 199.00,
    credito_ia_mensal           = 4000,
    limite_nfe_mensal           = NULL,
    tem_upgrades                = TRUE,
    is_enterprise               = FALSE,
    descricao                   = 'Inclui 5 usuÃ¡rios, 2 empresas, 10 GB e 4.000 crÃ©ditos de IA/mÃªs. UsuÃ¡rio adicional: R$ 89/mÃªs. Empresa adicional: R$ 199/mÃªs.',
    ativo                       = TRUE
WHERE nome IN ('Profissional', 'Plano 2')
  AND id = (
      SELECT id FROM planos_assinatura
      WHERE nome IN ('Profissional', 'Plano 2')
      ORDER BY id ASC
      LIMIT 1
  );

-- Plano de maior preÃ§o ou nome antigo â†’ Enterprise (sem Stripe, preÃ§o negociÃ¡vel)
UPDATE planos_assinatura
SET
    nome                        = 'Enterprise',
    preco_base                  = 0.00,
    usuarios_inclusos           = 0,
    empresas_incluidas          = 0,
    limite_empresas_enterprise  = 10,
    armazenamento_gb            = 0,
    preco_usuario_adicional     = 0.00,
    preco_cnpj_adicional        = 0.00,
    credito_ia_mensal           = 0,
    limite_nfe_mensal           = NULL,
    tem_upgrades                = TRUE,
    is_enterprise               = TRUE,
    descricao                   = 'SoluÃ§Ã£o personalizada para grandes operaÃ§Ãµes. Entre em contato via WhatsApp para negociaÃ§Ã£o.',
    ativo                       = TRUE
WHERE nome IN ('Corporativo', 'Enterprise')
  AND id = (
      SELECT id FROM planos_assinatura
      WHERE nome IN ('Corporativo', 'Enterprise')
      ORDER BY id ASC
      LIMIT 1
  );

-- Desativar quaisquer outros planos antigos que ainda existam
-- (nomes que nÃ£o foram convertidos acima e nÃ£o sÃ£o os trÃªs planos definitivos)
-- IMPORTANTE: nÃ£o desativar 'Trial gratuito' (cadastro "ComeÃ§ar grÃ¡tis" na landing).
UPDATE planos_assinatura
SET ativo = FALSE
WHERE nome NOT IN ('Plano 1', 'Plano 2', 'Enterprise', 'Trial gratuito');

-- Garantir que os trÃªs planos definitivos existam mesmo em bases zeradas
INSERT INTO planos_assinatura (
    nome, preco_base, usuarios_inclusos, empresas_incluidas, limite_empresas_enterprise,
    armazenamento_gb, preco_usuario_adicional, preco_cnpj_adicional,
    credito_ia_mensal, limite_nfe_mensal, tem_upgrades, is_enterprise, descricao, ativo
)
SELECT * FROM (VALUES
    ('Plano 1',    299.00, 2, 1, 10,  5, 99.00,  0.00, 2000, NULL::int, TRUE, FALSE,
     'Inclui 2 usuÃ¡rios, 1 empresa, 5 GB e 2.000 crÃ©ditos de IA/mÃªs. UsuÃ¡rio adicional: R$ 99/mÃªs.',    TRUE),
    ('Plano 2',    499.00, 5, 2, 10, 10, 89.00, 199.00, 4000, NULL::int, TRUE, FALSE,
     'Inclui 5 usuÃ¡rios, 2 empresas, 10 GB e 4.000 crÃ©ditos de IA/mÃªs. UsuÃ¡rio adicional: R$ 89/mÃªs. Empresa adicional: R$ 199/mÃªs.', TRUE),
    ('Enterprise',   0.00, 0, 0, 10,  0,  0.00,  0.00,    0, NULL::int, TRUE, TRUE,
     'SoluÃ§Ã£o personalizada para grandes operaÃ§Ãµes. Entre em contato via WhatsApp para negociaÃ§Ã£o.',      TRUE)
) AS v(nome, preco_base, usuarios_inclusos, empresas_incluidas, limite_empresas_enterprise,
       armazenamento_gb, preco_usuario_adicional, preco_cnpj_adicional,
       credito_ia_mensal, limite_nfe_mensal, tem_upgrades, is_enterprise, descricao, ativo)
WHERE NOT EXISTS (
    SELECT 1 FROM planos_assinatura p WHERE p.nome = v.nome
);

-- ============================================================
-- Plano interno: trial gratuito (30 dias, sem Stripe)
-- MantÃ©m cadastro "ComeÃ§ar grÃ¡tis" funcionando mesmo sem rodar migration_plan_trial_gratuito.sql Ã  parte.
-- ============================================================
INSERT INTO planos_assinatura (
    nome,
    preco_base,
    usuarios_inclusos,
    empresas_incluidas,
    limite_empresas_enterprise,
    armazenamento_gb,
    preco_usuario_adicional,
    preco_cnpj_adicional,
    credito_ia_mensal,
    limite_nfe_mensal,
    tem_upgrades,
    is_enterprise,
    descricao,
    ativo
)
SELECT
    'Trial gratuito',
    0.00,
    1,
    1,
    999,
    0,
    0.00,
    0.00,
    3000,
    NULL::int,
    FALSE,
    FALSE,
    '30 dias de teste: 1 usuÃ¡rio, 1 empresa, demais recursos liberados (IA atÃ© 3.000 crÃ©ditos/mÃªs). ApÃ³s o perÃ­odo, escolha um plano pago.',
    TRUE
WHERE NOT EXISTS (SELECT 1 FROM planos_assinatura WHERE nome = 'Trial gratuito');

UPDATE planos_assinatura
SET
    ativo = TRUE,
    usuarios_inclusos = 1,
    empresas_incluidas = 1,
    credito_ia_mensal = 3000,
    descricao = '30 dias de teste: 1 usuÃ¡rio, 1 empresa, demais recursos liberados (IA atÃ© 3.000 crÃ©ditos/mÃªs). ApÃ³s o perÃ­odo, escolha um plano pago.'
WHERE nome = 'Trial gratuito';

UPDATE public.assinaturas_clientes a
SET
    credito_ia_limite_mensal = GREATEST(3000, COALESCE(p.credito_ia_mensal, 0), COALESCE(a.credito_ia_limite_mensal, 0)),
    credito_ia_saldo_plano = GREATEST(3000, COALESCE(a.credito_ia_saldo_plano, 0))
FROM public.planos_assinatura p
WHERE p.id = a.plano_id
  AND p.nome = 'Trial gratuito'
  AND a.status = 'Trial';


-- =============================================================================
-- SOURCE: frontend/database/migration_painel_adm_billing.sql
-- =============================================================================
-- Painel ADM - billing controls, RBAC, trial settings e cupons
-- Execute no Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner','manager','viewer')),
  active boolean NOT NULL DEFAULT true,
  created_by_admin text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assinatura_limites_override (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes_azoup(id) ON DELETE CASCADE,
  usuarios_limite_override integer,
  empresas_limite_override integer,
  armazenamento_gb_override numeric(10,2),
  credito_ia_override integer,
  active boolean NOT NULL DEFAULT true,
  updated_by_admin text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id)
);

CREATE TABLE IF NOT EXISTS public.admin_billing_settings (
  id integer PRIMARY KEY,
  trial_days_default integer NOT NULL DEFAULT 15 CHECK (trial_days_default BETWEEN 1 AND 365),
  updated_by_admin text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.admin_billing_settings (id, trial_days_default)
VALUES (1, 15)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.admin_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  plan_id integer NOT NULL REFERENCES public.planos_assinatura(id),
  discount_type text NOT NULL CHECK (discount_type IN ('percent','amount')),
  discount_value numeric(10,2) NOT NULL,
  duration text NOT NULL CHECK (duration IN ('once','repeating','forever')),
  duration_in_months integer,
  redeem_by timestamptz,
  max_redemptions integer,
  stripe_coupon_id text NOT NULL,
  stripe_promotion_code_id text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by_admin text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email text,
  action text NOT NULL,
  target_type text,
  target_id text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_updated_at_admin_tables_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_users_updated_at ON public.admin_users;
CREATE TRIGGER trg_admin_users_updated_at
BEFORE UPDATE ON public.admin_users
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_admin_tables_fn();

DROP TRIGGER IF EXISTS trg_assinatura_limites_override_updated_at ON public.assinatura_limites_override;
CREATE TRIGGER trg_assinatura_limites_override_updated_at
BEFORE UPDATE ON public.assinatura_limites_override
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_admin_tables_fn();

DROP TRIGGER IF EXISTS trg_admin_billing_settings_updated_at ON public.admin_billing_settings;
CREATE TRIGGER trg_admin_billing_settings_updated_at
BEFORE UPDATE ON public.admin_billing_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_admin_tables_fn();

DROP TRIGGER IF EXISTS trg_admin_coupons_updated_at ON public.admin_coupons;
CREATE TRIGGER trg_admin_coupons_updated_at
BEFORE UPDATE ON public.admin_coupons
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_admin_tables_fn();

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinatura_limites_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_all_admin_users" ON public.admin_users;
CREATE POLICY "deny_all_admin_users" ON public.admin_users
FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_all_assinatura_limites_override" ON public.assinatura_limites_override;
CREATE POLICY "deny_all_assinatura_limites_override" ON public.assinatura_limites_override
FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_all_admin_billing_settings" ON public.admin_billing_settings;
CREATE POLICY "deny_all_admin_billing_settings" ON public.admin_billing_settings
FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "public_read_trial_settings" ON public.admin_billing_settings;
CREATE POLICY "public_read_trial_settings" ON public.admin_billing_settings
FOR SELECT USING (true);

DROP POLICY IF EXISTS "deny_all_admin_coupons" ON public.admin_coupons;
CREATE POLICY "deny_all_admin_coupons" ON public.admin_coupons
FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_all_admin_audit_logs" ON public.admin_audit_logs;
CREATE POLICY "deny_all_admin_audit_logs" ON public.admin_audit_logs
FOR ALL USING (false) WITH CHECK (false);

-- Owner inicial (somente este owner poderÃ¡ criar novos admins via backend)
INSERT INTO public.admin_users (email, role, active, created_by_admin)
VALUES ('desenvolvimento@azoup.com.br', 'owner', true, 'bootstrap')
ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, active = true;


-- =============================================================================
-- SOURCE: frontend/database/migration_plan_trial_gratuito.sql
-- =============================================================================
-- Plano interno para assinaturas em perÃ­odo de teste (ComeÃ§ar grÃ¡tis na landing).
-- NÃ£o tem preÃ§os Stripe. Inclui 1 usuÃ¡rio e 1 empresa; demais cadastros exigem plano pago.
-- Os triggers de limite (migration_billing_limits_allow_trial.sql) consideram status Trial.
-- IA: credito_ia_mensal = 3000 (crÃ©ditos por mÃªs civil, America/Sao_Paulo, via consume_credito_ia).
--
-- Se o cadastro grÃ¡tis falhar com "Plano de teste nÃ£o estÃ¡ configurado":
--   1) Rode este SQL no Supabase (SQL Editor), OU
--   2) Garanta que migration_stripe_billing_v1.sql estÃ¡ atualizado: ele nÃ£o desativa mais
--      o plano 'Trial gratuito' e recria o registro ao final.
-- Se a linha existir com ativo = false (migraÃ§Ã£o Stripe antiga), o UPDATE abaixo reativa.

INSERT INTO planos_assinatura (
    nome,
    preco_base,
    usuarios_inclusos,
    empresas_incluidas,
    limite_empresas_enterprise,
    armazenamento_gb,
    preco_usuario_adicional,
    preco_cnpj_adicional,
    credito_ia_mensal,
    limite_nfe_mensal,
    tem_upgrades,
    is_enterprise,
    descricao,
    ativo
)
SELECT
    'Trial gratuito',
    0.00,
    1,
    1,
    999,
    0,
    0.00,
    0.00,
    3000,
    NULL::int,
    FALSE,
    FALSE,
    '15 dias de teste: 1 usuÃ¡rio, 1 empresa, demais recursos liberados (IA atÃ© 3.000 crÃ©ditos/mÃªs). ApÃ³s o perÃ­odo, escolha um plano pago.',
    TRUE
WHERE NOT EXISTS (SELECT 1 FROM planos_assinatura WHERE nome = 'Trial gratuito');

UPDATE planos_assinatura
SET
    ativo = TRUE,
    usuarios_inclusos = 1,
    empresas_incluidas = 1,
    credito_ia_mensal = 3000,
    descricao = '15 dias de teste: 1 usuÃ¡rio, 1 empresa, demais recursos liberados (IA atÃ© 3.000 crÃ©ditos/mÃªs). ApÃ³s o perÃ­odo, escolha um plano pago.'
WHERE nome = 'Trial gratuito';

-- Assinaturas trial jÃ¡ criadas: garantir cota de IA alinhada ao plano (3.000/mÃªs)
UPDATE public.assinaturas_clientes a
SET
    credito_ia_limite_mensal = GREATEST(3000, COALESCE(p.credito_ia_mensal, 0), COALESCE(a.credito_ia_limite_mensal, 0)),
    credito_ia_saldo_plano = GREATEST(3000, COALESCE(a.credito_ia_saldo_plano, 0))
FROM public.planos_assinatura p
WHERE p.id = a.plano_id
  AND p.nome = 'Trial gratuito'
  AND a.status = 'Trial';


-- =============================================================================
-- SOURCE: frontend/database/migration_trial_plano1.sql
-- =============================================================================
-- Migration: adiciona suporte ao perÃ­odo de teste (trial) do Plano 1
-- Cada cliente_azoup pode usar o trial uma Ãºnica vez.

ALTER TABLE assinaturas_clientes
    ADD COLUMN IF NOT EXISTS trial_utilizado BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS trial_fim TIMESTAMPTZ;


-- =============================================================================
-- SOURCE: frontend/database/migration_trial_days_15.sql
-- =============================================================================
-- Atualiza perÃ­odo de teste gratuito de 30 para 15 dias (ambientes jÃ¡ provisionados).
UPDATE public.admin_billing_settings
SET trial_days_default = 15, updated_at = now()
WHERE id = 1 AND trial_days_default = 30;

UPDATE public.planos_assinatura
SET descricao = '15 dias de teste: 1 usuÃ¡rio, 1 empresa, demais recursos liberados (IA atÃ© 3.000 crÃ©ditos/mÃªs). ApÃ³s o perÃ­odo, escolha um plano pago.'
WHERE nome = 'Trial gratuito'
  AND descricao LIKE '30 dias de teste%';


-- =============================================================================
-- SOURCE: frontend/database/migration_billing_limits_triggers.sql
-- =============================================================================
-- Billing Limits Triggers
-- Adiciona BEFORE INSERT triggers em `empresas` e `usuarios` como camada de seguranÃ§a
-- para garantir que os limites do plano sejam sempre respeitados, independente de como
-- a inserÃ§Ã£o chega ao banco (frontend direto, backend, migrations etc.).
--
-- PrÃ©-requisito: migration_stripe_billing_v1.sql jÃ¡ executada.
-- Execute este arquivo UMA VEZ no Supabase SQL Editor.

-- ============================================================
-- FunÃ§Ã£o: check_empresa_limit_fn
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_empresa_limit_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_empresas_count            int;
    v_empresas_incluidas        int;
    v_empresas_adicionais       int;
    v_preco_cnpj_adicional      numeric;
    v_limite_enterprise         int;
    v_stripe_subscription_id    text;
    v_stripe_status             text;
BEGIN
    -- Contar empresas existentes ANTES desta inserÃ§Ã£o
    SELECT COUNT(*)
    INTO v_empresas_count
    FROM empresas
    WHERE cliente_id = NEW.cliente_id;

    -- Buscar limites e dados Stripe da assinatura ativa
    SELECT
        COALESCE(p.empresas_incluidas, 1),
        COALESCE(a.empresas_adicionais, 0),
        COALESCE(p.preco_cnpj_adicional, 0),
        COALESCE(p.limite_empresas_enterprise, 10),
        a.stripe_subscription_id,
        a.stripe_status
    INTO
        v_empresas_incluidas,
        v_empresas_adicionais,
        v_preco_cnpj_adicional,
        v_limite_enterprise,
        v_stripe_subscription_id,
        v_stripe_status
    FROM assinaturas_clientes a
    JOIN planos_assinatura p ON p.id = a.plano_id
    WHERE a.cliente_id = NEW.cliente_id
      AND a.status IN ('Ativo', 'active', 'Trial')
    ORDER BY a.data_inicio DESC
    LIMIT 1;

    -- Sem assinatura ativa = sem restriÃ§Ã£o (conta em perÃ­odo de implantaÃ§Ã£o)
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    -- 1. Trigger Enterprise: acima do limite global de empresas
    IF v_empresas_count >= v_limite_enterprise THEN
        RAISE EXCEPTION 'enterprise_required|VocÃª atingiu % empresas. Entre em contato via WhatsApp para o Plano Enterprise.', v_limite_enterprise
            USING ERRCODE = 'P0001';
    END IF;

    -- 2. Plano 1 (sem add-on de empresa): limite fixo nas inclusas
    IF v_preco_cnpj_adicional = 0 AND v_empresas_count >= v_empresas_incluidas THEN
        RAISE EXCEPTION 'limit_exceeded|Seu plano inclui % empresa(s). FaÃ§a upgrade para o Plano 2 para adicionar mais empresas.', v_empresas_incluidas
            USING ERRCODE = 'P0001';
    END IF;

    -- 3. Plano 2 (com add-on): bloquear se nÃ£o houver subscription Stripe ativa
    --    Sem Stripe vinculado = pagamento nÃ£o configurado, nÃ£o pode adicionar extras
    IF v_empresas_count >= (v_empresas_incluidas + v_empresas_adicionais) THEN
        IF v_stripe_subscription_id IS NULL
           OR v_stripe_status NOT IN ('active', 'trialing', 'Ativo') THEN
            RAISE EXCEPTION 'payment_required|Configure o pagamento para adicionar empresas alÃ©m das % inclusas no plano. Acesse o painel de cobranÃ§a.', v_empresas_incluidas
                USING ERRCODE = 'P0001';
        END IF;
        -- Se hÃ¡ Stripe ativo: permite (syncAddon cuidarÃ¡ da cobranÃ§a do add-on)
    END IF;

    RETURN NEW;
END;
$$;

-- Garantir que trigger anterior seja substituÃ­do
DROP TRIGGER IF EXISTS trg_check_empresa_limit ON empresas;

CREATE TRIGGER trg_check_empresa_limit
BEFORE INSERT ON empresas
FOR EACH ROW
EXECUTE FUNCTION public.check_empresa_limit_fn();

COMMENT ON FUNCTION public.check_empresa_limit_fn() IS
    'Valida limites de plano antes de inserir uma empresa. Levanta exceÃ§Ã£o com cÃ³digo enterprise_required ou limit_exceeded.';

-- ============================================================
-- FunÃ§Ã£o: check_usuario_limit_fn
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_usuario_limit_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_usuarios_count            int;
    v_usuarios_inclusos         int;
    v_usuarios_adicionais       int;
    v_preco_usuario_adicional   numeric;
    v_stripe_subscription_id    text;
    v_stripe_status             text;
BEGIN
    -- Contar usuÃ¡rios ativos ANTES desta inserÃ§Ã£o
    SELECT COUNT(*)
    INTO v_usuarios_count
    FROM usuarios
    WHERE cliente_id = NEW.cliente_id
      AND ativo = true;

    -- Buscar limites e dados Stripe da assinatura ativa
    SELECT
        COALESCE(p.usuarios_inclusos, 0),
        COALESCE(a.usuarios_adicionais, 0),
        COALESCE(p.preco_usuario_adicional, 0),
        a.stripe_subscription_id,
        a.stripe_status
    INTO
        v_usuarios_inclusos,
        v_usuarios_adicionais,
        v_preco_usuario_adicional,
        v_stripe_subscription_id,
        v_stripe_status
    FROM assinaturas_clientes a
    JOIN planos_assinatura p ON p.id = a.plano_id
    WHERE a.cliente_id = NEW.cliente_id
      AND a.status IN ('Ativo', 'active', 'Trial')
    ORDER BY a.data_inicio DESC
    LIMIT 1;

    -- Sem assinatura ativa = sem restriÃ§Ã£o (conta em perÃ­odo de implantaÃ§Ã£o)
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    -- Dentro do limite incluso: sempre permitido
    IF v_usuarios_count < v_usuarios_inclusos THEN
        RETURN NEW;
    END IF;

    -- AlÃ©m do incluso: verificar add-on e Stripe
    IF v_preco_usuario_adicional > 0 THEN
        -- Plano com add-on de usuÃ¡rio (Plano 1: R$99/extra, Plano 2: R$89/extra)
        -- Sem Stripe ativo = pagamento nÃ£o configurado
        IF v_stripe_subscription_id IS NULL
           OR v_stripe_status NOT IN ('active', 'trialing', 'Ativo') THEN
            RAISE EXCEPTION 'payment_required|Configure o pagamento para adicionar usuÃ¡rios alÃ©m dos % inclusos no plano. Acesse o painel de cobranÃ§a.', v_usuarios_inclusos
                USING ERRCODE = 'P0001';
        END IF;
        -- Stripe ativo: permite a inserÃ§Ã£o; syncAddon atualizarÃ¡ a cobranÃ§a no Stripe
    ELSE
        -- Plano sem add-on de usuÃ¡rio: limite fixo nos inclusos
        RAISE EXCEPTION 'limit_exceeded|Limite de % usuÃ¡rio(s) atingido. FaÃ§a upgrade de plano para adicionar mais usuÃ¡rios.', v_usuarios_inclusos
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_usuario_limit ON usuarios;

CREATE TRIGGER trg_check_usuario_limit
BEFORE INSERT ON usuarios
FOR EACH ROW
EXECUTE FUNCTION public.check_usuario_limit_fn();

COMMENT ON FUNCTION public.check_usuario_limit_fn() IS
    'Valida limites de plano antes de inserir um usuÃ¡rio. Levanta exceÃ§Ã£o com cÃ³digo limit_exceeded.';


-- =============================================================================
-- SOURCE: frontend/database/migration_billing_limits_allow_trial.sql
-- =============================================================================
-- Aplica limites de plano tambÃ©m quando a assinatura estÃ¡ em status 'Trial'
-- (ex.: plano "Trial gratuito" com 1 usuÃ¡rio e 1 empresa inclusos).
-- Execute no Supabase apÃ³s migration_billing_limits_triggers.sql (idempotente).

CREATE OR REPLACE FUNCTION public.check_empresa_limit_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_empresas_count            int;
    v_empresas_incluidas        int;
    v_empresas_adicionais       int;
    v_preco_cnpj_adicional      numeric;
    v_limite_enterprise         int;
    v_stripe_subscription_id    text;
    v_stripe_status             text;
BEGIN
    SELECT COUNT(*)
    INTO v_empresas_count
    FROM empresas
    WHERE cliente_id = NEW.cliente_id;

    SELECT
        COALESCE(p.empresas_incluidas, 1),
        COALESCE(a.empresas_adicionais, 0),
        COALESCE(p.preco_cnpj_adicional, 0),
        COALESCE(p.limite_empresas_enterprise, 10),
        a.stripe_subscription_id,
        a.stripe_status
    INTO
        v_empresas_incluidas,
        v_empresas_adicionais,
        v_preco_cnpj_adicional,
        v_limite_enterprise,
        v_stripe_subscription_id,
        v_stripe_status
    FROM assinaturas_clientes a
    JOIN planos_assinatura p ON p.id = a.plano_id
    WHERE a.cliente_id = NEW.cliente_id
      AND a.status IN ('Ativo', 'active', 'Trial')
    ORDER BY a.data_inicio DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    IF v_empresas_count >= v_limite_enterprise THEN
        RAISE EXCEPTION 'enterprise_required|VocÃª atingiu % empresas. Entre em contato via WhatsApp para o Plano Enterprise.', v_limite_enterprise
            USING ERRCODE = 'P0001';
    END IF;

    IF v_preco_cnpj_adicional = 0 AND v_empresas_count >= v_empresas_incluidas THEN
        RAISE EXCEPTION 'limit_exceeded|Seu plano inclui % empresa(s). FaÃ§a upgrade para o Plano 2 para adicionar mais empresas.', v_empresas_incluidas
            USING ERRCODE = 'P0001';
    END IF;

    IF v_empresas_count >= (v_empresas_incluidas + v_empresas_adicionais) THEN
        IF v_stripe_subscription_id IS NULL
           OR v_stripe_status NOT IN ('active', 'trialing', 'Ativo') THEN
            RAISE EXCEPTION 'payment_required|Configure o pagamento para adicionar empresas alÃ©m das % inclusas no plano. Acesse o painel de cobranÃ§a.', v_empresas_incluidas
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_usuario_limit_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_usuarios_count            int;
    v_usuarios_inclusos         int;
    v_usuarios_adicionais       int;
    v_preco_usuario_adicional   numeric;
    v_stripe_subscription_id    text;
    v_stripe_status             text;
BEGIN
    SELECT COUNT(*)
    INTO v_usuarios_count
    FROM usuarios
    WHERE cliente_id = NEW.cliente_id
      AND ativo = true;

    SELECT
        COALESCE(p.usuarios_inclusos, 0),
        COALESCE(a.usuarios_adicionais, 0),
        COALESCE(p.preco_usuario_adicional, 0),
        a.stripe_subscription_id,
        a.stripe_status
    INTO
        v_usuarios_inclusos,
        v_usuarios_adicionais,
        v_preco_usuario_adicional,
        v_stripe_subscription_id,
        v_stripe_status
    FROM assinaturas_clientes a
    JOIN planos_assinatura p ON p.id = a.plano_id
    WHERE a.cliente_id = NEW.cliente_id
      AND a.status IN ('Ativo', 'active', 'Trial')
    ORDER BY a.data_inicio DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    IF v_usuarios_count < v_usuarios_inclusos THEN
        RETURN NEW;
    END IF;

    IF v_preco_usuario_adicional > 0 THEN
        IF v_stripe_subscription_id IS NULL
           OR v_stripe_status NOT IN ('active', 'trialing', 'Ativo') THEN
            RAISE EXCEPTION 'payment_required|Configure o pagamento para adicionar usuÃ¡rios alÃ©m dos % inclusos no plano. Acesse o painel de cobranÃ§a.', v_usuarios_inclusos
                USING ERRCODE = 'P0001';
        END IF;
    ELSE
        RAISE EXCEPTION 'limit_exceeded|Limite de % usuÃ¡rio(s) atingido. FaÃ§a upgrade de plano para adicionar mais usuÃ¡rios.', v_usuarios_inclusos
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;


-- =============================================================================
-- SOURCE: frontend/database/migration_billing_overrides_triggers.sql
-- =============================================================================
-- Ajusta triggers de limite para considerar overrides administrativos.

CREATE OR REPLACE FUNCTION public.check_empresa_limit_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_empresas_count            int;
    v_empresas_incluidas        int;
    v_empresas_adicionais       int;
    v_preco_cnpj_adicional      numeric;
    v_limite_enterprise         int;
    v_stripe_subscription_id    text;
    v_stripe_status             text;
    v_override_empresas         int;
BEGIN
    SELECT COUNT(*)
    INTO v_empresas_count
    FROM empresas
    WHERE cliente_id = NEW.cliente_id;

    SELECT
        COALESCE(p.empresas_incluidas, 1),
        COALESCE(a.empresas_adicionais, 0),
        COALESCE(p.preco_cnpj_adicional, 0),
        COALESCE(p.limite_empresas_enterprise, 10),
        a.stripe_subscription_id,
        a.stripe_status
    INTO
        v_empresas_incluidas,
        v_empresas_adicionais,
        v_preco_cnpj_adicional,
        v_limite_enterprise,
        v_stripe_subscription_id,
        v_stripe_status
    FROM assinaturas_clientes a
    JOIN planos_assinatura p ON p.id = a.plano_id
    WHERE a.cliente_id = NEW.cliente_id
      AND a.status IN ('Ativo', 'active')
    ORDER BY a.data_inicio DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    SELECT empresas_limite_override
    INTO v_override_empresas
    FROM assinatura_limites_override
    WHERE cliente_id = NEW.cliente_id
      AND active = true
    LIMIT 1;

    IF v_empresas_count >= v_limite_enterprise THEN
        RAISE EXCEPTION 'enterprise_required|Você atingiu % empresas. Entre em contato via WhatsApp para o Plano Enterprise.', v_limite_enterprise
            USING ERRCODE = 'P0001';
    END IF;

    IF v_override_empresas IS NOT NULL THEN
        IF v_empresas_count >= v_override_empresas THEN
            RAISE EXCEPTION 'limit_exceeded|Limite administrativo de empresas atingido (%).', v_override_empresas
                USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
    END IF;

    IF v_preco_cnpj_adicional = 0 AND v_empresas_count >= v_empresas_incluidas THEN
        RAISE EXCEPTION 'limit_exceeded|Seu plano inclui % empresa(s). Faça upgrade para o Plano 2 para adicionar mais empresas.', v_empresas_incluidas
            USING ERRCODE = 'P0001';
    END IF;

    IF v_empresas_count >= (v_empresas_incluidas + v_empresas_adicionais) THEN
        IF v_stripe_subscription_id IS NULL
           OR v_stripe_status NOT IN ('active', 'trialing', 'Ativo') THEN
            RAISE EXCEPTION 'payment_required|Configure o pagamento para adicionar empresas além das % inclusas no plano. Acesse o painel de cobrança.', v_empresas_incluidas
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_usuario_limit_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_usuarios_count            int;
    v_usuarios_inclusos         int;
    v_usuarios_adicionais       int;
    v_stripe_subscription_id    text;
    v_stripe_status             text;
    v_override_usuarios         int;
BEGIN
    SELECT COUNT(*)
    INTO v_usuarios_count
    FROM usuarios
    WHERE cliente_id = NEW.cliente_id
      AND ativo = true;

    SELECT
        COALESCE(p.usuarios_inclusos, 0),
        COALESCE(a.usuarios_adicionais, 0),
        a.stripe_subscription_id,
        a.stripe_status
    INTO
        v_usuarios_inclusos,
        v_usuarios_adicionais,
        v_stripe_subscription_id,
        v_stripe_status
    FROM assinaturas_clientes a
    JOIN planos_assinatura p ON p.id = a.plano_id
    WHERE a.cliente_id = NEW.cliente_id
      AND a.status IN ('Ativo', 'active')
    ORDER BY a.data_inicio DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    SELECT usuarios_limite_override
    INTO v_override_usuarios
    FROM assinatura_limites_override
    WHERE cliente_id = NEW.cliente_id
      AND active = true
    LIMIT 1;

    IF v_override_usuarios IS NOT NULL THEN
        IF v_usuarios_count >= v_override_usuarios THEN
            RAISE EXCEPTION 'limit_exceeded|Limite administrativo de usuários atingido (%).', v_override_usuarios
                USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
    END IF;

    IF v_usuarios_count >= (v_usuarios_inclusos + v_usuarios_adicionais) THEN
        IF v_stripe_subscription_id IS NULL
           OR v_stripe_status NOT IN ('active', 'trialing', 'Ativo') THEN
            RAISE EXCEPTION 'payment_required|Configure o pagamento para adicionar usuários além dos % inclusos no plano.', v_usuarios_inclusos
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


-- =============================================================================
-- SOURCE: frontend/database/migration_billing_usuario_limite_somente_ativos.sql
-- =============================================================================
-- Garante que o bloqueio de plano para usuÃ¡rios considere apenas usuÃ¡rios ativos.
-- TambÃ©m permite inserir usuÃ¡rio inativo sem consumir limite.

create or replace function public.check_usuario_limit_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_usuarios_count          int;
    v_usuarios_inclusos       int;
    v_usuarios_adicionais     int;
    v_stripe_subscription_id  text;
    v_stripe_status           text;
    v_override_usuarios       int;
begin
    -- UsuÃ¡rio sendo criado como inativo nÃ£o consome limite.
    if coalesce(new.ativo, true) = false then
        return new;
    end if;

    -- Conta SOMENTE usuÃ¡rios ativos do cliente.
    select count(*)
      into v_usuarios_count
      from public.usuarios
     where cliente_id = new.cliente_id
       and coalesce(ativo, true) = true;

    select
        coalesce(p.usuarios_inclusos, 0),
        coalesce(a.usuarios_adicionais, 0),
        a.stripe_subscription_id,
        a.stripe_status
    into
        v_usuarios_inclusos,
        v_usuarios_adicionais,
        v_stripe_subscription_id,
        v_stripe_status
    from public.assinaturas_clientes a
    join public.planos_assinatura p on p.id = a.plano_id
    where a.cliente_id = new.cliente_id
      and a.status in ('Ativo', 'active')
    order by a.data_inicio desc
    limit 1;

    if not found then
        return new;
    end if;

    select usuarios_limite_override
      into v_override_usuarios
      from public.assinatura_limites_override
     where cliente_id = new.cliente_id
       and active = true
     limit 1;

    if v_override_usuarios is not null then
        if v_usuarios_count >= v_override_usuarios then
            raise exception 'limit_exceeded|Limite administrativo de usuÃ¡rios ativos atingido (%).', v_override_usuarios
                using errcode = 'P0001';
        end if;
        return new;
    end if;

    if v_usuarios_count >= (v_usuarios_inclusos + v_usuarios_adicionais) then
        if v_stripe_subscription_id is null
           or v_stripe_status not in ('active', 'trialing', 'Ativo') then
            raise exception 'payment_required|Configure o pagamento para adicionar usuÃ¡rios ativos alÃ©m dos % inclusos no plano.', v_usuarios_inclusos
                using errcode = 'P0001';
        end if;
    end if;

    return new;
end;
$$;



-- =============================================================================
-- SOURCE: frontend/database/migration_fix_usuario_limite_inclusos_adicionais.sql
-- =============================================================================
-- Corrige limite de usuÃ¡rios: inclusos + usuarios_adicionais (assinaturas_clientes).
-- Bloqueia INSERT quando ativo >= limite (sem depender sÃ³ de usuarios_inclusos ou Stripe).

CREATE OR REPLACE FUNCTION public.check_usuario_limit_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_usuarios_count        int;
    v_usuarios_inclusos     int;
    v_usuarios_adicionais   int;
    v_limite                int;
    v_override_usuarios     int;
BEGIN
    IF coalesce(new.ativo, true) = false THEN
        RETURN new;
    END IF;

    SELECT count(*)
      INTO v_usuarios_count
      FROM public.usuarios
     WHERE cliente_id = new.cliente_id
       AND coalesce(ativo, true) = true;

    SELECT
        coalesce(p.usuarios_inclusos, 0),
        coalesce(a.usuarios_adicionais, 0)
    INTO
        v_usuarios_inclusos,
        v_usuarios_adicionais
    FROM public.assinaturas_clientes a
    JOIN public.planos_assinatura p ON p.id = a.plano_id
    WHERE a.cliente_id = new.cliente_id
      AND a.status IN ('Ativo', 'active', 'Trial')
    ORDER BY a.data_inicio DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN new;
    END IF;

    v_limite := v_usuarios_inclusos + v_usuarios_adicionais;

    SELECT usuarios_limite_override
      INTO v_override_usuarios
      FROM public.assinatura_limites_override
     WHERE cliente_id = new.cliente_id
       AND active = true
     LIMIT 1;

    IF v_override_usuarios IS NOT NULL THEN
        v_limite := v_override_usuarios;
    END IF;

    IF v_usuarios_count >= v_limite THEN
        RAISE EXCEPTION 'limit_exceeded|Limite de % usuÃ¡rio(s) ativo(s) atingido (% de %).', v_limite, v_usuarios_count, v_limite
            USING ERRCODE = 'P0001';
    END IF;

    RETURN new;
END;
$$;

COMMENT ON FUNCTION public.check_usuario_limit_fn() IS
    'Bloqueia novo usuÃ¡rio ativo quando count(ativos) >= usuarios_inclusos + usuarios_adicionais (ou override ADM).';


-- =============================================================================
-- SOURCE: frontend/database/migration_ai_credits.sql
-- =============================================================================
-- CrÃ©ditos de uso de IA: plano mensal (reabastece no inÃ­cio do mÃªs calendÃ¡rio America/Sao_Paulo)
-- + crÃ©ditos extras acumulativos.

ALTER TABLE planos_assinatura
ADD COLUMN IF NOT EXISTS credito_ia_mensal integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN planos_assinatura.credito_ia_mensal IS 'Cota mensal de usos de IA incluÃ­da no plano (replica em clientes_azoup.credito_plano no virar do mÃªs).';

ALTER TABLE clientes_azoup
ADD COLUMN IF NOT EXISTS credito_plano integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS credito_extra integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS credito_ia_mes_ref text;

COMMENT ON COLUMN clientes_azoup.credito_plano IS 'Saldo do ciclo atual (mensal); reabastecido do plano no 1Âº uso apÃ³s mudanÃ§a de mÃªs.';
COMMENT ON COLUMN clientes_azoup.credito_extra IS 'CrÃ©ditos comprados; nÃ£o zeram no mÃªs.';
COMMENT ON COLUMN clientes_azoup.credito_ia_mes_ref IS 'YYYY-MM (America/Sao_Paulo) do Ãºltimo reabastecimento de credito_plano.';

-- Valores exemplo por plano (ajuste conforme negÃ³cio)
UPDATE planos_assinatura SET credito_ia_mensal = 200 WHERE nome = 'Essencial';
UPDATE planos_assinatura SET credito_ia_mensal = 600 WHERE nome = 'Profissional';
UPDATE planos_assinatura SET credito_ia_mensal = 2000 WHERE nome = 'Corporativo';

CREATE OR REPLACE FUNCTION public.consume_credito_ia(p_cliente_id uuid, p_units integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mes_ref text := to_char((timezone('America/Sao_Paulo', now()))::date, 'YYYY-MM');
  v_mes_row text;
  v_plano_cred integer;
  v_cp integer;
  v_ce integer;
  v_need integer;
  v_from_plano integer := 0;
  v_from_extra integer := 0;
BEGIN
  IF p_units IS NULL OR p_units < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_units');
  END IF;

  SELECT COALESCE(p.credito_ia_mensal, 0) INTO v_plano_cred
  FROM assinaturas_clientes a
  JOIN planos_assinatura p ON p.id = a.plano_id
  WHERE a.cliente_id = p_cliente_id AND a.status = 'Ativo'
  ORDER BY a.data_inicio DESC
  LIMIT 1;

  IF v_plano_cred IS NULL THEN
    v_plano_cred := 0;
  END IF;

  SELECT credito_ia_mes_ref, credito_plano, credito_extra
  INTO v_mes_row, v_cp, v_ce
  FROM clientes_azoup
  WHERE id = p_cliente_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cliente_not_found');
  END IF;

  v_cp := COALESCE(v_cp, 0);
  v_ce := COALESCE(v_ce, 0);

  IF v_mes_row IS DISTINCT FROM v_mes_ref THEN
    v_cp := v_plano_cred;
    UPDATE clientes_azoup
    SET credito_plano = v_cp,
        credito_ia_mes_ref = v_mes_ref
    WHERE id = p_cliente_id;
  END IF;

  IF v_cp + v_ce < p_units THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_credits',
      'credito_plano', v_cp,
      'credito_extra', v_ce
    );
  END IF;

  v_need := p_units;
  IF v_cp >= v_need THEN
    v_from_plano := v_need;
    v_cp := v_cp - v_need;
  ELSE
    v_from_plano := v_cp;
    v_need := v_need - v_cp;
    v_cp := 0;
    v_from_extra := v_need;
    v_ce := v_ce - v_need;
  END IF;

  UPDATE clientes_azoup
  SET credito_plano = v_cp, credito_extra = v_ce
  WHERE id = p_cliente_id;

  RETURN jsonb_build_object(
    'ok', true,
    'from_plano', v_from_plano,
    'from_extra', v_from_extra,
    'credito_plano', v_cp,
    'credito_extra', v_ce
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_credito_ia(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_credito_ia(uuid, integer) TO service_role;

-- PrÃ³ximo passo (histÃ³rico por tipo de IA + RPC com origem/meta): rode tambÃ©m
-- frontend/database/migration_ai_credits_ledger.sql â€” substitui consume_credito_ia pela versÃ£o com log.


-- =============================================================================
-- SOURCE: frontend/database/migration_ai_credits_assinaturas_clientes.sql
-- =============================================================================
-- Migra crÃ©ditos de IA de clientes_azoup â†’ assinaturas_clientes.
-- Regra: crÃ©dito mensal do plano (saldo + limite) reseta ao virar o mÃªs (America/Sao_Paulo);
--         crÃ©dito_ia_extra nunca reseta.
--
-- Ordem: rode no SQL Editor do Supabase. Idempotente na criaÃ§Ã£o de colunas (IF NOT EXISTS).

-- ---------------------------------------------------------------------------
-- 1) Colunas na assinatura ativa
-- ---------------------------------------------------------------------------
ALTER TABLE public.assinaturas_clientes
    ADD COLUMN IF NOT EXISTS credito_ia_limite_mensal integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS credito_ia_saldo_plano integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS credito_ia_extra integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS credito_ia_mes_ref text;

COMMENT ON COLUMN public.assinaturas_clientes.credito_ia_limite_mensal IS
    'Cota mensal de IA desta assinatura (espelho do plano no momento do cadastro/upgrade; usada no reset mensal).';
COMMENT ON COLUMN public.assinaturas_clientes.credito_ia_saldo_plano IS
    'Saldo restante do ciclo mensal de IA (consome antes do extra).';
COMMENT ON COLUMN public.assinaturas_clientes.credito_ia_extra IS
    'CrÃ©ditos de IA comprados/extras; nÃ£o zeram no mÃªs.';
COMMENT ON COLUMN public.assinaturas_clientes.credito_ia_mes_ref IS
    'YYYY-MM (America/Sao_Paulo) do Ãºltimo reabastecimento do saldo mensal.';

-- ---------------------------------------------------------------------------
-- 2) Copiar saldos que estavam em clientes_azoup â†’ assinatura â€œativaâ€ (mesmo critÃ©rio do app)
--    (NÃ£o referencie o alvo do UPDATE no FROM/JOIN â€” use CTE com join em assinaturas ac.)
-- ---------------------------------------------------------------------------
WITH ativa AS (
    SELECT DISTINCT ON (cliente_id)
        id AS assinatura_id,
        cliente_id
    FROM public.assinaturas_clientes
    WHERE status IN ('Ativo', 'active', 'Trial')
    ORDER BY cliente_id, data_inicio DESC NULLS LAST
),
src AS (
    SELECT
        t.assinatura_id,
        COALESCE(p.credito_ia_mensal, 0) AS limite,
        COALESCE(c.credito_plano, 0) AS saldo,
        COALESCE(c.credito_extra, 0) AS extra,
        c.credito_ia_mes_ref AS mes_ref
    FROM ativa t
    JOIN public.assinaturas_clientes ac ON ac.id = t.assinatura_id
    JOIN public.clientes_azoup c ON c.id = t.cliente_id
    JOIN public.planos_assinatura p ON p.id = ac.plano_id
)
UPDATE public.assinaturas_clientes a
SET
    credito_ia_limite_mensal = s.limite,
    credito_ia_saldo_plano = s.saldo,
    credito_ia_extra = s.extra,
    credito_ia_mes_ref = s.mes_ref
FROM src s
WHERE a.id = s.assinatura_id;

-- ---------------------------------------------------------------------------
-- 3) Preencher limite/saldo a partir do plano onde ainda nÃ£o migrou (ex.: sem linha em clientes_azoup)
-- ---------------------------------------------------------------------------
UPDATE public.assinaturas_clientes a
SET
    credito_ia_limite_mensal = COALESCE(p.credito_ia_mensal, 0),
    credito_ia_saldo_plano = COALESCE(p.credito_ia_mensal, 0)
FROM public.planos_assinatura p
WHERE p.id = a.plano_id
  AND a.credito_ia_limite_mensal = 0
  AND COALESCE(p.credito_ia_mensal, 0) > 0;

COMMENT ON COLUMN public.planos_assinatura.credito_ia_mensal IS
    'Cota mensal de usos de IA do catÃ¡logo de planos; copiada para assinaturas_clientes.credito_ia_limite_mensal na assinatura.';

-- ---------------------------------------------------------------------------
-- 4) RPC de consumo (lÃª/atualiza assinaturas_clientes; mantÃ©m chaves JSON credito_plano/credito_extra)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.consume_credito_ia(uuid, integer);
DROP FUNCTION IF EXISTS public.consume_credito_ia(uuid, integer, text, jsonb);

CREATE OR REPLACE FUNCTION public.consume_credito_ia(
    p_cliente_id uuid,
    p_units integer,
    p_origem text DEFAULT NULL,
    p_meta jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mes_ref text := to_char((timezone('America/Sao_Paulo', now()))::date, 'YYYY-MM');
  v_mes_row text;
  -- id da assinatura Ã© SERIAL (int4) em setup_plans.sql â€” nÃ£o usar uuid aqui
  v_assinatura_id public.assinaturas_clientes.id%TYPE;
  v_limite_snap integer;
  v_catalog_limite integer;
  v_limite integer;
  v_cp integer;
  v_ce integer;
  v_need integer;
  v_from_plano integer := 0;
  v_from_extra integer := 0;
  v_origem text := NULLIF(trim(COALESCE(p_origem, '')), '');
  v_prov text;
BEGIN
  IF p_units IS NULL OR p_units < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_units');
  END IF;

  SELECT
    a.id,
    a.credito_ia_limite_mensal,
    a.credito_ia_saldo_plano,
    a.credito_ia_extra,
    a.credito_ia_mes_ref,
    COALESCE(p.credito_ia_mensal, 0)
  INTO
    v_assinatura_id,
    v_limite_snap,
    v_cp,
    v_ce,
    v_mes_row,
    v_catalog_limite
  FROM public.assinaturas_clientes a
  LEFT JOIN public.planos_assinatura p ON p.id = a.plano_id
  WHERE a.cliente_id = p_cliente_id
    AND a.status IN ('Ativo', 'active', 'Trial')
  ORDER BY a.data_inicio DESC NULLS LAST
  LIMIT 1
  FOR UPDATE OF a;

  IF v_assinatura_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'assinatura_not_found');
  END IF;

  v_limite := COALESCE(NULLIF(v_limite_snap, 0), v_catalog_limite, 0);

  v_cp := COALESCE(v_cp, 0);
  v_ce := COALESCE(v_ce, 0);

  IF v_mes_row IS DISTINCT FROM v_mes_ref THEN
    v_cp := v_limite;
    UPDATE public.assinaturas_clientes
    SET credito_ia_saldo_plano = v_cp,
        credito_ia_mes_ref = v_mes_ref
    WHERE id = v_assinatura_id;
  END IF;

  IF v_cp + v_ce < p_units THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_credits',
      'credito_plano', v_cp,
      'credito_extra', v_ce
    );
  END IF;

  v_need := p_units;
  IF v_cp >= v_need THEN
    v_from_plano := v_need;
    v_cp := v_cp - v_need;
  ELSE
    v_from_plano := v_cp;
    v_need := v_need - v_cp;
    v_cp := 0;
    v_from_extra := v_need;
    v_ce := v_ce - v_need;
  END IF;

  UPDATE public.assinaturas_clientes
  SET credito_ia_saldo_plano = v_cp,
      credito_ia_extra = v_ce
  WHERE id = v_assinatura_id;

  IF v_origem IS NOT NULL THEN
    v_prov := CASE
      WHEN v_origem LIKE 'photoroom%' THEN 'photoroom'
      WHEN v_origem LIKE 'openai%' THEN 'openai'
      ELSE 'ia'
    END;
    INSERT INTO public.credito_ia_gasto (
      cliente_id, origem, provedor, unidades, from_plano, from_extra, meta
    ) VALUES (
      p_cliente_id,
      v_origem,
      v_prov,
      p_units,
      v_from_plano,
      v_from_extra,
      COALESCE(p_meta, '{}'::jsonb)
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'from_plano', v_from_plano,
    'from_extra', v_from_extra,
    'credito_plano', v_cp,
    'credito_extra', v_ce,
    'origem', v_origem
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_credito_ia(uuid, integer, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_credito_ia(uuid, integer, text, jsonb) TO service_role;

COMMENT ON TABLE public.credito_ia_gasto IS
    'Log de dÃ©bitos de crÃ©ditos de IA (saldo mensal em assinaturas_clientes + extra).';

-- ---------------------------------------------------------------------------
-- 5) Remover colunas antigas de clientes_azoup (apÃ³s RPC jÃ¡ nÃ£o depender delas)
-- ---------------------------------------------------------------------------
ALTER TABLE public.clientes_azoup
    DROP COLUMN IF EXISTS credito_plano,
    DROP COLUMN IF EXISTS credito_extra,
    DROP COLUMN IF EXISTS credito_ia_mes_ref;


-- =============================================================================
-- SOURCE: frontend/database/migration_ai_credits_ledger.sql
-- =============================================================================
-- HistÃ³rico de gastos de crÃ©ditos de IA por origem (cada tipo de uso / provedor).
-- Rode APÃ“S migration_ai_credits.sql (precisa das colunas em clientes_azoup e da funÃ§Ã£o antiga).

CREATE TABLE IF NOT EXISTS public.credito_ia_gasto (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    cliente_id uuid NOT NULL REFERENCES public.clientes_azoup(id) ON DELETE CASCADE,
    origem text NOT NULL,
    provedor text NOT NULL DEFAULT 'ia',
    unidades integer NOT NULL CHECK (unidades > 0),
    from_plano integer NOT NULL DEFAULT 0,
    from_extra integer NOT NULL DEFAULT 0,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_credito_ia_gasto_cliente_created
    ON public.credito_ia_gasto (cliente_id, created_at DESC);

COMMENT ON TABLE public.credito_ia_gasto IS 'Log de dÃ©bitos de credito_plano/credito_extra por chamada de IA.';
COMMENT ON COLUMN public.credito_ia_gasto.origem IS 'Identificador do fluxo: openai_dashboard_summary, openai_assistant_ask, openai_cadastro_interpret, photoroom_sale_image.';
COMMENT ON COLUMN public.credito_ia_gasto.provedor IS 'openai | photoroom | ia';
COMMENT ON COLUMN public.credito_ia_gasto.meta IS 'JSON opcional: tokens OpenAI, modelo, flags PhotoRoom, etc.';

ALTER TABLE public.credito_ia_gasto ENABLE ROW LEVEL SECURITY;

-- Substitui consumo por versÃ£o com log (mantÃ©m compatibilidade: Ãºltimos args com default).
DROP FUNCTION IF EXISTS public.consume_credito_ia(uuid, integer);
DROP FUNCTION IF EXISTS public.consume_credito_ia(uuid, integer, text, jsonb);

CREATE OR REPLACE FUNCTION public.consume_credito_ia(
    p_cliente_id uuid,
    p_units integer,
    p_origem text DEFAULT NULL,
    p_meta jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mes_ref text := to_char((timezone('America/Sao_Paulo', now()))::date, 'YYYY-MM');
  v_mes_row text;
  v_plano_cred integer;
  v_cp integer;
  v_ce integer;
  v_need integer;
  v_from_plano integer := 0;
  v_from_extra integer := 0;
  v_origem text := NULLIF(trim(COALESCE(p_origem, '')), '');
  v_prov text;
BEGIN
  IF p_units IS NULL OR p_units < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_units');
  END IF;

  SELECT COALESCE(p.credito_ia_mensal, 0) INTO v_plano_cred
  FROM assinaturas_clientes a
  JOIN planos_assinatura p ON p.id = a.plano_id
  WHERE a.cliente_id = p_cliente_id AND a.status = 'Ativo'
  ORDER BY a.data_inicio DESC
  LIMIT 1;

  IF v_plano_cred IS NULL THEN
    v_plano_cred := 0;
  END IF;

  SELECT credito_ia_mes_ref, credito_plano, credito_extra
  INTO v_mes_row, v_cp, v_ce
  FROM clientes_azoup
  WHERE id = p_cliente_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cliente_not_found');
  END IF;

  v_cp := COALESCE(v_cp, 0);
  v_ce := COALESCE(v_ce, 0);

  IF v_mes_row IS DISTINCT FROM v_mes_ref THEN
    v_cp := v_plano_cred;
    UPDATE clientes_azoup
    SET credito_plano = v_cp,
        credito_ia_mes_ref = v_mes_ref
    WHERE id = p_cliente_id;
  END IF;

  IF v_cp + v_ce < p_units THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_credits',
      'credito_plano', v_cp,
      'credito_extra', v_ce
    );
  END IF;

  v_need := p_units;
  IF v_cp >= v_need THEN
    v_from_plano := v_need;
    v_cp := v_cp - v_need;
  ELSE
    v_from_plano := v_cp;
    v_need := v_need - v_cp;
    v_cp := 0;
    v_from_extra := v_need;
    v_ce := v_ce - v_need;
  END IF;

  UPDATE clientes_azoup
  SET credito_plano = v_cp, credito_extra = v_ce
  WHERE id = p_cliente_id;

  IF v_origem IS NOT NULL THEN
    v_prov := CASE
      WHEN v_origem LIKE 'photoroom%' THEN 'photoroom'
      WHEN v_origem LIKE 'openai%' THEN 'openai'
      ELSE 'ia'
    END;
    INSERT INTO public.credito_ia_gasto (
      cliente_id, origem, provedor, unidades, from_plano, from_extra, meta
    ) VALUES (
      p_cliente_id,
      v_origem,
      v_prov,
      p_units,
      v_from_plano,
      v_from_extra,
      COALESCE(p_meta, '{}'::jsonb)
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'from_plano', v_from_plano,
    'from_extra', v_from_extra,
    'credito_plano', v_cp,
    'credito_extra', v_ce,
    'origem', v_origem
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_credito_ia(uuid, integer, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_credito_ia(uuid, integer, text, jsonb) TO service_role;


-- =============================================================================
-- SOURCE: frontend/database/migration_ai_credits_purchase.sql
-- =============================================================================
-- Compra avulsa de crÃ©ditos de IA (credito_ia_extra em assinaturas_clientes).
-- Inclui funÃ§Ã£o add_credito_ia_extra e tabela de idempotÃªncia.

DROP FUNCTION IF EXISTS public.add_credito_ia_extra(uuid, integer);

CREATE OR REPLACE FUNCTION public.add_credito_ia_extra(
    p_cliente_id uuid,
    p_units integer,
    p_assinatura_id integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assinatura_id public.assinaturas_clientes.id%TYPE;
  v_extra integer;
BEGIN
  IF p_units IS NULL OR p_units < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_units');
  END IF;

  IF p_assinatura_id IS NOT NULL THEN
    SELECT a.id, COALESCE(a.credito_ia_extra, 0)
    INTO v_assinatura_id, v_extra
    FROM public.assinaturas_clientes a
    WHERE a.id = p_assinatura_id
      AND a.cliente_id = p_cliente_id
    FOR UPDATE OF a;
  ELSE
    SELECT a.id, COALESCE(a.credito_ia_extra, 0)
    INTO v_assinatura_id, v_extra
    FROM public.assinaturas_clientes a
    WHERE a.cliente_id = p_cliente_id
      AND a.status IN ('Ativo', 'active', 'Trial', 'Inadimplente', 'Pendente')
    ORDER BY a.data_inicio DESC NULLS LAST
    LIMIT 1
    FOR UPDATE OF a;
  END IF;

  IF v_assinatura_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'assinatura_not_found');
  END IF;

  v_extra := v_extra + p_units;

  UPDATE public.assinaturas_clientes
  SET credito_ia_extra = v_extra
  WHERE id = v_assinatura_id;

  RETURN jsonb_build_object(
    'ok', true,
    'assinatura_id', v_assinatura_id,
    'credito_extra', v_extra,
    'added', p_units
  );
END;
$$;

REVOKE ALL ON FUNCTION public.add_credito_ia_extra(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_credito_ia_extra(uuid, integer, integer) TO service_role;

CREATE TABLE IF NOT EXISTS public.ai_credit_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes_azoup(id) ON DELETE CASCADE,
  stripe_checkout_session_id text NOT NULL UNIQUE,
  creditos integer NOT NULL CHECK (creditos > 0),
  valor_centavos integer NOT NULL CHECK (valor_centavos > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_credit_purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_ai_credit_purchases" ON public.ai_credit_purchases;
CREATE POLICY "deny_all_ai_credit_purchases" ON public.ai_credit_purchases
FOR ALL USING (false) WITH CHECK (false);


-- =============================================================================
-- SOURCE: frontend/database/migration_credito_ia_reset_mensal.sql
-- =============================================================================
-- Reabastecimento mensal de credito_ia_saldo_plano (1x por mÃªs civil, America/Sao_Paulo).
-- NÃ£o altera credito_ia_extra. Rode apÃ³s migration_ai_credits_assinaturas_clientes.sql
-- e migration_fix_consume_credito_ia_assinatura_id_type.sql.

-- ---------------------------------------------------------------------------
-- RPC: reabastece saldo do plano se o mÃªs mudou (idempotente no mesmo mÃªs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reabastecer_credito_ia_saldo_plano_mes(p_cliente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mes_ref text := to_char((timezone('America/Sao_Paulo', now()))::date, 'YYYY-MM');
  v_assinatura_id public.assinaturas_clientes.id%TYPE;
  v_limite_snap integer;
  v_catalog_limite integer;
  v_limite integer;
  v_cp integer;
  v_ce integer;
  v_mes_row text;
  v_reset boolean := false;
  v_stamp_only boolean := false;
BEGIN
  IF p_cliente_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_cliente_id');
  END IF;

  SELECT
    a.id,
    a.credito_ia_limite_mensal,
    a.credito_ia_saldo_plano,
    COALESCE(a.credito_ia_extra, 0),
    a.credito_ia_mes_ref,
    COALESCE(p.credito_ia_mensal, 0)
  INTO
    v_assinatura_id,
    v_limite_snap,
    v_cp,
    v_ce,
    v_mes_row,
    v_catalog_limite
  FROM public.assinaturas_clientes a
  LEFT JOIN public.planos_assinatura p ON p.id = a.plano_id
  WHERE a.cliente_id = p_cliente_id
    AND a.status IN ('Ativo', 'active', 'Trial', 'Inadimplente', 'Pendente')
  ORDER BY a.data_inicio DESC NULLS LAST
  LIMIT 1
  FOR UPDATE OF a;

  IF v_assinatura_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'assinatura_not_found');
  END IF;

  v_limite := COALESCE(NULLIF(v_limite_snap, 0), v_catalog_limite, 0);
  v_cp := COALESCE(v_cp, 0);
  v_ce := COALESCE(v_ce, 0);

  -- 1x por mÃªs civil (SP): reabastece sÃ³ na virada YYYY-MM.
  -- Saldo zerado no mesmo mÃªs NÃƒO gera novo pacote (evita teste/manual com mes_ref NULL reencher).
  IF v_mes_row IS NULL THEN
    -- Legado ou mes_ref apagado no painel: carimba o mÃªs sem devolver cota.
    v_stamp_only := true;
  ELSIF v_mes_row < v_mes_ref THEN
    v_cp := v_limite;
    v_reset := true;
    UPDATE public.assinaturas_clientes
    SET
      credito_ia_saldo_plano = v_cp,
      credito_ia_mes_ref = v_mes_ref
    WHERE id = v_assinatura_id;
  END IF;

  IF v_stamp_only THEN
    UPDATE public.assinaturas_clientes
    SET credito_ia_mes_ref = v_mes_ref
    WHERE id = v_assinatura_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'reset_applied', v_reset,
    'mes_ref', v_mes_ref,
    'credito_ia_limite_mensal', v_limite,
    'credito_ia_saldo_plano', v_cp,
    'credito_ia_extra', v_ce
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reabastecer_credito_ia_saldo_plano_mes(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reabastecer_credito_ia_saldo_plano_mes(uuid) TO service_role;

COMMENT ON FUNCTION public.reabastecer_credito_ia_saldo_plano_mes(uuid) IS
  'Reabastece credito_ia_saldo_plano atÃ© credito_ia_limite_mensal quando o mÃªs civil (SP) muda. No mÃ¡ximo 1x por mÃªs; nÃ£o mexe em credito_ia_extra.';

-- ---------------------------------------------------------------------------
-- consume_credito_ia: usa o mesmo critÃ©rio de mÃªs (delega reabastecimento antes de consumir)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_credito_ia(
    p_cliente_id uuid,
    p_units integer,
    p_origem text DEFAULT NULL,
    p_meta jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reab jsonb;
  v_mes_ref text;
  v_assinatura_id public.assinaturas_clientes.id%TYPE;
  v_limite_snap integer;
  v_catalog_limite integer;
  v_limite integer;
  v_cp integer;
  v_ce integer;
  v_need integer;
  v_from_plano integer := 0;
  v_from_extra integer := 0;
  v_origem text := NULLIF(trim(COALESCE(p_origem, '')), '');
  v_prov text;
BEGIN
  IF p_units IS NULL OR p_units < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_units');
  END IF;

  v_reab := public.reabastecer_credito_ia_saldo_plano_mes(p_cliente_id);
  IF COALESCE((v_reab->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_reab;
  END IF;

  v_mes_ref := v_reab->>'mes_ref';

  SELECT
    a.id,
    a.credito_ia_limite_mensal,
    a.credito_ia_saldo_plano,
    a.credito_ia_extra,
    COALESCE(p.credito_ia_mensal, 0)
  INTO
    v_assinatura_id,
    v_limite_snap,
    v_cp,
    v_ce,
    v_catalog_limite
  FROM public.assinaturas_clientes a
  LEFT JOIN public.planos_assinatura p ON p.id = a.plano_id
  WHERE a.cliente_id = p_cliente_id
    AND a.status IN ('Ativo', 'active', 'Trial', 'Inadimplente', 'Pendente')
  ORDER BY a.data_inicio DESC NULLS LAST
  LIMIT 1
  FOR UPDATE OF a;

  IF v_assinatura_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'assinatura_not_found');
  END IF;

  v_limite := COALESCE(NULLIF(v_limite_snap, 0), v_catalog_limite, 0);
  v_cp := COALESCE(v_cp, 0);
  v_ce := COALESCE(v_ce, 0);

  IF v_cp + v_ce < p_units THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_credits',
      'credito_plano', v_cp,
      'credito_extra', v_ce,
      'credito_ia_limite_mensal', v_limite,
      'mes_ref', v_mes_ref
    );
  END IF;

  v_need := p_units;
  IF v_cp >= v_need THEN
    v_from_plano := v_need;
    v_cp := v_cp - v_need;
  ELSE
    v_from_plano := v_cp;
    v_need := v_need - v_cp;
    v_cp := 0;
    v_from_extra := v_need;
    v_ce := v_ce - v_need;
  END IF;

  UPDATE public.assinaturas_clientes
  SET
    credito_ia_saldo_plano = v_cp,
    credito_ia_extra = v_ce
  WHERE id = v_assinatura_id;

  IF v_origem IS NOT NULL THEN
    v_prov := CASE
      WHEN v_origem LIKE 'photoroom%' THEN 'photoroom'
      WHEN v_origem LIKE 'openai%' THEN 'openai'
      ELSE 'ia'
    END;
    INSERT INTO public.credito_ia_gasto (
      cliente_id, origem, provedor, unidades, from_plano, from_extra, meta
    ) VALUES (
      p_cliente_id,
      v_origem,
      v_prov,
      p_units,
      v_from_plano,
      v_from_extra,
      COALESCE(p_meta, '{}'::jsonb)
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'from_plano', v_from_plano,
    'from_extra', v_from_extra,
    'credito_plano', v_cp,
    'credito_extra', v_ce,
    'mes_ref', v_mes_ref,
    'origem', v_origem
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_credito_ia(uuid, integer, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_credito_ia(uuid, integer, text, jsonb) TO service_role;

COMMENT ON COLUMN public.assinaturas_clientes.credito_ia_saldo_plano IS
  'Saldo restante dos crÃ©ditos do plano no mÃªs civil (America/Sao_Paulo). Reabastece atÃ© credito_ia_limite_mensal no mÃ¡ximo 1x por mÃªs (credito_ia_mes_ref).';

COMMENT ON COLUMN public.assinaturas_clientes.credito_ia_limite_mensal IS
  'Cota mensal fixa do plano; valor usado no reabastecimento de credito_ia_saldo_plano.';

COMMENT ON COLUMN public.assinaturas_clientes.credito_ia_mes_ref IS
  'YYYY-MM do Ãºltimo reabastecimento de credito_ia_saldo_plano â€” evita reset duplicado no mesmo mÃªs.';


-- =============================================================================
-- SOURCE: frontend/database/migration_fix_credito_ia_reset_nao_duplicar_mes.sql
-- =============================================================================
-- Corrige reabastecimento que voltava a encher credito_ia_saldo_plano no mesmo dia 1
-- quando o saldo era zerado manualmente (mes_ref NULL ou IS DISTINCT FROM).
-- Rode no Supabase (substitui reabastecer_credito_ia_saldo_plano_mes da migration_credito_ia_reset_mensal.sql).

CREATE OR REPLACE FUNCTION public.reabastecer_credito_ia_saldo_plano_mes(p_cliente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mes_ref text := to_char((timezone('America/Sao_Paulo', now()))::date, 'YYYY-MM');
  v_assinatura_id public.assinaturas_clientes.id%TYPE;
  v_limite_snap integer;
  v_catalog_limite integer;
  v_limite integer;
  v_cp integer;
  v_ce integer;
  v_mes_row text;
  v_reset boolean := false;
  v_stamp_only boolean := false;
BEGIN
  IF p_cliente_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_cliente_id');
  END IF;

  SELECT
    a.id,
    a.credito_ia_limite_mensal,
    a.credito_ia_saldo_plano,
    COALESCE(a.credito_ia_extra, 0),
    a.credito_ia_mes_ref,
    COALESCE(p.credito_ia_mensal, 0)
  INTO
    v_assinatura_id,
    v_limite_snap,
    v_cp,
    v_ce,
    v_mes_row,
    v_catalog_limite
  FROM public.assinaturas_clientes a
  LEFT JOIN public.planos_assinatura p ON p.id = a.plano_id
  WHERE a.cliente_id = p_cliente_id
    AND a.status IN ('Ativo', 'active', 'Trial', 'Inadimplente', 'Pendente')
  ORDER BY a.data_inicio DESC NULLS LAST
  LIMIT 1
  FOR UPDATE OF a;

  IF v_assinatura_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'assinatura_not_found');
  END IF;

  v_limite := COALESCE(NULLIF(v_limite_snap, 0), v_catalog_limite, 0);
  v_cp := COALESCE(v_cp, 0);
  v_ce := COALESCE(v_ce, 0);

  IF v_mes_row IS NULL THEN
    v_stamp_only := true;
  ELSIF v_mes_row < v_mes_ref THEN
    v_cp := v_limite;
    v_reset := true;
    UPDATE public.assinaturas_clientes
    SET
      credito_ia_saldo_plano = v_cp,
      credito_ia_mes_ref = v_mes_ref
    WHERE id = v_assinatura_id;
  END IF;

  IF v_stamp_only THEN
    UPDATE public.assinaturas_clientes
    SET credito_ia_mes_ref = v_mes_ref
    WHERE id = v_assinatura_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'reset_applied', v_reset,
    'mes_ref_stamped', v_stamp_only,
    'mes_ref', v_mes_ref,
    'credito_ia_limite_mensal', v_limite,
    'credito_ia_saldo_plano', v_cp,
    'credito_ia_extra', v_ce
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reabastecer_credito_ia_saldo_plano_mes(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reabastecer_credito_ia_saldo_plano_mes(uuid) TO service_role;

COMMENT ON FUNCTION public.reabastecer_credito_ia_saldo_plano_mes(uuid) IS
  'Reabastece credito_ia_saldo_plano sÃ³ na virada do mÃªs (YYYY-MM SP). Saldo 0 no mesmo mÃªs nÃ£o renova cota.';


-- =============================================================================
-- SOURCE: frontend/database/migration_fix_add_credito_ia_extra_assinatura.sql
-- =============================================================================
-- Credita credito_ia_extra na assinatura correta (mesma linha que o billing/consume usam).
-- Rode apÃ³s migration_ai_credits_purchase.sql (ou se a funÃ§Ã£o antiga de 2 parÃ¢metros jÃ¡ existir).

DROP FUNCTION IF EXISTS public.add_credito_ia_extra(uuid, integer);

CREATE OR REPLACE FUNCTION public.add_credito_ia_extra(
    p_cliente_id uuid,
    p_units integer,
    p_assinatura_id integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assinatura_id public.assinaturas_clientes.id%TYPE;
  v_extra integer;
BEGIN
  IF p_units IS NULL OR p_units < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_units');
  END IF;

  IF p_assinatura_id IS NOT NULL THEN
    SELECT a.id, COALESCE(a.credito_ia_extra, 0)
    INTO v_assinatura_id, v_extra
    FROM public.assinaturas_clientes a
    WHERE a.id = p_assinatura_id
      AND a.cliente_id = p_cliente_id
    FOR UPDATE OF a;
  ELSE
    -- Mesmo critÃ©rio de consume_credito_ia (evita creditar em linha Pendente antiga)
    SELECT a.id, COALESCE(a.credito_ia_extra, 0)
    INTO v_assinatura_id, v_extra
    FROM public.assinaturas_clientes a
    WHERE a.cliente_id = p_cliente_id
      AND a.status IN ('Ativo', 'active', 'Trial', 'Inadimplente', 'Pendente')
    ORDER BY a.data_inicio DESC NULLS LAST
    LIMIT 1
    FOR UPDATE OF a;
  END IF;

  IF v_assinatura_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'assinatura_not_found');
  END IF;

  v_extra := v_extra + p_units;

  UPDATE public.assinaturas_clientes
  SET credito_ia_extra = v_extra
  WHERE id = v_assinatura_id;

  RETURN jsonb_build_object(
    'ok', true,
    'assinatura_id', v_assinatura_id,
    'credito_extra', v_extra,
    'added', p_units
  );
END;
$$;

REVOKE ALL ON FUNCTION public.add_credito_ia_extra(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_credito_ia_extra(uuid, integer, integer) TO service_role;


-- =============================================================================
-- SOURCE: frontend/database/migration_fix_consume_credito_ia_assinatura_id_type.sql
-- =============================================================================
-- CorreÃ§Ã£o: consume_credito_ia usava v_assinatura_id uuid, mas assinaturas_clientes.id Ã© SERIAL (int4).
-- Rode no Supabase se vocÃª jÃ¡ aplicou migration_ai_credits_assinaturas_clientes.sql com a versÃ£o antiga.

DROP FUNCTION IF EXISTS public.consume_credito_ia(uuid, integer);
DROP FUNCTION IF EXISTS public.consume_credito_ia(uuid, integer, text, jsonb);

CREATE OR REPLACE FUNCTION public.consume_credito_ia(
    p_cliente_id uuid,
    p_units integer,
    p_origem text DEFAULT NULL,
    p_meta jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mes_ref text := to_char((timezone('America/Sao_Paulo', now()))::date, 'YYYY-MM');
  v_mes_row text;
  v_assinatura_id public.assinaturas_clientes.id%TYPE;
  v_limite_snap integer;
  v_catalog_limite integer;
  v_limite integer;
  v_cp integer;
  v_ce integer;
  v_need integer;
  v_from_plano integer := 0;
  v_from_extra integer := 0;
  v_origem text := NULLIF(trim(COALESCE(p_origem, '')), '');
  v_prov text;
BEGIN
  IF p_units IS NULL OR p_units < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_units');
  END IF;

  SELECT
    a.id,
    a.credito_ia_limite_mensal,
    a.credito_ia_saldo_plano,
    a.credito_ia_extra,
    a.credito_ia_mes_ref,
    COALESCE(p.credito_ia_mensal, 0)
  INTO
    v_assinatura_id,
    v_limite_snap,
    v_cp,
    v_ce,
    v_mes_row,
    v_catalog_limite
  FROM public.assinaturas_clientes a
  LEFT JOIN public.planos_assinatura p ON p.id = a.plano_id
  WHERE a.cliente_id = p_cliente_id
    AND a.status IN ('Ativo', 'active', 'Trial')
  ORDER BY a.data_inicio DESC NULLS LAST
  LIMIT 1
  FOR UPDATE OF a;

  IF v_assinatura_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'assinatura_not_found');
  END IF;

  v_limite := COALESCE(NULLIF(v_limite_snap, 0), v_catalog_limite, 0);

  v_cp := COALESCE(v_cp, 0);
  v_ce := COALESCE(v_ce, 0);

  IF v_mes_row IS NULL THEN
    UPDATE public.assinaturas_clientes
    SET credito_ia_mes_ref = v_mes_ref
    WHERE id = v_assinatura_id;
  ELSIF v_mes_row < v_mes_ref THEN
    v_cp := v_limite;
    UPDATE public.assinaturas_clientes
    SET credito_ia_saldo_plano = v_cp,
        credito_ia_mes_ref = v_mes_ref
    WHERE id = v_assinatura_id;
  END IF;

  IF v_cp + v_ce < p_units THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_credits',
      'credito_plano', v_cp,
      'credito_extra', v_ce
    );
  END IF;

  v_need := p_units;
  IF v_cp >= v_need THEN
    v_from_plano := v_need;
    v_cp := v_cp - v_need;
  ELSE
    v_from_plano := v_cp;
    v_need := v_need - v_cp;
    v_cp := 0;
    v_from_extra := v_need;
    v_ce := v_ce - v_need;
  END IF;

  UPDATE public.assinaturas_clientes
  SET credito_ia_saldo_plano = v_cp,
      credito_ia_extra = v_ce
  WHERE id = v_assinatura_id;

  IF v_origem IS NOT NULL THEN
    v_prov := CASE
      WHEN v_origem LIKE 'photoroom%' THEN 'photoroom'
      WHEN v_origem LIKE 'openai%' THEN 'openai'
      ELSE 'ia'
    END;
    INSERT INTO public.credito_ia_gasto (
      cliente_id, origem, provedor, unidades, from_plano, from_extra, meta
    ) VALUES (
      p_cliente_id,
      v_origem,
      v_prov,
      p_units,
      v_from_plano,
      v_from_extra,
      COALESCE(p_meta, '{}'::jsonb)
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'from_plano', v_from_plano,
    'from_extra', v_from_extra,
    'credito_plano', v_cp,
    'credito_extra', v_ce,
    'origem', v_origem
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_credito_ia(uuid, integer, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_credito_ia(uuid, integer, text, jsonb) TO service_role;


-- =============================================================================
-- SOURCE: frontend/database/migration_ia_uso_mensal.sql
-- =============================================================================
-- Contagem mensal de uso de IA (imagens + mensagens).
-- Mesmo mÃªs civil de America/Sao_Paulo usado em consume_credito_ia (credito_ia_mes_ref).
-- Rode apÃ³s migration_ai_credits_ledger.sql (credito_ia_gasto).

-- ---------------------------------------------------------------------------
-- 1) Eventos de uso (mensagens locais, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ia_uso_eventos (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at  timestamptz NOT NULL DEFAULT now(),
    cliente_id  uuid NOT NULL REFERENCES public.clientes_azoup(id) ON DELETE CASCADE,
    ano_mes     text NOT NULL,
    categoria   text NOT NULL CHECK (categoria IN ('imagem', 'mensagem')),
    origem      text NOT NULL,
    meta        jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.ia_uso_eventos
    ADD COLUMN IF NOT EXISTS ano_mes text;

UPDATE public.ia_uso_eventos
SET ano_mes = to_char((timezone('America/Sao_Paulo', created_at))::date, 'YYYY-MM')
WHERE ano_mes IS NULL OR trim(ano_mes) = '';

CREATE INDEX IF NOT EXISTS idx_ia_uso_eventos_cliente_mes
    ON public.ia_uso_eventos (cliente_id, ano_mes, categoria);

COMMENT ON COLUMN public.ia_uso_eventos.ano_mes IS
    'ReferÃªncia mensal YYYY-MM (America/Sao_Paulo), alinhada ao reset de crÃ©ditos de IA.';

ALTER TABLE public.ia_uso_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ia_uso_eventos_select_tenant" ON public.ia_uso_eventos;
CREATE POLICY "ia_uso_eventos_select_tenant" ON public.ia_uso_eventos
    FOR SELECT
    USING (
        cliente_id IN (
            SELECT u.cliente_id FROM public.usuarios u
            WHERE u.auth_id = auth.uid() AND u.ativo = true
        )
    );

-- ---------------------------------------------------------------------------
-- 2) RPC: totais do mÃªs civil (BrasÃ­lia)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_ia_uso_mes(
    p_cliente_id uuid,
    p_mes_ref text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ref text;
    v_imagens_ledger integer := 0;
    v_imagens_mockup integer := 0;
    v_imagens_contador integer := 0;
    v_mensagens_ledger integer := 0;
    v_mensagens_eventos integer := 0;
BEGIN
    IF p_cliente_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'cliente_id_required');
    END IF;

    v_ref := COALESCE(
        NULLIF(trim(p_mes_ref), ''),
        to_char((timezone('America/Sao_Paulo', now()))::date, 'YYYY-MM')
    );

    SELECT COUNT(*)::int INTO v_imagens_ledger
    FROM public.credito_ia_gasto
    WHERE cliente_id = p_cliente_id
      AND origem IN ('mockup_finalizacao', 'openai_sale_image', 'photoroom_sale_image')
      AND to_char(timezone('America/Sao_Paulo', created_at), 'YYYY-MM') = v_ref;

    SELECT COUNT(*)::int INTO v_mensagens_ledger
    FROM public.credito_ia_gasto
    WHERE cliente_id = p_cliente_id
      AND origem IN ('openai_assistant_ask', 'openai_cadastro_interpret')
      AND to_char(timezone('America/Sao_Paulo', created_at), 'YYYY-MM') = v_ref;

    SELECT COUNT(*)::int INTO v_imagens_mockup
    FROM public.mockup_simulacoes
    WHERE cliente_id_tenant = p_cliente_id
      AND imagem_final_url IS NOT NULL
      AND trim(imagem_final_url) <> ''
      AND to_char(timezone('America/Sao_Paulo', updated_at), 'YYYY-MM') = v_ref;

    SELECT COALESCE(quantidade_gerada, 0)::int INTO v_imagens_contador
    FROM public.venda_imagem_ia_contador_mensal
    WHERE cliente_id = p_cliente_id
      AND ano_mes = v_ref;

    IF v_imagens_contador IS NULL THEN
        v_imagens_contador := 0;
    END IF;

    SELECT COUNT(*)::int INTO v_mensagens_eventos
    FROM public.ia_uso_eventos
    WHERE cliente_id = p_cliente_id
      AND categoria = 'mensagem'
      AND ano_mes = v_ref;

    RETURN jsonb_build_object(
        'ok', true,
        'mes_ref', v_ref,
        'imagens_geradas', GREATEST(v_imagens_ledger, v_imagens_mockup, v_imagens_contador),
        'mensagens_enviadas', v_mensagens_ledger + v_mensagens_eventos
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_ia_uso_mes(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ia_uso_mes(uuid, text) TO service_role;

COMMENT ON FUNCTION public.get_ia_uso_mes IS
    'Totais mensais de imagens e mensagens de IA por tenant (mÃªs civil America/Sao_Paulo).';


-- =============================================================================
-- SOURCE: frontend/database/migration_password_reset.sql
-- =============================================================================
-- RedefiniÃ§Ã£o de senha (cÃ³digos 6 dÃ­gitos) â€” tabela e funÃ§Ã£o sÃ³ acessÃ­veis com service_role no app (backend).
-- Execute no SQL Editor do Supabase se o banco ainda nÃ£o tiver estes objetos.

CREATE TABLE IF NOT EXISTS public.password_reset_challenges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    code_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_challenges_user_active
    ON public.password_reset_challenges (user_id, created_at DESC)
    WHERE used_at IS NULL;

ALTER TABLE public.password_reset_challenges ENABLE ROW LEVEL SECURITY;

-- Sem polÃ­ticas: anon/authenticated nÃ£o enxergam; service_role (backend) ignora RLS.
COMMENT ON TABLE public.password_reset_challenges IS
    'Desafios de redefiniÃ§Ã£o de senha; acesso somente via backend com chave de serviÃ§o.';

-- Resolve auth.users.id por e-mail (sÃ³ service_role, nÃ£o o app cliente).
CREATE OR REPLACE FUNCTION public.admin_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT u.id
    FROM auth.users u
    WHERE lower(btrim(u.email::text)) = lower(btrim($1::text))
    LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.admin_auth_user_id_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_auth_user_id_by_email(text) TO service_role;


-- =============================================================================
-- SOURCE: frontend/database/migration_contadores.sql
-- =============================================================================
-- =============================================================================
-- Contadores (escritÃ³rio contÃ¡bil) por tenant (clientes_azoup)
-- Rode no SQL Editor do Supabase (idempotente).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.contadores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    cliente_id_tenant uuid NOT NULL
        REFERENCES public.clientes_azoup (id) ON DELETE CASCADE,

    nome text NOT NULL,

    cpf text,
    cnpj text,

    telefone text,
    email text NOT NULL,

    logradouro text,
    numero text,
    complemento text,
    bairro text,
    cidade text,
    uf char(2),
    cep text,

    auth_user_id uuid,
    login_criado_em timestamptz,

    ativo boolean NOT NULL DEFAULT true,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT contadores_doc_ck CHECK (
        (cpf IS NOT NULL AND btrim(cpf) <> '')
        OR (cnpj IS NOT NULL AND btrim(cnpj) <> '')
    )
);

CREATE INDEX IF NOT EXISTS idx_contadores_tenant
    ON public.contadores (cliente_id_tenant);

CREATE INDEX IF NOT EXISTS idx_contadores_tenant_nome
    ON public.contadores (cliente_id_tenant, nome);

CREATE INDEX IF NOT EXISTS idx_contadores_auth_user
    ON public.contadores (auth_user_id)
    WHERE auth_user_id IS NOT NULL;

COMMENT ON TABLE public.contadores IS
    'Cadastro de contadores vinculados ao tenant (clientes_azoup). Mesmos dados podem existir em tenants diferentes.';

COMMENT ON COLUMN public.contadores.auth_user_id IS
    'UsuÃ¡rio Supabase Auth (senha inicial ZPFsistemas no backend). NULL se e-mail jÃ¡ tinha login.';

-- updated_at automÃ¡tico
CREATE OR REPLACE FUNCTION public.contadores_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_contadores_updated_at ON public.contadores;
CREATE TRIGGER tr_contadores_updated_at
    BEFORE UPDATE ON public.contadores
    FOR EACH ROW
    EXECUTE FUNCTION public.contadores_set_updated_at();

ALTER TABLE public.contadores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contadores_select_tenant" ON public.contadores;
CREATE POLICY "contadores_select_tenant"
    ON public.contadores
    FOR SELECT
    TO authenticated
    USING (
        cliente_id_tenant = (
            SELECT u.cliente_id
            FROM public.usuarios u
            WHERE u.auth_id = auth.uid()
               OR u.id = auth.uid()
            LIMIT 1
        )
    );

DROP POLICY IF EXISTS "contadores_insert_tenant" ON public.contadores;
CREATE POLICY "contadores_insert_tenant"
    ON public.contadores
    FOR INSERT
    TO authenticated
    WITH CHECK (
        cliente_id_tenant = (
            SELECT u.cliente_id
            FROM public.usuarios u
            WHERE u.auth_id = auth.uid()
               OR u.id = auth.uid()
            LIMIT 1
        )
    );

DROP POLICY IF EXISTS "contadores_update_tenant" ON public.contadores;
CREATE POLICY "contadores_update_tenant"
    ON public.contadores
    FOR UPDATE
    TO authenticated
    USING (
        cliente_id_tenant = (
            SELECT u.cliente_id
            FROM public.usuarios u
            WHERE u.auth_id = auth.uid()
               OR u.id = auth.uid()
            LIMIT 1
        )
    )
    WITH CHECK (
        cliente_id_tenant = (
            SELECT u.cliente_id
            FROM public.usuarios u
            WHERE u.auth_id = auth.uid()
               OR u.id = auth.uid()
            LIMIT 1
        )
    );

DROP POLICY IF EXISTS "contadores_delete_tenant" ON public.contadores;
CREATE POLICY "contadores_delete_tenant"
    ON public.contadores
    FOR DELETE
    TO authenticated
    USING (
        cliente_id_tenant = (
            SELECT u.cliente_id
            FROM public.usuarios u
            WHERE u.auth_id = auth.uid()
               OR u.id = auth.uid()
            LIMIT 1
        )
    );


-- =============================================================================
-- SOURCE: frontend/database/migration_login_faccionista.sql
-- =============================================================================
-- =============================================================================
-- login_faccionista: vÃ­nculo fornecedor (faccionista) â†” Supabase Auth
-- Rode no SQL Editor do Supabase (idempotente).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.login_faccionista (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    cliente_id_tenant uuid NOT NULL
        REFERENCES public.clientes_azoup (id) ON DELETE CASCADE,

    fornecedor_id uuid NOT NULL
        REFERENCES public.fornecedores_cadastros (id) ON DELETE CASCADE,

    email text NOT NULL,
    cpf_cnpj text NOT NULL,

    auth_user_id uuid NOT NULL,

    status text NOT NULL DEFAULT 'ativo'
        CONSTRAINT login_faccionista_status_ck
            CHECK (status IN ('ativo', 'inativo', 'pendente')),

    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT login_faccionista_fornecedor_unique UNIQUE (fornecedor_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS login_faccionista_tenant_email_lower
    ON public.login_faccionista (cliente_id_tenant, lower(email));

CREATE INDEX IF NOT EXISTS idx_login_faccionista_tenant
    ON public.login_faccionista (cliente_id_tenant);

CREATE INDEX IF NOT EXISTS idx_login_faccionista_auth_user
    ON public.login_faccionista (auth_user_id);

COMMENT ON TABLE public.login_faccionista IS
    'Login Supabase Auth vinculado ao cadastro de fornecedor tipo faccionista (senha inicial definida no backend).';

COMMENT ON COLUMN public.login_faccionista.cpf_cnpj IS
    'Documento do fornecedor no momento do vÃ­nculo (PF = CPF, PJ = CNPJ; texto como cadastrado).';

ALTER TABLE public.login_faccionista ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "login_faccionista_select_tenant" ON public.login_faccionista;
CREATE POLICY "login_faccionista_select_tenant"
    ON public.login_faccionista
    FOR SELECT
    TO authenticated
    USING (
        cliente_id_tenant = (
            SELECT u.cliente_id
            FROM public.usuarios u
            WHERE u.auth_id = auth.uid()
               OR u.id = auth.uid()
            LIMIT 1
        )
    );

-- Escrita apenas via service_role / backend (sem policy INSERT/UPDATE para authenticated).


-- =============================================================================
-- SOURCE: frontend/database/migration_login_faccionista_rls_usuarios_auth_id.sql
-- =============================================================================
-- Corrige SELECT em login_faccionista: auth.uid() bate com usuarios.auth_id (nÃ£o com usuarios.id).
-- Rode no SQL Editor se migration_login_faccionista.sql jÃ¡ tiver sido aplicada com a policy antiga.

DROP POLICY IF EXISTS "login_faccionista_select_tenant" ON public.login_faccionista;

CREATE POLICY "login_faccionista_select_tenant"
    ON public.login_faccionista
    FOR SELECT
    TO authenticated
    USING (
        cliente_id_tenant = (
            SELECT u.cliente_id
            FROM public.usuarios u
            WHERE u.auth_id = auth.uid()
               OR u.id = auth.uid()
            LIMIT 1
        )
    );


-- =============================================================================
-- SOURCE: frontend/database/ibge_municipios_schema.sql
-- =============================================================================
-- ============================================
-- Tabela auxiliar: ibge_municipios
-- ============================================
-- Objetivo:
-- - Armazenar a lista completa de municÃ­pios do IBGE (cÃ³digo, nome, UF).
-- - Permitir popular automaticamente cidades.codigo_ibge para TODAS
--   as cidades jÃ¡ cadastradas no sistema.
--
-- Como usar (passos recomendados):
-- 1) Baixar a lista oficial de municÃ­pios IBGE (cÃ³digo, nome, UF)
--    em CSV do site do IBGE ou outra fonte confiÃ¡vel.
-- 2) Importar o CSV para esta tabela (ibge_municipios) via Supabase UI
--    ou script SQL (COPY ... FROM ...).
-- 3) Rodar o UPDATE no final deste arquivo para preencher cidades.codigo_ibge.

CREATE TABLE IF NOT EXISTS ibge_municipios (
    codigo_ibge VARCHAR(7) PRIMARY KEY,
    nome        VARCHAR(150) NOT NULL,
    uf          CHAR(2)      NOT NULL
);

COMMENT ON TABLE ibge_municipios IS 'Tabela auxiliar com municÃ­pios do IBGE (cÃ³digo, nome, UF).';
COMMENT ON COLUMN ibge_municipios.codigo_ibge IS 'CÃ³digo IBGE do municÃ­pio (7 dÃ­gitos).';
COMMENT ON COLUMN ibge_municipios.nome IS 'Nome oficial do municÃ­pio (sem UF).';
COMMENT ON COLUMN ibge_municipios.uf IS 'UF do municÃ­pio (sigla de 2 letras).';

-- Habilita RLS e libera somente leitura pÃºblica (para dropdowns, etc.)
ALTER TABLE ibge_municipios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select ibge_municipios" ON ibge_municipios;
CREATE POLICY "Allow select ibge_municipios" ON ibge_municipios
FOR SELECT USING (true);

-- ============================================
-- Preencher cidades.codigo_ibge usando ibge_municipios
-- ============================================
-- Este UPDATE associa cidades existentes ao cÃ³digo IBGE, baseando-se em
-- (nome, estado/UF). Ã‰ executado apÃ³s a importaÃ§Ã£o da tabela ibge_municipios.

-- Garante que a coluna exista em cidades
ALTER TABLE cidades
    ADD COLUMN IF NOT EXISTS codigo_ibge VARCHAR(7);

COMMENT ON COLUMN cidades.codigo_ibge IS 'CÃ³digo IBGE do municÃ­pio (7 dÃ­gitos).';

-- Atualiza TODAS as cidades que ainda nÃ£o possuem cÃ³digo IBGE, usando o match por nome + UF.
UPDATE cidades c
SET codigo_ibge = i.codigo_ibge
FROM ibge_municipios i
WHERE (c.codigo_ibge IS NULL OR c.codigo_ibge = '')
  AND UPPER(TRIM(c.nome)) = UPPER(TRIM(i.nome))
  AND UPPER(TRIM(c.estado)) = UPPER(TRIM(i.uf));



-- =============================================================================
-- SOURCE: frontend/database/migration_nfe_campos.sql
-- =============================================================================
-- ===============================
-- MigraÃ§Ã£o: campos para NF-e (paÃ­s, cÃ³digo IBGE, CEST, itens, pagamentos, transporte)
-- Rodar apÃ³s as tabelas base (clientes_azoup, empresas, cidades, cliente_endereco, venda, venda_itens, venda_forma_pagamento, produtos)
-- ===============================

-- 1) Tabela de paÃ­ses (cÃ³digos para NF-e / BACEN)
CREATE TABLE IF NOT EXISTS paises (
    codigo VARCHAR(10) PRIMARY KEY,
    nome VARCHAR(120) NOT NULL
);

-- Inserir paÃ­ses e cÃ³digos (cÃ³digo BACEN / uso comum em NF-e)
INSERT INTO paises (codigo, nome) VALUES
    ('1058', 'Brasil'),
    ('076', 'Argentina'),
    ('0586', 'Paraguai'),
    ('0840', 'Uruguai'),
    ('0584', 'BolÃ­via'),
    ('0152', 'Chile'),
    ('0170', 'ColÃ´mbia'),
    ('0218', 'Equador'),
    ('0604', 'Peru'),
    ('0842', 'Estados Unidos'),
    ('0624', 'Portugal'),
    ('0724', 'Espanha'),
    ('0380', 'ItÃ¡lia'),
    ('0250', 'FranÃ§a'),
    ('0826', 'Reino Unido'),
    ('0392', 'JapÃ£o'),
    ('0156', 'China'),
    ('0484', 'MÃ©xico'),
    ('0000', 'Outro')
ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome;

-- 2) PaÃ­s em clientes_azoup
ALTER TABLE clientes_azoup ADD COLUMN IF NOT EXISTS pais_codigo VARCHAR(10) DEFAULT '1058';
COMMENT ON COLUMN clientes_azoup.pais_codigo IS 'CÃ³digo do paÃ­s (NF-e). 1058 = Brasil';

-- 3) PaÃ­s em empresas
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS pais_codigo VARCHAR(10) DEFAULT '1058';
COMMENT ON COLUMN empresas.pais_codigo IS 'CÃ³digo do paÃ­s do emitente (NF-e). 1058 = Brasil';

-- 4) PaÃ­s em cliente_endereco (endereÃ§o do destinatÃ¡rio)
ALTER TABLE cliente_endereco ADD COLUMN IF NOT EXISTS pais_codigo VARCHAR(10) DEFAULT '1058';
COMMENT ON COLUMN cliente_endereco.pais_codigo IS 'CÃ³digo do paÃ­s do endereÃ§o (NF-e). 1058 = Brasil';

-- 5) CÃ³digo IBGE em cidades (para codigoCidade na NF-e)
ALTER TABLE cidades ADD COLUMN IF NOT EXISTS codigo_ibge VARCHAR(7);
COMMENT ON COLUMN cidades.codigo_ibge IS 'CÃ³digo IBGE do municÃ­pio (7 dÃ­gitos)';

-- 6) CEST em produtos
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS cest VARCHAR(20);
COMMENT ON COLUMN produtos.cest IS 'CÃ³digo Especificador da SubstituiÃ§Ã£o TributÃ¡ria (NF-e)';

-- 7) Item do pedido de compra em venda_itens (nÃºmero do item no pedido do comprador)
ALTER TABLE venda_itens ADD COLUMN IF NOT EXISTS item_pedido_compra INTEGER;
COMMENT ON COLUMN venda_itens.item_pedido_compra IS 'NÃºmero do item no pedido do comprador (NF-e)';

-- 8) Pagamento: bandeira, CNPJ credenciadora, nÃºmero autorizaÃ§Ã£o (cartÃ£o, etc.)
ALTER TABLE venda_forma_pagamento ADD COLUMN IF NOT EXISTS bandeira VARCHAR(50);
ALTER TABLE venda_forma_pagamento ADD COLUMN IF NOT EXISTS cnpj_credenciadora VARCHAR(18);
ALTER TABLE venda_forma_pagamento ADD COLUMN IF NOT EXISTS numero_autorizacao VARCHAR(50);

-- 9) Transporte na venda
ALTER TABLE venda ADD COLUMN IF NOT EXISTS modalidade_frete VARCHAR(2);
-- 0=Emitente, 1=DestinatÃ¡rio, 2=Terceiros, 9=Sem frete
ALTER TABLE venda ADD COLUMN IF NOT EXISTS transportadora_cnpj VARCHAR(18);
ALTER TABLE venda ADD COLUMN IF NOT EXISTS transportadora_razao_social VARCHAR(120);
ALTER TABLE venda ADD COLUMN IF NOT EXISTS transportadora_ie VARCHAR(20);
ALTER TABLE venda ADD COLUMN IF NOT EXISTS veiculo_placa VARCHAR(10);
ALTER TABLE venda ADD COLUMN IF NOT EXISTS veiculo_uf CHAR(2);
ALTER TABLE venda ADD COLUMN IF NOT EXISTS volumes_quantidade INTEGER;
ALTER TABLE venda ADD COLUMN IF NOT EXISTS volumes_especie VARCHAR(60);
ALTER TABLE venda ADD COLUMN IF NOT EXISTS volumes_marca VARCHAR(60);
ALTER TABLE venda ADD COLUMN IF NOT EXISTS volumes_numeracao VARCHAR(60);
ALTER TABLE venda ADD COLUMN IF NOT EXISTS volumes_peso_bruto NUMERIC(12, 3);
ALTER TABLE venda ADD COLUMN IF NOT EXISTS volumes_peso_liquido NUMERIC(12, 3);

COMMENT ON COLUMN venda.modalidade_frete IS 'NF-e: 0=Emitente, 1=DestinatÃ¡rio, 2=Terceiros, 9=Sem frete';

-- PolÃ­tica para leitura de paises (dropdowns)
ALTER TABLE paises ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow select paises" ON paises;
CREATE POLICY "Allow select paises" ON paises FOR SELECT USING (true);


-- =============================================================================
-- SOURCE: frontend/database/cfop_codigos_schema.sql
-- =============================================================================
-- ===============================
-- CÃ³digos CFOP (Grupo Fiscal - dropdown)
-- ===============================

CREATE TABLE IF NOT EXISTS cfop_codigos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    codigo VARCHAR(10) NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (cliente_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_cfop_codigos_cliente ON cfop_codigos(cliente_id);

ALTER TABLE cfop_codigos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total cfop_codigos"
ON cfop_codigos FOR ALL TO authenticated
USING (true) WITH CHECK (true);


-- =============================================================================
-- SOURCE: frontend/database/csosn_codigos_schema.sql
-- =============================================================================
-- ===============================
-- CSOSN (Grupo Fiscal - dropdown, Simples Nacional)
-- ===============================

CREATE TABLE IF NOT EXISTS csosn_codigos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    codigo VARCHAR(3) NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (cliente_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_csosn_codigos_cliente ON csosn_codigos(cliente_id);

ALTER TABLE csosn_codigos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total csosn_codigos"
ON csosn_codigos FOR ALL TO authenticated
USING (true) WITH CHECK (true);


-- =============================================================================
-- SOURCE: frontend/database/cst_icms_codigos_schema.sql
-- =============================================================================
-- ===============================
-- CST ICMS (Grupo Fiscal - dropdown, Regime Normal)
-- ===============================

CREATE TABLE IF NOT EXISTS cst_icms_codigos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    codigo VARCHAR(3) NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (cliente_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_cst_icms_codigos_cliente ON cst_icms_codigos(cliente_id);

ALTER TABLE cst_icms_codigos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total cst_icms_codigos"
ON cst_icms_codigos FOR ALL TO authenticated
USING (true) WITH CHECK (true);


-- =============================================================================
-- SOURCE: frontend/database/cst_pis_codigos_schema.sql
-- =============================================================================
-- ===============================
-- CST PIS (Grupo Fiscal - dropdown)
-- ===============================

CREATE TABLE IF NOT EXISTS cst_pis_codigos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    codigo VARCHAR(3) NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (cliente_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_cst_pis_codigos_cliente ON cst_pis_codigos(cliente_id);

ALTER TABLE cst_pis_codigos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total cst_pis_codigos"
ON cst_pis_codigos FOR ALL TO authenticated
USING (true) WITH CHECK (true);


-- =============================================================================
-- SOURCE: frontend/database/cst_cofins_codigos_schema.sql
-- =============================================================================
-- ===============================
-- CST COFINS (Grupo Fiscal - dropdown)
-- ===============================

CREATE TABLE IF NOT EXISTS cst_cofins_codigos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    codigo VARCHAR(3) NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (cliente_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_cst_cofins_codigos_cliente ON cst_cofins_codigos(cliente_id);

ALTER TABLE cst_cofins_codigos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total cst_cofins_codigos"
ON cst_cofins_codigos FOR ALL TO authenticated
USING (true) WITH CHECK (true);


-- =============================================================================
-- SOURCE: frontend/database/cst_ipi_codigos_schema.sql
-- =============================================================================
-- ===============================
-- CST IPI (Grupo Fiscal - dropdown)
-- ===============================

CREATE TABLE IF NOT EXISTS cst_ipi_codigos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    codigo VARCHAR(3) NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (cliente_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_cst_ipi_codigos_cliente ON cst_ipi_codigos(cliente_id);

ALTER TABLE cst_ipi_codigos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total cst_ipi_codigos"
ON cst_ipi_codigos FOR ALL TO authenticated
USING (true) WITH CHECK (true);


-- =============================================================================
-- SOURCE: frontend/database/cst_ibs_cbs_codigos_schema.sql
-- =============================================================================
-- ===============================
-- CST IBS/CBS (Grupo Fiscal - dropdown)
-- ===============================

CREATE TABLE IF NOT EXISTS cst_ibs_cbs_codigos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    codigo VARCHAR(3) NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (cliente_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_cst_ibs_cbs_codigos_cliente ON cst_ibs_cbs_codigos(cliente_id);

ALTER TABLE cst_ibs_cbs_codigos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total cst_ibs_cbs_codigos"
ON cst_ibs_cbs_codigos FOR ALL TO authenticated
USING (true) WITH CHECK (true);


-- =============================================================================
-- SOURCE: frontend/database/class_trib_codigos_schema.sql
-- =============================================================================
-- ===============================
-- ClassificaÃ§Ã£o TributÃ¡ria (Grupo Fiscal - dropdown)
-- ===============================

CREATE TABLE IF NOT EXISTS class_trib_codigos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    codigo VARCHAR(20) NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (cliente_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_class_trib_codigos_cliente ON class_trib_codigos(cliente_id);

ALTER TABLE class_trib_codigos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total class_trib_codigos"
ON class_trib_codigos FOR ALL TO authenticated
USING (true) WITH CHECK (true);


-- =============================================================================
-- SOURCE: frontend/database/grupo_fiscal_config_schema.sql
-- =============================================================================
-- ===============================
-- ConfiguraÃ§Ã£o principal de Grupo Fiscal
-- ===============================

CREATE TABLE IF NOT EXISTS grupo_fiscal_config (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    grupo_fiscal_id UUID NOT NULL REFERENCES grupos_fiscais(id) ON DELETE CASCADE,
    empresa_id      UUID NOT NULL REFERENCES empresas(id)       ON DELETE CASCADE,
    tipo_operacao_id UUID NOT NULL REFERENCES tipo_operacao(id) ON DELETE CASCADE,

    observacao TEXT,

    -- Checkboxes gerais
    somar_frete_icms                BOOLEAN DEFAULT FALSE,
    somar_ipi_icms                  BOOLEAN DEFAULT FALSE,
    isento_icms_orgao_publico       BOOLEAN DEFAULT FALSE,  -- Decreto 48034
    uso_consumo_st_conv142          BOOLEAN DEFAULT FALSE,  -- Uso e consumo ST (ConvÃªnio 142/2018)
    somar_frete_ipi                 BOOLEAN DEFAULT FALSE,
    somar_outras_despesas_icms      BOOLEAN DEFAULT FALSE,
    somar_fcp_st                    BOOLEAN DEFAULT FALSE,
    somar_frete_pis_cofins          BOOLEAN DEFAULT FALSE,
    subtrair_icms_base_pis_cofins   BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_grupo_empresa_operacao UNIQUE (grupo_fiscal_id, empresa_id, tipo_operacao_id)
);

CREATE INDEX IF NOT EXISTS idx_grupo_fiscal_config_empresa
ON grupo_fiscal_config(empresa_id);

CREATE INDEX IF NOT EXISTS idx_grupo_fiscal_config_grupo
ON grupo_fiscal_config(grupo_fiscal_id);

CREATE INDEX IF NOT EXISTS idx_grupo_fiscal_config_tipo_operacao
ON grupo_fiscal_config(tipo_operacao_id);

ALTER TABLE grupo_fiscal_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total grupo_fiscal_config"
ON grupo_fiscal_config FOR ALL TO authenticated
USING (true) WITH CHECK (true);



-- =============================================================================
-- SOURCE: frontend/database/grupo_fiscal_regra_schema.sql
-- =============================================================================
-- ===============================
-- Regras fiscais por UF (grid de Grupo Fiscal)
-- ===============================

CREATE TABLE IF NOT EXISTS grupo_fiscal_regra (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    grupo_fiscal_id UUID NOT NULL REFERENCES grupos_fiscais(id) ON DELETE CASCADE,
    empresa_id      UUID NOT NULL REFERENCES empresas(id)       ON DELETE CASCADE,
    tipo_operacao_id UUID NOT NULL REFERENCES tipo_operacao(id) ON DELETE CASCADE,

    origem  CHAR(2) NOT NULL,
    destino CHAR(2) NOT NULL,

    -- Campos fiscais do grid (todos opcionais, permitem NULL)
    cfop                  VARCHAR(10),
    cest                  VARCHAR(20),
    cbenef                VARCHAR(20),

    perc_icms             NUMERIC(7,4),
    perc_reducao_icms     NUMERIC(7,4),
    perc_iva              NUMERIC(7,4),
    icms_st               VARCHAR(20),
    perc_icms_st_proprio  NUMERIC(7,4),

    cst_pis               VARCHAR(3),
    perc_pis              NUMERIC(7,4),

    cst_cofins            VARCHAR(3),
    perc_cofins           NUMERIC(7,4),

    cst_ibs_cbs           VARCHAR(3),
    classificacao_tributaria VARCHAR(50),

    perc_ibs_uf           NUMERIC(7,4),
    perc_ibs_municipio    NUMERIC(7,4),
    perc_cbs              NUMERIC(7,4),

    perc_ipi              NUMERIC(7,4),
    cst_ipi               VARCHAR(3),
    codigo_enquadramento_ipi VARCHAR(10),

    -- Regime Normal: CST
    cst                   VARCHAR(3),

    -- Simples Nacional: CSOSN (duas colunas)
    csosn_contribuinte     VARCHAR(3),
    csosn_consumidor_final VARCHAR(3),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grupo_fiscal_regra_chave
ON grupo_fiscal_regra(grupo_fiscal_id, empresa_id, tipo_operacao_id);

CREATE INDEX IF NOT EXISTS idx_grupo_fiscal_regra_ufs
ON grupo_fiscal_regra(origem, destino);

ALTER TABLE grupo_fiscal_regra ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total grupo_fiscal_regra"
ON grupo_fiscal_regra FOR ALL TO authenticated
USING (true) WITH CHECK (true);



-- =============================================================================
-- SOURCE: frontend/database/tipo_operacao_schema.sql
-- =============================================================================
-- ===============================
--  Tipo de OperaÃ§Ã£o (informaÃ§Ãµes fiscais por cliente)
-- ===============================

CREATE TABLE IF NOT EXISTS tipo_operacao (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    descricao VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tipo_operacao_cliente_id
ON tipo_operacao(cliente_id);

ALTER TABLE tipo_operacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total tipo_operacao"
ON tipo_operacao FOR ALL TO authenticated
USING (true) WITH CHECK (true);



-- =============================================================================
-- SOURCE: frontend/database/tipo_pagamento_schema.sql
-- =============================================================================
-- ============================================================
-- Tipo de Pagamento (PIX, CartÃ£o, Cheque, etc.)
-- Rodar apÃ³s condicao_pagamento_formas_parcelas_schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS tipo_pagamento (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    descricao VARCHAR(100) NOT NULL,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tipo_pagamento_cliente_id ON tipo_pagamento(cliente_id);
CREATE INDEX IF NOT EXISTS idx_tipo_pagamento_ativo ON tipo_pagamento(ativo);

ALTER TABLE tipo_pagamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total tipo_pagamento" ON tipo_pagamento FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Adiciona coluna tipo_pagamento_id em venda_forma_pagamento
ALTER TABLE venda_forma_pagamento ADD COLUMN IF NOT EXISTS tipo_pagamento_id UUID REFERENCES tipo_pagamento(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_venda_forma_pagamento_tipo_id ON venda_forma_pagamento(tipo_pagamento_id);

-- Inserir tipos padrÃ£o por cliente (opcional: rodar apÃ³s ter clientes)
-- INSERT INTO tipo_pagamento (cliente_id, descricao) SELECT id, 'PIX' FROM clientes_azoup ON CONFLICT DO NOTHING;
-- INSERT INTO tipo_pagamento (cliente_id, descricao) SELECT id, 'CartÃ£o' FROM clientes_azoup ON CONFLICT DO NOTHING;
-- INSERT INTO tipo_pagamento (cliente_id, descricao) SELECT id, 'Cheque' FROM clientes_azoup ON CONFLICT DO NOTHING;
-- INSERT INTO tipo_pagamento (cliente_id, descricao) SELECT id, 'Dinheiro' FROM clientes_azoup ON CONFLICT DO NOTHING;
-- INSERT INTO tipo_pagamento (cliente_id, descricao) SELECT id, 'Boleto' FROM clientes_azoup ON CONFLICT DO NOTHING;


-- =============================================================================
-- SOURCE: frontend/database/condicao_pagamento_formas_parcelas_schema.sql
-- =============================================================================
-- ============================================================
-- MÃ³dulo Formas de Pagamento e Parcelas
-- Tabelas: condicao_pagamento, venda_forma_pagamento, venda_parcela
-- Rodar apÃ³s origem_pedido_venda_schema.sql e venda_codigo_etapa_valor_migration.sql
-- ============================================================

-- -------------------------------
-- 1. CondiÃ§Ã£o de Pagamento (configuraÃ§Ã£o por cliente/tenant)
-- -------------------------------
CREATE TABLE IF NOT EXISTS condicao_pagamento (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    descricao VARCHAR(255) NOT NULL,
    tipo_calculo VARCHAR(50) DEFAULT 'fixo',
    intervalo_dias INTEGER DEFAULT 0,
    parcelas_padrao INTEGER DEFAULT 1,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_condicao_pagamento_cliente_id ON condicao_pagamento(cliente_id);
CREATE INDEX IF NOT EXISTS idx_condicao_pagamento_ativo ON condicao_pagamento(ativo);

ALTER TABLE condicao_pagamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total condicao_pagamento" ON condicao_pagamento FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON COLUMN condicao_pagamento.intervalo_dias IS 'Dias entre cada parcela; 0 = Ã  vista na data do pedido';
COMMENT ON COLUMN condicao_pagamento.parcelas_padrao IS 'Quantidade padrÃ£o de parcelas (ex: 1 para Ã  vista)';

-- -------------------------------
-- 2. Venda Forma de Pagamento (uma venda pode ter vÃ¡rias formas)
-- -------------------------------
CREATE TABLE IF NOT EXISTS venda_forma_pagamento (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    venda_id BIGINT NOT NULL REFERENCES venda(id) ON DELETE CASCADE,
    condicao_pagamento_id UUID NOT NULL REFERENCES condicao_pagamento(id) ON DELETE RESTRICT,
    valor NUMERIC(12, 2) NOT NULL CHECK (valor >= 0),
    quantidade_parcelas INTEGER NOT NULL CHECK (quantidade_parcelas >= 1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_venda_forma_pagamento_venda_id ON venda_forma_pagamento(venda_id);
CREATE INDEX IF NOT EXISTS idx_venda_forma_pagamento_condicao_id ON venda_forma_pagamento(condicao_pagamento_id);

ALTER TABLE venda_forma_pagamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total venda_forma_pagamento" ON venda_forma_pagamento FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- -------------------------------
-- 3. Venda Parcela (parcelas de cada forma de pagamento)
-- -------------------------------
CREATE TABLE IF NOT EXISTS venda_parcela (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    venda_forma_pagamento_id UUID NOT NULL REFERENCES venda_forma_pagamento(id) ON DELETE CASCADE,
    numero_parcela INTEGER NOT NULL CHECK (numero_parcela >= 1),
    valor_parcela NUMERIC(12, 2) NOT NULL CHECK (valor_parcela >= 0),
    data_vencimento DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(venda_forma_pagamento_id, numero_parcela)
);

CREATE INDEX IF NOT EXISTS idx_venda_parcela_forma_id ON venda_parcela(venda_forma_pagamento_id);
CREATE INDEX IF NOT EXISTS idx_venda_parcela_vencimento ON venda_parcela(data_vencimento);

ALTER TABLE venda_parcela ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total venda_parcela" ON venda_parcela FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE venda_parcela IS 'Parcelas geradas a partir de venda_forma_pagamento; soma valor_parcela = valor da forma';


-- =============================================================================
-- SOURCE: frontend/database/products_schema.sql
-- =============================================================================
-- Tabela de Categorias
CREATE TABLE IF NOT EXISTS categorias (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    cliente_id UUID REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Subcategorias
CREATE TABLE IF NOT EXISTS subcategorias (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    categoria_id UUID REFERENCES categorias(id) ON DELETE CASCADE,
    cliente_id UUID REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Origens de Produtos
CREATE TABLE IF NOT EXISTS origens_produtos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    codigo VARCHAR(10) NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Grupos Fiscais
CREATE TABLE IF NOT EXISTS grupos_fiscais (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    cliente_id UUID REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela Principal de Produtos
CREATE TABLE IF NOT EXISTS produtos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id UUID REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
    subcategoria_id UUID REFERENCES subcategorias(id) ON DELETE SET NULL,
    inativo BOOLEAN DEFAULT FALSE,
    unidade VARCHAR(20),
    ncm VARCHAR(20),
    origem_id UUID REFERENCES origens_produtos(id) ON DELETE SET NULL,
    grupo_fiscal_id UUID REFERENCES grupos_fiscais(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraint: SKU Ãºnico por cliente (apenas se informado)
    CONSTRAINT unique_sku_per_client UNIQUE (cliente_id, sku)
);

-- Tabela de VariaÃ§Ãµes (Cor e Tamanho)
CREATE TABLE IF NOT EXISTS produto_cor_tamanho (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    produto_id UUID REFERENCES produtos(id) ON DELETE CASCADE,
    cor VARCHAR(100) NOT NULL,
    tamanho VARCHAR(50) NOT NULL,
    preco_venda DECIMAL(10, 2) DEFAULT 0.00,
    estoque INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraint: CombinaÃ§Ã£o Ãºnica de Produto + Cor + Tamanho
    CONSTRAINT unique_variation_per_product UNIQUE (produto_id, cor, tamanho)
);

-- Ãndices para melhor performance
CREATE INDEX IF NOT EXISTS idx_produtos_cliente_id ON produtos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_produtos_sku ON produtos(sku);
CREATE INDEX IF NOT EXISTS idx_produto_cor_tamanho_produto_id ON produto_cor_tamanho(produto_id);

-- --- POLÃTICAS DE SEGURANÃ‡A (RLS) ---

-- Habilitar RLS em todas as tabelas
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcategorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE origens_produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE grupos_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE produto_cor_tamanho ENABLE ROW LEVEL SECURITY;

-- Criar Policies (Permitir tudo para usuÃ¡rios autenticados)
-- Nota: Ajuste conforme sua regra de negÃ³cio especÃ­fica se precisar de isolamento por tenant no nÃ­vel do banco.

CREATE POLICY "Acesso total categorias" ON categorias FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total subcategorias" ON subcategorias FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total origens_produtos" ON origens_produtos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total grupos_fiscais" ON grupos_fiscais FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total produtos" ON produtos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total produto_cor_tamanho" ON produto_cor_tamanho FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- =============================================================================
-- SOURCE: frontend/database/add_roteiro_to_products.sql
-- =============================================================================
-- Adicionar coluna de roteiro_id na tabela de produtos
ALTER TABLE produtos 
ADD COLUMN IF NOT EXISTS roteiro_id UUID REFERENCES roteiros_producao(id) ON DELETE SET NULL;

-- Ãndice para a nova coluna
CREATE INDEX IF NOT EXISTS idx_produtos_roteiro_id ON produtos(roteiro_id);


-- =============================================================================
-- SOURCE: frontend/database/tecidos_schema.sql
-- =============================================================================
-- ===============================
--  Esquema de Tecidos e Cores
-- ===============================

-- Tabela de Tipos de Tecido
CREATE TABLE IF NOT EXISTS tipo_tecido (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    descricao VARCHAR(255) NOT NULL,
    cliente_id UUID REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela Principal de Tecidos
CREATE TABLE IF NOT EXISTS tecidos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id UUID REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    unidade VARCHAR(20),
    composicao VARCHAR(255),
    largura NUMERIC(10, 2),
    rendimento NUMERIC(10, 4),
    custo NUMERIC(10, 2) DEFAULT 0.00,
    tipo_tecido_id UUID REFERENCES tipo_tecido(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraint: SKU de tecido Ãºnico por cliente (apenas se informado)
    CONSTRAINT unique_tecido_sku_per_client UNIQUE (cliente_id, sku)
);

-- Tabela de Cores de Tecidos
CREATE TABLE IF NOT EXISTS tecido_cor (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    tecido_id UUID REFERENCES tecidos(id) ON DELETE CASCADE,
    cor VARCHAR(100) NOT NULL,
    sku_cor VARCHAR(100),
    estoque INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraint: cada cor Ãºnica por tecido
    CONSTRAINT unique_cor_per_tecido UNIQUE (tecido_id, cor)
);

-- Ãndices para performance
CREATE INDEX IF NOT EXISTS idx_tipo_tecido_cliente_id ON tipo_tecido(cliente_id);
CREATE INDEX IF NOT EXISTS idx_tecidos_cliente_id ON tecidos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_tecidos_sku ON tecidos(sku);
CREATE INDEX IF NOT EXISTS idx_tecidos_tipo_tecido_id ON tecidos(tipo_tecido_id);
CREATE INDEX IF NOT EXISTS idx_tecido_cor_tecido_id ON tecido_cor(tecido_id);
CREATE INDEX IF NOT EXISTS idx_tecido_cor_sku_cor ON tecido_cor(sku_cor);

-- --- POLÃTICAS DE SEGURANÃ‡A (RLS) ---

-- Habilitar RLS
ALTER TABLE tipo_tecido ENABLE ROW LEVEL SECURITY;
ALTER TABLE tecidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tecido_cor ENABLE ROW LEVEL SECURITY;

-- Policies genÃ©ricas: acesso total para usuÃ¡rios autenticados
-- (ajuste conforme sua regra de negÃ³cio se precisar de isolamento mais rÃ­gido)
CREATE POLICY "Acesso total tipo_tecido" ON tipo_tecido
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Acesso total tecidos" ON tecidos
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Acesso total tecido_cor" ON tecido_cor
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);



-- =============================================================================
-- SOURCE: frontend/database/aviamentos_schema.sql
-- =============================================================================
-- ===============================
--  Esquema de Aviamentos e Cores/Tamanhos
-- ===============================

-- Tabela Principal de Aviamentos
CREATE TABLE IF NOT EXISTS aviamentos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id UUID REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    unidade VARCHAR(20),
    custo NUMERIC(10, 2) DEFAULT 0.00,
    estoque INTEGER DEFAULT 0, -- usado apenas quando nÃ£o hÃ¡ cores cadastradas
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraint: SKU de aviamento Ãºnico por cliente (apenas se informado)
    CONSTRAINT unique_aviamento_sku_per_client UNIQUE (cliente_id, sku)
);

-- Tabela de Cores/Tamanhos de Aviamentos
CREATE TABLE IF NOT EXISTS aviamento_cor_tamanho (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    aviamento_id UUID REFERENCES aviamentos(id) ON DELETE CASCADE,
    cor VARCHAR(100) NOT NULL,
    tamanho VARCHAR(50), -- opcional
    estoque INTEGER DEFAULT 0,
    sku_variacao VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraint: CombinaÃ§Ã£o Ãºnica de Aviamento + Cor + Tamanho
    CONSTRAINT unique_aviamento_variation_per_item UNIQUE (aviamento_id, cor, tamanho)
);

-- Ãndices para performance
CREATE INDEX IF NOT EXISTS idx_aviamentos_cliente_id ON aviamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_aviamentos_sku ON aviamentos(sku);
CREATE INDEX IF NOT EXISTS idx_aviamento_cor_tamanho_aviamento_id ON aviamento_cor_tamanho(aviamento_id);
CREATE INDEX IF NOT EXISTS idx_aviamento_cor_tamanho_sku_variacao ON aviamento_cor_tamanho(sku_variacao);

-- --- POLÃTICAS DE SEGURANÃ‡A (RLS) ---

ALTER TABLE aviamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE aviamento_cor_tamanho ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso total aviamentos" ON aviamentos
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Acesso total aviamento_cor_tamanho" ON aviamento_cor_tamanho
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);



-- =============================================================================
-- SOURCE: frontend/database/roteiros_producao_schema.sql
-- =============================================================================
-- Roteiro de ProduÃ§Ã£o
CREATE TABLE IF NOT EXISTS roteiros_producao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fases do Roteiro de ProduÃ§Ã£o
CREATE TABLE IF NOT EXISTS roteiro_producao_fases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    roteiro_id UUID REFERENCES roteiros_producao(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    is_corte BOOLEAN DEFAULT FALSE,
    tempo_medio DECIMAL(10,2),
    unidade_tempo TEXT, -- 'hora' ou 'dia'
    ordem INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE roteiros_producao ENABLE ROW LEVEL SECURITY;
ALTER TABLE roteiro_producao_fases ENABLE ROW LEVEL SECURITY;

-- PolÃ­ticas de RLS
CREATE POLICY "Acesso total roteiros_producao" ON roteiros_producao 
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Acesso total roteiro_producao_fases" ON roteiro_producao_fases 
    FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- =============================================================================
-- SOURCE: frontend/database/produto_imagens_ficha_schema.sql
-- =============================================================================
-- ===============================
--  Esquema de Imagens e Ficha TÃ©cnica de Produtos
-- ===============================

-- Tabela de Imagens de Produtos
CREATE TABLE IF NOT EXISTS produto_imagem (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    produto_id UUID REFERENCES produtos(id) ON DELETE CASCADE,
    url_imagem VARCHAR(500) NOT NULL,
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Ficha TÃ©cnica de Produtos
CREATE TABLE IF NOT EXISTS produto_ficha_tecnica (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    produto_id UUID REFERENCES produtos(id) ON DELETE CASCADE,
    observacao_ficha_tecnica TEXT,
    dificuldade INTEGER CHECK (dificuldade >= 1 AND dificuldade <= 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraint: Um produto pode ter apenas uma ficha tÃ©cnica
    CONSTRAINT unique_ficha_tecnica_per_produto UNIQUE (produto_id)
);

-- Ãndices para performance
CREATE INDEX IF NOT EXISTS idx_produto_imagem_produto_id ON produto_imagem(produto_id);
CREATE INDEX IF NOT EXISTS idx_produto_ficha_tecnica_produto_id ON produto_ficha_tecnica(produto_id);

-- --- POLÃTICAS DE SEGURANÃ‡A (RLS) ---

ALTER TABLE produto_imagem ENABLE ROW LEVEL SECURITY;
ALTER TABLE produto_ficha_tecnica ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso total produto_imagem" ON produto_imagem
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Acesso total produto_ficha_tecnica" ON produto_ficha_tecnica
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);


-- =============================================================================
-- SOURCE: frontend/database/produto_tecidos_schema.sql
-- =============================================================================
-- =======================================================
--  Esquema de Consumo de Tecidos na Ficha TÃ©cnica
-- =======================================================

-- Tabela de VinculaÃ§Ã£o Ficha TÃ©cnica <-> Tecido (Consumo)
CREATE TABLE IF NOT EXISTS ficha_tecnica_consumo_tecido (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    ficha_tecnica_id UUID REFERENCES produto_ficha_tecnica(id) ON DELETE CASCADE,
    tecido_id UUID REFERENCES tecidos(id) ON DELETE RESTRICT, -- NÃ£o apagar tecido se usado em ficha
    tipo_consumo VARCHAR(20) CHECK (tipo_consumo IN ('geral', 'tamanho')) NOT NULL,
    unidade VARCHAR(20) NOT NULL, -- Ex: 'kg', 'm'
    consumo_geral NUMERIC(10, 4), -- Preenchido se tipo_consumo = 'geral'
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Consumo por Tamanho (Filha de ficha_tecnica_consumo_tecido)
CREATE TABLE IF NOT EXISTS ficha_tecnica_consumo_tecido_tamanho (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    consumo_tecido_id UUID REFERENCES ficha_tecnica_consumo_tecido(id) ON DELETE CASCADE,
    tamanho VARCHAR(20) NOT NULL, -- Ex: 'P', 'M', 'G', '38', '40'
    consumo NUMERIC(10, 4) NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraint: Um tamanho por item de consumo
    CONSTRAINT unique_tamanho_per_consumo_ft UNIQUE (consumo_tecido_id, tamanho)
);

-- Ãndices
CREATE INDEX IF NOT EXISTS idx_ft_consumo_tecido_ficha_id ON ficha_tecnica_consumo_tecido(ficha_tecnica_id);
CREATE INDEX IF NOT EXISTS idx_ft_consumo_tecido_tecido_id ON ficha_tecnica_consumo_tecido(tecido_id);
CREATE INDEX IF NOT EXISTS idx_ft_consumo_tecido_tamanho_pai_id ON ficha_tecnica_consumo_tecido_tamanho(consumo_tecido_id);


-- --- POLÃTICAS DE SEGURANÃ‡A (RLS) ---

ALTER TABLE ficha_tecnica_consumo_tecido ENABLE ROW LEVEL SECURITY;
ALTER TABLE ficha_tecnica_consumo_tecido_tamanho ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso total ficha_tecnica_consumo_tecido" ON ficha_tecnica_consumo_tecido
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Acesso total ficha_tecnica_consumo_tecido_tamanho" ON ficha_tecnica_consumo_tecido_tamanho
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);


-- =============================================================================
-- SOURCE: frontend/database/produto_aviamentos_schema.sql
-- =============================================================================
-- =======================================================
--  Esquema de Consumo de Aviamentos na Ficha TÃ©cnica
-- =======================================================

-- Tabela de VinculaÃ§Ã£o Ficha TÃ©cnica <-> Aviamento (Consumo)
CREATE TABLE IF NOT EXISTS ficha_tecnica_consumo_aviamento (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    ficha_tecnica_id UUID REFERENCES produto_ficha_tecnica(id) ON DELETE CASCADE,
    aviamento_id UUID REFERENCES aviamentos(id) ON DELETE RESTRICT,
    tipo_consumo VARCHAR(20) CHECK (tipo_consumo IN ('geral', 'tamanho', 'tamanho_cor')) NOT NULL,
    unidade VARCHAR(20) NOT NULL,
    consumo_geral NUMERIC(10, 4),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Consumo por Tamanho/Cor (Filha de ficha_tecnica_consumo_aviamento)
CREATE TABLE IF NOT EXISTS ficha_tecnica_consumo_aviamento_tamanho (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    consumo_aviamento_id UUID REFERENCES ficha_tecnica_consumo_aviamento(id) ON DELETE CASCADE,
    
    -- VariaÃ§Ã£o do Produto Acadado
    produto_cor VARCHAR(50), -- Cor do Produto Acabado
    tamanho VARCHAR(20) NOT NULL, -- Tamanho do Produto Acabado (P, M, G...)
    
    -- EspecificaÃ§Ã£o do Aviamento para esta variaÃ§Ã£o
    cor VARCHAR(50), -- Cor do aviamento
    tamanho_aviamento VARCHAR(50), -- Tamanho do aviamento (ex: 2cm, 15mm...)
    
    consumo NUMERIC(10, 4) NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chave Ãšnica para a Matriz de Aviamento
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_consumo_aviamento_ft_variacao_completa
ON ficha_tecnica_consumo_aviamento_tamanho (consumo_aviamento_id, COALESCE(produto_cor, ''), tamanho);

-- Ãndices
CREATE INDEX IF NOT EXISTS idx_ft_consumo_aviamento_ficha_id ON ficha_tecnica_consumo_aviamento(ficha_tecnica_id);
CREATE INDEX IF NOT EXISTS idx_ft_consumo_aviamento_item_id ON ficha_tecnica_consumo_aviamento(aviamento_id);
CREATE INDEX IF NOT EXISTS idx_ft_consumo_aviamento_tamanho_pai_id ON ficha_tecnica_consumo_aviamento_tamanho(consumo_aviamento_id);

-- --- POLÃTICAS DE SEGURANÃ‡A (RLS) ---
ALTER TABLE ficha_tecnica_consumo_aviamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE ficha_tecnica_consumo_aviamento_tamanho ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso total ficha_tecnica_consumo_aviamento" ON ficha_tecnica_consumo_aviamento
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Acesso total ficha_tecnica_consumo_aviamento_tamanho" ON ficha_tecnica_consumo_aviamento_tamanho
    FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- =============================================================================
-- SOURCE: frontend/database/update_ficha_tecnica_consumo_v2.sql
-- =============================================================================
-- =======================================================
--  Ajuste Ficha TÃ©cnica: Consumo por Tamanho e Cor
-- =======================================================

-- 1. Adicionar coluna 'cor' na tabela de consumo por tamanho
ALTER TABLE ficha_tecnica_consumo_tecido_tamanho ADD COLUMN IF NOT EXISTS cor VARCHAR(50);

-- 2. Remover a constraint de unicidade antiga (que sÃ³ considerava tamanho)
ALTER TABLE ficha_tecnica_consumo_tecido_tamanho DROP CONSTRAINT IF EXISTS unique_tamanho_per_consumo_ft;

-- 3. Adicionar novas restriÃ§Ãµes de unicidade para garantir integridade dependendo do tipo de preenchimento
-- Caso 1: Consumo por tamanho simples (cor Ã© NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_consumo_tamanho_sem_cor 
ON ficha_tecnica_consumo_tecido_tamanho (consumo_tecido_id, tamanho) 
WHERE (cor IS NULL);

-- Caso 2: Consumo por tamanho e cor (cor Ã© NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_consumo_tamanho_com_cor 
ON ficha_tecnica_consumo_tecido_tamanho (consumo_tecido_id, tamanho, cor) 
WHERE (cor IS NOT NULL);

-- 4. Atualizar a constraint de check na tabela pai para permitir o novo tipo 'tamanho_cor'
ALTER TABLE ficha_tecnica_consumo_tecido DROP CONSTRAINT IF EXISTS ficha_tecnica_consumo_tecido_tipo_consumo_check;

ALTER TABLE ficha_tecnica_consumo_tecido ADD CONSTRAINT ficha_tecnica_consumo_tecido_tipo_consumo_check 
CHECK (tipo_consumo IN ('geral', 'tamanho', 'tamanho_cor'));


-- =============================================================================
-- SOURCE: frontend/database/update_ficha_tecnica_consumo_v3.sql
-- =============================================================================
-- =======================================================
--  Ajuste Ficha TÃ©cnica: Consumo por VariaÃ§Ã£o (Cor Produto + Tamanho)
-- =======================================================

-- 1. Adicionar colunas se nÃ£o existirem
ALTER TABLE ficha_tecnica_consumo_tecido_tamanho ADD COLUMN IF NOT EXISTS cor VARCHAR(50); -- Cor do Tecido
ALTER TABLE ficha_tecnica_consumo_tecido_tamanho ADD COLUMN IF NOT EXISTS produto_cor VARCHAR(50); -- Cor do Produto (VariaÃ§Ã£o)

-- 2. Remover constraints antigas de unicidade
ALTER TABLE ficha_tecnica_consumo_tecido_tamanho DROP CONSTRAINT IF EXISTS unique_tamanho_per_consumo_ft;
DROP INDEX IF EXISTS idx_unique_consumo_tamanho_sem_cor;
DROP INDEX IF EXISTS idx_unique_consumo_tamanho_com_cor;

-- 3. Adicionar novas restriÃ§Ãµes de unicidade para a matriz completa
-- Agora a chave Ãºnica Ã© (Consumo Pai, Cor do Produto, Tamanho)
-- produto_cor pode ser NULL para produtos que nÃ£o tÃªm variaÃ§Ãµes de cor (apenas tamanho)

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_consumo_ft_variacao_completa
ON ficha_tecnica_consumo_tecido_tamanho (consumo_tecido_id, COALESCE(produto_cor, ''), tamanho);

-- 4. Garantir que o check de tipo de consumo na tabela pai suporte 'tamanho_cor'
ALTER TABLE ficha_tecnica_consumo_tecido DROP CONSTRAINT IF EXISTS ficha_tecnica_consumo_tecido_tipo_consumo_check;

ALTER TABLE ficha_tecnica_consumo_tecido ADD CONSTRAINT ficha_tecnica_consumo_tecido_tipo_consumo_check 
CHECK (tipo_consumo IN ('geral', 'tamanho', 'tamanho_cor'));


-- =============================================================================
-- SOURCE: frontend/database/migration_produto_ficha_tecnica_partes.sql
-- =============================================================================
-- Ficha tÃ©cnica: suporte a produto dividido em partes

alter table public.produto_ficha_tecnica
    add column if not exists dividido_em_partes boolean not null default false;

comment on column public.produto_ficha_tecnica.dividido_em_partes is
'Indica se o produto Ã© dividido em partes na ficha tÃ©cnica.';

create table if not exists public.produto_ficha_tecnica_partes (
    id uuid primary key default gen_random_uuid(),
    ficha_tecnica_id uuid not null references public.produto_ficha_tecnica(id) on delete cascade,
    descricao text not null,
    ordem integer not null default 1,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint produto_ficha_tecnica_partes_descricao_not_blank check (length(trim(descricao)) > 0)
);

create index if not exists idx_produto_ficha_tecnica_partes_ficha
    on public.produto_ficha_tecnica_partes (ficha_tecnica_id, ordem);

create or replace function public.touch_updated_at_produto_ficha_tecnica_partes()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_touch_updated_at_produto_ficha_tecnica_partes on public.produto_ficha_tecnica_partes;
create trigger trg_touch_updated_at_produto_ficha_tecnica_partes
before update on public.produto_ficha_tecnica_partes
for each row execute function public.touch_updated_at_produto_ficha_tecnica_partes();

alter table public.produto_ficha_tecnica_partes enable row level security;

drop policy if exists "Acesso total produto_ficha_tecnica_partes" on public.produto_ficha_tecnica_partes;
create policy "Acesso total produto_ficha_tecnica_partes"
on public.produto_ficha_tecnica_partes
for all
to authenticated
using (true)
with check (true);



-- =============================================================================
-- SOURCE: frontend/database/produto_fase_custo_schema.sql
-- =============================================================================
-- Tabela de custo de mÃ£o de obra por fase do produto
CREATE TABLE IF NOT EXISTS produto_fase_custo (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    produto_id UUID REFERENCES produtos(id) ON DELETE CASCADE,
    fase_id UUID REFERENCES roteiro_producao_fases(id) ON DELETE CASCADE,
    custo_mao_obra DECIMAL(10, 2) DEFAULT 0.00,
    cliente_id UUID REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraint: Um custo Ãºnico por produto e fase
    CONSTRAINT unique_product_phase_cost UNIQUE (produto_id, fase_id)
);

-- Ãndice para performance
CREATE INDEX IF NOT EXISTS idx_produto_fase_custo_produto_id ON produto_fase_custo(produto_id);
CREATE INDEX IF NOT EXISTS idx_produto_fase_custo_fase_id ON produto_fase_custo(fase_id);

-- Habilitar RLS
ALTER TABLE produto_fase_custo ENABLE ROW LEVEL SECURITY;

-- PolÃ­ticas de RLS
CREATE POLICY "Acesso total produto_fase_custo" ON produto_fase_custo
    FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- =============================================================================
-- SOURCE: frontend/database/tabelas_precos_schema.sql
-- =============================================================================
-- Habilitar extensÃ£o para UUID se nÃ£o existir
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabela para armazenar as tabelas de preÃ§os
CREATE TABLE IF NOT EXISTS tabela_precos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    descricao TEXT NOT NULL,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT descricao_not_empty CHECK (descricao <> '')
);

-- Ativar RLS
ALTER TABLE tabela_precos ENABLE ROW LEVEL SECURITY;

-- PolÃ­ticas de SeguranÃ§a (Simplificadas para seguir o padrÃ£o do projeto)
CREATE POLICY "Acesso total tabela_precos" ON tabela_precos
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_tabela_precos_updated_at ON tabela_precos;
CREATE TRIGGER update_tabela_precos_updated_at
    BEFORE UPDATE ON tabela_precos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- =============================================================================
-- SOURCE: frontend/database/update_multi_price_tables.sql
-- =============================================================================
-- ==========================================
-- MIGRATION: Multi-Price Table System
-- ==========================================

-- 1. Garante a extensÃ£o de UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. CriaÃ§Ã£o da nova tabela de vinculaÃ§Ã£o PreÃ§o x VariaÃ§Ã£o x Tabela
CREATE TABLE IF NOT EXISTS produto_cor_tamanho_tabela_preco (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    produto_id UUID REFERENCES produtos(id) ON DELETE CASCADE,
    cor VARCHAR(100) NOT NULL,
    tamanho VARCHAR(50) NOT NULL,
    tabela_preco_id UUID REFERENCES tabela_precos(id) ON DELETE CASCADE,
    preco DECIMAL(10, 2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Garante que para uma variaÃ§Ã£o de um produto, sÃ³ exista um preÃ§o por tabela
    CONSTRAINT unique_price_per_variation_table UNIQUE (produto_id, cor, tamanho, tabela_preco_id)
);

-- Ativar RLS na nova tabela
ALTER TABLE produto_cor_tamanho_tabela_preco ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total produto_cor_tamanho_tabela_preco" 
ON produto_cor_tamanho_tabela_preco FOR ALL TO authenticated 
USING (true) WITH CHECK (true);

-- 3. Inserir tabela "PadrÃ£o" para clientes que ainda nÃ£o possuem
INSERT INTO tabela_precos (cliente_id, descricao, ativo)
SELECT DISTINCT cliente_id, 'PadrÃ£o', true
FROM produtos p
WHERE NOT EXISTS (
    SELECT 1 FROM tabela_precos tp 
    WHERE tp.cliente_id = p.cliente_id 
    AND (LOWER(tp.descricao) = 'padrÃ£o' OR LOWER(tp.descricao) = 'padrao')
);

-- 4. Migrar os preÃ§os existentes da tabela produto_cor_tamanho para a nova tabela
-- VÃ­ncula ao preÃ§o "PadrÃ£o" de cada cliente
INSERT INTO produto_cor_tamanho_tabela_preco (produto_id, cor, tamanho, tabela_preco_id, preco)
SELECT 
    pct.produto_id, 
    pct.cor, 
    pct.tamanho, 
    tp.id as tabela_preco_id, 
    pct.preco_venda
FROM produto_cor_tamanho pct
JOIN produtos p ON p.id = pct.produto_id
JOIN tabela_precos tp ON tp.cliente_id = p.cliente_id
WHERE (LOWER(tp.descricao) = 'padrÃ£o' OR LOWER(tp.descricao) = 'padrao')
ON CONFLICT ON CONSTRAINT unique_price_per_variation_table DO NOTHING;

-- 5. Remover a coluna preco_venda da tabela original produto_cor_tamanho
-- Nota: Ã‰ recomendÃ¡vel verificar os dados antes de rodar este drop em produÃ§Ã£o.
-- ALTER TABLE produto_cor_tamanho DROP COLUMN IF EXISTS preco_venda;

-- Ãndices para performance
CREATE INDEX IF NOT EXISTS idx_pcttp_produto_id ON produto_cor_tamanho_tabela_preco(produto_id);
CREATE INDEX IF NOT EXISTS idx_pcttp_tabela_preco_id ON produto_cor_tamanho_tabela_preco(tabela_preco_id);


-- =============================================================================
-- SOURCE: frontend/database/create_client_default_price_table_trigger.sql
-- =============================================================================
-- FunÃ§Ã£o que serÃ¡ executada pelo trigger
CREATE OR REPLACE FUNCTION public.handle_new_client_default_price_table()
RETURNS TRIGGER AS $$
BEGIN
    -- Insere a tabela de preÃ§os 'PadrÃ£o' para o novo cliente
    -- Verificando antes se jÃ¡ nÃ£o existe (para evitar erros em caso de re-execuÃ§Ã£o ou seeds)
    IF NOT EXISTS (
        SELECT 1 FROM public.tabela_precos 
        WHERE cliente_id = NEW.id 
        AND (LOWER(descricao) = 'padrÃ£o' OR LOWER(descricao) = 'padrao')
    ) THEN
        INSERT INTO public.tabela_precos (cliente_id, descricao, ativo)
        VALUES (NEW.id, 'PadrÃ£o', true);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger que dispara apÃ³s a inserÃ§Ã£o de um novo cliente
DROP TRIGGER IF EXISTS on_client_created_setup_price_table ON public.clientes_azoup;
CREATE TRIGGER on_client_created_setup_price_table
    AFTER INSERT ON public.clientes_azoup
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_client_default_price_table();

-- ComentÃ¡rio informativo
COMMENT ON FUNCTION public.handle_new_client_default_price_table() IS 'Cria automaticamente uma tabela de preÃ§os PadrÃ£o ao cadastrar um novo cliente.';


-- =============================================================================
-- SOURCE: frontend/database/update_sku_schema.sql
-- =============================================================================
-- 1. Criar SequÃªncia para SKU de Produtos (se nÃ£o existir)
CREATE SEQUENCE IF NOT EXISTS produtos_sku_seq START 1;

-- 1b. Criar SequÃªncia para SKU de Tecidos (se nÃ£o existir)
CREATE SEQUENCE IF NOT EXISTS tecidos_sku_seq START 1;

-- 1c. Criar SequÃªncia para SKU de Aviamentos (se nÃ£o existir)
CREATE SEQUENCE IF NOT EXISTS aviamentos_sku_seq START 1;

-- 2. Adicionar Colunas na Tabela de VariaÃ§Ãµes
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'produto_cor_tamanho' AND column_name = 'sku_variacao') THEN
        ALTER TABLE produto_cor_tamanho ADD COLUMN sku_variacao VARCHAR(20);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'produto_cor_tamanho' AND column_name = 'ean13') THEN
        ALTER TABLE produto_cor_tamanho ADD COLUMN ean13 VARCHAR(13);
    END IF;
END $$;

-- 3. FunÃ§Ã£o RPC para obter o prÃ³ximo SKU de Produto formatado
CREATE OR REPLACE FUNCTION get_next_produto_sku()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER -- Roda com permissÃµes do criador (admin) para acessar sequence sem grant explÃ­cito
AS $$
DECLARE
    next_val BIGINT;
BEGIN
    next_val := nextval('produtos_sku_seq');
    -- Retorna formatado com 6 dÃ­gitos (ex: 000123)
    RETURN LPAD(next_val::TEXT, 6, '0');
END;
$$;

-- 4. FunÃ§Ã£o RPC para obter o prÃ³ximo SKU de Tecido formatado
CREATE OR REPLACE FUNCTION get_next_tecido_sku()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    next_val BIGINT;
BEGIN
    next_val := nextval('tecidos_sku_seq');
    -- Retorna formatado com 6 dÃ­gitos (ex: 000123)
    RETURN LPAD(next_val::TEXT, 6, '0');
END;
$$;

-- 5. FunÃ§Ã£o RPC para obter o prÃ³ximo SKU de Aviamento formatado
CREATE OR REPLACE FUNCTION get_next_aviamento_sku()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    next_val BIGINT;
BEGIN
    next_val := nextval('aviamentos_sku_seq');
    -- Retorna formatado com 6 dÃ­gitos (ex: 000123)
    RETURN LPAD(next_val::TEXT, 6, '0');
END;
$$;

-- Grant execute para autenticados (se necessÃ¡rio, mas SECURITY DEFINER ajuda)
GRANT EXECUTE ON FUNCTION get_next_produto_sku() TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_produto_sku() TO anon; -- Se permitir acesso pÃºblico, cuidado. Melhor apenas authenticated.

GRANT EXECUTE ON FUNCTION get_next_tecido_sku() TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_tecido_sku() TO anon; -- Idem observaÃ§Ã£o acima

GRANT EXECUTE ON FUNCTION get_next_aviamento_sku() TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_aviamento_sku() TO anon; -- Idem observaÃ§Ã£o acima


-- =============================================================================
-- SOURCE: frontend/database/migration_produto_sku_somente_numeros.sql
-- =============================================================================
update produtos
set sku = nullif(regexp_replace(coalesce(sku, ''), '\D', '', 'g'), '')
where sku is not null
  and sku ~ '\D';

update produto_cor_tamanho
set sku_variacao = nullif(regexp_replace(coalesce(sku_variacao, ''), '\D', '', 'g'), '')
where sku_variacao is not null
  and sku_variacao ~ '\D';


-- =============================================================================
-- SOURCE: frontend/database/migration_aviamentos_tecidos_sku_por_cliente.sql
-- =============================================================================
-- =============================================================================
-- Permite SKU repetido entre clientes diferentes (multi-tenant).
-- MantÃ©m SKU Ãºnico apenas dentro do mesmo cliente.
-- Tabelas: public.tecidos e public.aviamentos
-- =============================================================================

-- 1) Remove constraints globais conhecidas (sku Ãºnico sem cliente)
ALTER TABLE public.tecidos
    DROP CONSTRAINT IF EXISTS tecidos_sku_key;
ALTER TABLE public.tecidos
    DROP CONSTRAINT IF EXISTS unique_tecidos_sku;

ALTER TABLE public.aviamentos
    DROP CONSTRAINT IF EXISTS aviamentos_sku_key;
ALTER TABLE public.aviamentos
    DROP CONSTRAINT IF EXISTS unique_aviamentos_sku;

-- Alguns ambientes podem ter Ã­ndice Ãºnico em sku (em vez de constraint)
DROP INDEX IF EXISTS public.idx_tecidos_sku_unique;
DROP INDEX IF EXISTS public.idx_aviamentos_sku_unique;

-- 2) Garante constraints corretas por cliente + sku
ALTER TABLE public.tecidos
    DROP CONSTRAINT IF EXISTS unique_tecido_sku_per_client;

ALTER TABLE public.tecidos
    ADD CONSTRAINT unique_tecido_sku_per_client UNIQUE (cliente_id, sku);

ALTER TABLE public.aviamentos
    DROP CONSTRAINT IF EXISTS unique_aviamento_sku_per_client;

ALTER TABLE public.aviamentos
    ADD CONSTRAINT unique_aviamento_sku_per_client UNIQUE (cliente_id, sku);

-- 3) (Opcional) Recarregar schema do PostgREST/Supabase
-- SELECT pg_notify('pgrst', 'reload schema');



-- =============================================================================
-- SOURCE: frontend/database/modelo_etiqueta_schema.sql
-- =============================================================================
-- ===============================
--  Modelo de Etiqueta (por cliente)
-- ===============================
-- Um modelo por tipo de folha (TÃ©rmica / A4) por cliente.

CREATE TABLE IF NOT EXISTS modelo_etiqueta (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    tipo_folha VARCHAR(20) NOT NULL CHECK (tipo_folha IN ('Termica', 'A4')),
    -- ConfiguraÃ§Ã£o comum
    alinhamento VARCHAR(10) NOT NULL DEFAULT 'left' CHECK (alinhamento IN ('left', 'center', 'right')),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    -- Para tÃ©rmica
    termica_colunas INTEGER,
    termica_largura NUMERIC(10, 2),
    termica_altura NUMERIC(10, 2),
    termica_margem_externa NUMERIC(10, 2),
    -- Para A4
    a4_colunas INTEGER,
    a4_linhas INTEGER,
    a4_largura NUMERIC(10, 2),
    a4_altura NUMERIC(10, 2),
    a4_margem_lateral NUMERIC(10, 2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Permite apenas um modelo ativo por cliente + tipo de folha
CREATE UNIQUE INDEX IF NOT EXISTS uq_modelo_etiqueta_cliente_tipo_ativo
ON modelo_etiqueta(cliente_id, tipo_folha)
WHERE ativo = TRUE;

CREATE INDEX IF NOT EXISTS idx_modelo_etiqueta_cliente_tipo
ON modelo_etiqueta(cliente_id, tipo_folha);

ALTER TABLE modelo_etiqueta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total modelo_etiqueta"
ON modelo_etiqueta FOR ALL TO authenticated
USING (true) WITH CHECK (true);



-- =============================================================================
-- SOURCE: frontend/database/produto_cor_tamanho_ordem_migration.sql
-- =============================================================================
-- ============================================================
-- Ordem dos tamanhos por produto (produto_cor_tamanho)
-- Usado para exibir tamanhos na mesma sequÃªncia do cadastro.
-- Rodar apÃ³s products_schema (ou qualquer schema que crie produto_cor_tamanho).
-- ============================================================

ALTER TABLE produto_cor_tamanho ADD COLUMN IF NOT EXISTS ordem INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_produto_cor_tamanho_ordem ON produto_cor_tamanho(produto_id, ordem);

COMMENT ON COLUMN produto_cor_tamanho.ordem IS 'Ordem de exibiÃ§Ã£o do tamanho no produto; menor = primeiro.';


-- =============================================================================
-- SOURCE: frontend/database/00_bootstrap_nf_entrada.sql
-- =============================================================================
-- NF entrada â€” rodar apÃ³s produtos/tecidos/aviamentos/condicao_pagamento

CREATE TABLE IF NOT EXISTS public.nota_fiscal_entrada (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id_tenant UUID NOT NULL REFERENCES public.clientes_azoup(id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
    fornecedor_id UUID REFERENCES public.fornecedores_cadastros(id) ON DELETE SET NULL,
    id_integracao TEXT, data_emissao DATE, data_entrada DATE,
    serie INTEGER, numero INTEGER, modelo TEXT, observacao TEXT,
    valor_produtos NUMERIC(14,2) DEFAULT 0, valor_frete NUMERIC(14,2) DEFAULT 0,
    valor_seguro NUMERIC(14,2) DEFAULT 0, valor_desconto NUMERIC(14,2) DEFAULT 0,
    valor_ipi NUMERIC(14,2) DEFAULT 0, valor_icms NUMERIC(14,2) DEFAULT 0,
    valor_pis NUMERIC(14,2) DEFAULT 0, valor_cofins NUMERIC(14,2) DEFAULT 0,
    valor_outras_despesas NUMERIC(14,2) DEFAULT 0, valor_total_nota NUMERIC(14,2) DEFAULT 0,
    chave_acesso TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nota_fiscal_entrada_item (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nota_fiscal_entrada_id UUID NOT NULL REFERENCES public.nota_fiscal_entrada(id) ON DELETE CASCADE,
    produto_id UUID REFERENCES public.produtos(id) ON DELETE SET NULL,
    tecido_id UUID REFERENCES public.tecidos(id) ON DELETE SET NULL,
    aviamento_id UUID REFERENCES public.aviamentos(id) ON DELETE SET NULL,
    variacao_id UUID, tipo_item_vinculado TEXT,
    ean TEXT, codigo_produto TEXT, descricao TEXT, ncm TEXT, cest TEXT, unidade TEXT,
    quantidade NUMERIC(14,3) NOT NULL DEFAULT 0,
    valor_unitario NUMERIC(14,4) NOT NULL DEFAULT 0,
    valor_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    cfop TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nota_fiscal_entrada_pagamento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nota_fiscal_entrada_id UUID NOT NULL REFERENCES public.nota_fiscal_entrada(id) ON DELETE CASCADE,
    condicao_pagamento_id UUID REFERENCES public.condicao_pagamento(id) ON DELETE SET NULL,
    tipo_pagamento_id UUID REFERENCES public.tipo_pagamento(id) ON DELETE SET NULL,
    valor NUMERIC(14,2) NOT NULL DEFAULT 0,
    quantidade_parcelas INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nota_fiscal_entrada_parcela (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nota_fiscal_entrada_pagamento_id UUID NOT NULL REFERENCES public.nota_fiscal_entrada_pagamento(id) ON DELETE CASCADE,
    numero_parcela INTEGER NOT NULL,
    valor_parcela NUMERIC(14,2) NOT NULL DEFAULT 0,
    data_vencimento DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nota_fiscal_entrada_xml (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nota_fiscal_entrada_id UUID NOT NULL REFERENCES public.nota_fiscal_entrada(id) ON DELETE CASCADE,
    cliente_id_tenant UUID NOT NULL REFERENCES public.clientes_azoup(id) ON DELETE CASCADE,
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
    usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    nome_arquivo TEXT, storage_bucket TEXT, storage_path TEXT,
    data_importacao TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'nota_fiscal_entrada','nota_fiscal_entrada_item','nota_fiscal_entrada_pagamento',
    'nota_fiscal_entrada_parcela','nota_fiscal_entrada_xml'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Acesso total %I" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Acesso total %I" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;


-- =============================================================================
-- SOURCE: frontend/database/origem_pedido_venda_schema.sql
-- =============================================================================
-- ===============================
--  Origem do Pedido + Venda + Venda Itens
-- ===============================

-- Tabela origem_pedido (configuraÃ§Ã£o por cliente/tenant)
CREATE TABLE IF NOT EXISTS origem_pedido (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id UUID REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    descricao VARCHAR(255) NOT NULL,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_origem_pedido_cliente_id ON origem_pedido(cliente_id);
CREATE INDEX IF NOT EXISTS idx_origem_pedido_ativo ON origem_pedido(ativo);

ALTER TABLE origem_pedido ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total origem_pedido" ON origem_pedido FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabela venda (pedido ou orÃ§amento)
CREATE TABLE IF NOT EXISTS venda (
    id BIGSERIAL PRIMARY KEY,
    cliente_id_tenant UUID REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    empresa_id UUID REFERENCES empresas(id) ON DELETE SET NULL,
    cliente_id UUID REFERENCES clientes_cadastros(id) ON DELETE SET NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('OrÃ§amento', 'Pedido')),
    vendedor_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    origem_pedido_id UUID REFERENCES origem_pedido(id) ON DELETE SET NULL,
    codigo_pedido VARCHAR(50),
    etapa VARCHAR(30) DEFAULT 'Pedido',
    prazo_entrega VARCHAR(100),
    observacao TEXT,
    desconto_tipo VARCHAR(10) CHECK (desconto_tipo IS NULL OR desconto_tipo IN ('percentual', 'valor')),
    desconto_valor NUMERIC(12, 2) DEFAULT 0,
    frete NUMERIC(12, 2) DEFAULT 0,
    valor_total NUMERIC(12, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_venda_cliente_tenant ON venda(cliente_id_tenant);
CREATE INDEX IF NOT EXISTS idx_venda_empresa_id ON venda(empresa_id);
CREATE INDEX IF NOT EXISTS idx_venda_cliente_id ON venda(cliente_id);
CREATE INDEX IF NOT EXISTS idx_venda_vendedor_id ON venda(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_venda_created_at ON venda(created_at);
CREATE INDEX IF NOT EXISTS idx_venda_etapa ON venda(etapa);
CREATE INDEX IF NOT EXISTS idx_venda_codigo_pedido ON venda(codigo_pedido);

ALTER TABLE venda ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total venda" ON venda FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabela venda_itens (itens do pedido/orÃ§amento)
CREATE TABLE IF NOT EXISTS venda_itens (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    venda_id BIGINT NOT NULL REFERENCES venda(id) ON DELETE CASCADE,
    produto_id UUID REFERENCES produtos(id) ON DELETE SET NULL,
    produto_cor_tamanho_id UUID REFERENCES produto_cor_tamanho(id) ON DELETE SET NULL,
    cor VARCHAR(100),
    tamanho VARCHAR(50),
    quantidade NUMERIC(12, 3) NOT NULL DEFAULT 1,
    valor_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0,
    valor_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_venda_itens_venda_id ON venda_itens(venda_id);
CREATE INDEX IF NOT EXISTS idx_venda_itens_produto_id ON venda_itens(produto_id);

ALTER TABLE venda_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total venda_itens" ON venda_itens FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- =============================================================================
-- SOURCE: frontend/database/venda_codigo_etapa_valor_migration.sql
-- =============================================================================
-- ============================================================
-- Migration: tabela venda JÃ EXISTENTE
-- Adiciona: codigo_pedido, etapa, valor_total
-- Pode rodar com seguranÃ§a mesmo que a tabela jÃ¡ tenha sido criada.
-- ============================================================

-- Novas colunas (IF NOT EXISTS = seguro rodar mais de uma vez)
ALTER TABLE venda ADD COLUMN IF NOT EXISTS codigo_pedido VARCHAR(50);
ALTER TABLE venda ADD COLUMN IF NOT EXISTS etapa VARCHAR(30) DEFAULT 'Pedido';
ALTER TABLE venda ADD COLUMN IF NOT EXISTS valor_total NUMERIC(12, 2) DEFAULT 0;

-- ComentÃ¡rios
COMMENT ON COLUMN venda.etapa IS 'OrÃ§amento | Pedido | Ordem de ProduÃ§Ã£o | ExpediÃ§Ã£o';
COMMENT ON COLUMN venda.codigo_pedido IS 'CÃ³digo exibido do pedido; editÃ¡vel; se null, exibir id';

-- Ãndices (IF NOT EXISTS = seguro rodar mais de uma vez)
CREATE INDEX IF NOT EXISTS idx_venda_etapa ON venda(etapa);
CREATE INDEX IF NOT EXISTS idx_venda_codigo_pedido ON venda(codigo_pedido);

-- Preencher etapa nos registros antigos (onde etapa estÃ¡ null ou vazio)
UPDATE venda SET etapa = 'OrÃ§amento' WHERE tipo = 'OrÃ§amento' AND (etapa IS NULL OR etapa = '');
UPDATE venda SET etapa = 'Pedido' WHERE tipo = 'Pedido' AND (etapa IS NULL OR etapa = '');

-- Preencher codigo_pedido com o id onde estiver vazio (opcional, para exibiÃ§Ã£o)
UPDATE venda SET codigo_pedido = id::TEXT WHERE (codigo_pedido IS NULL OR codigo_pedido = '') AND id IS NOT NULL;

-- Preencher valor_total a partir dos itens, nos registros que ainda estiverem 0 ou null
UPDATE venda v
SET valor_total = COALESCE(
  (SELECT SUM(vi.valor_total) FROM venda_itens vi WHERE vi.venda_id = v.id),
  0
)
WHERE (v.valor_total IS NULL OR v.valor_total = 0);


-- =============================================================================
-- SOURCE: frontend/database/venda_tipo_kanban_migration.sql
-- =============================================================================
-- Permite que venda.tipo armazene os nomes das colunas do kanban (configurÃ¡veis)
ALTER TABLE venda DROP CONSTRAINT IF EXISTS venda_tipo_check;
ALTER TABLE venda ALTER COLUMN tipo TYPE VARCHAR(100);
ALTER TABLE venda ALTER COLUMN etapa TYPE VARCHAR(100);


-- =============================================================================
-- SOURCE: frontend/database/venda_tipo_operacao_migration.sql
-- =============================================================================
-- ===============================
-- MigraÃ§Ã£o: tipo_operacao_id na venda
-- ===============================

ALTER TABLE venda
    ADD COLUMN IF NOT EXISTS tipo_operacao_id UUID REFERENCES tipo_operacao(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_venda_tipo_operacao_id
    ON venda(tipo_operacao_id);



-- =============================================================================
-- SOURCE: frontend/database/venda_kanban_coluna_schema.sql
-- =============================================================================
-- ===============================
--  Colunas do Kanban de Vendas (configurÃ¡veis por cliente)
-- ===============================
-- Ordem: 1 = primeira coluna (esquerda), 2 = segunda, etc.
-- Coluna "Pedido" Ã© fixa (is_pedido = true): nÃ£o pode editar nome nem excluir, sÃ³ reordenar.

CREATE TABLE IF NOT EXISTS venda_kanban_coluna (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    ordem INTEGER NOT NULL DEFAULT 1,
    is_pedido BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(cliente_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_venda_kanban_coluna_cliente ON venda_kanban_coluna(cliente_id);
CREATE INDEX IF NOT EXISTS idx_venda_kanban_coluna_ordem ON venda_kanban_coluna(cliente_id, ordem);

ALTER TABLE venda_kanban_coluna ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total venda_kanban_coluna" ON venda_kanban_coluna FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ComentÃ¡rio: Inserir coluna "Pedido" por cliente deve ser feito via app ou seed (um registro is_pedido=true por cliente).
-- Exemplo de seed para clientes existentes (opcional, rodar apÃ³s criar a tabela):
-- INSERT INTO venda_kanban_coluna (cliente_id, nome, ordem, is_pedido)
-- SELECT id, 'Pedido', 2, true FROM clientes_azoup c WHERE NOT EXISTS (SELECT 1 FROM venda_kanban_coluna k WHERE k.cliente_id = c.id AND k.is_pedido = true);


-- =============================================================================
-- SOURCE: frontend/database/add_payment_description.sql
-- =============================================================================
-- Adicionar coluna descricao para atender requisitos da SEFAZ (tPag 99 - Outros)
ALTER TABLE nota_fiscal_pagamento ADD COLUMN IF NOT EXISTS descricao VARCHAR(255);
ALTER TABLE venda_forma_pagamento ADD COLUMN IF NOT EXISTS descricao VARCHAR(255);

COMMENT ON COLUMN nota_fiscal_pagamento.descricao IS 'DescriÃ§Ã£o do meio de pagamento, obrigatÃ³rio para SEFAZ quando tPag = 99';
COMMENT ON COLUMN venda_forma_pagamento.descricao IS 'DescriÃ§Ã£o do meio de pagamento, obrigatÃ³rio para SEFAZ quando tPag = 99';


-- =============================================================================
-- SOURCE: frontend/database/migration_quantidade_expedicao_venda.sql
-- =============================================================================
-- ============================================================
-- Migration: quantidade expedicao (tabela venda)
-- NÃ£o possui UI por enquanto.
-- ============================================================

ALTER TABLE venda
ADD COLUMN IF NOT EXISTS quantidade_expedicao INTEGER DEFAULT 0;

-- ComentÃ¡rio (se a coluna existir apÃ³s a migraÃ§Ã£o)
COMMENT ON COLUMN venda.quantidade_expedicao IS 'Quantidade de expedicao (controla volume/contagem para futuras telas).';



-- =============================================================================
-- SOURCE: frontend/database/migration_quantidade_expedicao_venda_itens.sql
-- =============================================================================
-- ============================================================
-- Migration: quantidade_expedicao por item (venda_itens)
-- Regras:
-- - Remove quantidade_expedicao que foi adicionada em `venda`
-- - Adiciona quantidade_expedicao em `venda_itens` (default 0)
-- ============================================================

ALTER TABLE venda
DROP COLUMN IF EXISTS quantidade_expedicao;

ALTER TABLE venda_itens
ADD COLUMN IF NOT EXISTS quantidade_expedicao INTEGER DEFAULT 0;

COMMENT ON COLUMN venda_itens.quantidade_expedicao IS 'Quantidade expedida por item (usado no romaneio/expediÃ§Ã£o).';

CREATE INDEX IF NOT EXISTS idx_venda_itens_quantidade_expedicao
ON venda_itens(quantidade_expedicao);



-- =============================================================================
-- SOURCE: frontend/database/migration_venda_codigo_pedido_unique_tenant_empresa.sql
-- =============================================================================
-- Permite repetir codigo_pedido entre clientes/empresas diferentes,
-- mantendo unicidade apenas dentro do mesmo tenant + empresa.
-- Regra aplicada somente quando codigo_pedido estiver preenchido.

BEGIN;

-- Remove possÃ­veis unicidades antigas globais por codigo_pedido.
ALTER TABLE public.venda
    DROP CONSTRAINT IF EXISTS venda_codigo_pedido_key;

ALTER TABLE public.venda
    DROP CONSTRAINT IF EXISTS unique_venda_codigo_pedido;

DROP INDEX IF EXISTS public.idx_venda_codigo_pedido_unique;
DROP INDEX IF EXISTS public.venda_codigo_pedido_key;
DROP INDEX IF EXISTS public.uk_venda_codigo_pedido;

-- Unicidade composta:
-- - cliente_id_tenant (cliente_azoup)
-- - empresa_id (tratando null como 0)
-- - codigo_pedido normalizado (trim + lower)
CREATE UNIQUE INDEX IF NOT EXISTS idx_venda_codigo_pedido_tenant_empresa_unique
ON public.venda (
    cliente_id_tenant,
    COALESCE(empresa_id, 0),
    LOWER(BTRIM(codigo_pedido))
)
WHERE codigo_pedido IS NOT NULL
  AND BTRIM(codigo_pedido) <> '';

COMMIT;



-- =============================================================================
-- SOURCE: frontend/database/migration_venda_faturamento_schema.sql
-- =============================================================================
-- ============================================================
-- MÃ“DULO FATURAMENTO (Nova base: venda 1:N)
--  - CabeÃ§alho: venda_faturamento
--  - Itens: venda_faturamento_itens (vincula por venda_item_id)
-- Regras:
--  - RLS liberando acesso para authenticated (mesmo padrÃ£o do projeto)
--  - Sem depender de tenant via tabela "tenant" (usa cliente_id_tenant)
-- ============================================================

-- 1) CabeÃ§alho do faturamento
CREATE TABLE IF NOT EXISTS venda_faturamento (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    -- Tenant
    cliente_id_tenant UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,

    -- Cliente (cadastro jÃ¡ existente)
    cliente_id UUID NOT NULL REFERENCES clientes_cadastros(id) ON DELETE RESTRICT,

    -- Venda original (pedido/orÃ§amento)
    venda_id BIGINT NOT NULL REFERENCES venda(id) ON DELETE CASCADE,

    -- Controle do fluxo do faturamento
    -- 'FINANCEIRO_GERADO', 'NFE_AUTORIZADA'
    status VARCHAR(50) NOT NULL DEFAULT 'FINANCEIRO_GERADO',

    -- Snapshot do que foi faturado (para facilitar Kanban/relatÃ³rios)
    valor_total_faturado NUMERIC(15,2) NOT NULL DEFAULT 0,
    quantidade_total_faturada NUMERIC(15,3) NOT NULL DEFAULT 0,

    -- VÃ­nculo com NF-e gerada para este faturamento (pode ser NULL antes)
    nota_fiscal_id UUID REFERENCES nota_fiscal(id) ON DELETE SET NULL,

    -- Documento de referÃªncia (pode ser cÃ³digo do pedido + sufixo, se vocÃª quiser depois)
    documento VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_venda_faturamento_tenant_venda
    ON venda_faturamento (cliente_id_tenant, venda_id);

CREATE INDEX IF NOT EXISTS idx_venda_faturamento_status
    ON venda_faturamento (status);

ALTER TABLE venda_faturamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total venda_faturamento"
    ON venda_faturamento FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

-- 2) Itens faturados (por item da venda original)
CREATE TABLE IF NOT EXISTS venda_faturamento_itens (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    cliente_id_tenant UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,

    venda_faturamento_id UUID NOT NULL REFERENCES venda_faturamento(id) ON DELETE CASCADE,

    -- Item original da venda
    venda_item_id UUID NOT NULL REFERENCES venda_itens(id) ON DELETE CASCADE,

    quantidade_faturada NUMERIC(15,3) NOT NULL DEFAULT 0,
    valor_unitario NUMERIC(15,2) NOT NULL DEFAULT 0,
    valor_total NUMERIC(15,2) NOT NULL DEFAULT 0,

    -- Snapshot de campos Ãºteis para auditoria/traceabilidade
    cor VARCHAR(100),
    tamanho VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_venda_faturamento_itens_unique
    ON venda_faturamento_itens (venda_faturamento_id, venda_item_id);

CREATE INDEX IF NOT EXISTS idx_venda_faturamento_itens_item
    ON venda_faturamento_itens (venda_item_id);

CREATE INDEX IF NOT EXISTS idx_venda_faturamento_itens_faturamento
    ON venda_faturamento_itens (venda_faturamento_id);

ALTER TABLE venda_faturamento_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total venda_faturamento_itens"
    ON venda_faturamento_itens FOR ALL TO authenticated
    USING (true) WITH CHECK (true);



-- =============================================================================
-- SOURCE: frontend/database/migration_venda_faturamento_links_finance_nfe.sql
-- =============================================================================
-- ============================================================
-- VÃNCULOS: venda_faturamento -> contas_receber/parcelas + nota_fiscal
-- ============================================================

-- 1) contas_receber: liga o financeiro ao faturamento (1:N na prÃ¡tica)
ALTER TABLE contas_receber
ADD COLUMN IF NOT EXISTS venda_faturamento_id UUID REFERENCES venda_faturamento(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contas_receber_venda_faturamento_id
    ON contas_receber(venda_faturamento_id);

-- 2) parcelas_contas_receber: duplicar o vÃ­nculo para filtros rÃ¡pidos
ALTER TABLE parcelas_contas_receber
ADD COLUMN IF NOT EXISTS venda_faturamento_id UUID REFERENCES venda_faturamento(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_parcelas_cr_venda_faturamento_id
    ON parcelas_contas_receber(venda_faturamento_id);

-- 3) nota_fiscal: liga a NF-e ao faturamento que a originou
ALTER TABLE nota_fiscal
ADD COLUMN IF NOT EXISTS venda_faturamento_id UUID REFERENCES venda_faturamento(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nota_fiscal_venda_faturamento_id
    ON nota_fiscal(venda_faturamento_id);



-- =============================================================================
-- SOURCE: frontend/database/migration_expedicao_romaneio_historico.sql
-- =============================================================================
-- HistÃ³rico de romaneios: registra cada operaÃ§Ã£o de romaneio (por item e variaÃ§Ã£o)
-- para permitir consulta histÃ³rica na tela de Gerar Romaneio.
-- Cada "salvar romaneio" gera um romaneio_batch_id Ãºnico, agrupando todos os
-- itens expedidos na mesma operaÃ§Ã£o.

CREATE TABLE IF NOT EXISTS expedicao_romaneio (
    id                    UUID             DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_id_tenant     UUID             NOT NULL,
    cliente_id            UUID,                              -- cliente do pedido
    empresa_id            UUID,
    venda_id              BIGINT           NOT NULL,
    venda_item_id         UUID,
    produto_id            UUID,
    produto_cor_tamanho_id UUID,
    cor                   TEXT,
    tamanho               TEXT,
    produto_nome          TEXT,                              -- snapshot
    produto_sku           TEXT,                              -- snapshot
    quantidade            NUMERIC          NOT NULL DEFAULT 0,
    romaneio_batch_id     UUID             NOT NULL,         -- agrupa itens de uma mesma operaÃ§Ã£o
    usuario_id            UUID,
    created_at            TIMESTAMPTZ      DEFAULT now()
);

-- Ãndices para buscas comuns
CREATE INDEX IF NOT EXISTS idx_expedicao_romaneio_venda_id
    ON expedicao_romaneio (venda_id);

CREATE INDEX IF NOT EXISTS idx_expedicao_romaneio_tenant
    ON expedicao_romaneio (cliente_id_tenant);

CREATE INDEX IF NOT EXISTS idx_expedicao_romaneio_batch
    ON expedicao_romaneio (romaneio_batch_id);

-- RLS â€” padrÃ£o do projeto: acesso total para autenticados, isolaÃ§Ã£o de tenant feita na aplicaÃ§Ã£o
ALTER TABLE expedicao_romaneio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_expedicao_romaneio" ON expedicao_romaneio;
DROP POLICY IF EXISTS "expedicao_romaneio_select"           ON expedicao_romaneio;
DROP POLICY IF EXISTS "expedicao_romaneio_insert"           ON expedicao_romaneio;
DROP POLICY IF EXISTS "expedicao_romaneio_update"           ON expedicao_romaneio;
DROP POLICY IF EXISTS "expedicao_romaneio_delete"           ON expedicao_romaneio;

CREATE POLICY "Acesso total expedicao_romaneio"
    ON expedicao_romaneio
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);


-- =============================================================================
-- SOURCE: frontend/database/venda_imagem_ia_schema.sql
-- =============================================================================
-- ==========================================
-- ConfiguraÃ§Ã£o de Prompt IA e HistÃ³rico de Imagens
-- ==========================================

-- Tabela para configuraÃ§Ã£o de Prompt IA
CREATE TABLE IF NOT EXISTS configuracao_prompt_ia (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id UUID REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    descricao VARCHAR(255) NOT NULL DEFAULT 'PadrÃ£o',
    prompt_padrao TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_prompt_cliente UNIQUE (cliente_id)
);

CREATE INDEX IF NOT EXISTS idx_configuracao_prompt_cliente ON configuracao_prompt_ia(cliente_id);

ALTER TABLE configuracao_prompt_ia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total configuracao_prompt_ia" ON configuracao_prompt_ia;
CREATE POLICY "Acesso total configuracao_prompt_ia" ON configuracao_prompt_ia FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- Gatilho para atualizar updated_at
-- (Assumindo que a funÃ§Ã£o update_updated_at_column() jÃ¡ existe globalmente, ou criar manual via aplicaÃ§Ã£o)


-- Tabela para histÃ³rico de imagens geradas no pedido
CREATE TABLE IF NOT EXISTS venda_imagem_ia (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id UUID REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    venda_id BIGINT REFERENCES venda(id) ON DELETE CASCADE,
    venda_item_id UUID REFERENCES venda_itens(id) ON DELETE CASCADE,
    produto_imagem_base TEXT, -- URL da imagem do produto usada como base
    imagem_logo TEXT, -- URL da logo enviada para o storage
    imagem_gerada TEXT, -- URL da imagem final gerada
    prompt_utilizado TEXT,
    data_geracao TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_venda_imagem_ia_venda_id ON venda_imagem_ia(venda_id);
CREATE INDEX IF NOT EXISTS idx_venda_imagem_ia_venda_item_id ON venda_imagem_ia(venda_item_id);

ALTER TABLE venda_imagem_ia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total venda_imagem_ia" ON venda_imagem_ia;
CREATE POLICY "Acesso total venda_imagem_ia" ON venda_imagem_ia FOR ALL USING (true) WITH CHECK (true);


-- ATENÃ‡ÃƒO: Bucket do Supabase Storage e PolÃ­ticas
-- Cria o bucket se nÃ£o existir e o torna pÃºblico
INSERT INTO storage.buckets (id, name, public) 
VALUES ('imagens_ia', 'imagens_ia', true) 
ON CONFLICT (id) DO NOTHING;

-- PolÃ­ticas de RLS para a tabela storage.objects vinculadas ao bucket 'imagens_ia'
-- Permite leitura de arquivos para todos
DROP POLICY IF EXISTS "Leitura de imagens IA" ON storage.objects;
CREATE POLICY "Leitura de imagens IA" ON storage.objects FOR SELECT USING (bucket_id = 'imagens_ia');

-- Permite upload de arquivos (INSERT) 
DROP POLICY IF EXISTS "Upload de imagens IA" ON storage.objects;
CREATE POLICY "Upload de imagens IA" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'imagens_ia');

-- Permite deleÃ§Ã£o/atualizaÃ§Ã£o de arquivos
DROP POLICY IF EXISTS "Edicao de imagens IA" ON storage.objects;
CREATE POLICY "Edicao de imagens IA" ON storage.objects FOR UPDATE USING (bucket_id = 'imagens_ia');
DROP POLICY IF EXISTS "Delecao de imagens IA" ON storage.objects;
CREATE POLICY "Delecao de imagens IA" ON storage.objects FOR DELETE USING (bucket_id = 'imagens_ia');

-- InserÃ§Ã£o de um prompt padrÃ£o inicial para um cliente (SerÃ¡ feito dinamicamente na tela, mas um modelo genÃ©rico pode ser inserido pelo app caso nÃ£o exista)
-- A lÃ³gica no app deve garantir que se 'configuracao_prompt_ia' estiver vazio para o cliente, seja criado com o default fornecido.


-- =============================================================================
-- SOURCE: frontend/database/migration_configuracao_prompt_ia_campos_logo.sql
-- =============================================================================
-- Campos estruturados para geraÃ§Ã£o de imagem IA (lados da logo, tipo de aplicaÃ§Ã£o, fundo).

ALTER TABLE public.configuracao_prompt_ia
    ADD COLUMN IF NOT EXISTS logo_lados VARCHAR(20) DEFAULT 'frente',
    ADD COLUMN IF NOT EXISTS logo_aplicacao VARCHAR(20) DEFAULT 'costura';

COMMENT ON COLUMN public.configuracao_prompt_ia.logo_lados IS 'frente | frente_verso â€” onde aplicar a logo na peÃ§a';
COMMENT ON COLUMN public.configuracao_prompt_ia.logo_aplicacao IS 'costura | adesivo â€” aspecto visual da aplicaÃ§Ã£o da logo';

-- Garante cor_fundo se a migration anterior nÃ£o rodou
ALTER TABLE public.configuracao_prompt_ia
    ADD COLUMN IF NOT EXISTS cor_fundo VARCHAR(30);

COMMENT ON COLUMN public.configuracao_prompt_ia.cor_fundo IS 'Cor do fundo: hex sem # (ex: ECEFF1, FFFFFF)';


-- =============================================================================
-- SOURCE: frontend/database/migration_configuracao_prompt_ia_logo_url.sql
-- =============================================================================
-- Adiciona coluna logo_url Ã  tabela configuracao_prompt_ia
-- para armazenar a logo padrÃ£o a ser usada na geraÃ§Ã£o de imagem com IA.

ALTER TABLE public.configuracao_prompt_ia
    ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN public.configuracao_prompt_ia.logo_url
    IS 'URL da logo padrÃ£o da empresa a ser aplicada nas imagens geradas por IA. Quando preenchida, Ã© carregada automaticamente no componente de geraÃ§Ã£o.';


-- =============================================================================
-- SOURCE: frontend/database/migration_configuracao_prompt_ia_logo_vertical.sql
-- =============================================================================
-- PosiÃ§Ã£o vertical explÃ­cita da logo na composiÃ§Ã£o PhotoRoom (GET horizontalAlignment / verticalAlignment).
-- NULL = automÃ¡tico (inferir a partir do texto do prompt).

ALTER TABLE public.configuracao_prompt_ia
    ADD COLUMN IF NOT EXISTS logo_vertical VARCHAR(20);

COMMENT ON COLUMN public.configuracao_prompt_ia.logo_vertical IS
'Alinhamento vertical na composiÃ§Ã£o: top, center, bottom. NULL = inferir do prompt.';


-- =============================================================================
-- SOURCE: frontend/database/configuracao_prompt_ia_logo_fundo_migration.sql
-- =============================================================================
-- ParÃ¢metros explÃ­citos para a IA: posiÃ§Ã£o da logo e cor do fundo
-- Assim a API Photoroom aplica exatamente o que foi configurado (nÃ£o depende sÃ³ do texto do prompt).

ALTER TABLE configuracao_prompt_ia
    ADD COLUMN IF NOT EXISTS logo_posicao VARCHAR(20),
    ADD COLUMN IF NOT EXISTS cor_fundo VARCHAR(30);

COMMENT ON COLUMN configuracao_prompt_ia.logo_posicao IS 'Lado da logo: left, center, right (ou Esquerda, Centro, Direita)';
COMMENT ON COLUMN configuracao_prompt_ia.cor_fundo IS 'Cor do fundo: hex sem # (ex: FFFFFF) ou nome (ex: white, gray)';


-- =============================================================================
-- SOURCE: frontend/database/migration_venda_imagem_ia_contador_mensal.sql
-- =============================================================================
-- Contador mensal de imagens geradas por IA em Vendas (por cliente)

create table if not exists public.venda_imagem_ia_contador_mensal (
    id uuid primary key default gen_random_uuid(),
    cliente_id uuid not null references public.clientes_azoup(id) on delete cascade,
    ano_mes date not null,
    quantidade_gerada integer not null default 0 check (quantidade_gerada >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint uq_venda_imagem_ia_contador_cliente_mes unique (cliente_id, ano_mes)
);

create index if not exists idx_venda_imagem_ia_contador_cliente_mes
    on public.venda_imagem_ia_contador_mensal (cliente_id, ano_mes desc);

create or replace function public.touch_updated_at_venda_imagem_ia_contador()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_touch_updated_at_venda_imagem_ia_contador on public.venda_imagem_ia_contador_mensal;
create trigger trg_touch_updated_at_venda_imagem_ia_contador
before update on public.venda_imagem_ia_contador_mensal
for each row execute function public.touch_updated_at_venda_imagem_ia_contador();

-- Incrementa 1 imagem no mÃªs de referÃªncia (padrÃ£o: mÃªs atual)
create or replace function public.incrementar_contador_venda_imagem_ia(
    p_cliente_id uuid,
    p_referencia date default current_date
)
returns void
language plpgsql
as $$
declare
    v_mes date;
begin
    if p_cliente_id is null then
        raise exception 'p_cliente_id Ã© obrigatÃ³rio';
    end if;

    v_mes := date_trunc('month', coalesce(p_referencia, current_date))::date;

    insert into public.venda_imagem_ia_contador_mensal (cliente_id, ano_mes, quantidade_gerada)
    values (p_cliente_id, v_mes, 1)
    on conflict (cliente_id, ano_mes)
    do update set
        quantidade_gerada = public.venda_imagem_ia_contador_mensal.quantidade_gerada + 1,
        updated_at = now();
end;
$$;

alter table public.venda_imagem_ia_contador_mensal enable row level security;

drop policy if exists "venda_imagem_ia_contador_select_tenant" on public.venda_imagem_ia_contador_mensal;
create policy "venda_imagem_ia_contador_select_tenant"
on public.venda_imagem_ia_contador_mensal
for select
to authenticated
using (
    exists (
        select 1
        from public.usuarios u
        where u.auth_id = auth.uid()
          and u.cliente_id = venda_imagem_ia_contador_mensal.cliente_id
    )
);



-- =============================================================================
-- SOURCE: frontend/database/migration_producao_op_kanban.sql
-- =============================================================================
-- =========================================
-- ProduÃ§Ã£o OP Kanban
-- =========================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CabeÃ§alho da Ordem de ProduÃ§Ã£o
CREATE TABLE IF NOT EXISTS producao_op (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id_tenant UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    numero_op INTEGER NOT NULL,
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    cliente_id UUID REFERENCES clientes_cadastros(id) ON DELETE SET NULL,
    pedido_id BIGINT REFERENCES venda(id) ON DELETE SET NULL,
    produto_id UUID NOT NULL REFERENCES produtos(id) ON DELETE RESTRICT,
    roteiro_id UUID NOT NULL REFERENCES roteiros_producao(id) ON DELETE RESTRICT,
    fase_atual_id UUID REFERENCES roteiro_producao_fases(id) ON DELETE SET NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'EM_ESPERA',
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT producao_op_status_check CHECK (
        status IN ('EM_ESPERA', 'EM_PRODUCAO', 'CONCLUIDA', 'PAUSADA', 'CANCELADA')
    ),
    CONSTRAINT producao_op_numero_unique UNIQUE (cliente_id_tenant, numero_op)
);

-- Itens/variaÃ§Ãµes da OP (cor/tamanho/quantidade)
CREATE TABLE IF NOT EXISTS producao_op_item (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id_tenant UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    op_id UUID NOT NULL REFERENCES producao_op(id) ON DELETE CASCADE,
    cor VARCHAR(100) NOT NULL,
    tamanho VARCHAR(50) NOT NULL,
    quantidade NUMERIC(12,3) NOT NULL CHECK (quantidade > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ãndices para filtros e performance do Kanban
CREATE INDEX IF NOT EXISTS idx_producao_op_tenant_numero
    ON producao_op (cliente_id_tenant, numero_op);

CREATE INDEX IF NOT EXISTS idx_producao_op_tenant_pedido
    ON producao_op (cliente_id_tenant, pedido_id);

CREATE INDEX IF NOT EXISTS idx_producao_op_tenant_cliente
    ON producao_op (cliente_id_tenant, cliente_id);

CREATE INDEX IF NOT EXISTS idx_producao_op_tenant_produto
    ON producao_op (cliente_id_tenant, produto_id);

CREATE INDEX IF NOT EXISTS idx_producao_op_tenant_empresa
    ON producao_op (cliente_id_tenant, empresa_id);

CREATE INDEX IF NOT EXISTS idx_producao_op_tenant_roteiro
    ON producao_op (cliente_id_tenant, roteiro_id);

CREATE INDEX IF NOT EXISTS idx_producao_op_tenant_fase
    ON producao_op (cliente_id_tenant, fase_atual_id);

CREATE INDEX IF NOT EXISTS idx_producao_op_tenant_status
    ON producao_op (cliente_id_tenant, status);

CREATE INDEX IF NOT EXISTS idx_producao_op_created_at
    ON producao_op (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_producao_op_item_op_id
    ON producao_op_item (op_id);

CREATE INDEX IF NOT EXISTS idx_producao_op_item_tenant
    ON producao_op_item (cliente_id_tenant);

-- Sequencial de OP por tenant
CREATE OR REPLACE FUNCTION gerar_numero_op_por_tenant()
RETURNS TRIGGER AS $$
DECLARE
    proximo_numero INTEGER;
BEGIN
    IF NEW.numero_op IS NOT NULL AND NEW.numero_op > 0 THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(MAX(numero_op), 0) + 1
      INTO proximo_numero
      FROM producao_op
     WHERE cliente_id_tenant = NEW.cliente_id_tenant;

    NEW.numero_op := proximo_numero;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gerar_numero_op_por_tenant ON producao_op;
CREATE TRIGGER trg_gerar_numero_op_por_tenant
BEFORE INSERT ON producao_op
FOR EACH ROW
EXECUTE FUNCTION gerar_numero_op_por_tenant();

-- AtualizaÃ§Ã£o automÃ¡tica de updated_at
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_producao_op_touch_updated_at ON producao_op;
CREATE TRIGGER trg_producao_op_touch_updated_at
BEFORE UPDATE ON producao_op
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_producao_op_item_touch_updated_at ON producao_op_item;
CREATE TRIGGER trg_producao_op_item_touch_updated_at
BEFORE UPDATE ON producao_op_item
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

-- RLS
ALTER TABLE producao_op ENABLE ROW LEVEL SECURITY;
ALTER TABLE producao_op_item ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso total producao_op"
    ON producao_op FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Acesso total producao_op_item"
    ON producao_op_item FOR ALL TO authenticated
    USING (true) WITH CHECK (true);


-- =============================================================================
-- SOURCE: frontend/database/00_bootstrap_producao_extras.sql
-- =============================================================================
-- ProduÃ§Ã£o extras â€” rodar APÃ“S migration_producao_op_kanban.sql

CREATE TABLE IF NOT EXISTS public.producao_op_fases_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id_tenant UUID NOT NULL REFERENCES public.clientes_azoup(id) ON DELETE CASCADE,
    op_id UUID NOT NULL REFERENCES public.producao_op(id) ON DELETE CASCADE,
    numero_op INTEGER,
    fase_id UUID REFERENCES public.roteiro_producao_fases(id) ON DELETE SET NULL,
    faccionista_id UUID REFERENCES public.fornecedores_cadastros(id) ON DELETE SET NULL,
    observacao TEXT,
    quantidade NUMERIC(14,3) NOT NULL DEFAULT 0,
    tempo_total_segundos INTEGER NOT NULL DEFAULT 0,
    valor_mao_obra_total NUMERIC(14,4),
    data_previsao_finalizacao DATE,
    is_reprocesso BOOLEAN NOT NULL DEFAULT false,
    defeito_registro_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_producao_op_fases_log_tenant_op
    ON public.producao_op_fases_log (cliente_id_tenant, op_id, fase_id);

ALTER TABLE public.producao_op ADD COLUMN IF NOT EXISTS faccionista_id UUID REFERENCES public.fornecedores_cadastros(id) ON DELETE SET NULL;
ALTER TABLE public.producao_op ADD COLUMN IF NOT EXISTS timer_ativo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.producao_op ADD COLUMN IF NOT EXISTS timer_inicio TIMESTAMPTZ;
ALTER TABLE public.producao_op ADD COLUMN IF NOT EXISTS tempo_acumulado_segundos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.producao_op ADD COLUMN IF NOT EXISTS data_previsao_finalizacao DATE;

ALTER TABLE public.producao_op_fases_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total producao_op_fases_log" ON public.producao_op_fases_log;
CREATE POLICY "Acesso total producao_op_fases_log" ON public.producao_op_fases_log FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- =============================================================================
-- SOURCE: frontend/database/migration_producao_op_numero_compartilhado.sql
-- =============================================================================
-- Permite cards da mesma OP em fases diferentes
-- mantendo o mesmo numero_op.

-- Remove unicidade por tenant+numero_op para permitir desdobramentos parciais.
ALTER TABLE producao_op
    DROP CONSTRAINT IF EXISTS producao_op_numero_unique;

-- MantÃ©m Ã­ndice para filtro/consulta por nÃºmero da OP.
CREATE INDEX IF NOT EXISTS idx_producao_op_tenant_numero
    ON producao_op (cliente_id_tenant, numero_op);


-- =============================================================================
-- SOURCE: frontend/database/migration_producao_op_unique_por_kanban_key.sql
-- =============================================================================
-- =============================================================================
-- Permite vÃ¡rios cartÃµes com o mesmo numero_op na MESMA FASE quando forem
-- cartÃµes de defeito / anti-merge (kanban_card_key preenchido).
--
-- O erro "duplicate key value violates unique constraint producao_op_numero_fase_unique"
-- ocorre porque a constraint antiga era UNIQUE (cliente_id_tenant, numero_op, fase_atual_id)
-- sem considerar kanban_card_key.
--
-- Substitui por Ã­ndices Ãºnicos PARCIAIS: sÃ³ aplicam quando kanban_card_key IS NULL,
-- ou seja, no mÃ¡ximo um cartÃ£o "padrÃ£o" por (tenant, numero, fase); cartÃµes com
-- chave prÃ³pria podem coexistir na mesma fase.
--
-- ROLLBACK (cuidado: falha se existirem duplicatas que a constraint antiga proibia):
--
-- DROP INDEX IF EXISTS public.idx_producao_op_one_per_fase_sem_key;
-- DROP INDEX IF EXISTS public.idx_producao_op_one_backlog_sem_key;
-- ALTER TABLE public.producao_op
--   ADD CONSTRAINT producao_op_numero_fase_unique
--   UNIQUE (cliente_id_tenant, numero_op, fase_atual_id);
-- =============================================================================

ALTER TABLE public.producao_op
    DROP CONSTRAINT IF EXISTS producao_op_numero_fase_unique;

-- Backlog: no mÃ¡ximo um cartÃ£o sem kanban_card_key por tenant + numero_op
CREATE UNIQUE INDEX IF NOT EXISTS idx_producao_op_one_backlog_sem_key
    ON public.producao_op (cliente_id_tenant, numero_op)
    WHERE kanban_card_key IS NULL
      AND fase_atual_id IS NULL;

-- Fase definida: no mÃ¡ximo um cartÃ£o sem kanban_card_key por tenant + numero_op + fase
CREATE UNIQUE INDEX IF NOT EXISTS idx_producao_op_one_per_fase_sem_key
    ON public.producao_op (cliente_id_tenant, numero_op, fase_atual_id)
    WHERE kanban_card_key IS NULL
      AND fase_atual_id IS NOT NULL;

-- PostgREST / Supabase
-- SELECT pg_notify('pgrst', 'reload schema');


-- =============================================================================
-- SOURCE: frontend/database/migration_producao_op_item_parte.sql
-- =============================================================================
-- Permite identificar a parte do produto em cada variaÃ§Ã£o da OP
-- Ex.: parte=PaletÃ³, cor=Azul, tamanho=P

alter table public.producao_op_item
    add column if not exists parte text null;

comment on column public.producao_op_item.parte is
'Parte do produto para OPs de itens divididos em partes (ex.: PaletÃ³, CalÃ§a).';

create index if not exists idx_producao_op_item_op_parte
    on public.producao_op_item (op_id, parte);



-- =============================================================================
-- SOURCE: frontend/database/migration_producao_op_item_pendente_partes.sql
-- =============================================================================
-- Controle de pendÃªncia por parte na finalizaÃ§Ã£o de OP
-- NecessÃ¡rio para produtos divididos em partes (ex.: PaletÃ³ + CalÃ§a)

alter table public.producao_op_item
    add column if not exists quantidade_pendente_partes numeric not null default 0;

comment on column public.producao_op_item.quantidade_pendente_partes is
'Quantidade finalizada de parte que ainda aguarda complemento das demais partes para formar kit completo e subir ao estoque.';



-- =============================================================================
-- SOURCE: frontend/database/migration_producao_op_item_valor_mao_obra.sql
-- =============================================================================
-- Valor unitÃ¡rio de mÃ£o de obra por variaÃ§Ã£o (cor/tamanho) na OP â€” usado no pagamento do faccionista.
-- Preenchido a partir de produto_fase_custo.custo_mao_obra da fase de destino (cadastro do produto).
--
-- Em seguida rode: migration_producao_op_item_valor_mao_obra_total.sql
-- (coluna gerada: total = quantidade Ã— valor unitÃ¡rio).
-- =============================================================================
-- ROLLBACK:
-- ALTER TABLE public.producao_op_item DROP COLUMN IF EXISTS valor_mao_obra_unitario;
-- =============================================================================

ALTER TABLE public.producao_op_item
    ADD COLUMN IF NOT EXISTS valor_mao_obra_unitario NUMERIC(14, 4) NULL DEFAULT NULL;

COMMENT ON COLUMN public.producao_op_item.valor_mao_obra_unitario IS
'Valor unitÃ¡rio (por peÃ§a) para pagamento do faccionista nesta variaÃ§Ã£o; alinhado ao custo mÃ£o de obra da fase no cadastro do produto.';

-- SELECT pg_notify('pgrst', 'reload schema');


-- =============================================================================
-- SOURCE: frontend/database/migration_producao_op_item_valor_mao_obra_total.sql
-- =============================================================================
-- Total de mÃ£o de obra por linha = quantidade Ã— valor_mao_obra_unitario (calculado no banco).
-- Execute DEPOIS de: migration_producao_op_item_valor_mao_obra.sql
-- =============================================================================
-- ROLLBACK:
-- ALTER TABLE public.producao_op_item DROP COLUMN IF EXISTS valor_mao_obra_total;
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'producao_op_item'
          AND column_name = 'valor_mao_obra_unitario'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'producao_op_item'
          AND column_name = 'valor_mao_obra_total'
    ) THEN
        ALTER TABLE public.producao_op_item
            ADD COLUMN valor_mao_obra_total NUMERIC(14, 4)
            GENERATED ALWAYS AS (
                ROUND(
                    (COALESCE(quantidade, 0::NUMERIC) * COALESCE(valor_mao_obra_unitario, 0::NUMERIC))::NUMERIC,
                    4
                )
            ) STORED;
        COMMENT ON COLUMN public.producao_op_item.valor_mao_obra_total IS
            'Custo mÃ£o de obra da variaÃ§Ã£o: quantidade de peÃ§as Ã— valor unitÃ¡rio (atualizado automaticamente).';
    END IF;
END $$;

-- SELECT pg_notify('pgrst', 'reload schema');


-- =============================================================================
-- SOURCE: frontend/database/migration_producao_op_fases_log_valor_mao_obra.sql
-- =============================================================================
-- =============================================================================
-- Total de mÃ£o de obra registrado na movimentaÃ§Ã£o de fase (Kanban).
-- Preenchido ao confirmar mudanÃ§a de coluna (soma qtd Ã— R$ un. do modal).
-- Execute no Supabase SQL Editor; depois recarregue o schema da API se necessÃ¡rio.
-- =============================================================================

ALTER TABLE public.producao_op_fases_log
    ADD COLUMN IF NOT EXISTS valor_mao_obra_total NUMERIC(14, 4) NULL DEFAULT NULL;

COMMENT ON COLUMN public.producao_op_fases_log.valor_mao_obra_total IS
    'Total mÃ£o de obra desta linha de log (movimentaÃ§Ã£o): soma das linhas (quantidade Ã— valor unitÃ¡rio informado ao mudar de fase).';


-- =============================================================================
-- SOURCE: frontend/database/migration_producao_op_fases_log_previsao_finalizacao.sql
-- =============================================================================
-- PrevisÃ£o de finalizaÃ§Ã£o ao enviar OP para uma fase (Kanban de produÃ§Ã£o).
-- data_previsao_finalizacao em producao_op espelha a previsÃ£o da fase atual (exibiÃ§Ã£o no card).
-- data_previsao_finalizacao em producao_op_fases_log registra por fase (histÃ³rico).

ALTER TABLE public.producao_op_fases_log
    ADD COLUMN IF NOT EXISTS data_previsao_finalizacao DATE;

COMMENT ON COLUMN public.producao_op_fases_log.data_previsao_finalizacao IS
    'Data prevista para conclusÃ£o da OP nesta fase (informada ao enviar para a fase).';

ALTER TABLE public.producao_op
    ADD COLUMN IF NOT EXISTS data_previsao_finalizacao DATE;

COMMENT ON COLUMN public.producao_op.data_previsao_finalizacao IS
    'PrevisÃ£o de finalizaÃ§Ã£o da fase atual do card no Kanban (atualizada ao mover de fase).';


-- =============================================================================
-- SOURCE: frontend/database/migration_producao_op_defeitos.sql
-- =============================================================================
-- =============================================================================
-- ProduÃ§Ã£o Kanban: defeitos (reprocesso / perda de peÃ§a), cartÃµes nÃ£o unificados
-- e extensÃ£o do log de fases.
--
-- ROLLBACK (desfazer) â€” execute na ordem inversa, ajustando se necessÃ¡rio:
--
-- ALTER TABLE public.producao_op_fases_log
--   DROP CONSTRAINT IF EXISTS producao_op_fases_log_defeito_registro_id_fkey;
-- ALTER TABLE public.producao_op_fases_log
--   DROP COLUMN IF EXISTS defeito_registro_id,
--   DROP COLUMN IF EXISTS is_reprocesso;
-- DROP TABLE IF EXISTS public.producao_op_defeito_item;
-- DROP TABLE IF EXISTS public.producao_op_defeito;
-- ALTER TABLE public.producao_op DROP CONSTRAINT IF EXISTS producao_op_defeito_tipo_check;
-- ALTER TABLE public.producao_op
--   DROP COLUMN IF EXISTS defeito_tipo,
--   DROP COLUMN IF EXISTS kanban_card_key;
-- =============================================================================

-- Colunas no card de OP: chave Ãºnica para nÃ£o mesclar no Kanban + tipo de defeito
ALTER TABLE public.producao_op
    ADD COLUMN IF NOT EXISTS kanban_card_key uuid NULL,
    ADD COLUMN IF NOT EXISTS defeito_tipo character varying(30) NULL;

ALTER TABLE public.producao_op
    DROP CONSTRAINT IF EXISTS producao_op_defeito_tipo_check;

ALTER TABLE public.producao_op
    ADD CONSTRAINT producao_op_defeito_tipo_check CHECK (
        defeito_tipo IS NULL
        OR (defeito_tipo)::text = ANY (
            ARRAY['REPROCESSO'::character varying, 'PERDA_PECA'::character varying]::text[]
        )
    );

COMMENT ON COLUMN public.producao_op.kanban_card_key IS
'UUID por cartÃ£o. CartÃµes com chave preenchida nÃ£o sÃ£o unificados com outros na mesma fase.';

COMMENT ON COLUMN public.producao_op.defeito_tipo IS
'REPROCESSO: pode arrastar no Kanban. PERDA_PECA: cartÃ£o fixo na coluna (sem arrastar).';


CREATE TABLE IF NOT EXISTS public.producao_op_defeito (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4 (),
    cliente_id_tenant uuid NOT NULL,
    op_origem_id uuid NULL,
    op_destino_id uuid NOT NULL,
    tipo_defeito character varying(30) NOT NULL,
    fase_destino_id uuid NULL,
    faccionista_id uuid NULL,
    observacao text NULL,
    tempo_origem_segundos integer NULL,
    numero_op integer NULL,
    empresa_id uuid NULL,
    cliente_id uuid NULL,
    pedido_id bigint NULL,
    produto_id uuid NULL,
    roteiro_id uuid NULL,
    created_at timestamp with time zone NULL DEFAULT now(),
    CONSTRAINT producao_op_defeito_pkey PRIMARY KEY (id),
    CONSTRAINT producao_op_defeito_tipo_defeito_check CHECK (
        (tipo_defeito)::text = ANY (ARRAY['REPROCESSO'::character varying, 'PERDA_PECA'::character varying]::text[])
    ),
    CONSTRAINT producao_op_defeito_cliente_id_tenant_fkey FOREIGN KEY (cliente_id_tenant) REFERENCES clientes_azoup (id) ON DELETE CASCADE,
    CONSTRAINT producao_op_defeito_op_origem_id_fkey FOREIGN KEY (op_origem_id) REFERENCES producao_op (id) ON DELETE SET NULL,
    CONSTRAINT producao_op_defeito_op_destino_id_fkey FOREIGN KEY (op_destino_id) REFERENCES producao_op (id) ON DELETE CASCADE,
    CONSTRAINT producao_op_defeito_fase_destino_id_fkey FOREIGN KEY (fase_destino_id) REFERENCES roteiro_producao_fases (id) ON DELETE SET NULL,
    CONSTRAINT producao_op_defeito_faccionista_id_fkey FOREIGN KEY (faccionista_id) REFERENCES fornecedores_cadastros (id) ON DELETE SET NULL,
    CONSTRAINT producao_op_defeito_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas (id) ON DELETE SET NULL,
    CONSTRAINT producao_op_defeito_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes_cadastros (id) ON DELETE SET NULL,
    CONSTRAINT producao_op_defeito_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES venda (id) ON DELETE SET NULL,
    CONSTRAINT producao_op_defeito_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES produtos (id) ON DELETE SET NULL,
    CONSTRAINT producao_op_defeito_roteiro_id_fkey FOREIGN KEY (roteiro_id) REFERENCES roteiros_producao (id) ON DELETE SET NULL
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_producao_op_defeito_tenant ON public.producao_op_defeito USING btree (cliente_id_tenant) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_producao_op_defeito_destino ON public.producao_op_defeito USING btree (op_destino_id) TABLESPACE pg_default;


CREATE TABLE IF NOT EXISTS public.producao_op_defeito_item (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4 (),
    defeito_id uuid NOT NULL,
    producao_op_item_origem_id uuid NULL,
    cor character varying(100) NOT NULL,
    tamanho character varying(50) NOT NULL,
    quantidade numeric(12, 3) NOT NULL,
    created_at timestamp with time zone NULL DEFAULT now(),
    CONSTRAINT producao_op_defeito_item_pkey PRIMARY KEY (id),
    CONSTRAINT producao_op_defeito_item_defeito_id_fkey FOREIGN KEY (defeito_id) REFERENCES producao_op_defeito (id) ON DELETE CASCADE,
    CONSTRAINT producao_op_defeito_item_item_origem_fkey FOREIGN KEY (producao_op_item_origem_id) REFERENCES producao_op_item (id) ON DELETE SET NULL,
    CONSTRAINT producao_op_defeito_item_quantidade_check CHECK ((quantidade > (0)::numeric))
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_producao_op_defeito_item_defeito ON public.producao_op_defeito_item USING btree (defeito_id) TABLESPACE pg_default;


-- Log de fases: marca reprocesso e vÃ­nculo com registro de defeito (se a tabela jÃ¡ existir)
DO $$
BEGIN
    IF to_regclass('public.producao_op_fases_log') IS NOT NULL THEN
        ALTER TABLE public.producao_op_fases_log
            ADD COLUMN IF NOT EXISTS is_reprocesso boolean NOT NULL DEFAULT false;
        ALTER TABLE public.producao_op_fases_log
            ADD COLUMN IF NOT EXISTS defeito_registro_id uuid NULL;

        ALTER TABLE public.producao_op_fases_log
            DROP CONSTRAINT IF EXISTS producao_op_fases_log_defeito_registro_id_fkey;

        ALTER TABLE public.producao_op_fases_log
            ADD CONSTRAINT producao_op_fases_log_defeito_registro_id_fkey
            FOREIGN KEY (defeito_registro_id) REFERENCES public.producao_op_defeito (id) ON DELETE SET NULL;
    END IF;
END
$$;


ALTER TABLE public.producao_op_defeito ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producao_op_defeito_item ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total producao_op_defeito" ON public.producao_op_defeito;
CREATE POLICY "Acesso total producao_op_defeito"
    ON public.producao_op_defeito FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso total producao_op_defeito_item" ON public.producao_op_defeito_item;
CREATE POLICY "Acesso total producao_op_defeito_item"
    ON public.producao_op_defeito_item FOR ALL TO authenticated
    USING (true) WITH CHECK (true);


-- Recarregar schema do PostgREST (Supabase)
-- SELECT pg_notify('pgrst', 'reload schema');


-- =============================================================================
-- SOURCE: frontend/database/migration_producao_faccionista_pagamento.sql
-- =============================================================================
-- Pagamento de faccionista gerado a partir de OPs por perÃ­odo.
-- =============================================================================
-- ROLLBACK:
-- DROP TABLE IF EXISTS public.producao_faccionista_pagamento_extra;
-- DROP TABLE IF EXISTS public.producao_faccionista_pagamento_op;
-- DROP TABLE IF EXISTS public.producao_faccionista_pagamento;
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.producao_faccionista_pagamento (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    cliente_id_tenant uuid NOT NULL,
    faccionista_id uuid NOT NULL,
    tipo_pagamento_id uuid NULL,
    periodo_inicio date NOT NULL,
    periodo_fim date NOT NULL,
    data_pagamento date NOT NULL DEFAULT CURRENT_DATE,
    valor_ops numeric(14, 4) NOT NULL DEFAULT 0,
    valor_ajustes numeric(14, 4) NOT NULL DEFAULT 0,
    valor_total numeric(14, 4) NOT NULL DEFAULT 0,
    observacao text NULL,
    created_at timestamp with time zone NULL DEFAULT now(),
    CONSTRAINT producao_faccionista_pagamento_pkey PRIMARY KEY (id),
    CONSTRAINT producao_faccionista_pagamento_tenant_fkey FOREIGN KEY (cliente_id_tenant) REFERENCES clientes_azoup (id) ON DELETE CASCADE,
    CONSTRAINT producao_faccionista_pagamento_faccionista_fkey FOREIGN KEY (faccionista_id) REFERENCES fornecedores_cadastros (id) ON DELETE RESTRICT,
    CONSTRAINT producao_faccionista_pagamento_tipo_pagamento_fkey FOREIGN KEY (tipo_pagamento_id) REFERENCES tipo_pagamento (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_prod_facc_pag_tenant ON public.producao_faccionista_pagamento (cliente_id_tenant);
CREATE INDEX IF NOT EXISTS idx_prod_facc_pag_faccionista ON public.producao_faccionista_pagamento (faccionista_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.producao_faccionista_pagamento_op (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    pagamento_id uuid NOT NULL,
    op_id uuid NOT NULL,
    numero_op integer NULL,
    produto_id uuid NULL,
    quantidade numeric(14, 4) NOT NULL DEFAULT 0,
    valor_total numeric(14, 4) NOT NULL DEFAULT 0,
    created_at timestamp with time zone NULL DEFAULT now(),
    CONSTRAINT producao_faccionista_pagamento_op_pkey PRIMARY KEY (id),
    CONSTRAINT producao_faccionista_pagamento_op_pagamento_fkey FOREIGN KEY (pagamento_id) REFERENCES producao_faccionista_pagamento (id) ON DELETE CASCADE,
    CONSTRAINT producao_faccionista_pagamento_op_op_fkey FOREIGN KEY (op_id) REFERENCES producao_op (id) ON DELETE RESTRICT,
    CONSTRAINT producao_faccionista_pagamento_op_produto_fkey FOREIGN KEY (produto_id) REFERENCES produtos (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prod_facc_pag_op_unique ON public.producao_faccionista_pagamento_op (pagamento_id, op_id);

CREATE TABLE IF NOT EXISTS public.producao_faccionista_pagamento_extra (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    pagamento_id uuid NOT NULL,
    ordem integer NOT NULL DEFAULT 0,
    descricao text NOT NULL,
    valor numeric(14, 4) NOT NULL,
    created_at timestamp with time zone NULL DEFAULT now(),
    CONSTRAINT producao_faccionista_pagamento_extra_pkey PRIMARY KEY (id),
    CONSTRAINT producao_faccionista_pagamento_extra_pagamento_fkey FOREIGN KEY (pagamento_id) REFERENCES producao_faccionista_pagamento (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prod_facc_pag_extra_pagamento ON public.producao_faccionista_pagamento_extra (pagamento_id, ordem);

ALTER TABLE public.producao_faccionista_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producao_faccionista_pagamento_op ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producao_faccionista_pagamento_extra ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total producao_faccionista_pagamento" ON public.producao_faccionista_pagamento;
CREATE POLICY "Acesso total producao_faccionista_pagamento"
    ON public.producao_faccionista_pagamento FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso total producao_faccionista_pagamento_op" ON public.producao_faccionista_pagamento_op;
CREATE POLICY "Acesso total producao_faccionista_pagamento_op"
    ON public.producao_faccionista_pagamento_op FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso total producao_faccionista_pagamento_extra" ON public.producao_faccionista_pagamento_extra;
CREATE POLICY "Acesso total producao_faccionista_pagamento_extra"
    ON public.producao_faccionista_pagamento_extra FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

-- SELECT pg_notify('pgrst', 'reload schema');


-- =============================================================================
-- SOURCE: frontend/database/migration_producao_faccionista_pagamento_conta_pagar_link.sql
-- =============================================================================
-- Complemento do pagamento de faccionista:
-- vincular lanÃ§amento em contas_pagar e dados do recibo.
--
-- Execute APÃ“S: migration_producao_faccionista_pagamento.sql
-- =============================================================================
-- ROLLBACK:
-- ALTER TABLE public.producao_faccionista_pagamento
--   DROP CONSTRAINT IF EXISTS producao_faccionista_pagamento_conta_pagar_fkey;
-- ALTER TABLE public.producao_faccionista_pagamento
--   DROP COLUMN IF EXISTS conta_pagar_id,
--   DROP COLUMN IF EXISTS recibo_emitido_em,
--   DROP COLUMN IF EXISTS recibo_pdf_uri;
-- =============================================================================

ALTER TABLE public.producao_faccionista_pagamento
    ADD COLUMN IF NOT EXISTS conta_pagar_id uuid NULL,
    ADD COLUMN IF NOT EXISTS recibo_emitido_em timestamp with time zone NULL,
    ADD COLUMN IF NOT EXISTS recibo_pdf_uri text NULL;

ALTER TABLE public.producao_faccionista_pagamento
    DROP CONSTRAINT IF EXISTS producao_faccionista_pagamento_conta_pagar_fkey;

ALTER TABLE public.producao_faccionista_pagamento
    ADD CONSTRAINT producao_faccionista_pagamento_conta_pagar_fkey
    FOREIGN KEY (conta_pagar_id) REFERENCES public.contas_pagar (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prod_facc_pag_conta_pagar
    ON public.producao_faccionista_pagamento (conta_pagar_id);

-- SELECT pg_notify('pgrst', 'reload schema');


-- =============================================================================
-- SOURCE: frontend/database/migration_estoque_movimentacao.sql
-- =============================================================================
create table if not exists estoque_movimentacao (
    id uuid primary key default gen_random_uuid(),
    cliente_id_tenant uuid not null references clientes_azoup(id) on delete cascade,
    empresa_id uuid not null references empresas(id) on delete restrict,
    usuario_id uuid not null references usuarios(id) on delete restrict,
    item_id uuid not null,
    produto_id uuid null references produtos(id) on delete restrict,
    tecido_id uuid null references tecidos(id) on delete restrict,
    aviamento_id uuid null references aviamentos(id) on delete restrict,
    variacao_id uuid null,
    tipo_item text not null check (tipo_item in ('produto', 'tecido', 'aviamento')),
    status_movimentacao text not null check (status_movimentacao in ('entrada', 'saida')),
    data_movimentacao date not null default current_date,
    quantidade numeric(14,3) not null check (quantidade > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint estoque_movimentacao_item_ck check (
        (
            case when produto_id is not null then 1 else 0 end +
            case when tecido_id is not null then 1 else 0 end +
            case when aviamento_id is not null then 1 else 0 end
        ) = 1
    ),
    constraint estoque_movimentacao_tipo_ref_ck check (
        (tipo_item = 'produto' and produto_id is not null and tecido_id is null and aviamento_id is null)
        or
        (tipo_item = 'tecido' and tecido_id is not null and produto_id is null and aviamento_id is null)
        or
        (tipo_item = 'aviamento' and aviamento_id is not null and produto_id is null and tecido_id is null)
    )
);

create index if not exists idx_estoque_movimentacao_cliente_data
    on estoque_movimentacao (cliente_id_tenant, data_movimentacao desc);

create index if not exists idx_estoque_movimentacao_empresa
    on estoque_movimentacao (empresa_id);

create index if not exists idx_estoque_movimentacao_item
    on estoque_movimentacao (item_id, tipo_item);

create index if not exists idx_estoque_movimentacao_usuario
    on estoque_movimentacao (usuario_id);

create index if not exists idx_estoque_movimentacao_produto
    on estoque_movimentacao (produto_id)
    where produto_id is not null;

create index if not exists idx_estoque_movimentacao_tecido
    on estoque_movimentacao (tecido_id)
    where tecido_id is not null;

create index if not exists idx_estoque_movimentacao_aviamento
    on estoque_movimentacao (aviamento_id)
    where aviamento_id is not null;

create index if not exists idx_estoque_movimentacao_variacao
    on estoque_movimentacao (variacao_id)
    where variacao_id is not null;

create or replace function set_updated_at_estoque_movimentacao()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_set_updated_at_estoque_movimentacao on estoque_movimentacao;

create trigger trg_set_updated_at_estoque_movimentacao
before update on estoque_movimentacao
for each row
execute function set_updated_at_estoque_movimentacao();

alter table estoque_movimentacao enable row level security;

drop policy if exists "estoque_movimentacao_select_authenticated" on estoque_movimentacao;
create policy "estoque_movimentacao_select_authenticated"
on estoque_movimentacao
for select
to authenticated
using (
    exists (
        select 1
        from usuarios u
        where u.auth_id = auth.uid()
          and u.cliente_id = estoque_movimentacao.cliente_id_tenant
    )
);

drop policy if exists "estoque_movimentacao_insert_authenticated" on estoque_movimentacao;
create policy "estoque_movimentacao_insert_authenticated"
on estoque_movimentacao
for insert
to authenticated
with check (
    exists (
        select 1
        from usuarios u
        where u.auth_id = auth.uid()
          and u.id = estoque_movimentacao.usuario_id
          and u.cliente_id = estoque_movimentacao.cliente_id_tenant
    )
    and exists (
        select 1
        from empresas e
        where e.id = estoque_movimentacao.empresa_id
          and e.cliente_id = estoque_movimentacao.cliente_id_tenant
    )
);

drop policy if exists "estoque_movimentacao_update_authenticated" on estoque_movimentacao;
create policy "estoque_movimentacao_update_authenticated"
on estoque_movimentacao
for update
to authenticated
using (
    exists (
        select 1
        from usuarios u
        where u.auth_id = auth.uid()
          and u.cliente_id = estoque_movimentacao.cliente_id_tenant
    )
)
with check (
    exists (
        select 1
        from usuarios u
        where u.auth_id = auth.uid()
          and u.id = estoque_movimentacao.usuario_id
          and u.cliente_id = estoque_movimentacao.cliente_id_tenant
    )
    and exists (
        select 1
        from empresas e
        where e.id = estoque_movimentacao.empresa_id
          and e.cliente_id = estoque_movimentacao.cliente_id_tenant
    )
);

drop policy if exists "estoque_movimentacao_delete_authenticated" on estoque_movimentacao;
create policy "estoque_movimentacao_delete_authenticated"
on estoque_movimentacao
for delete
to authenticated
using (
    exists (
        select 1
        from usuarios u
        where u.auth_id = auth.uid()
          and u.id = estoque_movimentacao.usuario_id
          and u.cliente_id = estoque_movimentacao.cliente_id_tenant
    )
);


-- =============================================================================
-- SOURCE: frontend/database/migration_estoque_movimentacao_fornecedor_lote.sql
-- =============================================================================
alter table if exists estoque_movimentacao
    add column if not exists fornecedor_id uuid null references fornecedores_cadastros(id) on delete set null;

alter table if exists estoque_movimentacao
    add column if not exists movimentacao_lote_id uuid;

update estoque_movimentacao
set movimentacao_lote_id = id
where movimentacao_lote_id is null;

alter table if exists estoque_movimentacao
    alter column movimentacao_lote_id set default gen_random_uuid();

alter table if exists estoque_movimentacao
    alter column movimentacao_lote_id set not null;

create index if not exists idx_estoque_movimentacao_fornecedor
    on estoque_movimentacao (fornecedor_id)
    where fornecedor_id is not null;

create index if not exists idx_estoque_movimentacao_lote
    on estoque_movimentacao (movimentacao_lote_id);


-- =============================================================================
-- SOURCE: frontend/database/migration_estoque_inventario.sql
-- =============================================================================
alter table if exists estoque_movimentacao
    add column if not exists observacao text;

create table if not exists estoque_inventario (
    id uuid primary key default gen_random_uuid(),
    cliente_id_tenant uuid not null references clientes_azoup(id) on delete cascade,
    empresa_id uuid not null references empresas(id) on delete restrict,
    usuario_id uuid not null references usuarios(id) on delete restrict,
    data_inventario timestamptz not null default now(),
    observacao text null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists estoque_inventario_item (
    id uuid primary key default gen_random_uuid(),
    inventario_id uuid not null references estoque_inventario(id) on delete cascade,
    cliente_id_tenant uuid not null references clientes_azoup(id) on delete cascade,
    empresa_id uuid not null references empresas(id) on delete restrict,
    usuario_id uuid not null references usuarios(id) on delete restrict,
    item_id uuid not null,
    produto_id uuid null references produtos(id) on delete restrict,
    tecido_id uuid null references tecidos(id) on delete restrict,
    aviamento_id uuid null references aviamentos(id) on delete restrict,
    variacao_id uuid null,
    tipo_item text not null check (tipo_item in ('produto', 'tecido', 'aviamento')),
    quantidade_sistema numeric(14,3) not null default 0,
    quantidade_contada numeric(14,3) not null default 0,
    diferenca numeric(14,3) not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint estoque_inventario_item_ref_ck check (
        (
            case when produto_id is not null then 1 else 0 end +
            case when tecido_id is not null then 1 else 0 end +
            case when aviamento_id is not null then 1 else 0 end
        ) = 1
    ),
    constraint estoque_inventario_item_tipo_ck check (
        (tipo_item = 'produto' and produto_id is not null and tecido_id is null and aviamento_id is null)
        or
        (tipo_item = 'tecido' and tecido_id is not null and produto_id is null and aviamento_id is null)
        or
        (tipo_item = 'aviamento' and aviamento_id is not null and produto_id is null and tecido_id is null)
    )
);

create index if not exists idx_estoque_inventario_cliente_data
    on estoque_inventario (cliente_id_tenant, created_at desc);

create index if not exists idx_estoque_inventario_empresa
    on estoque_inventario (empresa_id);

create index if not exists idx_estoque_inventario_item_inventario
    on estoque_inventario_item (inventario_id);

create index if not exists idx_estoque_inventario_item_tipo
    on estoque_inventario_item (tipo_item, item_id, variacao_id);

create or replace function set_updated_at_estoque_inventario()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_set_updated_at_estoque_inventario on estoque_inventario;
create trigger trg_set_updated_at_estoque_inventario
before update on estoque_inventario
for each row
execute function set_updated_at_estoque_inventario();

drop trigger if exists trg_set_updated_at_estoque_inventario_item on estoque_inventario_item;
create trigger trg_set_updated_at_estoque_inventario_item
before update on estoque_inventario_item
for each row
execute function set_updated_at_estoque_inventario();

alter table estoque_inventario enable row level security;
alter table estoque_inventario_item enable row level security;

drop policy if exists "estoque_inventario_select_authenticated" on estoque_inventario;
create policy "estoque_inventario_select_authenticated"
on estoque_inventario
for select
to authenticated
using (
    exists (
        select 1
        from usuarios u
        where u.auth_id = auth.uid()
          and u.cliente_id = estoque_inventario.cliente_id_tenant
    )
);

drop policy if exists "estoque_inventario_insert_authenticated" on estoque_inventario;
create policy "estoque_inventario_insert_authenticated"
on estoque_inventario
for insert
to authenticated
with check (
    exists (
        select 1
        from usuarios u
        where u.auth_id = auth.uid()
          and u.id = estoque_inventario.usuario_id
          and u.cliente_id = estoque_inventario.cliente_id_tenant
    )
    and exists (
        select 1
        from empresas e
        where e.id = estoque_inventario.empresa_id
          and e.cliente_id = estoque_inventario.cliente_id_tenant
    )
);

drop policy if exists "estoque_inventario_update_authenticated" on estoque_inventario;
create policy "estoque_inventario_update_authenticated"
on estoque_inventario
for update
to authenticated
using (
    exists (
        select 1
        from usuarios u
        where u.auth_id = auth.uid()
          and u.cliente_id = estoque_inventario.cliente_id_tenant
    )
)
with check (
    exists (
        select 1
        from usuarios u
        where u.auth_id = auth.uid()
          and u.cliente_id = estoque_inventario.cliente_id_tenant
    )
    and exists (
        select 1
        from empresas e
        where e.id = estoque_inventario.empresa_id
          and e.cliente_id = estoque_inventario.cliente_id_tenant
    )
);

drop policy if exists "estoque_inventario_delete_authenticated" on estoque_inventario;
create policy "estoque_inventario_delete_authenticated"
on estoque_inventario
for delete
to authenticated
using (
    exists (
        select 1
        from usuarios u
        where u.auth_id = auth.uid()
          and u.cliente_id = estoque_inventario.cliente_id_tenant
    )
);

drop policy if exists "estoque_inventario_item_select_authenticated" on estoque_inventario_item;
create policy "estoque_inventario_item_select_authenticated"
on estoque_inventario_item
for select
to authenticated
using (
    exists (
        select 1
        from usuarios u
        where u.auth_id = auth.uid()
          and u.cliente_id = estoque_inventario_item.cliente_id_tenant
    )
);

drop policy if exists "estoque_inventario_item_insert_authenticated" on estoque_inventario_item;
create policy "estoque_inventario_item_insert_authenticated"
on estoque_inventario_item
for insert
to authenticated
with check (
    exists (
        select 1
        from usuarios u
        where u.auth_id = auth.uid()
          and u.id = estoque_inventario_item.usuario_id
          and u.cliente_id = estoque_inventario_item.cliente_id_tenant
    )
    and exists (
        select 1
        from estoque_inventario i
        where i.id = estoque_inventario_item.inventario_id
          and i.cliente_id_tenant = estoque_inventario_item.cliente_id_tenant
    )
);

drop policy if exists "estoque_inventario_item_update_authenticated" on estoque_inventario_item;
create policy "estoque_inventario_item_update_authenticated"
on estoque_inventario_item
for update
to authenticated
using (
    exists (
        select 1
        from usuarios u
        where u.auth_id = auth.uid()
          and u.cliente_id = estoque_inventario_item.cliente_id_tenant
    )
)
with check (
    exists (
        select 1
        from usuarios u
        where u.auth_id = auth.uid()
          and u.cliente_id = estoque_inventario_item.cliente_id_tenant
    )
    and exists (
        select 1
        from estoque_inventario i
        where i.id = estoque_inventario_item.inventario_id
          and i.cliente_id_tenant = estoque_inventario_item.cliente_id_tenant
    )
);

drop policy if exists "estoque_inventario_item_delete_authenticated" on estoque_inventario_item;
create policy "estoque_inventario_item_delete_authenticated"
on estoque_inventario_item
for delete
to authenticated
using (
    exists (
        select 1
        from usuarios u
        where u.auth_id = auth.uid()
          and u.cliente_id = estoque_inventario_item.cliente_id_tenant
    )
);


-- =============================================================================
-- SOURCE: frontend/database/migration_nota_entrada_item_variacao_estoque.sql
-- =============================================================================
alter table if exists nota_fiscal_entrada_item
    add column if not exists variacao_id uuid;

create index if not exists idx_nota_fiscal_entrada_item_variacao_id
    on nota_fiscal_entrada_item (variacao_id);


-- =============================================================================
-- SOURCE: frontend/database/migration_estoque_mov_nota_entrada_id.sql
-- =============================================================================
-- Vincula movimentaÃ§Ãµes de estoque Ã  nota fiscal de entrada que as gerou.
-- Permite exclusÃ£o precisa dos movimentos ao apagar uma nota de entrada.

ALTER TABLE public.estoque_movimentacao
    ADD COLUMN IF NOT EXISTS nota_fiscal_entrada_id UUID
        REFERENCES public.nota_fiscal_entrada(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_estoque_mov_nota_entrada_id
    ON public.estoque_movimentacao (nota_fiscal_entrada_id)
    WHERE nota_fiscal_entrada_id IS NOT NULL;

COMMENT ON COLUMN public.estoque_movimentacao.nota_fiscal_entrada_id
    IS 'Nota fiscal de entrada que gerou esta movimentaÃ§Ã£o; NULL para movimentos manuais ou de outros mÃ³dulos.';


-- =============================================================================
-- SOURCE: frontend/database/migration_fornecedor_dashboard_columns.sql
-- =============================================================================
-- Migration: adiciona colunas de vÃ­nculo com fornecedor nas tabelas usadas pelo FornecedorDashboardScreen
-- Execute no SQL Editor do Supabase

-- 1. contas_pagar â†’ id_fornecedor
ALTER TABLE IF EXISTS contas_pagar
    ADD COLUMN IF NOT EXISTS id_fornecedor uuid NULL
        REFERENCES fornecedores_cadastros(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contas_pagar_fornecedor
    ON contas_pagar (id_fornecedor)
    WHERE id_fornecedor IS NOT NULL;

-- 2. estoque_movimentacao â†’ fornecedor_id (pode jÃ¡ existir via migration anterior)
ALTER TABLE IF EXISTS estoque_movimentacao
    ADD COLUMN IF NOT EXISTS fornecedor_id uuid NULL
        REFERENCES fornecedores_cadastros(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_estoque_movimentacao_fornecedor
    ON estoque_movimentacao (fornecedor_id)
    WHERE fornecedor_id IS NOT NULL;

-- 3. nota_fiscal_entrada â†’ fornecedor_id
ALTER TABLE IF EXISTS nota_fiscal_entrada
    ADD COLUMN IF NOT EXISTS fornecedor_id uuid NULL
        REFERENCES fornecedores_cadastros(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nota_fiscal_entrada_fornecedor
    ON nota_fiscal_entrada (fornecedor_id)
    WHERE fornecedor_id IS NOT NULL;


-- =============================================================================
-- SOURCE: frontend/database/financeiro_contas_receber_schema.sql
-- =============================================================================
-- ============================================================
-- MÃ“DULO FINANCEIRO - CONTAS A RECEBER
-- Adaptado do documento "Financeiro"
-- Multi-tenant via cliente_id_tenant (clientes_azoup.id)
-- Reutiliza clientes_cadastros como cadastro de clientes da confecÃ§Ã£o
-- Reutiliza tipo_pagamento para formas de recebimento
-- ============================================================

-- ============================================================
-- 1. Centros de Custo
-- ============================================================
CREATE TABLE IF NOT EXISTS centros_custo (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id_tenant UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    codigo VARCHAR(50) NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_centros_custo_tenant_id_codigo
    ON centros_custo (cliente_id_tenant, codigo);

ALTER TABLE centros_custo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total centros_custo"
    ON centros_custo FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

-- ============================================================
-- 2. Plano de Contas (bÃ¡sico, suficiente para Contas a Receber)
-- ============================================================
CREATE TABLE IF NOT EXISTS plano_contas (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id_tenant UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    codigo VARCHAR(50) NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    tipo_conta VARCHAR(50) NOT NULL, -- 'ATIVO', 'PASSIVO', 'RECEITA', 'DESPESA'
    nivel INTEGER NOT NULL,
    id_pai UUID REFERENCES plano_contas(id) ON DELETE SET NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    centro_custo_id UUID REFERENCES centros_custo(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_plano_contas_tenant_id_codigo
    ON plano_contas (cliente_id_tenant, codigo);

CREATE INDEX IF NOT EXISTS idx_plano_contas_id_pai
    ON plano_contas (id_pai);

ALTER TABLE plano_contas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total plano_contas"
    ON plano_contas FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

-- ============================================================
-- 3. CONTAS A RECEBER
--    Usa clientes_cadastros como cliente da venda/nota
-- ============================================================

-- 3.1. Tabela principal: contas_receber
CREATE TABLE IF NOT EXISTS contas_receber (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    -- Tenant
    cliente_id_tenant UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,

    -- Cliente da confecÃ§Ã£o (jÃ¡ existente no sistema)
    cliente_id UUID NOT NULL REFERENCES clientes_cadastros(id) ON DELETE RESTRICT,

    documento VARCHAR(50) NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    data_emissao DATE NOT NULL,
    data_vencimento_original DATE NOT NULL,
    valor_original NUMERIC(15,2) NOT NULL,
    observacoes TEXT,
    status VARCHAR(50) NOT NULL, -- 'Pendente', 'Parcialmente Recebido', 'Recebido', 'Cancelado'

    centro_custo_id UUID NOT NULL REFERENCES centros_custo(id) ON DELETE RESTRICT,
    plano_contas_id_ativo UUID NOT NULL REFERENCES plano_contas(id) ON DELETE RESTRICT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contas_receber_tenant_cliente_status
    ON contas_receber (cliente_id_tenant, cliente_id, status);

CREATE INDEX IF NOT EXISTS idx_contas_receber_data_vencimento
    ON contas_receber (data_vencimento_original);

ALTER TABLE contas_receber ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total contas_receber"
    ON contas_receber FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

-- 3.2. Parcelas de Contas a Receber
CREATE TABLE IF NOT EXISTS parcelas_contas_receber (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    cliente_id_tenant UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    conta_receber_id UUID NOT NULL REFERENCES contas_receber(id) ON DELETE CASCADE,

    numero_parcela INTEGER NOT NULL,
    data_vencimento DATE NOT NULL,
    valor_parcela_original NUMERIC(15,2) NOT NULL,
    valor_recebido NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    valor_juros NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    valor_desconto NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    valor_multa NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    saldo_a_receber NUMERIC(15,2) NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'Pendente', 'Parcialmente Recebido', 'Recebido', 'Atrasado'

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE (conta_receber_id, numero_parcela)
);

CREATE INDEX IF NOT EXISTS idx_parcelas_cr_conta_receber
    ON parcelas_contas_receber (conta_receber_id);

CREATE INDEX IF NOT EXISTS idx_parcelas_cr_data_vencimento_status
    ON parcelas_contas_receber (data_vencimento, status);

ALTER TABLE parcelas_contas_receber ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total parcelas_contas_receber"
    ON parcelas_contas_receber FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

-- 3.3. Recebimentos de Contas a Receber
-- Usa tipo_pagamento (jÃ¡ existente) para forma de recebimento
CREATE TABLE IF NOT EXISTS recebimentos_contas_receber (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    cliente_id_tenant UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    parcela_cr_id UUID NOT NULL REFERENCES parcelas_contas_receber(id) ON DELETE CASCADE,

    data_recebimento TIMESTAMP WITH TIME ZONE NOT NULL,
    valor_recebido NUMERIC(15,2) NOT NULL,
    valor_juros_aplicado NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    valor_desconto_aplicado NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    valor_multa_aplicada NUMERIC(15,2) NOT NULL DEFAULT 0.00,

    tipo_pagamento_id UUID NOT NULL REFERENCES tipo_pagamento(id) ON DELETE RESTRICT,
    observacoes TEXT,
    plano_contas_id_caixa UUID NOT NULL REFERENCES plano_contas(id) ON DELETE RESTRICT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recebimentos_cr_parcela
    ON recebimentos_contas_receber (parcela_cr_id);

CREATE INDEX IF NOT EXISTS idx_recebimentos_cr_data_recebimento
    ON recebimentos_contas_receber (data_recebimento);

ALTER TABLE recebimentos_contas_receber ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total recebimentos_contas_receber"
    ON recebimentos_contas_receber FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

-- 3.4. Log de Juros/Descontos em Recebimentos
CREATE TABLE IF NOT EXISTS juros_desconto_receber_log (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    cliente_id_tenant UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    recebimento_cr_id UUID NOT NULL REFERENCES recebimentos_contas_receber(id) ON DELETE CASCADE,

    data_evento TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    tipo_evento VARCHAR(100) NOT NULL, -- 'JUROS_APLICADO', 'DESCONTO_CONCEDIDO', 'MULTA_APLICADA'
    valor_afetado NUMERIC(15,2) NOT NULL,
    detalhes TEXT
);

CREATE INDEX IF NOT EXISTS idx_juros_desconto_cr_recebimento
    ON juros_desconto_receber_log (recebimento_cr_id);

ALTER TABLE juros_desconto_receber_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total juros_desconto_receber_log"
    ON juros_desconto_receber_log FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

-- ============================================================
-- 4. MovimentaÃ§Ãµes de Fluxo de Caixa (ENTRADA/SAÃDA, projetado/realizado)
--    Usado por Contas a Receber (e futuramente Contas a Pagar)
-- ============================================================
CREATE TABLE IF NOT EXISTS movimentacoes_fluxo_caixa (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    cliente_id_tenant UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,

    data_movimentacao DATE NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    valor NUMERIC(15,2) NOT NULL,
    tipo_movimento VARCHAR(50) NOT NULL, -- 'ENTRADA', 'SAIDA'
    status VARCHAR(50) NOT NULL,         -- 'PROJETADO', 'REALIZADO'

    plano_contas_id UUID NOT NULL REFERENCES plano_contas(id) ON DELETE RESTRICT,
    centro_custo_id UUID NOT NULL REFERENCES centros_custo(id) ON DELETE RESTRICT,

    -- ligaÃ§Ãµes com contas a pagar/receber (apenas CR implementado agora)
    conta_pagar_id UUID,                 -- reservado para CP futuro
    conta_receber_id UUID REFERENCES contas_receber(id) ON DELETE SET NULL,
    pagamento_cp_id UUID,                -- reservado para CP futuro
    recebimento_cr_id UUID REFERENCES recebimentos_contas_receber(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_mov_fc_tenant_data_status
    ON movimentacoes_fluxo_caixa (cliente_id_tenant, data_movimentacao, status);

CREATE INDEX IF NOT EXISTS idx_mov_fc_plano_contas
    ON movimentacoes_fluxo_caixa (plano_contas_id);

CREATE INDEX IF NOT EXISTS idx_mov_fc_centro_custo
    ON movimentacoes_fluxo_caixa (centro_custo_id);

ALTER TABLE movimentacoes_fluxo_caixa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total movimentacoes_fluxo_caixa"
    ON movimentacoes_fluxo_caixa FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

-- ============================================================
-- 5. DRE (DemonstraÃ§Ã£o de Resultado) com Centro de Custo
--    Tabelas: periodos_dre, grupos_dre, linhas_dre
-- ============================================================

-- 5.1. PerÃ­odos da DRE
CREATE TABLE IF NOT EXISTS periodos_dre (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    cliente_id_tenant UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,

    ano INTEGER NOT NULL,
    mes INTEGER, -- NULL para DRE anual
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'ABERTO', 'FECHADO'

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_periodos_dre_tenant_ano_mes
    ON periodos_dre (cliente_id_tenant, ano, mes);

ALTER TABLE periodos_dre ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total periodos_dre"
    ON periodos_dre FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

-- 5.2. Grupos da DRE (Receita Bruta, Custos, Despesas, etc.)
CREATE TABLE IF NOT EXISTS grupos_dre (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    cliente_id_tenant UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,

    nome VARCHAR(100) NOT NULL,
    tipo_grupo VARCHAR(50) NOT NULL, -- 'RECEITA', 'CUSTO', 'DESPESA', 'RESULTADO'
    ordem INTEGER NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grupos_dre_tenant_nome
    ON grupos_dre (cliente_id_tenant, nome);

ALTER TABLE grupos_dre ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total grupos_dre"
    ON grupos_dre FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

-- 5.3. Linhas da DRE (valores consolidados, com opcional centro de custo)
CREATE TABLE IF NOT EXISTS linhas_dre (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    cliente_id_tenant UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,

    periodo_dre_id UUID NOT NULL REFERENCES periodos_dre(id) ON DELETE CASCADE,
    grupo_dre_id UUID NOT NULL REFERENCES grupos_dre(id) ON DELETE CASCADE,
    plano_contas_id UUID REFERENCES plano_contas(id) ON DELETE SET NULL,

    valor_realizado NUMERIC(15,2) NOT NULL,
    valor_projetado NUMERIC(15,2) NOT NULL,

    centro_custo_id UUID REFERENCES centros_custo(id) ON DELETE SET NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_linhas_dre_tenant_periodo_grupo_cc
    ON linhas_dre (cliente_id_tenant, periodo_dre_id, grupo_dre_id, centro_custo_id);

ALTER TABLE linhas_dre ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total linhas_dre"
    ON linhas_dre FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

-- ============================================================
-- 6. CONTAS A PAGAR
--    Usa fornecedores_cadastros como cadastro de fornecedores
-- ============================================================

-- 6.1. Tabela principal: contas_pagar
CREATE TABLE IF NOT EXISTS contas_pagar (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    -- Tenant
    cliente_id_tenant UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,

    -- Fornecedor (jÃ¡ existente no sistema)
    id_fornecedor UUID NOT NULL REFERENCES fornecedores_cadastros(id) ON DELETE RESTRICT,

    documento VARCHAR(50) NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    data_emissao DATE NOT NULL,
    data_vencimento_original DATE NOT NULL,
    valor_original NUMERIC(15,2) NOT NULL,
    observacoes TEXT,
    status VARCHAR(50) NOT NULL, -- 'Pendente', 'Parcialmente Pago', 'Pago', 'Cancelado'

    centro_custo_id UUID NOT NULL REFERENCES centros_custo(id) ON DELETE RESTRICT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contas_pagar_tenant_fornecedor_status
    ON contas_pagar (cliente_id_tenant, id_fornecedor, status);

CREATE INDEX IF NOT EXISTS idx_contas_pagar_data_vencimento
    ON contas_pagar (data_vencimento_original);

ALTER TABLE contas_pagar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total contas_pagar"
    ON contas_pagar FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

-- 6.2. Parcelas de Contas a Pagar
CREATE TABLE IF NOT EXISTS parcelas_contas_pagar (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    cliente_id_tenant UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    conta_pagar_id UUID NOT NULL REFERENCES contas_pagar(id) ON DELETE CASCADE,

    numero_parcela INTEGER NOT NULL,
    data_vencimento DATE NOT NULL,
    valor_parcela_original NUMERIC(15,2) NOT NULL,
    valor_pago NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    valor_juros NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    valor_desconto NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    valor_multa NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    saldo_devedor NUMERIC(15,2) NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'Pendente', 'Parcialmente Pago', 'Pago', 'Atrasado'

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE (conta_pagar_id, numero_parcela)
);

CREATE INDEX IF NOT EXISTS idx_parcelas_cp_conta_pagar
    ON parcelas_contas_pagar (conta_pagar_id);

CREATE INDEX IF NOT EXISTS idx_parcelas_cp_data_vencimento_status
    ON parcelas_contas_pagar (data_vencimento, status);

ALTER TABLE parcelas_contas_pagar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total parcelas_contas_pagar"
    ON parcelas_contas_pagar FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

-- 6.3. Pagamentos de Contas a Pagar
-- Usa tipo_pagamento (jÃ¡ existente) para forma de pagamento
CREATE TABLE IF NOT EXISTS pagamentos_contas_pagar (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    cliente_id_tenant UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    parcela_cp_id UUID NOT NULL REFERENCES parcelas_contas_pagar(id) ON DELETE CASCADE,

    data_pagamento TIMESTAMP WITH TIME ZONE NOT NULL,
    valor_pago NUMERIC(15,2) NOT NULL,
    valor_juros_aplicado NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    valor_desconto_aplicado NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    valor_multa_aplicada NUMERIC(15,2) NOT NULL DEFAULT 0.00,

    tipo_pagamento_id UUID NOT NULL REFERENCES tipo_pagamento(id) ON DELETE RESTRICT,
    observacoes TEXT,
    plano_contas_id_caixa UUID NOT NULL REFERENCES plano_contas(id) ON DELETE RESTRICT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_cp_parcela
    ON pagamentos_contas_pagar (parcela_cp_id);

CREATE INDEX IF NOT EXISTS idx_pagamentos_cp_data_pagamento
    ON pagamentos_contas_pagar (data_pagamento);

ALTER TABLE pagamentos_contas_pagar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total pagamentos_contas_pagar"
    ON pagamentos_contas_pagar FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

-- 6.4. HistÃ³rico de eventos de pagamento (estornos, ajustes, renegociaÃ§Ãµes)
CREATE TABLE IF NOT EXISTS historico_pagamentos_cp (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    cliente_id_tenant UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    pagamento_cp_id UUID NOT NULL REFERENCES pagamentos_contas_pagar(id) ON DELETE CASCADE,

    data_evento TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    tipo_evento VARCHAR(100) NOT NULL, -- 'ESTORNO', 'RENEGOCIACAO', 'AJUSTE', etc.
    detalhes_evento TEXT
);

CREATE INDEX IF NOT EXISTS idx_historico_cp_pagamento
    ON historico_pagamentos_cp (pagamento_cp_id);

ALTER TABLE historico_pagamentos_cp ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total historico_pagamentos_cp"
    ON historico_pagamentos_cp FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

-- Ajuste em movimentacoes_fluxo_caixa para ligar corretamente com Contas a Pagar
ALTER TABLE movimentacoes_fluxo_caixa
    ADD COLUMN IF NOT EXISTS conta_pagar_id UUID REFERENCES contas_pagar(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS pagamento_cp_id UUID REFERENCES pagamentos_contas_pagar(id) ON DELETE SET NULL;



-- =============================================================================
-- SOURCE: frontend/database/contas_correntes_schema.sql
-- =============================================================================
-- ============================================================
-- MÃ“DULO DE CONTAS CORRENTES
-- ============================================================

-- 1. Tabela de Contas Correntes
CREATE TABLE IF NOT EXISTS contas_correntes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id_tenant UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    
    codigo SERIAL, -- NÃºmero sequencial automÃ¡tico
    descricao VARCHAR(255) NOT NULL,
    banco VARCHAR(100),
    agencia VARCHAR(20),
    digito_ag VARCHAR(5),
    conta_corrente VARCHAR(20),
    digito_conta VARCHAR(5),
    convenio VARCHAR(50),
    codigo_cedente VARCHAR(50),
    modalidade_variacao VARCHAR(50), -- EspecÃ­fico BB
    operacao VARCHAR(20),
    cobranca_caixa VARCHAR(50),
    tipo_cobranca VARCHAR(50),
    carteira_cobranca VARCHAR(50),
    
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS para Contas Correntes
ALTER TABLE contas_correntes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total contas_correntes"
    ON contas_correntes FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

-- 2. Colunas de ligaÃ§Ã£o nos mÃ³dulos financeiros
ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS conta_corrente_id UUID REFERENCES contas_correntes(id) ON DELETE SET NULL;
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS conta_corrente_id UUID REFERENCES contas_correntes(id) ON DELETE SET NULL;
ALTER TABLE movimentacoes_fluxo_caixa ADD COLUMN IF NOT EXISTS conta_corrente_id UUID REFERENCES contas_correntes(id) ON DELETE SET NULL;

-- Ãndices para performance
CREATE INDEX IF NOT EXISTS idx_contas_correntes_tenant ON contas_correntes(cliente_id_tenant);
CREATE INDEX IF NOT EXISTS idx_contas_receber_conta_corrente ON contas_receber(conta_corrente_id);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_conta_corrente ON contas_pagar(conta_corrente_id);
CREATE INDEX IF NOT EXISTS idx_mov_fc_conta_corrente ON movimentacoes_fluxo_caixa(conta_corrente_id);


-- =============================================================================
-- SOURCE: frontend/database/contas_correntes_link_existing.sql
-- =============================================================================
-- ============================================================
-- VINCULAR REGISTROS EXISTENTES Ã€S CONTAS CORRENTES
-- ============================================================

-- 1. Atualiza as movimentaÃ§Ãµes de fluxo de caixa existentes 
-- vinculando-as ao conta_corrente_id definido no Contas a Receber
UPDATE movimentacoes_fluxo_caixa m
SET conta_corrente_id = c.conta_corrente_id
FROM contas_receber c
WHERE m.conta_receber_id = c.id
AND m.conta_corrente_id IS NULL
AND c.conta_corrente_id IS NOT NULL;

-- 2. Atualiza as movimentaÃ§Ãµes de fluxo de caixa existentes 
-- vinculando-as ao conta_corrente_id definido no Contas a Pagar
UPDATE movimentacoes_fluxo_caixa m
SET conta_corrente_id = c.conta_corrente_id
FROM contas_pagar c
WHERE m.conta_pagar_id = c.id
AND m.conta_corrente_id IS NULL
AND c.conta_corrente_id IS NOT NULL;


-- =============================================================================
-- SOURCE: frontend/database/migration_contas_correntes_saldo_inicial.sql
-- =============================================================================
-- ============================================================
-- Migration: adiciona saldo inicial e data Ã  conta corrente
-- ============================================================

-- Valor do saldo em caixa ao criar a conta (equivalente a uma entrada inicial)
ALTER TABLE contas_correntes
    ADD COLUMN IF NOT EXISTS saldo_inicial NUMERIC(15,2) NOT NULL DEFAULT 0;

-- Data de referÃªncia do saldo inicial; quando NULL usa-se created_at
ALTER TABLE contas_correntes
    ADD COLUMN IF NOT EXISTS saldo_inicial_data DATE NULL;

-- Popula saldo_inicial_data com a data de criaÃ§Ã£o nos registros jÃ¡ existentes
-- (opcional â€“ sÃ³ afeta linhas onde saldo_inicial > 0 e data ainda Ã© NULL)
UPDATE contas_correntes
SET saldo_inicial_data = created_at::date
WHERE saldo_inicial > 0
  AND saldo_inicial_data IS NULL;


-- =============================================================================
-- SOURCE: frontend/database/migration_finance_empresa_id.sql
-- =============================================================================
-- Adicionar coluna empresa_id em contas_receber e contas_pagar
ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE SET NULL;
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE SET NULL;

-- Criar Ã­ndices para performance
CREATE INDEX IF NOT EXISTS idx_contas_receber_empresa_id ON contas_receber(empresa_id);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_empresa_id ON contas_pagar(empresa_id);


-- =============================================================================
-- SOURCE: frontend/database/migration_cash_flow_empresa_id.sql
-- =============================================================================
-- MigraÃ§Ã£o para adicionar empresa_id na tabela de movimentaÃ§Ãµes do fluxo de caixa
ALTER TABLE movimentacoes_fluxo_caixa 
ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE SET NULL;

-- Criar Ã­ndice para performance de filtros por empresa
CREATE INDEX IF NOT EXISTS idx_movimentacoes_fluxo_caixa_empresa_id 
ON movimentacoes_fluxo_caixa(empresa_id);

-- Opcional: Tentar preencher empresa_id retroativamente a partir das tabelas vinculadas
UPDATE movimentacoes_fluxo_caixa m
SET empresa_id = cr.empresa_id
FROM contas_receber cr
WHERE m.conta_receber_id = cr.id
AND m.empresa_id IS NULL;

-- Para contas_pagar (apÃ³s a implementaÃ§Ã£o total)
UPDATE movimentacoes_fluxo_caixa m
SET empresa_id = cp.empresa_id
FROM contas_pagar cp
WHERE m.conta_pagar_id = cp.id
AND m.empresa_id IS NULL;


-- =============================================================================
-- SOURCE: frontend/database/migration_add_codigo_pedido_vinculado_contas_receber.sql
-- =============================================================================
-- ============================================================
-- Migration: vincular contas_receber ao cÃ³digo do pedido
-- ============================================================

ALTER TABLE contas_receber
ADD COLUMN IF NOT EXISTS codigo_pedido_vinculado VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_contas_receber_codigo_pedido_vinculado
ON contas_receber(codigo_pedido_vinculado);



-- =============================================================================
-- SOURCE: frontend/database/migration_installment_numbering.sql
-- =============================================================================
-- ============================================================
-- MIGRATION: Fix installment numbering unique constraint
-- ============================================================

-- 1. Contas a Receber
ALTER TABLE parcelas_contas_receber 
DROP CONSTRAINT IF EXISTS parcelas_contas_receber_conta_receber_id_numero_parcela_key;

-- Se o nome da constraint for outro (gerado automaticamente pelo Supabase/Postgres)
-- Tentamos dropar pela definiÃ§Ã£o se o nome acima falhar ou nÃ£o for o padrÃ£o
-- Nota: O padrÃ£o costuma ser {tabela}_{colunas}_key

ALTER TABLE parcelas_contas_receber
ADD CONSTRAINT unique_parcela_por_forma_cr 
UNIQUE (conta_receber_id, forma_pagamento_indice, numero_parcela);


-- 2. Contas a Pagar
ALTER TABLE parcelas_contas_pagar
DROP CONSTRAINT IF EXISTS parcelas_contas_pagar_id_conta_pagar_numero_parcela_key;

-- Tentativa GenÃ©rica caso o nome varie
-- No schema original: UNIQUE (id_conta_pagar, numero_parcela)
-- No schema atualizado: UNIQUE (conta_pagar_id, numero_parcela)

ALTER TABLE parcelas_contas_pagar 
ADD CONSTRAINT unique_parcela_por_forma_cp
UNIQUE (conta_pagar_id, forma_pagamento_indice, numero_parcela);


-- =============================================================================
-- SOURCE: frontend/database/migration_parcelas_grouping.sql
-- =============================================================================

-- MIGRATION: Preserve installment grouping in financial forms
-- This migration adds columns to store why each installment was created (which block/condition)

-- 1. Contas a Receber
ALTER TABLE parcelas_contas_receber 
ADD COLUMN IF NOT EXISTS condicao_pagamento_id UUID REFERENCES condicao_pagamento(id),
ADD COLUMN IF NOT EXISTS forma_pagamento_indice INTEGER DEFAULT 0;

-- 2. Contas a Pagar
ALTER TABLE parcelas_contas_pagar
ADD COLUMN IF NOT EXISTS condicao_pagamento_id UUID REFERENCES condicao_pagamento(id),
ADD COLUMN IF NOT EXISTS forma_pagamento_indice INTEGER DEFAULT 0;

-- Comments for documentation
COMMENT ON COLUMN parcelas_contas_receber.condicao_pagamento_id IS 'ID da condiÃ§Ã£o de pagamento original';
COMMENT ON COLUMN parcelas_contas_receber.forma_pagamento_indice IS 'Ãndice do bloco de forma de pagamento no formulÃ¡rio';
COMMENT ON COLUMN parcelas_contas_pagar.condicao_pagamento_id IS 'ID da condiÃ§Ã£o de pagamento original';
COMMENT ON COLUMN parcelas_contas_pagar.forma_pagamento_indice IS 'Ãndice do bloco de forma de pagamento no formulÃ¡rio';


-- =============================================================================
-- SOURCE: frontend/database/migration_contas_pagar_passivo_nullable.sql
-- =============================================================================
-- Corrige erro 23502 ao inserir contas_pagar sem plano_contas_id_passivo (importaÃ§Ã£o XML, faccionista, etc.).
-- O app deixou de enviar essa coluna. Rode este script no Supabase SQL Editor se a coluna ainda existir com NOT NULL.
--
-- Depois de validar, vocÃª pode rodar migration_remove_contas_pagar_passivo.sql para remover a coluna e alinhar views/funÃ§Ã£o DRE.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'contas_pagar'
          AND column_name = 'plano_contas_id_passivo'
    ) THEN
        ALTER TABLE public.contas_pagar
            ALTER COLUMN plano_contas_id_passivo DROP NOT NULL;
    END IF;
END $$;


-- =============================================================================
-- SOURCE: frontend/database/migration_remove_contas_pagar_passivo.sql
-- =============================================================================
-- Remove plano_contas_id_passivo de contas_pagar (nÃ£o usado mais no app).
-- Rode apÃ³s backups. Recria vw_dre_financeiro e fn_gerar_dre_profissional sem essa coluna.
--
-- Se o insert ainda falhar com 23502 (NOT NULL em plano_contas_id_passivo), rode antes:
--   frontend/database/migration_contas_pagar_passivo_nullable.sql

DROP VIEW IF EXISTS vw_dre_financeiro;

ALTER TABLE contas_pagar DROP COLUMN IF EXISTS plano_contas_id_passivo;

CREATE OR REPLACE VIEW vw_dre_financeiro AS
SELECT
    'RECEITA' AS natureza,
    cr.cliente_id_tenant,
    cr.empresa_id,
    pcr.data_vencimento AS data_referencia,
    pcr.valor_parcela_original AS valor,
    pcr.status,
    cr.plano_contas_id_ativo AS plano_conta_id,
    pc.codigo AS plano_conta_codigo,
    pc.descricao AS plano_conta_descricao,
    pc.tipo_conta AS plano_conta_tipo
FROM parcelas_contas_receber pcr
JOIN contas_receber cr ON cr.id = pcr.conta_receber_id
LEFT JOIN plano_contas pc ON pc.id = cr.plano_contas_id_ativo
UNION ALL
SELECT
    'DESPESA' AS natureza,
    cp.cliente_id_tenant,
    cp.empresa_id,
    pcp.data_vencimento AS data_referencia,
    pcp.valor_parcela_original AS valor,
    pcp.status,
    NULL::uuid AS plano_conta_id,
    NULL::varchar AS plano_conta_codigo,
    NULL::varchar AS plano_conta_descricao,
    NULL::varchar AS plano_conta_tipo
FROM parcelas_contas_pagar pcp
JOIN contas_pagar cp ON cp.id = pcp.conta_pagar_id;

GRANT SELECT ON vw_dre_financeiro TO authenticated;
GRANT SELECT ON vw_dre_financeiro TO anon;

CREATE OR REPLACE FUNCTION fn_gerar_dre_profissional(
    p_cliente_id_tenant UUID,
    p_data_inicio DATE,
    p_data_fim DATE,
    p_empresa_id UUID DEFAULT NULL
)
RETURNS TABLE (
    ordem INTEGER,
    grupo_nome TEXT,
    valor NUMERIC,
    nivel INTEGER,
    estilo TEXT
) AS $$
DECLARE
    v_receita_bruta NUMERIC := 0;
    v_deducoes NUMERIC := 0;
    v_receita_liquida NUMERIC := 0;
    v_cpv NUMERIC := 0;
    v_lucro_bruto NUMERIC := 0;
    v_despesas_op NUMERIC := 0;
    v_ebitda NUMERIC := 0;
    v_resultado_financeiro NUMERIC := 0;
    v_lucro_liquido NUMERIC := 0;
BEGIN
    SELECT COALESCE(SUM(vi.valor_total), 0)
    INTO v_receita_bruta
    FROM venda_itens vi
    JOIN venda v ON v.id = vi.venda_id
    WHERE v.cliente_id_tenant = p_cliente_id_tenant
      AND v.tipo = 'Pedido'
      AND v.created_at::DATE BETWEEN p_data_inicio AND p_data_fim
      AND (p_empresa_id IS NULL OR v.empresa_id = p_empresa_id);

    SELECT COALESCE(SUM(v.desconto_valor), 0)
    INTO v_deducoes
    FROM venda v
    WHERE v.cliente_id_tenant = p_cliente_id_tenant
      AND v.tipo = 'Pedido'
      AND v.created_at::DATE BETWEEN p_data_inicio AND p_data_fim
      AND (p_empresa_id IS NULL OR v.empresa_id = p_empresa_id);

    v_receita_liquida := v_receita_bruta - v_deducoes;

    SELECT COALESCE(SUM(vi.quantidade * pc.custo_total_unitario), 0)
    INTO v_cpv
    FROM venda_itens vi
    JOIN venda v ON v.id = vi.venda_id
    JOIN vw_produto_custo_estimado pc ON pc.produto_id = vi.produto_id
    WHERE v.cliente_id_tenant = p_cliente_id_tenant
      AND v.tipo = 'Pedido'
      AND v.created_at::DATE BETWEEN p_data_inicio AND p_data_fim
      AND (p_empresa_id IS NULL OR v.empresa_id = p_empresa_id);

    v_lucro_bruto := v_receita_liquida - v_cpv;

    SELECT COALESCE(SUM(pcp.valor_parcela_original), 0)
    INTO v_despesas_op
    FROM parcelas_contas_pagar pcp
    JOIN contas_pagar cp ON cp.id = pcp.conta_pagar_id
    WHERE cp.cliente_id_tenant = p_cliente_id_tenant
      AND pcp.data_vencimento BETWEEN p_data_inicio AND p_data_fim
      AND (p_empresa_id IS NULL OR cp.empresa_id = p_empresa_id);

    v_ebitda := v_lucro_bruto - v_despesas_op;
    v_resultado_financeiro := 0;
    v_lucro_liquido := v_ebitda + v_resultado_financeiro;

    ordem := 1; grupo_nome := '1. RECEITA BRUTA'; valor := v_receita_bruta; nivel := 1; estilo := 'negrito'; RETURN NEXT;
    ordem := 2; grupo_nome := '   (-) DeduÃ§Ãµes e Descontos'; valor := -v_deducoes; nivel := 2; estilo := 'normal'; RETURN NEXT;
    ordem := 3; grupo_nome := '2. (=) RECEITA LÃQUIDA'; valor := v_receita_liquida; nivel := 1; estilo := 'total'; RETURN NEXT;
    ordem := 4; grupo_nome := '   (-) Custo dos Produtos Vendidos (CPV)'; valor := -v_cpv; nivel := 2; estilo := 'normal'; RETURN NEXT;
    ordem := 5; grupo_nome := '3. (=) LUCRO BRUTO'; valor := v_lucro_bruto; nivel := 1; estilo := 'total'; RETURN NEXT;
    ordem := 6; grupo_nome := '   (-) Despesas Operacionais (Administrativas/Vendas)'; valor := -v_despesas_op; nivel := 2; estilo := 'normal'; RETURN NEXT;
    ordem := 7; grupo_nome := '4. (=) RESULTADO OPERACIONAL (EBITDA)'; valor := v_ebitda; nivel := 1; estilo := 'total'; RETURN NEXT;
    ordem := 8; grupo_nome := '5. (=) RESULTADO LÃQUIDO DO EXERCÃCIO'; valor := v_lucro_liquido; nivel := 1; estilo := 'resultado'; RETURN NEXT;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- SOURCE: frontend/database/migration_previsoes_financeiras.sql
-- =============================================================================
-- MÃ³dulo de PrevisÃµes Financeiras
-- Matriz de OrÃ§amentos (Ano x Meses x Centros de Custo x Plano de Contas)

-- 1. CriaÃ§Ã£o da Tabela Principal
CREATE TABLE IF NOT EXISTS public.previsoes_financeiras (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id_tenant UUID NOT NULL REFERENCES public.clientes_azoup(id) ON DELETE CASCADE,
    centro_custo_id UUID NOT NULL REFERENCES public.centros_custo(id) ON DELETE CASCADE,
    plano_contas_id UUID NOT NULL REFERENCES public.plano_contas(id) ON DELETE CASCADE,
    ano INTEGER NOT NULL,
    mes INTEGER NOT NULL CHECK (mes >= 1 AND mes <= 12),
    valor NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uk_previsao_unica UNIQUE (cliente_id_tenant, centro_custo_id, plano_contas_id, ano, mes)
);

-- 2. Habilitar seguranÃ§a a nÃ­vel de linha (Row Level Security)
ALTER TABLE public.previsoes_financeiras ENABLE ROW LEVEL SECURITY;

-- 3. PolÃ­ticas de SeguranÃ§a (Tenants)
CREATE POLICY "Acesso total previsoes_financeiras"
    ON previsoes_financeiras FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

-- 4. FunÃ§Ã£o para auto-atualizar o campo updated_at
CREATE OR REPLACE FUNCTION update_previsoes_financeiras_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Verifica e cria a trigger caso nÃ£o exista
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_previsoes_financeiras_updated_at'
    ) THEN
        CREATE TRIGGER trg_previsoes_financeiras_updated_at
            BEFORE UPDATE ON public.previsoes_financeiras
            FOR EACH ROW
            EXECUTE FUNCTION update_previsoes_financeiras_updated_at();
    END IF;
END
$$;

-- 5. Criar Ãndices de performance para relatÃ³rios
CREATE INDEX IF NOT EXISTS idx_previsoes_ano_mes ON public.previsoes_financeiras(ano, mes);
CREATE INDEX IF NOT EXISTS idx_previsoes_centro_custo ON public.previsoes_financeiras(centro_custo_id);
CREATE INDEX IF NOT EXISTS idx_previsoes_plano_contas ON public.previsoes_financeiras(plano_contas_id);


-- =============================================================================
-- SOURCE: frontend/database/migration_previsoes_financeiras_empresa_id.sql
-- =============================================================================
-- PrevisÃµes financeiras por empresa: coluna empresa_id, backfill e novo UNIQUE.
-- Execute no Supabase SQL Editor (ou psql) apÃ³s existir a tabela previsoes_financeiras e empresas.

-- 1) Coluna (inicialmente nullable para backfill)
ALTER TABLE public.previsoes_financeiras
    ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE;

-- 2) Atribuir cada linha existente Ã  primeira empresa do mesmo tenant (ordenada por razÃ£o social)
UPDATE public.previsoes_financeiras pf
SET empresa_id = (
    SELECT e2.id
    FROM public.empresas e2
    WHERE e2.cliente_id = pf.cliente_id_tenant
    ORDER BY e2.razao_social NULLS LAST, e2.id
    LIMIT 1
)
WHERE pf.empresa_id IS NULL;

-- 3) Linhas Ã³rfÃ£s (tenant sem empresa cadastrada): removidas â€” nÃ£o hÃ¡ como satisfazer NOT NULL
DELETE FROM public.previsoes_financeiras WHERE empresa_id IS NULL;

-- 4) Remover UNIQUE antigo (sem empresa)
ALTER TABLE public.previsoes_financeiras DROP CONSTRAINT IF EXISTS uk_previsao_unica;

-- 5) ObrigatÃ³rio por linha
ALTER TABLE public.previsoes_financeiras ALTER COLUMN empresa_id SET NOT NULL;

-- 6) Uma meta por (tenant, empresa, centro, plano, ano, mÃªs)
ALTER TABLE public.previsoes_financeiras
    ADD CONSTRAINT uk_previsao_unica_empresa
    UNIQUE (cliente_id_tenant, empresa_id, centro_custo_id, plano_contas_id, ano, mes);

CREATE INDEX IF NOT EXISTS idx_previsoes_empresa ON public.previsoes_financeiras(empresa_id);

COMMENT ON COLUMN public.previsoes_financeiras.empresa_id IS 'Empresa Ã  qual o orÃ§amento previsto se aplica.';


-- =============================================================================
-- SOURCE: frontend/database/migration_coa_rollup.sql
-- =============================================================================
-- ==========================================================
-- MIGRATION: PLANO DE CONTAS - HIERARQUIA & ROLL-UP
-- ==========================================================

-- 1. AdiÃ§Ã£o da coluna de caminho (Materialized Path)
ALTER TABLE public.plano_contas 
ADD COLUMN IF NOT EXISTS path TEXT;

-- 2. FunÃ§Ã£o para atualizar o nÃ­vel e caminho automaticamente
CREATE OR REPLACE FUNCTION public.fn_update_plano_contas_path()
RETURNS TRIGGER AS $$
DECLARE
    v_parent_path TEXT;
    v_parent_nivel INT;
BEGIN
    IF NEW.id_pai IS NULL THEN
        NEW.path := NEW.id::TEXT;
        NEW.nivel := 1;
    ELSE
        SELECT path, nivel INTO v_parent_path, v_parent_nivel 
        FROM public.plano_contas 
        WHERE id = NEW.id_pai;
        
        IF v_parent_path IS NULL THEN
            -- Caso o pai ainda nÃ£o tenha path (correÃ§Ã£o de dados antigos)
            NEW.path := NEW.id_pai::TEXT || '/' || NEW.id::TEXT;
            NEW.nivel := 2;
        ELSE
            NEW.path := v_parent_path || '/' || NEW.id::TEXT;
            NEW.nivel := v_parent_nivel + 1;
        END IF;

        -- Previne loops (uma conta nÃ£o pode ser pai de si mesma nem de seus ancestrais)
        IF NEW.id_pai = NEW.id OR v_parent_path LIKE '%' || NEW.id::TEXT || '%' THEN
            RAISE EXCEPTION 'Erro de Hierarquia: Loop detectado (id % jÃ¡ estÃ¡ presente no caminho do pai).', NEW.id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger para manter caminho e nÃ­vel sempre atualizados
DROP TRIGGER IF EXISTS trg_update_plano_contas_path ON public.plano_contas;
CREATE TRIGGER trg_update_plano_contas_path
BEFORE INSERT OR UPDATE OF id_pai ON public.plano_contas
FOR EACH ROW
EXECUTE FUNCTION public.fn_update_plano_contas_path();

-- 4. FunÃ§Ã£o para recalcular todos os paths existentes (Migration)
CREATE OR REPLACE FUNCTION public.fn_reset_all_plano_contas_paths()
RETURNS VOID AS $$
BEGIN
    -- Reseta os nÃ­veis de 1 a 10 para garantir ordem (limitado a 10 nÃ­veis para seguranÃ§a)
    FOR i IN 1..10 LOOP
        UPDATE public.plano_contas SET id_pai = id_pai WHERE nivel = i;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Executa o reset inicial para popular a coluna path nos dados atuais
SELECT public.fn_reset_all_plano_contas_paths();

-- 5. FunÃ§Ã£o de AgregaÃ§Ã£o Roll-up (Soma HierÃ¡rquica)
-- Esta funÃ§Ã£o retorna o total de uma conta E de todos os seus descendentes
CREATE OR REPLACE FUNCTION public.fn_get_plano_total_consolidado(
    p_conta_id UUID,
    p_data_inicio DATE,
    p_data_fim DATE,
    p_empresa_id UUID DEFAULT NULL
)
RETURNS NUMERIC AS $$
DECLARE
    v_sum NUMERIC;
    v_path TEXT;
BEGIN
    -- Busca o path da conta alvo
    SELECT path INTO v_path FROM public.plano_contas WHERE id = p_conta_id;
    
    -- Soma todas as movimentaÃ§Ãµes cujas contas tenham o path iniciado pelo path da conta alvo
    SELECT COALESCE(SUM(m.valor), 0) INTO v_sum
    FROM public.movimentacoes_fluxo_caixa m
    JOIN public.plano_contas pc ON m.plano_contas_id = pc.id
    WHERE (pc.path LIKE v_path || '%' OR pc.id = p_conta_id)
      AND m.data_movimentacao BETWEEN p_data_inicio AND p_data_fim
      AND (p_empresa_id IS NULL OR m.empresa_id = p_empresa_id);
      
    RETURN v_sum;
END;
$$ LANGUAGE plpgsql;

RAISE NOTICE 'Migration de Hierarquia & Roll-up concluÃ­da!';


-- =============================================================================
-- SOURCE: frontend/database/migration_dre_profissional.sql
-- =============================================================================
-- ============================================================
-- MÃ“DULO DRE PROFISSIONAL (REGIME DE COMPETÃŠNCIA)
-- 1. Vincular Vendas ao Financeiro
-- 2. Motor de CÃ¡lculo de Custos (BOM + MÃ£o de Obra)
-- 3. FunÃ§Ã£o Geradora de DRE Gerencial
-- ============================================================

-- 1. VINCULAR VENDAS AO FINANCEIRO
ALTER TABLE public.contas_receber 
ADD COLUMN IF NOT EXISTS venda_id BIGINT REFERENCES public.venda(id) ON DELETE SET NULL;

ALTER TABLE public.venda
ADD COLUMN IF NOT EXISTS plano_contas_id UUID REFERENCES public.plano_contas(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS centro_custo_id UUID REFERENCES public.centros_custo(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contas_receber_venda_id ON public.contas_receber(venda_id);
CREATE INDEX IF NOT EXISTS idx_venda_plano_contas_id ON public.venda(plano_contas_id);
CREATE INDEX IF NOT EXISTS idx_venda_centro_custo_id ON public.venda(centro_custo_id);

-- 2. MOTOR DE CÃLCULO DE CUSTOS (VIEW DE CUSTO MÃ‰DIO/ESTIMADO)

-- View para consolidar o custo de tecidos por ficha tÃ©cnica
CREATE OR REPLACE VIEW vw_custo_tecido_por_ficha AS
SELECT 
    ft.id as ficha_tecnica_id,
    ft.produto_id,
    SUM(
        CASE 
            WHEN c.tipo_consumo = 'geral' THEN c.consumo_geral * t.custo
            ELSE (SELECT AVG(consumo) FROM ficha_tecnica_consumo_tecido_tamanho WHERE consumo_tecido_id = c.id) * t.custo
        END
    ) as custo_tecido_total
FROM produto_ficha_tecnica ft
JOIN ficha_tecnica_consumo_tecido c ON c.ficha_tecnica_id = ft.id
JOIN tecidos t ON t.id = c.tecido_id
GROUP BY ft.id, ft.produto_id;

-- View para consolidar o custo de aviamentos por ficha tÃ©cnica
CREATE OR REPLACE VIEW vw_custo_aviamento_por_ficha AS
SELECT 
    ft.id as ficha_tecnica_id,
    ft.produto_id,
    SUM(
        CASE 
            WHEN c.tipo_consumo = 'geral' THEN c.consumo_geral * a.custo
            ELSE (SELECT AVG(consumo) FROM ficha_tecnica_consumo_aviamento_tamanho WHERE consumo_aviamento_id = c.id) * a.custo
        END
    ) as custo_aviamento_total
FROM produto_ficha_tecnica ft
JOIN ficha_tecnica_consumo_aviamento c ON c.ficha_tecnica_id = ft.id
JOIN aviamentos a ON a.id = c.aviamento_id
GROUP BY ft.id, ft.produto_id;

-- View consolidada de Custo de MÃ£o de Obra (fases)
CREATE OR REPLACE VIEW vw_custo_mao_obra_por_produto AS
SELECT 
    produto_id,
    SUM(custo_mao_obra) as custo_mao_obra_total
FROM produto_fase_custo
GROUP BY produto_id;

-- View Final de Custo Estimado do Produto
CREATE OR REPLACE VIEW vw_produto_custo_estimado AS
SELECT 
    p.id as produto_id,
    p.cliente_id,
    COALESCE(ct.custo_tecido_total, 0) as custo_tecido,
    COALESCE(ca.custo_aviamento_total, 0) as custo_aviamento,
    COALESCE(mo.custo_mao_obra_total, 0) as custo_mao_obra,
    (COALESCE(ct.custo_tecido_total, 0) + COALESCE(ca.custo_aviamento_total, 0) + COALESCE(mo.custo_mao_obra_total, 0)) as custo_total_unitario
FROM produtos p
LEFT JOIN vw_custo_tecido_por_ficha ct ON ct.produto_id = p.id
LEFT JOIN vw_custo_aviamento_por_ficha ca ON ca.produto_id = p.id
LEFT JOIN vw_custo_mao_obra_por_produto mo ON mo.produto_id = p.id;

-- 3. FUNÃ‡ÃƒO GERADORA DE DRE PROFISSIONAL

CREATE OR REPLACE FUNCTION fn_gerar_dre_profissional(
    p_cliente_id_tenant UUID,
    p_data_inicio DATE,
    p_data_fim DATE,
    p_empresa_id UUID DEFAULT NULL
)
RETURNS TABLE (
    ordem INTEGER,
    grupo_nome TEXT,
    valor NUMERIC,
    nivel INTEGER,
    estilo TEXT
) AS $$
DECLARE
    v_receita_bruta NUMERIC := 0;
    v_deducoes NUMERIC := 0;
    v_receita_liquida NUMERIC := 0;
    v_cpv NUMERIC := 0;
    v_lucro_bruto NUMERIC := 0;
    v_despesas_op NUMERIC := 0;
    v_ebitda NUMERIC := 0;
    v_resultado_financeiro NUMERIC := 0;
    v_lucro_liquido NUMERIC := 0;
BEGIN
    -- 1. CALCULAR RECEITA BRUTA (Vendas confirmadas no perÃ­odo)
    SELECT COALESCE(SUM(vi.valor_total), 0)
    INTO v_receita_bruta
    FROM venda_itens vi
    JOIN venda v ON v.id = vi.venda_id
    WHERE v.cliente_id_tenant = p_cliente_id_tenant
      AND v.tipo = 'Pedido'
      AND v.created_at::DATE BETWEEN p_data_inicio AND p_data_fim
      AND (p_empresa_id IS NULL OR v.empresa_id = p_empresa_id);

    -- 2. CALCULAR DEDUÃ‡Ã•ES (Simplificado: Descontos dados nas vendas)
    SELECT COALESCE(SUM(v.desconto_valor), 0)
    INTO v_deducoes
    FROM venda v
    WHERE v.cliente_id_tenant = p_cliente_id_tenant
      AND v.tipo = 'Pedido'
      AND v.created_at::DATE BETWEEN p_data_inicio AND p_data_fim
      AND (p_empresa_id IS NULL OR v.empresa_id = p_empresa_id);

    v_receita_liquida := v_receita_bruta - v_deducoes;

    -- 3. CALCULAR CPV (Custo dos Produtos Vendidos - com base no custo unitÃ¡rio atual)
    SELECT COALESCE(SUM(vi.quantidade * pc.custo_total_unitario), 0)
    INTO v_cpv
    FROM venda_itens vi
    JOIN venda v ON v.id = vi.venda_id
    JOIN vw_produto_custo_estimado pc ON pc.produto_id = vi.produto_id
    WHERE v.cliente_id_tenant = p_cliente_id_tenant
      AND v.tipo = 'Pedido'
      AND v.created_at::DATE BETWEEN p_data_inicio AND p_data_fim
      AND (p_empresa_id IS NULL OR v.empresa_id = p_empresa_id);

    v_lucro_bruto := v_receita_liquida - v_cpv;

    -- 4. CALCULAR DESPESAS OPERACIONAIS (parcelas a pagar no perÃ­odo, regime de competÃªncia)
    SELECT COALESCE(SUM(pcp.valor_parcela_original), 0)
    INTO v_despesas_op
    FROM parcelas_contas_pagar pcp
    JOIN contas_pagar cp ON cp.id = pcp.conta_pagar_id
    WHERE cp.cliente_id_tenant = p_cliente_id_tenant
      AND pcp.data_vencimento BETWEEN p_data_inicio AND p_data_fim
      AND (p_empresa_id IS NULL OR cp.empresa_id = p_empresa_id);

    v_ebitda := v_lucro_bruto - v_despesas_op;

    -- 5. RESULTADO FINANCEIRO (Juros recebidos vs Juros pagos / Multas)
    v_resultado_financeiro := 0; -- Simplificado por enquanto

    v_lucro_liquido := v_ebitda + v_resultado_financeiro;

    -- RETORNAR AS LINHAS DA DRE
    ordem := 1; grupo_nome := '1. RECEITA BRUTA'; valor := v_receita_bruta; nivel := 1; estilo := 'negrito'; RETURN NEXT;
    ordem := 2; grupo_nome := '   (-) DeduÃ§Ãµes e Descontos'; valor := -v_deducoes; nivel := 2; estilo := 'normal'; RETURN NEXT;
    ordem := 3; grupo_nome := '2. (=) RECEITA LÃQUIDA'; valor := v_receita_liquida; nivel := 1; estilo := 'total'; RETURN NEXT;
    ordem := 4; grupo_nome := '   (-) Custo dos Produtos Vendidos (CPV)'; valor := -v_cpv; nivel := 2; estilo := 'normal'; RETURN NEXT;
    ordem := 5; grupo_nome := '3. (=) LUCRO BRUTO'; valor := v_lucro_bruto; nivel := 1; estilo := 'total'; RETURN NEXT;
    ordem := 6; grupo_nome := '   (-) Despesas Operacionais (Administrativas/Vendas)'; valor := -v_despesas_op; nivel := 2; estilo := 'normal'; RETURN NEXT;
    ordem := 7; grupo_nome := '4. (=) RESULTADO OPERACIONAL (EBITDA)'; valor := v_ebitda; nivel := 1; estilo := 'total'; RETURN NEXT;
    ordem := 8; grupo_nome := '5. (=) RESULTADO LÃQUIDO DO EXERCÃCIO'; valor := v_lucro_liquido; nivel := 1; estilo := 'resultado'; RETURN NEXT;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- SOURCE: frontend/database/migration_dre_view.sql
-- =============================================================================
-- SQL Migration to create the DRE Aggregation View (DemonstraÃ§Ã£o do Resultado do ExercÃ­cio)

-- Drop the view if it exists to allow recreation
DROP VIEW IF EXISTS vw_dre_financeiro;

-- Create the DRE view combining Contas a Receber (Receitas) and Contas a Pagar (Custos/Despesas)
-- We use 'data_vencimento' to group the DRE by competence/accrual, but you can also filter by data_pagamento later on the app side if needed.
CREATE OR REPLACE VIEW vw_dre_financeiro AS

-- 1. RECEITAS
SELECT 
    'RECEITA' as natureza,
    cr.cliente_id_tenant,
    cr.empresa_id,
    pcr.data_vencimento as data_referencia,
    pcr.valor_parcela_original as valor,
    pcr.status,
    cr.plano_contas_id_ativo as plano_conta_id,
    pc.codigo as plano_conta_codigo,
    pc.descricao as plano_conta_descricao,
    pc.tipo_conta as plano_conta_tipo
FROM parcelas_contas_receber pcr
JOIN contas_receber cr ON cr.id = pcr.conta_receber_id
LEFT JOIN plano_contas pc ON pc.id = cr.plano_contas_id_ativo

UNION ALL

-- 2. DESPESAS E CUSTOS (sem vÃ­nculo obrigatÃ³rio a plano de contas na conta a pagar)
SELECT 
    'DESPESA' as natureza,
    cp.cliente_id_tenant,
    cp.empresa_id,
    pcp.data_vencimento as data_referencia,
    pcp.valor_parcela_original as valor,
    pcp.status,
    NULL::uuid as plano_conta_id,
    NULL::varchar as plano_conta_codigo,
    NULL::varchar as plano_conta_descricao,
    NULL::varchar as plano_conta_tipo
FROM parcelas_contas_pagar pcp
JOIN contas_pagar cp ON cp.id = pcp.conta_pagar_id;

-- Ensure read access to the view
GRANT SELECT ON vw_dre_financeiro TO authenticated;
GRANT SELECT ON vw_dre_financeiro TO anon;


-- =============================================================================
-- SOURCE: frontend/database/dre_view_plan.sql
-- =============================================================================
-- Migration to create the DRE (DemonstraÃ§Ã£o do Resultado do ExercÃ­cio) view.
-- This view aggregates Contas a Receber (Receitas) and Contas a Pagar (Custos/Despesas)
-- It structures them based on the Plano de Contas levels (Receita, Custo, Despesa).

-- 1. Create a function or view to aggregate financial data for DRE

-- First, let's ensure we have a standard DRE view that joins the parcelas 
-- with their respective accounts to get the type (Receita vs Despesa).

CREATE OR REPLACE VIEW dre_agregado AS
SELECT 
    'RECEITA' as origem,
    cr.cliente_id_tenant,
    cr.empresa_id,
    pcr.data_vencimento as data_referencia,
    pcr.valor_total as valor,
    pcr.status,
    cr.plano_conta_id,
    pc.codigo as conta_codigo,
    pc.descricao as conta_descricao,
    pc.tipo_conta
FROM parcelas_contas_receber pcr
JOIN contas_receber cr ON cr.id = pcr.conta_receber_id
LEFT JOIN plano_contas pc ON pc.id = cr.plano_conta_id
WHERE pcr.status IN ('Pago', 'Recebido', 'Parcialmente Pago', 'Parcialmente Recebido')

UNION ALL

SELECT 
    'DESPESA' as origem,
    cp.cliente_id_tenant,
    cp.empresa_id,
    pcp.data_vencimento as data_referencia,
    pcp.valor_total as valor,
    pcp.status,
    cp.plano_conta_id,
    pc.codigo as conta_codigo,
    pc.descricao as conta_descricao,
    pc.tipo_conta
FROM parcelas_contas_pagar pcp
JOIN contas_pagar cp ON cp.id = pcp.conta_pagar_id
LEFT JOIN plano_contas pc ON pc.id = cp.plano_conta_id
WHERE pcp.status IN ('Pago', 'Recebido', 'Parcialmente Pago', 'Parcialmente Recebido');

-- ObservaÃ§Ã£o: Se a modelagem usar data_pagamento, deverÃ­amos usar data_pagamento em vez de vencimento.
-- Por enquanto, usando data_vencimento (regime de competÃªncia/projeÃ§Ã£o) como base.


-- =============================================================================
-- SOURCE: frontend/database/migration_undo_movements.sql
-- =============================================================================
-- ==========================================================
-- MIGRATION: UNDO PAYMENT / RECEIPT (RPC)
-- ==========================================================

-- 1. Function to undo a payment (Accounts Payable)
CREATE OR REPLACE FUNCTION public.undo_pagamento_contas_pagar(p_pagamento_id UUID, p_tenant_id UUID)
RETURNS VOID AS $$
DECLARE
    v_parcela_id UUID;
    v_valor_pago NUMERIC;
    v_juros NUMERIC;
    v_desconto NUMERIC;
    v_multa NUMERIC;
    v_conta_id UUID;
BEGIN
    -- 1. Get payment details
    SELECT parcela_cp_id, valor_pago, valor_juros_aplicado, valor_desconto_aplicado, valor_multa_aplicada
    INTO v_parcela_id, v_valor_pago, v_juros, v_desconto, v_multa
    FROM public.pagamentos_contas_pagar
    WHERE id = p_pagamento_id AND cliente_id_tenant = p_tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pagamento nÃ£o encontrado ou acesso negado.';
    END IF;

    -- 2. Delete cash flow movement
    DELETE FROM public.movimentacoes_fluxo_caixa
    WHERE pagamento_cp_id = p_pagamento_id AND cliente_id_tenant = p_tenant_id;

    -- 3. Delete payment record
    DELETE FROM public.pagamentos_contas_pagar
    WHERE id = p_pagamento_id AND cliente_id_tenant = p_tenant_id;

    -- 4. Update parcela (revert values and state)
    UPDATE public.parcelas_contas_pagar
    SET 
        valor_pago = valor_pago - v_valor_pago,
        valor_juros = valor_juros - v_juros,
        valor_desconto = valor_desconto - v_desconto,
        valor_multa = valor_multa - v_multa,
        saldo_devedor = saldo_devedor + (v_valor_pago + v_desconto - v_juros - v_multa)
    WHERE id = v_parcela_id AND cliente_id_tenant = p_tenant_id;

    -- 5. Recalculate status of the parcela
    UPDATE public.parcelas_contas_pagar
    SET status = CASE 
        WHEN valor_pago <= 0.009 THEN 'Pendente'
        WHEN saldo_devedor > 0.009 THEN 'Parcialmente Pago'
        ELSE 'Pago'
    END
    WHERE id = v_parcela_id AND cliente_id_tenant = p_tenant_id
    RETURNING conta_pagar_id INTO v_conta_id;

    -- 6. Recalculate status of the main account (Contas Pagar)
    UPDATE public.contas_pagar
    SET status = (
        SELECT 
            CASE 
                WHEN COUNT(*) = COUNT(*) FILTER (WHERE status = 'Pago') THEN 'Pago'
                WHEN COUNT(*) FILTER (WHERE status = 'Pago' OR status = 'Parcialmente Pago') > 0 THEN 'Parcialmente Pago'
                ELSE 'Pendente'
            END
        FROM public.parcelas_contas_pagar
        WHERE conta_pagar_id = v_conta_id
    )
    WHERE id = v_conta_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Function to undo a receipt (Accounts Receivable)
CREATE OR REPLACE FUNCTION public.undo_recebimento_contas_receber(p_recebimento_id UUID, p_tenant_id UUID)
RETURNS VOID AS $$
DECLARE
    v_parcela_id UUID;
    v_valor_recebido NUMERIC;
    v_juros NUMERIC;
    v_desconto NUMERIC;
    v_multa NUMERIC;
    v_conta_id UUID;
BEGIN
    -- 1. Get receipt details
    SELECT parcela_cr_id, valor_recebido, valor_juros_aplicado, valor_desconto_aplicado, valor_multa_aplicada
    INTO v_parcela_id, v_valor_recebido, v_juros, v_desconto, v_multa
    FROM public.recebimentos_contas_receber
    WHERE id = p_recebimento_id AND cliente_id_tenant = p_tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Recebimento nÃ£o encontrado ou acesso negado.';
    END IF;

    -- 2. Delete cash flow movement
    DELETE FROM public.movimentacoes_fluxo_caixa
    WHERE recebimento_cr_id = p_recebimento_id AND cliente_id_tenant = p_tenant_id;

    -- 3. Delete receipt record
    DELETE FROM public.recebimentos_contas_receber
    WHERE id = p_recebimento_id AND cliente_id_tenant = p_tenant_id;

    -- 4. Update parcela (revert values and state)
    UPDATE public.parcelas_contas_receber
    SET 
        valor_recebido = valor_recebido - v_valor_recebido,
        valor_juros = valor_juros - v_juros,
        valor_desconto = valor_desconto - v_desconto,
        valor_multa = valor_multa - v_multa,
        saldo_a_receber = saldo_a_receber + (v_valor_recebido + v_desconto - v_juros - v_multa)
    WHERE id = v_parcela_id AND cliente_id_tenant = p_tenant_id;

    -- 5. Recalculate status of the parcela
    UPDATE public.parcelas_contas_receber
    SET status = CASE 
        WHEN valor_recebido <= 0.009 THEN 'Pendente'
        WHEN saldo_a_receber > 0.009 THEN 'Parcialmente Recebido'
        ELSE 'Recebido'
    END
    WHERE id = v_parcela_id AND cliente_id_tenant = p_tenant_id
    RETURNING conta_receber_id INTO v_conta_id;

    -- 6. Recalculate status of the main account (Contas Receber)
    UPDATE public.contas_receber
    SET status = (
        SELECT 
            CASE 
                WHEN COUNT(*) = COUNT(*) FILTER (WHERE status = 'Recebido') THEN 'Recebido'
                WHEN COUNT(*) FILTER (WHERE status = 'Recebido' OR status = 'Parcialmente Recebido') > 0 THEN 'Parcialmente Recebido'
                ELSE 'Pendente'
            END
        FROM public.parcelas_contas_receber
        WHERE conta_receber_id = v_conta_id
    )
    WHERE id = v_conta_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================================================
-- SOURCE: frontend/database/migration_undo_audit.sql
-- =============================================================================
-- ============================================================
-- MIGRATION: AUDIT LOG FOR UNDO PAYMENT/RECEIPT
-- Run this in Supabase SQL Editor
-- Created: 2026-03-19
-- ============================================================

-- 1. Tabela de Auditoria de Estornos
CREATE TABLE IF NOT EXISTS public.audit_estornos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id_tenant   UUID NOT NULL,
    tipo_operacao       TEXT NOT NULL CHECK (tipo_operacao IN ('ESTORNO_PAGAMENTO', 'ESTORNO_RECEBIMENTO')),
    -- ReferÃªncias ao registro estornado (uma das duas serÃ¡ preenchida)
    pagamento_cp_id     UUID,
    recebimento_cr_id   UUID,
    -- Snapshot dos dados da conta e parcela no momento do estorno
    conta_documento     TEXT,
    conta_descricao     TEXT,
    parcela_numero      INTEGER,
    valor_estornado     NUMERIC(15,2),
    -- Quem fez e quando
    user_id             UUID,
    user_email          TEXT,
    justificativa       TEXT NOT NULL,
    -- Timestamp com timezone (auditoria)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.audit_estornos IS 'Log imutÃ¡vel de todos os estornos de pagamentos e recebimentos realizados no sistema.';
COMMENT ON COLUMN public.audit_estornos.tipo_operacao IS 'ESTORNO_PAGAMENTO ou ESTORNO_RECEBIMENTO';
COMMENT ON COLUMN public.audit_estornos.user_email IS 'Email do usuÃ¡rio autenticado no momento do estorno (snapshot)';
COMMENT ON COLUMN public.audit_estornos.justificativa IS 'Justificativa obrigatÃ³ria informada pelo usuÃ¡rio (mÃ­n. 15 caracteres)';

-- 2. Ãndices para pesquisa eficiente
CREATE INDEX IF NOT EXISTS idx_audit_estornos_tenant  ON public.audit_estornos(cliente_id_tenant);
CREATE INDEX IF NOT EXISTS idx_audit_estornos_tipo    ON public.audit_estornos(tipo_operacao);
CREATE INDEX IF NOT EXISTS idx_audit_estornos_created ON public.audit_estornos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_estornos_user    ON public.audit_estornos(user_id);

-- 3. RLS (Row Level Security)
ALTER TABLE public.audit_estornos ENABLE ROW LEVEL SECURITY;

-- UsuÃ¡rios do tenant sÃ³ lÃªem seus prÃ³prios logs
CREATE POLICY "tenant_select_audit_estornos"
    ON public.audit_estornos FOR SELECT
    USING (cliente_id_tenant = (
        SELECT cliente_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    ));

-- Apenas INSERT permitido (log Ã© imutÃ¡vel â€” sem UPDATE ou DELETE)
CREATE POLICY "tenant_insert_audit_estornos"
    ON public.audit_estornos FOR INSERT
    WITH CHECK (cliente_id_tenant = (
        SELECT cliente_id FROM public.usuarios WHERE id = auth.uid() LIMIT 1
    ));

-- ============================================================
-- 4. RPC: undo_pagamento_contas_pagar  (agora com justificativa)
-- ============================================================
CREATE OR REPLACE FUNCTION public.undo_pagamento_contas_pagar(
    p_pagamento_id  UUID,
    p_tenant_id     UUID,
    p_justificativa TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_parcela_id        UUID;
    v_valor_pago        NUMERIC;
    v_juros             NUMERIC;
    v_desconto          NUMERIC;
    v_multa             NUMERIC;
    v_conta_id          UUID;
    v_conta_documento   TEXT;
    v_conta_descricao   TEXT;
    v_parcela_numero    INTEGER;
BEGIN
    -- 1. Buscar dados do pagamento E da conta/parcela para o log de auditoria
    SELECT
        pcp.parcela_cp_id,
        pcp.valor_pago,
        pcp.valor_juros_aplicado,
        pcp.valor_desconto_aplicado,
        pcp.valor_multa_aplicada,
        parc.numero_parcela,
        cp.documento,
        cp.descricao
    INTO
        v_parcela_id, v_valor_pago, v_juros, v_desconto, v_multa,
        v_parcela_numero, v_conta_documento, v_conta_descricao
    FROM public.pagamentos_contas_pagar pcp
    JOIN public.parcelas_contas_pagar parc ON parc.id = pcp.parcela_cp_id
    JOIN public.contas_pagar cp ON cp.id = parc.conta_pagar_id
    WHERE pcp.id = p_pagamento_id AND pcp.cliente_id_tenant = p_tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pagamento nÃ£o encontrado ou acesso negado.';
    END IF;

    -- 2. Excluir movimentaÃ§Ã£o de caixa vinculada
    DELETE FROM public.movimentacoes_fluxo_caixa
    WHERE pagamento_cp_id = p_pagamento_id AND cliente_id_tenant = p_tenant_id;

    -- 3. Excluir o registro de pagamento
    DELETE FROM public.pagamentos_contas_pagar
    WHERE id = p_pagamento_id AND cliente_id_tenant = p_tenant_id;

    -- 4. Reverter valores da parcela
    UPDATE public.parcelas_contas_pagar
    SET
        valor_pago     = valor_pago     - v_valor_pago,
        valor_juros    = valor_juros    - v_juros,
        valor_desconto = valor_desconto - v_desconto,
        valor_multa    = valor_multa    - v_multa,
        saldo_devedor  = saldo_devedor  + (v_valor_pago + v_desconto - v_juros - v_multa)
    WHERE id = v_parcela_id AND cliente_id_tenant = p_tenant_id;

    -- 5. Recalcular status da parcela
    UPDATE public.parcelas_contas_pagar
    SET status = CASE
        WHEN valor_pago    <= 0.009 THEN 'Pendente'
        WHEN saldo_devedor >  0.009 THEN 'Parcialmente Pago'
        ELSE 'Pago'
    END
    WHERE id = v_parcela_id AND cliente_id_tenant = p_tenant_id
    RETURNING conta_pagar_id INTO v_conta_id;

    -- 6. Recalcular status da conta principal
    UPDATE public.contas_pagar
    SET status = (
        SELECT CASE
            WHEN COUNT(*) = COUNT(*) FILTER (WHERE status = 'Pago')                             THEN 'Pago'
            WHEN COUNT(*) FILTER (WHERE status IN ('Pago', 'Parcialmente Pago')) > 0            THEN 'Parcialmente Pago'
            ELSE 'Pendente'
        END
        FROM public.parcelas_contas_pagar WHERE conta_pagar_id = v_conta_id
    )
    WHERE id = v_conta_id;

    -- 7. Inserir no log de auditoria (sempre, mesmo sem justificativa)
    INSERT INTO public.audit_estornos (
        cliente_id_tenant,
        tipo_operacao,
        pagamento_cp_id,
        conta_documento,
        conta_descricao,
        parcela_numero,
        valor_estornado,
        user_id,
        user_email,
        justificativa
    ) VALUES (
        p_tenant_id,
        'ESTORNO_PAGAMENTO',
        p_pagamento_id,
        v_conta_documento,
        v_conta_descricao,
        v_parcela_numero,
        v_valor_pago,
        auth.uid(),
        auth.email(),
        COALESCE(p_justificativa, '(sem justificativa)')
    );

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. RPC: undo_recebimento_contas_receber  (agora com justificativa)
-- ============================================================
CREATE OR REPLACE FUNCTION public.undo_recebimento_contas_receber(
    p_recebimento_id UUID,
    p_tenant_id      UUID,
    p_justificativa  TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_parcela_id        UUID;
    v_valor_recebido    NUMERIC;
    v_juros             NUMERIC;
    v_desconto          NUMERIC;
    v_multa             NUMERIC;
    v_conta_id          UUID;
    v_conta_documento   TEXT;
    v_conta_descricao   TEXT;
    v_parcela_numero    INTEGER;
BEGIN
    -- 1. Buscar dados do recebimento E da conta/parcela para o log de auditoria
    SELECT
        rcr.parcela_cr_id,
        rcr.valor_recebido,
        rcr.valor_juros_aplicado,
        rcr.valor_desconto_aplicado,
        rcr.valor_multa_aplicada,
        parc.numero_parcela,
        cr.documento,
        cr.descricao
    INTO
        v_parcela_id, v_valor_recebido, v_juros, v_desconto, v_multa,
        v_parcela_numero, v_conta_documento, v_conta_descricao
    FROM public.recebimentos_contas_receber rcr
    JOIN public.parcelas_contas_receber parc ON parc.id = rcr.parcela_cr_id
    JOIN public.contas_receber cr ON cr.id = parc.conta_receber_id
    WHERE rcr.id = p_recebimento_id AND rcr.cliente_id_tenant = p_tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Recebimento nÃ£o encontrado ou acesso negado.';
    END IF;

    -- 2. Excluir movimentaÃ§Ã£o de caixa vinculada
    DELETE FROM public.movimentacoes_fluxo_caixa
    WHERE recebimento_cr_id = p_recebimento_id AND cliente_id_tenant = p_tenant_id;

    -- 3. Excluir o registro de recebimento
    DELETE FROM public.recebimentos_contas_receber
    WHERE id = p_recebimento_id AND cliente_id_tenant = p_tenant_id;

    -- 4. Reverter valores da parcela
    UPDATE public.parcelas_contas_receber
    SET
        valor_recebido = valor_recebido - v_valor_recebido,
        valor_juros    = valor_juros    - v_juros,
        valor_desconto = valor_desconto - v_desconto,
        valor_multa    = valor_multa    - v_multa,
        saldo_a_receber= saldo_a_receber + (v_valor_recebido + v_desconto - v_juros - v_multa)
    WHERE id = v_parcela_id AND cliente_id_tenant = p_tenant_id;

    -- 5. Recalcular status da parcela
    UPDATE public.parcelas_contas_receber
    SET status = CASE
        WHEN valor_recebido  <= 0.009 THEN 'Pendente'
        WHEN saldo_a_receber >  0.009 THEN 'Parcialmente Recebido'
        ELSE 'Recebido'
    END
    WHERE id = v_parcela_id AND cliente_id_tenant = p_tenant_id
    RETURNING conta_receber_id INTO v_conta_id;

    -- 6. Recalcular status da conta principal
    UPDATE public.contas_receber
    SET status = (
        SELECT CASE
            WHEN COUNT(*) = COUNT(*) FILTER (WHERE status = 'Recebido')                                THEN 'Recebido'
            WHEN COUNT(*) FILTER (WHERE status IN ('Recebido', 'Parcialmente Recebido')) > 0           THEN 'Parcialmente Recebido'
            ELSE 'Pendente'
        END
        FROM public.parcelas_contas_receber WHERE conta_receber_id = v_conta_id
    )
    WHERE id = v_conta_id;

    -- 7. Inserir no log de auditoria
    INSERT INTO public.audit_estornos (
        cliente_id_tenant,
        tipo_operacao,
        recebimento_cr_id,
        conta_documento,
        conta_descricao,
        parcela_numero,
        valor_estornado,
        user_id,
        user_email,
        justificativa
    ) VALUES (
        p_tenant_id,
        'ESTORNO_RECEBIMENTO',
        p_recebimento_id,
        v_conta_documento,
        v_conta_descricao,
        v_parcela_numero,
        v_valor_recebido,
        auth.uid(),
        auth.email(),
        COALESCE(p_justificativa, '(sem justificativa)')
    );

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- CONSULTA DE AUDITORIA (use para visualizar os logs):
-- SELECT
--     id,
--     tipo_operacao,
--     conta_documento,
--     conta_descricao,
--     parcela_numero,
--     valor_estornado,
--     user_email,
--     justificativa,
--     created_at AT TIME ZONE 'America/Sao_Paulo' AS created_at_br
-- FROM audit_estornos
-- ORDER BY created_at DESC;
-- ============================================================


-- =============================================================================
-- SOURCE: frontend/database/nota_fiscal_schema.sql
-- =============================================================================
-- ===============================
-- Tabela de Nota Fiscal (NF-e) vinculada Ã  venda/pedido
-- ===============================

CREATE TABLE IF NOT EXISTS nota_fiscal (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    venda_id BIGINT NOT NULL REFERENCES venda(id) ON DELETE CASCADE,

    -- ReferÃªncias para facilitar filtros por tenant/empresa/cliente
    cliente_id_tenant UUID REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    empresa_id        UUID REFERENCES empresas(id) ON DELETE SET NULL,
    cliente_id        UUID REFERENCES clientes_cadastros(id) ON DELETE SET NULL,

    -- Tipo de operaÃ§Ã£o fiscal selecionado para esta nota
    tipo_operacao_id UUID REFERENCES tipo_operacao(id) ON DELETE SET NULL,

    -- IdentificaÃ§Ã£o da NF-e
    id_integracao           VARCHAR(100),
    data_emissao            DATE,
    data_saida_entrada      DATE,
    finalidade              SMALLINT,
    presenca_consumidor     SMALLINT,
    serie                   INTEGER,
    numero                  INTEGER,
    ambiente                SMALLINT,
    modelo                  VARCHAR(2),
    tipo_emissao            SMALLINT,
    consumidor_final        SMALLINT,
    indicador_destino       SMALLINT,
    indicador_intermediador SMALLINT,
    observacao              TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nota_fiscal_venda_id
    ON nota_fiscal(venda_id);

CREATE INDEX IF NOT EXISTS idx_nota_fiscal_cliente_tenant
    ON nota_fiscal(cliente_id_tenant);

CREATE INDEX IF NOT EXISTS idx_nota_fiscal_numero
    ON nota_fiscal(numero);

-- Garante a existÃªncia da coluna tipo_operacao_id mesmo se a tabela jÃ¡ tiver sido criada antes
ALTER TABLE nota_fiscal
    ADD COLUMN IF NOT EXISTS tipo_operacao_id UUID REFERENCES tipo_operacao(id) ON DELETE SET NULL;

ALTER TABLE nota_fiscal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total nota_fiscal"
ON nota_fiscal FOR ALL TO authenticated
USING (true) WITH CHECK (true);



-- =============================================================================
-- SOURCE: frontend/database/nota_fiscal_item_schema.sql
-- =============================================================================
-- ===============================
-- Itens da Nota Fiscal (NF-e)
-- ===============================

CREATE TABLE IF NOT EXISTS nota_fiscal_item (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    nota_fiscal_id UUID NOT NULL REFERENCES nota_fiscal(id) ON DELETE CASCADE,

    -- ReferÃªncia ao item original da venda (para reconstruir quantidades/valores)
    venda_item_id UUID REFERENCES venda_itens(id) ON DELETE SET NULL,
    produto_id    UUID REFERENCES produtos(id) ON DELETE SET NULL,

    -- Snapshot bÃ¡sico do item
    descricao      VARCHAR(255),
    ncm            VARCHAR(20),
    cest           VARCHAR(20),
    unidade        VARCHAR(20),
    quantidade     NUMERIC(12, 3),
    valor_unitario NUMERIC(12, 2),
    valor_total    NUMERIC(12, 2),

    -- InformaÃ§Ãµes fiscais aplicadas ao item (cÃ³pia da regra do Grupo Fiscal)
    grupo_fiscal_regra_id UUID REFERENCES grupo_fiscal_regra(id) ON DELETE SET NULL,

    origem  CHAR(2),
    destino CHAR(2),

    cfop                  VARCHAR(10),
    perc_icms             NUMERIC(7,4),
    perc_reducao_icms     NUMERIC(7,4),
    perc_iva              NUMERIC(7,4),
    icms_st               VARCHAR(20),
    perc_icms_st_proprio  NUMERIC(7,4),

    cst_pis               VARCHAR(3),
    perc_pis              NUMERIC(7,4),

    cst_cofins            VARCHAR(3),
    perc_cofins           NUMERIC(7,4),

    cst_ibs_cbs           VARCHAR(3),
    classificacao_tributaria VARCHAR(50),

    perc_ibs_uf           NUMERIC(7,4),
    perc_ibs_municipio    NUMERIC(7,4),
    perc_cbs              NUMERIC(7,4),

    perc_ipi              NUMERIC(7,4),
    cst_ipi               VARCHAR(3),
    codigo_enquadramento_ipi VARCHAR(10),

    cst                   VARCHAR(3),
    csosn_contribuinte     VARCHAR(3),
    csosn_consumidor_final VARCHAR(3),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nota_fiscal_item_nota_id
    ON nota_fiscal_item(nota_fiscal_id);

CREATE INDEX IF NOT EXISTS idx_nota_fiscal_item_venda_item_id
    ON nota_fiscal_item(venda_item_id);

ALTER TABLE nota_fiscal_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total nota_fiscal_item"
ON nota_fiscal_item FOR ALL TO authenticated
USING (true) WITH CHECK (true);



-- =============================================================================
-- SOURCE: frontend/database/nota_fiscal_pagamento_schema.sql
-- =============================================================================
-- ============================================================
-- Pagamentos e Parcelas da Nota Fiscal (NF-e)
-- Tabelas: nota_fiscal_pagamento, nota_fiscal_parcela
-- ============================================================

-- -------------------------------
-- 1. Nota Fiscal Pagamento (uma NF pode ter vÃ¡rias formas)
-- -------------------------------
CREATE TABLE IF NOT EXISTS nota_fiscal_pagamento (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    nota_fiscal_id UUID NOT NULL REFERENCES nota_fiscal(id) ON DELETE CASCADE,

    condicao_pagamento_id UUID REFERENCES condicao_pagamento(id) ON DELETE SET NULL,
    tipo_pagamento_id     UUID REFERENCES tipo_pagamento(id)     ON DELETE SET NULL,

    valor NUMERIC(12, 2) NOT NULL CHECK (valor >= 0),
    quantidade_parcelas INTEGER NOT NULL CHECK (quantidade_parcelas >= 1),

    -- Dados adicionais de cartÃ£o (espelho de venda_forma_pagamento)
    bandeira           VARCHAR(50),
    cnpj_credenciadora VARCHAR(18),
    numero_autorizacao VARCHAR(50),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nota_fiscal_pagamento_nota_id
    ON nota_fiscal_pagamento(nota_fiscal_id);

CREATE INDEX IF NOT EXISTS idx_nota_fiscal_pagamento_condicao_id
    ON nota_fiscal_pagamento(condicao_pagamento_id);

ALTER TABLE nota_fiscal_pagamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total nota_fiscal_pagamento"
ON nota_fiscal_pagamento FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- -------------------------------
-- 2. Nota Fiscal Parcela (parcelas de cada forma da NF)
-- -------------------------------
CREATE TABLE IF NOT EXISTS nota_fiscal_parcela (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    nota_fiscal_pagamento_id UUID NOT NULL REFERENCES nota_fiscal_pagamento(id) ON DELETE CASCADE,

    numero_parcela INTEGER NOT NULL CHECK (numero_parcela >= 1),
    valor_parcela  NUMERIC(12, 2) NOT NULL CHECK (valor_parcela >= 0),
    data_vencimento DATE NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(nota_fiscal_pagamento_id, numero_parcela)
);

CREATE INDEX IF NOT EXISTS idx_nota_fiscal_parcela_pagamento_id
    ON nota_fiscal_parcela(nota_fiscal_pagamento_id);

CREATE INDEX IF NOT EXISTS idx_nota_fiscal_parcela_vencimento
    ON nota_fiscal_parcela(data_vencimento);

ALTER TABLE nota_fiscal_parcela ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total nota_fiscal_parcela"
ON nota_fiscal_parcela FOR ALL TO authenticated
USING (true) WITH CHECK (true);



-- =============================================================================
-- SOURCE: frontend/database/nota_fiscal_transporte_schema.sql
-- =============================================================================
-- ===============================
-- Transporte vinculado Ã  Nota Fiscal (NF-e)
-- ===============================

CREATE TABLE IF NOT EXISTS nota_fiscal_transporte (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    nota_fiscal_id UUID NOT NULL REFERENCES nota_fiscal(id) ON DELETE CASCADE,

    modalidade_frete VARCHAR(2),
    -- 0=Emitente, 1=DestinatÃ¡rio, 2=Terceiros, 9=Sem frete

    transportadora_cnpj         VARCHAR(18),
    transportadora_razao_social VARCHAR(120),
    transportadora_ie           VARCHAR(20),

    veiculo_placa VARCHAR(10),
    veiculo_uf    CHAR(2),

    volumes_quantidade   INTEGER,
    volumes_especie      VARCHAR(60),
    volumes_marca        VARCHAR(60),
    volumes_numeracao    VARCHAR(60),
    volumes_peso_bruto   NUMERIC(12, 3),
    volumes_peso_liquido NUMERIC(12, 3),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nota_fiscal_transporte_nota_id
    ON nota_fiscal_transporte(nota_fiscal_id);

ALTER TABLE nota_fiscal_transporte ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total nota_fiscal_transporte"
ON nota_fiscal_transporte FOR ALL TO authenticated
USING (true) WITH CHECK (true);



-- =============================================================================
-- SOURCE: frontend/database/nota_fiscal_inutilizacao_schema.sql
-- =============================================================================
-- ============================================
-- Tabela de InutilizaÃ§Ã£o de NumeraÃ§Ã£o de NF-e
-- ============================================

CREATE TABLE IF NOT EXISTS nota_fiscal_inutilizacao (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    -- Empresa emitente (obrigatÃ³ria)
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,

    -- Cliente/tenant dono do ambiente (mesmo padrÃ£o das outras tabelas)
    cliente_id_tenant UUID REFERENCES clientes_azoup(id) ON DELETE CASCADE,

    -- Dados da faixa de numeraÃ§Ã£o inutilizada
    serie           INTEGER      NOT NULL,
    modelo          INTEGER      NOT NULL,  -- 55 = NF-e
    ano             SMALLINT     NOT NULL,  -- dois dÃ­gitos (ex: 26 para 2026)
    numero_inicial  INTEGER      NOT NULL,
    numero_final    INTEGER      NOT NULL,

    -- Justificativa informada pelo usuÃ¡rio (obrigatÃ³ria, SEFAZ exige texto mÃ­nimo)
    justificativa   TEXT         NOT NULL,

    -- Retorno da SEFAZ
    status_sefaz    VARCHAR(10),      -- ex: 102 = InutilizaÃ§Ã£o de nÃºmero homologado
    mensagem_sefaz  TEXT,             -- JSON/descriÃ§Ã£o completa de retorno
    protocolo       VARCHAR(50),      -- NÃºmero do protocolo de inutilizaÃ§Ã£o

    -- Local onde o XML de inutilizaÃ§Ã£o foi salvo no bucket (nfe_xmls ou similar)
    xml_storage_path TEXT,            -- caminho interno no bucket (ex: empresaId/ano/serie/faixa_inutilizacao.xml)
    xml_url          TEXT,            -- URL pÃºblica (getPublicUrl) para acesso ao XML

    -- Metadados
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID                      -- opcional: usuÃ¡rio que realizou a inutilizaÃ§Ã£o
);

-- Ãndices Ãºteis
CREATE INDEX IF NOT EXISTS idx_nfi_empresa_serie_modelo_ano
    ON nota_fiscal_inutilizacao (empresa_id, serie, modelo, ano);

CREATE INDEX IF NOT EXISTS idx_nfi_cliente_tenant
    ON nota_fiscal_inutilizacao (cliente_id_tenant);

CREATE INDEX IF NOT EXISTS idx_nfi_created_at
    ON nota_fiscal_inutilizacao (created_at DESC);

-- SeguranÃ§a (RLS) â€“ mesmo padrÃ£o das demais tabelas fiscais
ALTER TABLE nota_fiscal_inutilizacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso total nota_fiscal_inutilizacao"
ON nota_fiscal_inutilizacao
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);



-- =============================================================================
-- SOURCE: frontend/database/nota_fiscal_nfe_campos_migration.sql
-- =============================================================================
-- ===============================
-- Campos de integraÃ§Ã£o NF-e na tabela nota_fiscal
-- ===============================

ALTER TABLE nota_fiscal
    ADD COLUMN IF NOT EXISTS chave_acesso          VARCHAR(44),
    ADD COLUMN IF NOT EXISTS protocolo_autorizacao VARCHAR(50),
    ADD COLUMN IF NOT EXISTS status_sefaz          VARCHAR(30),
    ADD COLUMN IF NOT EXISTS mensagem_sefaz        TEXT,
    ADD COLUMN IF NOT EXISTS xml_gerado            TEXT,
    ADD COLUMN IF NOT EXISTS xml_autorizado        TEXT,
    ADD COLUMN IF NOT EXISTS xml_protocolo         TEXT,
    ADD COLUMN IF NOT EXISTS data_autorizacao      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS danfe_url             TEXT;



-- =============================================================================
-- SOURCE: frontend/database/nota_fiscal_add_totals_migration.sql
-- =============================================================================
-- ===============================
-- MigraÃ§Ã£o: adiciona totais, frete e desconto Ã  tabela nota_fiscal
-- ===============================

ALTER TABLE nota_fiscal
    ADD COLUMN IF NOT EXISTS desconto_valor NUMERIC(12, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS frete          NUMERIC(12, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS valor_total    NUMERIC(12, 2) DEFAULT 0;

-- ComentÃ¡rios para documentaÃ§Ã£o
COMMENT ON COLUMN nota_fiscal.desconto_valor IS 'Valor total do desconto da nota fiscal';
COMMENT ON COLUMN nota_fiscal.frete          IS 'Valor total do frete da nota fiscal';
COMMENT ON COLUMN nota_fiscal.valor_total    IS 'Valor total da nota fiscal (Produtos - Desconto + Frete)';


-- =============================================================================
-- SOURCE: frontend/database/nota_fiscal_add_observacao_migration.sql
-- =============================================================================
-- ===============================
-- MigraÃ§Ã£o: adiciona coluna observacao Ã  nota_fiscal
-- ===============================

ALTER TABLE nota_fiscal
    ADD COLUMN IF NOT EXISTS observacao TEXT;



-- =============================================================================
-- SOURCE: frontend/database/nota_fiscal_drop_natureza_migration.sql
-- =============================================================================
-- ===============================
-- MigraÃ§Ã£o: remove coluna natureza da nota_fiscal
-- ===============================

ALTER TABLE nota_fiscal
    DROP COLUMN IF EXISTS natureza;



-- =============================================================================
-- SOURCE: frontend/database/nota_fiscal_item_add_valores_migration.sql
-- =============================================================================
-- ===============================
-- MigraÃ§Ã£o: adiciona quantidade e valores aos itens da NF
-- ===============================

ALTER TABLE nota_fiscal_item
    ADD COLUMN IF NOT EXISTS quantidade     NUMERIC(12, 3),
    ADD COLUMN IF NOT EXISTS valor_unitario NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS valor_total    NUMERIC(12, 2);



-- =============================================================================
-- SOURCE: frontend/database/grupo_fiscal_regra_add_cest_migration.sql
-- =============================================================================
-- ===============================
-- MigraÃ§Ã£o: adiciona coluna CEST ao grid de Grupo Fiscal
-- ===============================

ALTER TABLE grupo_fiscal_regra
    ADD COLUMN IF NOT EXISTS cest VARCHAR(20);



-- =============================================================================
-- SOURCE: frontend/database/grupo_fiscal_regra_migration_remove_columns.sql
-- =============================================================================
-- ===============================
-- MigraÃ§Ã£o: remover colunas do grid e alterar icms_st para texto
-- Rodar DEPOIS dos schemas de grupo_fiscal_regra e das tabelas de cÃ³digos
-- ===============================

-- 1) Alterar icms_st de BOOLEAN para VARCHAR (texto), sÃ³ se ainda for boolean
DO $$
DECLARE
    v_type text;
BEGIN
    SELECT data_type INTO v_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'grupo_fiscal_regra' AND column_name = 'icms_st';
    IF v_type = 'boolean' THEN
        ALTER TABLE grupo_fiscal_regra
        ALTER COLUMN icms_st TYPE VARCHAR(20)
        USING (CASE WHEN icms_st = true THEN 'S' WHEN icms_st = false THEN '' ELSE NULL END);
    END IF;
END $$;

-- 2) Remover colunas que saÃ­ram do grid
ALTER TABLE grupo_fiscal_regra DROP COLUMN IF EXISTS motivo_desoneracao;
ALTER TABLE grupo_fiscal_regra DROP COLUMN IF EXISTS periodo_apuracao_ipi;
ALTER TABLE grupo_fiscal_regra DROP COLUMN IF EXISTS perc_ipi_devolucao;
ALTER TABLE grupo_fiscal_regra DROP COLUMN IF EXISTS calcula_ipi_por_peso_caixa;
ALTER TABLE grupo_fiscal_regra DROP COLUMN IF EXISTS perc_aliquota;


-- =============================================================================
-- SOURCE: frontend/database/migration_grupo_fiscal_e_cst_ibs_cbs.sql
-- =============================================================================
-- ===============================
-- MigraÃ§Ã£o Ãºnica: alÃ­quota + CST IBS/CBS
-- Para quem jÃ¡ rodou os scripts anteriores.
-- ===============================

-- 1) Remover coluna alÃ­quota do grid fiscal (se ainda existir)
ALTER TABLE grupo_fiscal_regra DROP COLUMN IF EXISTS perc_aliquota;

-- 2) Limpar CST IBS/CBS e inserir cÃ³digos oficiais
DELETE FROM cst_ibs_cbs_codigos;

INSERT INTO cst_ibs_cbs_codigos (cliente_id, codigo, descricao, ativo)
SELECT c.id, v.codigo, v.descricao, true
FROM clientes_azoup c
CROSS JOIN (VALUES
  ('000', 'TributaÃ§Ã£o integral'),
  ('010', 'TributaÃ§Ã£o com alÃ­quotas uniformes (setor financeiro)'),
  ('011', 'TributaÃ§Ã£o com alÃ­quotas uniformes reduzidas (60% ou 30%)'),
  ('200', 'AlÃ­quota zero (ou reduzida: 80%, 70%, 60%, 50%, 40%, 30%)'),
  ('220', 'AlÃ­quota fixa'),
  ('400', 'IsenÃ§Ã£o'),
  ('410', 'Imunidade e nÃ£o incidÃªncia'),
  ('510', 'Diferimento (ou com reduÃ§Ã£o)'),
  ('515', 'Diferimento (ou com reduÃ§Ã£o)'),
  ('620', 'TributaÃ§Ã£o monofÃ¡sica'),
  ('800', 'Ajustes de crÃ©dito, ZFM e base de cÃ¡lculo (800-830)')
) AS v(codigo, descricao);


-- =============================================================================
-- SOURCE: frontend/database/migration_cbenef_produto_para_grupo_fiscal_regra.sql
-- =============================================================================
-- cBenef no grid do Grupo Fiscal (grupo_fiscal_regra), nÃ£o mais em produtos.
-- Rode no Supabase SQL Editor (com backup). Idempotente.

-- 1) Coluna na tabela de regras
ALTER TABLE public.grupo_fiscal_regra
    ADD COLUMN IF NOT EXISTS cbenef VARCHAR(20);

COMMENT ON COLUMN public.grupo_fiscal_regra.cbenef IS
    'CÃ³digo de BenefÃ­cio Fiscal (cBenef) para NF-e, por regra origem/destino do grupo fiscal.';

-- 2) Migra dados antigos de produtos.cbenef (se a coluna ainda existir)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'produtos'
          AND column_name = 'cbenef'
    ) THEN
        UPDATE public.grupo_fiscal_regra gfr
        SET cbenef = TRIM(p.cbenef)
        FROM public.produtos p
        WHERE p.grupo_fiscal_id = gfr.grupo_fiscal_id
          AND p.cbenef IS NOT NULL
          AND TRIM(p.cbenef) <> ''
          AND (gfr.cbenef IS NULL OR TRIM(gfr.cbenef) = '');
    END IF;
END $$;

-- 3) Remove cBenef do cadastro de produto (fonte Ãºnica: grupo_fiscal_regra)
ALTER TABLE public.produtos
    DROP COLUMN IF EXISTS cbenef;

-- 4) ConferÃªncia (opcional)
-- SELECT COUNT(*) AS regras_com_cbenef FROM public.grupo_fiscal_regra WHERE cbenef IS NOT NULL AND TRIM(cbenef) <> '';

-- ApÃ³s rodar: no Supabase, Settings â†’ API â†’ Reload schema (ou aguarde cache PostgREST).


-- =============================================================================
-- SOURCE: frontend/database/cst_ibs_cbs_codigos_migration_replace.sql
-- =============================================================================
-- ===============================
-- MigraÃ§Ã£o: limpar CST IBS/CBS e inserir cÃ³digos oficiais
-- Rodar DEPOIS do schema cst_ibs_cbs_codigos
-- ===============================

-- Limpar tabela
DELETE FROM cst_ibs_cbs_codigos;

-- Inserir novos cÃ³digos para todos os clientes
INSERT INTO cst_ibs_cbs_codigos (cliente_id, codigo, descricao, ativo)
SELECT c.id, v.codigo, v.descricao, true
FROM clientes_azoup c
CROSS JOIN (VALUES
  ('000', 'TributaÃ§Ã£o integral'),
  ('010', 'TributaÃ§Ã£o com alÃ­quotas uniformes (setor financeiro)'),
  ('011', 'TributaÃ§Ã£o com alÃ­quotas uniformes reduzidas (60% ou 30%)'),
  ('200', 'AlÃ­quota zero (ou reduzida: 80%, 70%, 60%, 50%, 40%, 30%)'),
  ('220', 'AlÃ­quota fixa'),
  ('400', 'IsenÃ§Ã£o'),
  ('410', 'Imunidade e nÃ£o incidÃªncia'),
  ('510', 'Diferimento (ou com reduÃ§Ã£o)'),
  ('515', 'Diferimento (ou com reduÃ§Ã£o)'),
  ('620', 'TributaÃ§Ã£o monofÃ¡sica'),
  ('800', 'Ajustes de crÃ©dito, ZFM e base de cÃ¡lculo (800-830)')
) AS v(codigo, descricao);


-- =============================================================================
-- SOURCE: frontend/database/empresa_certificado_schema.sql
-- =============================================================================
-- ===============================
-- Certificado digital (A1) por empresa para NF-e
-- ===============================

CREATE TABLE IF NOT EXISTS empresa_certificado (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,

    -- Caminho do arquivo .pfx armazenado em storage seguro (Supabase Storage ou similar)
    storage_path TEXT NOT NULL,

    -- Senha do certificado, armazenada de forma criptografada pela API backend
    senha_criptografada TEXT NOT NULL,

    -- Metadados opcionais do certificado
    validade        DATE,
    numero_serie    TEXT,
    emissor         TEXT,

    ativo BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_empresa_certificado_empresa_ativo
    ON empresa_certificado(empresa_id)
    WHERE ativo = TRUE;

ALTER TABLE empresa_certificado ENABLE ROW LEVEL SECURITY;

-- Regra conservadora: somente role de serviÃ§o do backend deve ter acesso total.
-- No Supabase, recomenda-se restringir esta tabela e acessÃ¡-la apenas via chave de serviÃ§o.
CREATE POLICY "Bloquear acesso padrÃ£o empresa_certificado"
ON empresa_certificado FOR ALL
TO public
USING (false)
WITH CHECK (false);



-- =============================================================================
-- SOURCE: frontend/database/empresa_logo_schema.sql
-- =============================================================================
-- ==========================================
-- Logo da empresa (imagem em Storage, URL na tabela)
-- A imagem Ã© salva no Supabase Storage para ser acessÃ­vel de qualquer lugar.
-- A tabela guarda apenas a referÃªncia (URL) e o id da empresa.
-- ==========================================

-- Tabela: uma logo por empresa (url aponta para o arquivo no Storage)
CREATE TABLE IF NOT EXISTS empresa_logo (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    url_imagem TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_empresa_logo UNIQUE (empresa_id)
);

CREATE INDEX IF NOT EXISTS idx_empresa_logo_empresa_id ON empresa_logo(empresa_id);

COMMENT ON TABLE empresa_logo IS 'URL da logo da empresa no Storage (imagem acessÃ­vel de qualquer lugar)';
COMMENT ON COLUMN empresa_logo.url_imagem IS 'URL pÃºblica do arquivo no bucket storage.empresa_logos';

ALTER TABLE empresa_logo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total empresa_logo" ON empresa_logo;
CREATE POLICY "Acesso total empresa_logo" ON empresa_logo
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- ==========================================
-- Storage: bucket para logos das empresas (pÃºblico para leitura)
-- O app faz upload do arquivo; a URL fica em empresa_logo.url_imagem
-- ==========================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'empresa_logos',
    'empresa_logos',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Leitura pÃºblica (para PDF e acesso de qualquer lugar)
DROP POLICY IF EXISTS "Leitura logos empresas" ON storage.objects;
CREATE POLICY "Leitura logos empresas" ON storage.objects
    FOR SELECT USING (bucket_id = 'empresa_logos');

-- Upload apenas para autenticados
DROP POLICY IF EXISTS "Upload logos empresas" ON storage.objects;
CREATE POLICY "Upload logos empresas" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'empresa_logos');

-- AtualizaÃ§Ã£o e deleÃ§Ã£o para autenticados
DROP POLICY IF EXISTS "Update logos empresas" ON storage.objects;
CREATE POLICY "Update logos empresas" ON storage.objects
    FOR UPDATE TO authenticated USING (bucket_id = 'empresa_logos');

DROP POLICY IF EXISTS "Delete logos empresas" ON storage.objects;
CREATE POLICY "Delete logos empresas" ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'empresa_logos');


-- =============================================================================
-- SOURCE: backend/cce_history_table.sql
-- =============================================================================
-- =============================================================
-- Tabela de HistÃ³rico de Cartas de CorreÃ§Ã£o (CC-e)
-- =============================================================

CREATE TABLE IF NOT EXISTS public.nota_fiscal_cce (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nota_fiscal_id UUID NOT NULL REFERENCES public.nota_fiscal(id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    usuario_id UUID REFERENCES public.clientes_azoup(id) ON DELETE SET NULL,
    
    sequencial INTEGER NOT NULL,
    correcao TEXT NOT NULL,
    data_evento TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    xml_url TEXT,
    pdf_url TEXT,
    protocolo TEXT,
    status_sefaz TEXT,
    mensagem_sefaz TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nota_fiscal_cce_nota_id ON public.nota_fiscal_cce(nota_fiscal_id);
CREATE INDEX IF NOT EXISTS idx_nota_fiscal_cce_empresa_id ON public.nota_fiscal_cce(empresa_id);

ALTER TABLE public.nota_fiscal_cce ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total nota_fiscal_cce" ON public.nota_fiscal_cce;
CREATE POLICY "Acesso total nota_fiscal_cce"
ON public.nota_fiscal_cce FOR ALL TO authenticated
USING (true) WITH CHECK (true);


-- =============================================================================
-- SOURCE: backend/setup_nfe_storage.sql
-- =============================================================================
-- =============================================================
-- NFe Storage Setup Script
-- Execute no Editor SQL do Supabase Dashboard
-- =============================================================

-- 1. Criar buckets (idempotente)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('nfe_xmls', 'nfe_xmls', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('nota_fiscal_danfe', 'nota_fiscal_danfe', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- =============================================================
-- 2. Policies do bucket nfe_xmls
-- Remove antes de recriar (evita erro de conflito)
-- =============================================================
DROP POLICY IF EXISTS "nfe_xmls_select" ON storage.objects;
DROP POLICY IF EXISTS "nfe_xmls_insert" ON storage.objects;
DROP POLICY IF EXISTS "nfe_xmls_update" ON storage.objects;
DROP POLICY IF EXISTS "nfe_xmls_delete" ON storage.objects;

CREATE POLICY "nfe_xmls_select"
ON storage.objects FOR SELECT
USING ( bucket_id = 'nfe_xmls' );

CREATE POLICY "nfe_xmls_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'nfe_xmls' );

CREATE POLICY "nfe_xmls_update"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'nfe_xmls' )
WITH CHECK ( bucket_id = 'nfe_xmls' );

CREATE POLICY "nfe_xmls_delete"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'nfe_xmls' );

-- =============================================================
-- 3. Policies do bucket nota_fiscal_danfe
-- =============================================================
DROP POLICY IF EXISTS "nfe_danfe_select" ON storage.objects;
DROP POLICY IF EXISTS "nfe_danfe_insert" ON storage.objects;
DROP POLICY IF EXISTS "nfe_danfe_update" ON storage.objects;
DROP POLICY IF EXISTS "nfe_danfe_delete" ON storage.objects;

CREATE POLICY "nfe_danfe_select"
ON storage.objects FOR SELECT
USING ( bucket_id = 'nota_fiscal_danfe' );

CREATE POLICY "nfe_danfe_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'nota_fiscal_danfe' );

CREATE POLICY "nfe_danfe_update"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'nota_fiscal_danfe' )
WITH CHECK ( bucket_id = 'nota_fiscal_danfe' );

CREATE POLICY "nfe_danfe_delete"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'nota_fiscal_danfe' );

-- =============================================================
-- 4. Tabela de logs dos XMLs da NF-e
-- =============================================================
CREATE TABLE IF NOT EXISTS public.nfe_xml_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nota_fiscal_id UUID NOT NULL REFERENCES public.nota_fiscal(id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    cliente_id UUID,
    tipo_evento TEXT NOT NULL, -- 'ENVIO', 'AUTORIZACAO', 'CONSULTA'
    nome_arquivo TEXT NOT NULL,
    url_storage TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nfe_xml_logs_nota_fiscal_id ON public.nfe_xml_logs(nota_fiscal_id);
CREATE INDEX IF NOT EXISTS idx_nfe_xml_logs_empresa_id ON public.nfe_xml_logs(empresa_id);

ALTER TABLE public.nfe_xml_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nfe_xml_logs_select" ON public.nfe_xml_logs;
DROP POLICY IF EXISTS "nfe_xml_logs_insert" ON public.nfe_xml_logs;

CREATE POLICY "nfe_xml_logs_select"
ON public.nfe_xml_logs FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "nfe_xml_logs_insert"
ON public.nfe_xml_logs FOR INSERT
TO authenticated
WITH CHECK (true);


-- =============================================================================
-- SOURCE: backend/add_xml_url_column.sql
-- =============================================================================
-- Adicionar coluna xml_url na tabela nota_fiscal para facilitar o compartilhamento
ALTER TABLE public.nota_fiscal ADD COLUMN IF NOT EXISTS xml_url TEXT;

-- ComentÃ¡rio para documentaÃ§Ã£o
COMMENT ON COLUMN public.nota_fiscal.xml_url IS 'URL pÃºblica do XML da nota autorizada no storage';


-- =============================================================================
-- SOURCE: frontend/database/migration_manifesto_nfe_estado.sql
-- =============================================================================
-- Tabela para persistir o estado da consulta de Manifesto NF-e por empresa.
-- Salva o Ãºltimo NSU consultado (ult_nsu) e o NSU mÃ¡ximo retornado pela SEFAZ (max_nsu),
-- permitindo que consultas subsequentes continuem de onde pararam.

CREATE TABLE IF NOT EXISTS public.manifesto_nfe_estado (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id_tenant UUID NOT NULL REFERENCES public.clientes_azoup(id) ON DELETE CASCADE,
    empresa_id      UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    ult_nsu         VARCHAR(15) NOT NULL DEFAULT '000000000000000',
    max_nsu         VARCHAR(15),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_manifesto_nfe_estado_empresa UNIQUE (empresa_id)
);

CREATE INDEX IF NOT EXISTS idx_manifesto_nfe_estado_empresa
    ON public.manifesto_nfe_estado (empresa_id);

CREATE INDEX IF NOT EXISTS idx_manifesto_nfe_estado_tenant
    ON public.manifesto_nfe_estado (cliente_id_tenant);

-- RLS: apenas o tenant dono dos dados tem acesso
ALTER TABLE public.manifesto_nfe_estado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso total manifesto_nfe_estado"
    ON public.manifesto_nfe_estado
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE public.manifesto_nfe_estado IS
    'Persiste o Ãºltimo NSU de consulta do Manifesto NF-e por empresa, evitando re-consultar desde o inÃ­cio.';
COMMENT ON COLUMN public.manifesto_nfe_estado.ult_nsu IS
    'Ãšltimo NSU retornado pela SEFAZ (15 dÃ­gitos com zeros Ã  esquerda).';
COMMENT ON COLUMN public.manifesto_nfe_estado.max_nsu IS
    'NSU mÃ¡ximo disponÃ­vel na SEFAZ na Ãºltima consulta (pode ser NULL se nÃ£o informado).';


-- =============================================================================
-- SOURCE: frontend/database/migration_nota_fiscal_venda_id_nullable.sql
-- =============================================================================
-- NF-e manual (sem pedido): permite nota_fiscal sem venda vinculada.
-- ApÃ³s aplicar, inserts com venda_id NULL sÃ£o vÃ¡lidos.

ALTER TABLE public.nota_fiscal
    ALTER COLUMN venda_id DROP NOT NULL;

COMMENT ON COLUMN public.nota_fiscal.venda_id IS 'Pedido de venda de origem, quando a NF vem do faturamento; NULL em NF manual.';


-- =============================================================================
-- SOURCE: frontend/database/nota_fiscal_danfe_storage_policies.sql
-- =============================================================================
-- CriaÃ§Ã£o/garantia do bucket de DANFE para NF-e
-- Executar no SQL do Supabase.

-- 1) Garante que o bucket exista e seja pÃºblico
insert into storage.buckets (id, name, public)
values ('nota_fiscal_danfe', 'nota_fiscal_danfe', true)
on conflict (id) do update
set public = true;

-- 2) Policy: leitura pÃºblica (anon + authenticated) apenas para o bucket nota_fiscal_danfe
create policy "Public read DANFE"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'nota_fiscal_danfe');

-- 3) Policy: acesso total para service_role no bucket nota_fiscal_danfe
create policy "Service role full access DANFE"
on storage.objects
for all
to service_role
using (bucket_id = 'nota_fiscal_danfe')
with check (bucket_id = 'nota_fiscal_danfe');




-- =============================================================================
-- SOURCE: frontend/database/migration_audit_logs.sql
-- =============================================================================
-- ============================================================
-- MIGRATION: audit_logs
-- Registra alteraÃ§Ãµes em Vendas, Produtos e OPs de ProduÃ§Ã£o.
-- Execute no SQL Editor do Supabase (projeto correto).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id            bigserial PRIMARY KEY,
    cliente_id    uuid NOT NULL,
    entidade      text NOT NULL,          -- 'venda' | 'produto' | 'producao_op'
    acao          text NOT NULL,          -- 'criar' | 'editar' | 'excluir' | 'cancelar' | 'mover_fase'
    entidade_id   text,                   -- id do registro afetado (venda.id, produto.id, op.id)
    descricao     text,                   -- texto humano: "Pedido #42 | Cliente: Fulano"
    detalhes      jsonb,                  -- dados extras (fase anterior/nova, campos alterados etc.)
    usuario_id    uuid,                   -- usuarios.id (quem fez)
    usuario_nome  text,                   -- nome do usuÃ¡rio (snapshot para nÃ£o perder se deletar)
    usuario_email text,
    criado_em     timestamptz NOT NULL DEFAULT now()
);

-- Ãndices para filtros comuns
CREATE INDEX IF NOT EXISTS audit_logs_cliente_id_idx   ON public.audit_logs (cliente_id);
CREATE INDEX IF NOT EXISTS audit_logs_entidade_idx     ON public.audit_logs (entidade);
CREATE INDEX IF NOT EXISTS audit_logs_entidade_id_idx  ON public.audit_logs (entidade_id);
CREATE INDEX IF NOT EXISTS audit_logs_criado_em_idx    ON public.audit_logs (criado_em DESC);
CREATE INDEX IF NOT EXISTS audit_logs_usuario_id_idx   ON public.audit_logs (usuario_id);

-- RLS: cada tenant vÃª apenas seus prÃ³prios logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- PolÃ­tica de leitura: usuÃ¡rios autenticados que pertencem ao cliente
CREATE POLICY "audit_logs_select" ON public.audit_logs
    FOR SELECT
    USING (
        cliente_id IN (
            SELECT u.cliente_id
            FROM public.usuarios u
            WHERE u.auth_id = auth.uid()
              AND u.ativo = true
        )
    );

-- PolÃ­tica de inserÃ§Ã£o: o prÃ³prio frontend grava (auth anon nÃ£o permitido)
CREATE POLICY "audit_logs_insert" ON public.audit_logs
    FOR INSERT
    WITH CHECK (
        cliente_id IN (
            SELECT u.cliente_id
            FROM public.usuarios u
            WHERE u.auth_id = auth.uid()
              AND u.ativo = true
        )
    );

-- Sem UPDATE nem DELETE: logs sÃ£o imutÃ¡veis
COMMENT ON TABLE public.audit_logs IS
  'Registro de auditoria de aÃ§Ãµes em Vendas, Produtos e OPs. ImutÃ¡vel apÃ³s inserÃ§Ã£o.';


-- =============================================================================
-- SOURCE: frontend/database/migration_whatsapp_ia.sql
-- =============================================================================
-- IntegraÃ§Ã£o Assistente IA via WhatsApp (Meta Cloud API)
-- VÃ­nculo: 1 nÃºmero por usuÃ¡rio ativo; limite = limite de logins do plano (validado na API).

CREATE TABLE IF NOT EXISTS usuario_whatsapp (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id uuid NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    telefone_e164 text NOT NULL,
    ativo boolean NOT NULL DEFAULT true,
    verificado_em timestamptz,
    verification_code text,
    verification_expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT usuario_whatsapp_usuario_unique UNIQUE (usuario_id),
    CONSTRAINT usuario_whatsapp_telefone_cliente_unique UNIQUE (cliente_id, telefone_e164)
);

CREATE INDEX IF NOT EXISTS idx_usuario_whatsapp_cliente ON usuario_whatsapp(cliente_id);
CREATE INDEX IF NOT EXISTS idx_usuario_whatsapp_telefone ON usuario_whatsapp(telefone_e164) WHERE ativo = true AND verificado_em IS NOT NULL;

CREATE TABLE IF NOT EXISTS whatsapp_ia_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id uuid NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    telefone_e164 text NOT NULL,
    messages jsonb NOT NULL DEFAULT '[]'::jsonb,
    last_synthesized_text text,
    pending_baixa_preview jsonb,
    pending_op_from_venda_preview jsonb,
    pending_fluxo_manual_preview jsonb,
    pending_cadastro_interpret jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT whatsapp_ia_sessions_phone_unique UNIQUE (cliente_id, telefone_e164)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_ia_sessions_usuario ON whatsapp_ia_sessions(usuario_id);

ALTER TABLE usuario_whatsapp ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_ia_sessions ENABLE ROW LEVEL SECURITY;

-- Apenas service role no backend manipula (RLS deny-all para anon/authenticated)
CREATE POLICY usuario_whatsapp_deny_all ON usuario_whatsapp FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY whatsapp_ia_sessions_deny_all ON whatsapp_ia_sessions FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE usuario_whatsapp IS 'VÃ­nculo WhatsApp â†” usuÃ¡rio do tenant para Assistente IA';
COMMENT ON TABLE whatsapp_ia_sessions IS 'Estado conversacional do assistente via WhatsApp';


-- =============================================================================
-- SOURCE: frontend/database/migration_whatsapp_op_move_session.sql
-- =============================================================================
-- Migration: adiciona coluna para preview de movimentaÃ§Ã£o de OP na sessÃ£o WhatsApp IA
-- Execute no SQL Editor do Supabase

ALTER TABLE IF EXISTS whatsapp_ia_sessions
    ADD COLUMN IF NOT EXISTS pending_op_move_preview jsonb NULL;

COMMENT ON COLUMN whatsapp_ia_sessions.pending_op_move_preview IS
    'Preview da movimentaÃ§Ã£o de OP em andamento (fluxo conversacional de mover OP entre fases)';


-- =============================================================================
-- SOURCE: frontend/database/migration_mockup_simulacoes.sql
-- =============================================================================
-- Simulador de mockup com IA (fases: base, canvas, finalizaÃ§Ã£o)
CREATE TABLE IF NOT EXISTS mockup_simulacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id_tenant UUID NOT NULL REFERENCES clientes_azoup(id) ON DELETE CASCADE,
    venda_id BIGINT REFERENCES venda(id) ON DELETE SET NULL,
    venda_item_id UUID REFERENCES venda_itens(id) ON DELETE SET NULL,
    produto_id UUID REFERENCES produtos(id) ON DELETE SET NULL,
    cor TEXT,
    imagem_base_url TEXT,
    canvas_json JSONB,
    imagem_final_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mockup_simulacoes_venda ON mockup_simulacoes(venda_id);
CREATE INDEX IF NOT EXISTS idx_mockup_simulacoes_tenant ON mockup_simulacoes(cliente_id_tenant);

ALTER TABLE mockup_simulacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total mockup_simulacoes" ON mockup_simulacoes;
CREATE POLICY "Acesso total mockup_simulacoes" ON mockup_simulacoes
    FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- =============================================================================
-- SOURCE: frontend/database/migration_set_tipo_operacao_default_vendas.sql
-- =============================================================================
-- ============================================================
-- Migration: preencher tipo_operacao_id nas vendas existentes
-- ============================================================
-- Preenche apenas vendas que ainda nÃ£o possuem tipo_operacao_id.
--
-- Se vocÃª tiver mais de um tenant e quiser limitar por cliente_id_tenant,
-- adicione no WHERE a clÃ¡usula:
--   AND cliente_id_tenant = '<SEU_TENANT_UUID>'
-- ============================================================

UPDATE venda
SET tipo_operacao_id = 'e08d1a83-5494-4f5f-a552-46f1d9bf37e3'
WHERE tipo_operacao_id IS NULL;



-- =============================================================================
-- SOURCE: frontend/database/migration_seed_configuracao_prompt_ia.sql
-- =============================================================================
-- Insere configuraÃ§Ã£o Prompt IA padrÃ£o no seed de tenant (chamado apÃ³s cadastro da empresa).
-- Atualize tambÃ©m BancodeDadosPadrao.txt e regenere migration_seed_tenant_defaults_fn.sql se usar o gerador.

-- Bloco a incluir em seed_tenant_defaults (antes do END):
/*
    IF to_regclass('public.configuracao_prompt_ia') IS NOT NULL THEN
        INSERT INTO public.configuracao_prompt_ia (
            cliente_id, descricao, prompt_padrao, logo_posicao, logo_vertical, cor_fundo, logo_lados, logo_aplicacao
        )
        SELECT
            p_cliente_id,
            'PadrÃ£o',
            $prompt$...$prompt$,
            'center',
            'top',
            'ECEFF1',
            'frente',
            'costura'
        WHERE NOT EXISTS (
            SELECT 1 FROM public.configuracao_prompt_ia c WHERE c.cliente_id = p_cliente_id
        );
    END IF;
*/

-- Patch da funÃ§Ã£o seed_tenant_defaults (append idempotente)
CREATE OR REPLACE FUNCTION public.seed_configuracao_prompt_ia_default(p_cliente_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
BEGIN
    IF p_cliente_id IS NULL THEN
        RETURN;
    END IF;
    IF to_regclass('public.configuracao_prompt_ia') IS NULL THEN
        RETURN;
    END IF;

    INSERT INTO public.configuracao_prompt_ia (
        cliente_id,
        descricao,
        prompt_padrao
    )
    SELECT
        p_cliente_id,
        'PadrÃ£o',
        $prompt$=== IMAGEM BASE ===
Utilize a primeira imagem (foto do produto no cadastro) como referÃªncia fiel do modelo, corte e tipo de peÃ§a.
Mantenha a cor do tecido conforme a variaÃ§Ã£o vendida quando informada no pedido.

=== LOGOTIPO (segunda imagem) ===
Use a segunda imagem exclusivamente como logotipo a aplicar na peÃ§a.
ProporÃ§Ã£o realista, sem distorcer nem esticar a marca.

=== POSIÃ‡ÃƒO DO LOGOTIPO ===
Local horizontal: centro do peito.
Altura vertical: regiÃ£o superior do tronco / topo do peito.
A logo deve ficar na zona do peito (frente), seguindo a curvatura do tecido.

=== LADOS DA PEÃ‡A ===
Aplicar a logo somente na FRENTE da peÃ§a. NÃ£o repetir a logo no verso.

=== TIPO DE APLICAÃ‡ÃƒO NA ROUPA ===
Tipo de aplicaÃ§Ã£o: COSTURA ou BORDADO â€” textura de linha, relevo suave, integrada ao tecido; sem efeito de adesivo flutuante ou recorte artificial.

=== FUNDO E ILUMINAÃ‡ÃƒO ===
Fundo sÃ³lido cinza claro neutro (#ECEFF1).
IluminaÃ§Ã£o de estÃºdio profissional, sombra suave e aparÃªncia comercial para apresentaÃ§Ã£o ao cliente.

=== FIDELIDADE ===
NÃ£o alterar o design original da peÃ§a alÃ©m da aplicaÃ§Ã£o da logo.
NÃ£o substituir por outro produto, modelo ou estampa nÃ£o solicitada.$prompt$
    WHERE NOT EXISTS (
        SELECT 1 FROM public.configuracao_prompt_ia c WHERE c.cliente_id = p_cliente_id
    );
END;
$body$;

REVOKE ALL ON FUNCTION public.seed_configuracao_prompt_ia_default(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_configuracao_prompt_ia_default(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.seed_configuracao_prompt_ia_default(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_configuracao_prompt_ia_default(uuid) TO service_role;


-- =============================================================================
-- SOURCE: frontend/database/migration_seed_tenant_defaults_fn.sql
-- =============================================================================
-- Gerado a partir de BancodeDadosPadrao.txt (rodar node scripts/build-seed-tenant-fn.js para regerar)
-- Seed idempotente de cadastros padrÃ£o por tenant (cliente_azoup).
-- Chamada apÃ³s criar a primeira empresa no onboarding: seed_tenant_defaults(cliente_id, empresa_id).

CREATE OR REPLACE FUNCTION public.seed_tenant_defaults(p_cliente_id uuid, p_empresa_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
    v_roteiro_id uuid;
    v_has_baixa_aviamentos boolean;
BEGIN
    IF p_cliente_id IS NULL THEN
        RAISE EXCEPTION 'cliente_id obrigatÃ³rio';
    END IF;

    IF p_empresa_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.empresas e
            WHERE e.id = p_empresa_id AND e.cliente_id = p_cliente_id
        ) THEN
            RAISE EXCEPTION 'Empresa invÃ¡lida para este cliente.';
        END IF;
    END IF;

-- -----------------------------------------
    -- FORNECEDORES
    -- -----------------------------------------
    IF to_regclass('public.tipos_fornecedores') IS NOT NULL THEN
        INSERT INTO public.tipos_fornecedores (cliente_id, nome)
        SELECT p_cliente_id, x.nome
        FROM (VALUES
            ('FACCIONISTA'), ('TRANSPORTADORA'), ('PRESTADOR DE SERVIÃ‡O'), ('OFICINA'),
            ('AVIAMENTOS'), ('TECIDOS/MALHAS'), ('ETIQUETAS'), ('EMBALAGENS'),
            ('ESTAMPARIA'), ('BORDADO'), ('LAVANDERIA'), ('MANUTENÃ‡ÃƒO'),
            ('LIMPEZA'), ('TECNOLOGIA'), ('MARKETING'), ('CONTABILIDADE')
        ) AS x(nome)
        WHERE NOT EXISTS (
            SELECT 1 FROM public.tipos_fornecedores t
            WHERE t.cliente_id = p_cliente_id
              AND lower(t.nome) = lower(x.nome)
        );
    END IF;

    IF to_regclass('public.origens_fornecedores') IS NOT NULL THEN
        INSERT INTO public.origens_fornecedores (cliente_id, nome)
        SELECT p_cliente_id, x.nome
        FROM (VALUES
            ('INDICAÃ‡ÃƒO'), ('GOOGLE'), ('INSTAGRAM'), ('FACEBOOK'),
            ('FEIRA'), ('EVENTO'), ('REPRESENTANTE'), ('SITE'),
            ('WHATSAPP'), ('CLIENTE'), ('PARCERIA')
        ) AS x(nome)
        WHERE NOT EXISTS (
            SELECT 1 FROM public.origens_fornecedores t
            WHERE t.cliente_id = p_cliente_id
              AND lower(t.nome) = lower(x.nome)
        );
    END IF;

    IF to_regclass('public.fornecedor_contato_tipo') IS NOT NULL THEN
        INSERT INTO public.fornecedor_contato_tipo (cliente_id, nome)
        SELECT p_cliente_id, x.nome
        FROM (VALUES
            ('DIRETORIA'), ('GERÃŠNCIA'), ('COMERCIAL'), ('FINANCEIRO'),
            ('MARKETING'), ('LOGÃSTICA'), ('RECEPÃ‡ÃƒO'), ('PCP'),
            ('PRODUÃ‡ÃƒO'), ('EXPEDIÃ‡ÃƒO')
        ) AS x(nome)
        WHERE NOT EXISTS (
            SELECT 1 FROM public.fornecedor_contato_tipo t
            WHERE t.cliente_id = p_cliente_id
              AND lower(t.nome) = lower(x.nome)
        );
    END IF;

    -- -----------------------------------------
    -- CLIENTES
    -- -----------------------------------------
    IF to_regclass('public.tipos_clientes') IS NOT NULL THEN
        INSERT INTO public.tipos_clientes (cliente_id, nome)
        SELECT p_cliente_id, x.nome
        FROM (VALUES
            ('ATACADO'), ('VAREJO'), ('VIP'), ('IMPORTANTE'),
            ('ESCOLAR'), ('SOB MEDIDA'), ('REVENDEDOR'), ('REPRESENTANTE')
        ) AS x(nome)
        WHERE NOT EXISTS (
            SELECT 1 FROM public.tipos_clientes t
            WHERE t.cliente_id = p_cliente_id
              AND lower(t.nome) = lower(x.nome)
        );
    END IF;

    IF to_regclass('public.origens_clientes') IS NOT NULL THEN
        INSERT INTO public.origens_clientes (cliente_id, nome)
        SELECT p_cliente_id, x.nome
        FROM (VALUES
            ('INDICAÃ‡ÃƒO'), ('GOOGLE'), ('INSTAGRAM'), ('FACEBOOK'),
            ('MARKETING'), ('LOJA FÃSICA'), ('SITE'), ('WHATSAPP'), ('EVENTO')
        ) AS x(nome)
        WHERE NOT EXISTS (
            SELECT 1 FROM public.origens_clientes t
            WHERE t.cliente_id = p_cliente_id
              AND lower(t.nome) = lower(x.nome)
        );
    END IF;

    IF to_regclass('public.cliente_contato_tipo') IS NOT NULL THEN
        INSERT INTO public.cliente_contato_tipo (cliente_id, nome)
        SELECT p_cliente_id, x.nome
        FROM (VALUES
            ('DIRETORIA'), ('GERÃŠNCIA'), ('COMERCIAL'), ('FINANCEIRO'),
            ('MARKETING'), ('LOGÃSTICA'), ('RECEPÃ‡ÃƒO')
        ) AS x(nome)
        WHERE NOT EXISTS (
            SELECT 1 FROM public.cliente_contato_tipo t
            WHERE t.cliente_id = p_cliente_id
              AND lower(t.nome) = lower(x.nome)
        );
    END IF;

    -- -----------------------------------------
    -- VENDA
    -- -----------------------------------------
    IF to_regclass('public.origem_pedido') IS NOT NULL THEN
        INSERT INTO public.origem_pedido (cliente_id, descricao, ativo)
        SELECT p_cliente_id, x.descricao, true
        FROM (VALUES
            ('SITE'), ('LOJA FÃSICA'), ('WHATSAPP'), ('INSTAGRAM'),
            ('E-COMMERCE'), ('MARKETPLACE'), ('REPRESENTANTE')
        ) AS x(descricao)
        WHERE NOT EXISTS (
            SELECT 1 FROM public.origem_pedido t
            WHERE t.cliente_id = p_cliente_id
              AND lower(t.descricao) = lower(x.descricao)
        );
    END IF;

    IF to_regclass('public.condicao_pagamento') IS NOT NULL THEN
        INSERT INTO public.condicao_pagamento (cliente_id, descricao, tipo_calculo, parcelas_padrao, intervalo_dias, ativo)
        SELECT p_cliente_id, x.descricao, x.tipo_calculo, x.parcelas, x.intervalo, true
        FROM (VALUES
            ('Ã€ VISTA', 'fixo', 1, 0),
            ('30 DIAS', 'fixo', 1, 30),
            ('30/60 DIAS', 'intervalo', 2, 30),
            ('30/60/90', 'intervalo', 3, 30),
            ('7/14/21', 'intervalo', 3, 7),
            ('DÃ‰BITO', 'fixo', 1, 2),
            ('ENTRADA + RETIRADA', 'intervalo', 2, 30)
        ) AS x(descricao, tipo_calculo, parcelas, intervalo)
        WHERE NOT EXISTS (
            SELECT 1 FROM public.condicao_pagamento t
            WHERE t.cliente_id = p_cliente_id
              AND lower(t.descricao) = lower(x.descricao)
        );
    END IF;

    IF to_regclass('public.tipo_pagamento') IS NOT NULL THEN
        INSERT INTO public.tipo_pagamento (cliente_id, descricao, ativo)
        SELECT p_cliente_id, x.descricao, true
        FROM (VALUES
            ('PIX'), ('DINHEIRO'), ('BOLETO'), ('CHEQUE'),
            ('DÃ‰BITO'), ('CRÃ‰DITO Ã€ VISTA'), ('CRÃ‰DITO PARCELADO'),
            ('TRANSFERÃŠNCIA BANCÃRIA')
        ) AS x(descricao)
        WHERE NOT EXISTS (
            SELECT 1 FROM public.tipo_pagamento t
            WHERE t.cliente_id = p_cliente_id
              AND lower(t.descricao) = lower(x.descricao)
        );
    END IF;

    -- -----------------------------------------
    -- FINANCEIRO
    -- -----------------------------------------
    IF to_regclass('public.centros_custo') IS NOT NULL THEN
        INSERT INTO public.centros_custo (cliente_id_tenant, codigo, descricao, ativo)
        SELECT p_cliente_id, x.codigo, x.descricao, true
        FROM (VALUES
            ('CC-001','PRODUÃ‡ÃƒO'), ('CC-002','VENDAS'), ('CC-003','ADMINISTRATIVO'),
            ('CC-004','MARKETING'), ('CC-005','LOGÃSTICA'), ('CC-006','RH'),
            ('CC-007','TECNOLOGIA'), ('CC-008','PCP'), ('CC-009','EXPEDIÃ‡ÃƒO'),
            ('CC-010','ESTOQUE'), ('CC-011','COMPRAS')
        ) AS x(codigo, descricao)
        WHERE NOT EXISTS (
            SELECT 1 FROM public.centros_custo t
            WHERE t.cliente_id_tenant = p_cliente_id
              AND lower(t.descricao) = lower(x.descricao)
        );
    END IF;

    IF to_regclass('public.plano_contas') IS NOT NULL THEN
        INSERT INTO public.plano_contas (cliente_id_tenant, codigo, descricao, tipo_conta, nivel, id_pai, ativo)
        SELECT p_cliente_id, x.codigo, x.descricao, x.tipo_conta, 1, NULL, true
        FROM (VALUES
            ('PC-001','CLIENTES','ATIVO'),
            ('PC-002','FORNECEDORES','PASSIVO'),
            ('PC-003','CAIXA GERAL','ATIVO'),
            ('PC-004','BANCOS','ATIVO'),
            ('PC-005','APLICAÃ‡Ã•ES FINANCEIRAS','ATIVO'),
            ('PC-006','ESTOQUE','ATIVO'),
            ('PC-007','MATÃ‰RIA-PRIMA','ATIVO'),
            ('PC-008','PRODUTO ACABADO','ATIVO'),
            ('PC-009','INSUMOS','ATIVO'),
            ('PC-010','SOFTWARES','DESPESA'),
            ('PC-011','EMPRÃ‰STIMOS','PASSIVO'),
            ('PC-012','SALÃRIOS','DESPESA'),
            ('PC-013','FGTS','DESPESA'),
            ('PC-014','INSS','DESPESA'),
            ('PC-015','13Âº SALÃRIO','DESPESA'),
            ('PC-016','FÃ‰RIAS','DESPESA'),
            ('PC-017','TAXAS BANCÃRIAS','DESPESA'),
            ('PC-018','VALE TRANSPORTE','DESPESA'),
            ('PC-019','REFEIÃ‡Ã•ES','DESPESA'),
            ('PC-020','ÃGUA','DESPESA'),
            ('PC-021','ENERGIA','DESPESA'),
            ('PC-022','INTERNET','DESPESA'),
            ('PC-023','ALUGUEL','DESPESA'),
            ('PC-024','COMBUSTÃVEL','DESPESA'),
            ('PC-025','FRETES','DESPESA'),
            ('PC-026','MATERIAL DE LIMPEZA','DESPESA'),
            ('PC-027','MATERIAL DE INFORMÃTICA','DESPESA'),
            ('PC-028','MATERIAL DE USO E CONSUMO','DESPESA'),
            ('PC-029','MANUTENÃ‡ÃƒO','DESPESA'),
            ('PC-030','IMPOSTOS','DESPESA'),
            ('PC-031','COMISSÃ•ES','DESPESA'),
            ('PC-032','MARKETING','DESPESA')
        ) AS x(codigo, descricao, tipo_conta)
        WHERE NOT EXISTS (
            SELECT 1 FROM public.plano_contas t
            WHERE t.cliente_id_tenant = p_cliente_id
              AND lower(t.descricao) = lower(x.descricao)
        );
    END IF;

    IF to_regclass('public.contas_correntes') IS NOT NULL THEN
        INSERT INTO public.contas_correntes (cliente_id_tenant, descricao, banco, ativo)
        SELECT p_cliente_id, x.descricao, x.banco, true
        FROM (VALUES
            ('CAIXA (DINHEIRO)', 'DINHEIRO'),
            ('NUBANK', 'NUBANK'),
            ('CAIXA ECONÃ”MICA FEDERAL', 'CAIXA ECONÃ”MICA FEDERAL'),
            ('BRADESCO', 'BRADESCO'),
            ('ITAÃš', 'ITAÃš'),
            ('BANCO DO BRASIL', 'BANCO DO BRASIL'),
            ('SANTANDER', 'SANTANDER'),
            ('BANCO INTER', 'BANCO INTER'),
            ('PICPAY', 'PICPAY'),
            ('MERCADO PAGO', 'MERCADO PAGO'),
            ('C6 BANK', 'C6 BANK'),
            ('SICOOB', 'SICOOB'),
            ('SICREDI', 'SICREDI'),
            ('PAGBANK', 'PAGBANK'),
            ('STONE', 'STONE'),
            ('PAGSEGURO', 'PAGSEGURO'),
            ('BTG', 'BTG')
        ) AS x(descricao, banco)
        WHERE NOT EXISTS (
            SELECT 1 FROM public.contas_correntes t
            WHERE t.cliente_id_tenant = p_cliente_id
              AND lower(t.descricao) = lower(x.descricao)
        );
    END IF;

    IF to_regclass('public.grupos_dre') IS NOT NULL THEN
        INSERT INTO public.grupos_dre (cliente_id_tenant, nome, tipo_grupo, ordem)
        SELECT p_cliente_id, x.nome, x.tipo_grupo, x.ordem
        FROM (VALUES
            ('RECEITA BRUTA','RECEITA',1),
            ('DEDUÃ‡Ã•ES','DESPESA',2),
            ('RECEITA LÃQUIDA','RESULTADO',3),
            ('CUSTOS VARIÃVEIS','CUSTO',4),
            ('CUSTOS FIXOS','CUSTO',5),
            ('DESPESAS OPERACIONAIS','DESPESA',6),
            ('DESPESAS ADMINISTRATIVAS','DESPESA',7),
            ('DESPESAS FINANCEIRAS','DESPESA',8),
            ('RESULTADO OPERACIONAL','RESULTADO',9)
        ) AS x(nome, tipo_grupo, ordem)
        WHERE NOT EXISTS (
            SELECT 1 FROM public.grupos_dre t
            WHERE t.cliente_id_tenant = p_cliente_id
              AND lower(t.nome) = lower(x.nome)
        );
    END IF;

    -- -----------------------------------------
    -- PRODUTOS
    -- -----------------------------------------
    IF to_regclass('public.tabela_precos') IS NOT NULL THEN
        INSERT INTO public.tabela_precos (cliente_id, descricao, ativo)
        SELECT p_cliente_id, x.descricao, true
        FROM (VALUES
            ('PADRÃƒO'), ('VAREJO'), ('ATACADO'),
            ('REPRESENTANTE'), ('PROMOCIONAL'), ('BLACK FRIDAY')
        ) AS x(descricao)
        WHERE NOT EXISTS (
            SELECT 1 FROM public.tabela_precos t
            WHERE t.cliente_id = p_cliente_id
              AND lower(t.descricao) = lower(x.descricao)
        );
    END IF;

    IF to_regclass('public.categorias') IS NOT NULL THEN
        INSERT INTO public.categorias (cliente_id, nome)
        SELECT p_cliente_id, x.nome
        FROM (VALUES
            ('CAMISETAS'), ('CALÃ‡AS'), ('VESTIDOS'), ('TERNOS'), ('PALETÃ“S'),
            ('SUTIÃƒS'), ('CALCINHAS'), ('CAMISAS'), ('SHORTS'), ('SAIAS'),
            ('JAQUETAS'), ('BLUSAS'), ('MOLETONS'), ('CROPPEDS'),
            ('UNIFORMES'), ('MODA FITNESS'), ('MODA ÃNTIMA'), ('MODA SOCIAL')
        ) AS x(nome)
        WHERE NOT EXISTS (
            SELECT 1 FROM public.categorias t
            WHERE t.cliente_id = p_cliente_id
              AND lower(t.nome) = lower(x.nome)
        );
    END IF;

    IF to_regclass('public.tipo_tecido') IS NOT NULL THEN
        INSERT INTO public.tipo_tecido (cliente_id, descricao)
        SELECT p_cliente_id, x.descricao
        FROM (VALUES
            ('MALHA'), ('LINHO'), ('TRICOLINE'), ('VISCOSE'),
            ('ALGODÃƒO'), ('POLIÃ‰STER'), ('JEANS'), ('MOLETOM'),
            ('HELANCA'), ('TACTEL'), ('SUPLEX')
        ) AS x(descricao)
        WHERE NOT EXISTS (
            SELECT 1 FROM public.tipo_tecido t
            WHERE t.cliente_id = p_cliente_id
              AND lower(t.descricao) = lower(x.descricao)
        );
    END IF;

    -- -----------------------------------------
    -- USUÃRIOS
    -- -----------------------------------------
    IF to_regclass('public.tipos_usuario') IS NOT NULL THEN
        INSERT INTO public.tipos_usuario (cliente_id, descricao, telas_acesso, ativo)
        SELECT p_cliente_id, x.descricao, '[]'::jsonb, true
        FROM (VALUES
            ('ADMINISTRADOR'), ('COMERCIAL'), ('ESTOQUE'), ('FINANCEIRO'),
            ('PRODUÃ‡ÃƒO'), ('GERENCIAL'), ('CADASTRO'), ('EXPEDIÃ‡ÃƒO')
        ) AS x(descricao)
        WHERE NOT EXISTS (
            SELECT 1 FROM public.tipos_usuario t
            WHERE t.cliente_id = p_cliente_id
              AND lower(t.descricao) = lower(x.descricao)
        );
    END IF;

    -- -----------------------------------------
    -- INFORMAÃ‡Ã•ES FISCAIS
    -- -----------------------------------------
    IF to_regclass('public.tipo_operacao') IS NOT NULL THEN
        INSERT INTO public.tipo_operacao (cliente_id, descricao)
        SELECT p_cliente_id, x.descricao
        FROM (VALUES
            ('VENDA DENTRO DO ESTADO'),
            ('VENDA FORA DO ESTADO'),
            ('REVENDA DENTRO DO ESTADO'),
            ('REVENDA FORA DO ESTADO'),
            ('REMESSA PARA INDUSTRIALIZAÃ‡ÃƒO DENTRO DO ESTADO'),
            ('REMESSA PARA INDUSTRIALIZAÃ‡ÃƒO FORA DO ESTADO'),
            ('INDUSTRIALIZAÃ‡ÃƒO'),
            ('DEVOLUÃ‡ÃƒO'),
            ('TRANSFERÃŠNCIA'),
            ('BONIFICAÃ‡ÃƒO')
        ) AS x(descricao)
        WHERE NOT EXISTS (
            SELECT 1 FROM public.tipo_operacao t
            WHERE t.cliente_id = p_cliente_id
              AND lower(t.descricao) = lower(x.descricao)
        );
    END IF;

    -- -----------------------------------------
    -- PRODUÃ‡ÃƒO (Roteiro + Fases)
    -- -----------------------------------------
    IF to_regclass('public.roteiros_producao') IS NOT NULL
       AND to_regclass('public.roteiro_producao_fases') IS NOT NULL THEN

        SELECT id INTO v_roteiro_id
        FROM public.roteiros_producao
        WHERE cliente_id = p_cliente_id
          AND lower(nome) = lower('ROTEIRO PADRÃƒO CONFECÃ‡ÃƒO')
        LIMIT 1;

        IF v_roteiro_id IS NULL THEN
            INSERT INTO public.roteiros_producao (cliente_id, nome)
            VALUES (p_cliente_id, 'ROTEIRO PADRÃƒO CONFECÃ‡ÃƒO')
            RETURNING id INTO v_roteiro_id;
        END IF;

        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'roteiro_producao_fases'
              AND column_name = 'is_baixa_aviamentos'
        ) INTO v_has_baixa_aviamentos;

        IF v_has_baixa_aviamentos THEN
            INSERT INTO public.roteiro_producao_fases
                (roteiro_id, nome, is_corte, is_baixa_aviamentos, tempo_medio, unidade_tempo, ordem)
            SELECT v_roteiro_id, x.nome, x.is_corte, x.is_baixa_aviamentos, x.tempo_medio, x.unidade_tempo, x.ordem
            FROM (VALUES
                ('CORTE', true,  true,  2::numeric, 'dia',  1),
                ('COSTURA', false, false, 5::numeric, 'dia',  2),
                ('ESTAMPARIA', false, false, 2::numeric, 'dia',  3),
                ('BORDADO', false, false, 1::numeric, 'dia',  4),
                ('LAVANDERIA', false, false, 1::numeric, 'dia',  5),
                ('ACABAMENTO', false, false, 5::numeric, 'hora', 6),
                ('REVISÃƒO', false, false, 2::numeric, 'hora', 7),
                ('PASSADORIA', false, false, 1::numeric, 'dia',  8),
                ('EMBALAGEM', false, false, 5::numeric, 'hora', 9),
                ('EXPEDIÃ‡ÃƒO', false, false, 5::numeric, 'hora', 10)
            ) AS x(nome, is_corte, is_baixa_aviamentos, tempo_medio, unidade_tempo, ordem)
            WHERE NOT EXISTS (
                SELECT 1 FROM public.roteiro_producao_fases f
                WHERE f.roteiro_id = v_roteiro_id
                  AND lower(f.nome) = lower(x.nome)
            );
        ELSE
            INSERT INTO public.roteiro_producao_fases
                (roteiro_id, nome, is_corte, tempo_medio, unidade_tempo, ordem)
            SELECT v_roteiro_id, x.nome, x.is_corte, x.tempo_medio, x.unidade_tempo, x.ordem
            FROM (VALUES
                ('CORTE', true,  2::numeric, 'dia',  1),
                ('COSTURA', false, 5::numeric, 'dia',  2),
                ('ESTAMPARIA', false, 2::numeric, 'dia',  3),
                ('BORDADO', false, 1::numeric, 'dia',  4),
                ('LAVANDERIA', false, 1::numeric, 'dia',  5),
                ('ACABAMENTO', false, 5::numeric, 'hora', 6),
                ('REVISÃƒO', false, 2::numeric, 'hora', 7),
                ('PASSADORIA', false, 1::numeric, 'dia',  8),
                ('EMBALAGEM', false, 5::numeric, 'hora', 9),
                ('EXPEDIÃ‡ÃƒO', false, 5::numeric, 'hora', 10)
            ) AS x(nome, is_corte, tempo_medio, unidade_tempo, ordem)
            WHERE NOT EXISTS (
                SELECT 1 FROM public.roteiro_producao_fases f
                WHERE f.roteiro_id = v_roteiro_id
                  AND lower(f.nome) = lower(x.nome)
            );
        END IF;
    END IF;

    -- -----------------------------------------
    -- CONFIGURAÃ‡ÃƒO PROMPT IA (imagem com logo em vendas)
    -- -----------------------------------------
    IF to_regclass('public.configuracao_prompt_ia') IS NOT NULL THEN
        PERFORM public.seed_configuracao_prompt_ia_default(p_cliente_id);
    END IF;

END;

$body$;

REVOKE ALL ON FUNCTION public.seed_tenant_defaults(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_tenant_defaults(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.seed_tenant_defaults(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_tenant_defaults(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.seed_tenant_defaults(uuid, uuid) IS
'Popula cadastros bÃ¡sicos (fornecedor, cliente, venda, financeiro, produtos, usuÃ¡rios, fiscal, roteiro) para o tenant; idempotente. Opcional: p_empresa_id valida vÃ­nculo empresaâ€“cliente no onboarding.';


-- =============================================================================
-- SOURCE: frontend/database/cidades_codigo_ibge_seed.sql
-- =============================================================================
-- ===============================
-- Seed: cÃ³digos IBGE em cidades
-- ===============================
-- Esta migration garante que a coluna codigo_ibge exista em `cidades`
-- e preenche cÃ³digos IBGE para cidades jÃ¡ usadas pelo sistema.
--
-- IMPORTANTE:
-- - Ajuste / acrescente UPDATEs conforme novas cidades forem sendo usadas.
-- - A lista completa de cÃ³digos IBGE pode ser obtida no site do IBGE.

-- Garante a coluna (idempotente)
ALTER TABLE cidades
    ADD COLUMN IF NOT EXISTS codigo_ibge VARCHAR(7);

COMMENT ON COLUMN cidades.codigo_ibge IS 'CÃ³digo IBGE do municÃ­pio (7 dÃ­gitos)';

-- ===============================
-- Exemplos de preenchimento de cidades
-- ===============================

-- SumarÃ© / SP
-- CEP 13471-140 (Avenida Nove de Julho, Jardim SÃ£o Domingos)
-- CÃ³digo IBGE oficial: 3552403
UPDATE cidades
SET codigo_ibge = '3552403'
WHERE UPPER(TRIM(nome)) = 'SUMARÃ‰'
  AND UPPER(TRIM(estado)) = 'SP'
  AND (codigo_ibge IS NULL OR codigo_ibge = '');

-- MODELO PARA NOVAS CIDADES:
-- UPDATE cidades
-- SET codigo_ibge = '<COD_IBGE_7_DIGITOS>'
-- WHERE UPPER(TRIM(nome)) = '<NOME_DA_CIDADE_EM_MAIUSCULO>'
--   AND UPPER(TRIM(estado)) = '<UF>'
--   AND (codigo_ibge IS NULL OR codigo_ibge = '');



-- =============================================================================
-- SOURCE: frontend/database/codigos_fiscais_seed.sql
-- =============================================================================
-- ===============================
-- Seed: cÃ³digos fiscais padrÃ£o para todos os clientes
-- Rodar DEPOIS dos schemas das tabelas (cfop_codigos, class_trib_codigos, etc.)
-- Insere para cada cliente em clientes_azoup. Seguro rodar mais de uma vez (ON CONFLICT DO NOTHING).
-- Na tela os itens aparecem como "codigo - descricao"
-- ===============================

-- 1) CFOP
INSERT INTO cfop_codigos (cliente_id, codigo, descricao, ativo)
SELECT c.id, v.codigo, v.descricao, true
FROM clientes_azoup c
CROSS JOIN (VALUES
  ('5101', 'Venda de produÃ§Ã£o do estabelecimento - dentro do estado'),
  ('5102', 'Venda de mercadoria adquirida ou recebida de terceiros - dentro do estado'),
  ('5103', 'Venda de produÃ§Ã£o do estabelecimento - fora do estado'),
  ('5104', 'Venda de mercadoria adquirida ou recebida de terceiros - fora do estado'),
  ('5105', 'Venda de produÃ§Ã£o do estabelecimento - exterior'),
  ('5106', 'Venda de mercadoria adquirida ou recebida de terceiros - exterior'),
  ('5401', 'Venda de produÃ§Ã£o do estabelecimento em operaÃ§Ã£o com produto sujeito a ST - dentro do estado'),
  ('5402', 'Venda de mercadoria adquirida ou recebida de terceiros em operaÃ§Ã£o com mercadoria sujeita a ST - dentro do estado'),
  ('5403', 'Venda de produÃ§Ã£o do estabelecimento em operaÃ§Ã£o com produto sujeito a ST - fora do estado'),
  ('5405', 'Venda de mercadoria adquirida de terceiros em operaÃ§Ã£o com mercadoria sujeita a ST - fora do estado'),
  ('5651', 'Venda de mercadoria adquirida ou recebida de terceiros - remetida para industrializaÃ§Ã£o (operaÃ§Ã£o fora do estado)'),
  ('5656', 'Venda de mercadoria adquirida ou recebida de terceiros - remetida para industrializaÃ§Ã£o (operaÃ§Ã£o dentro do estado)'),
  ('5949', 'Outra saÃ­da de mercadoria ou prestaÃ§Ã£o de serviÃ§o nÃ£o especificada'),
  ('6101', 'Venda de produÃ§Ã£o do estabelecimento - fora do estado'),
  ('6102', 'Venda de mercadoria adquirida ou recebida de terceiros - fora do estado'),
  ('6107', 'Venda de mercadoria adquirida ou recebida de terceiros - exterior'),
  ('6401', 'Venda de produÃ§Ã£o do estabelecimento em operaÃ§Ã£o com produto sujeito a ST - fora do estado'),
  ('6402', 'Venda de mercadoria adquirida ou recebida de terceiros em operaÃ§Ã£o com mercadoria sujeita a ST - fora do estado'),
  ('6403', 'Venda de mercadoria adquirida ou recebida de terceiros em operaÃ§Ã£o com mercadoria sujeita a ST - exterior'),
  ('6404', 'Venda de mercadoria adquirida ou recebida de terceiros em operaÃ§Ã£o com mercadoria sujeita a ST - dentro do estado')
) AS v(codigo, descricao)
ON CONFLICT (cliente_id, codigo) DO NOTHING;

-- 2) ClassificaÃ§Ã£o TributÃ¡ria
INSERT INTO class_trib_codigos (cliente_id, codigo, descricao, ativo)
SELECT c.id, v.codigo, v.descricao, true
FROM clientes_azoup c
CROSS JOIN (VALUES
  ('TRIB_INT', 'Tributada integralmente'),
  ('TRIB_ST', 'Tributada com cobranÃ§a de ICMS por ST'),
  ('RED_BC', 'Com reduÃ§Ã£o de base de cÃ¡lculo'),
  ('ISENTA', 'Isenta'),
  ('NAO_TRIB', 'NÃ£o tributada'),
  ('IMUNE', 'Imune'),
  ('SUSPENSA', 'SuspensÃ£o'),
  ('DIFERIDO', 'Diferimento'),
  ('OUTROS', 'Outros')
) AS v(codigo, descricao)
ON CONFLICT (cliente_id, codigo) DO NOTHING;

-- 3) CST PIS
INSERT INTO cst_pis_codigos (cliente_id, codigo, descricao, ativo)
SELECT c.id, v.codigo, v.descricao, true
FROM clientes_azoup c
CROSS JOIN (VALUES
  ('01', 'OperaÃ§Ã£o tributÃ¡vel com alÃ­quota bÃ¡sica'),
  ('02', 'OperaÃ§Ã£o tributÃ¡vel com alÃ­quota diferenciada'),
  ('03', 'OperaÃ§Ã£o tributÃ¡vel com alÃ­quota por unidade de medida (monofÃ¡sico)'),
  ('04', 'OperaÃ§Ã£o tributÃ¡vel monofÃ¡sica - revenda a alÃ­quota zero'),
  ('05', 'OperaÃ§Ã£o tributÃ¡vel por substituiÃ§Ã£o tributÃ¡ria'),
  ('06', 'OperaÃ§Ã£o tributÃ¡vel a alÃ­quota zero'),
  ('07', 'OperaÃ§Ã£o isenta da contribuiÃ§Ã£o'),
  ('08', 'OperaÃ§Ã£o sem incidÃªncia da contribuiÃ§Ã£o'),
  ('09', 'OperaÃ§Ã£o com suspensÃ£o da contribuiÃ§Ã£o'),
  ('49', 'Outras operaÃ§Ãµes de saÃ­da'),
  ('50', 'OperaÃ§Ã£o com direito a crÃ©dito - vinculada exclusivamente a receita tributada'),
  ('51', 'OperaÃ§Ã£o com direito a crÃ©dito - vinculada exclusivamente a receita nÃ£o tributada'),
  ('52', 'OperaÃ§Ã£o com direito a crÃ©dito - vinculada exclusivamente a receita de exportaÃ§Ã£o'),
  ('53', 'OperaÃ§Ã£o com direito a crÃ©dito - vinculada a receitas tributadas e nÃ£o tributadas'),
  ('54', 'OperaÃ§Ã£o com direito a crÃ©dito - vinculada a receitas tributadas e nÃ£o tributadas e de exportaÃ§Ã£o'),
  ('55', 'CrÃ©dito presunto - operaÃ§Ã£o de entrada vinculada a receitas tributadas e nÃ£o tributadas'),
  ('56', 'CrÃ©dito presunto - operaÃ§Ã£o de entrada vinculada a receitas de exportaÃ§Ã£o'),
  ('60', 'CrÃ©dito presumido - operaÃ§Ã£o de aquisiÃ§Ã£o vinculada exclusivamente a receita tributada'),
  ('61', 'CrÃ©dito presumido - operaÃ§Ã£o de aquisiÃ§Ã£o vinculada exclusivamente a receita nÃ£o tributada'),
  ('62', 'CrÃ©dito presumido - operaÃ§Ã£o de aquisiÃ§Ã£o vinculada exclusivamente a receita de exportaÃ§Ã£o'),
  ('63', 'CrÃ©dito presumido - operaÃ§Ã£o de aquisiÃ§Ã£o vinculada a receitas tributadas e nÃ£o tributadas'),
  ('64', 'CrÃ©dito presumido - operaÃ§Ã£o de aquisiÃ§Ã£o vinculada a receitas tributadas, nÃ£o tributadas e de exportaÃ§Ã£o'),
  ('65', 'CrÃ©dito presumido - operaÃ§Ã£o de aquisiÃ§Ã£o vinculada exclusivamente a receita tributada (alÃ­quota diferenciada)'),
  ('66', 'CrÃ©dito presumido - operaÃ§Ã£o de aquisiÃ§Ã£o vinculada exclusivamente a receita de exportaÃ§Ã£o (alÃ­quota diferenciada)'),
  ('67', 'CrÃ©dito presumido - operaÃ§Ã£o de aquisiÃ§Ã£o vinculada a receitas tributadas e nÃ£o tributadas (alÃ­quota diferenciada)'),
  ('70', 'OperaÃ§Ã£o de aquisiÃ§Ã£o sem direito a crÃ©dito'),
  ('71', 'OperaÃ§Ã£o de aquisiÃ§Ã£o com isenÃ§Ã£o'),
  ('72', 'OperaÃ§Ã£o de aquisiÃ§Ã£o com suspensÃ£o'),
  ('73', 'OperaÃ§Ã£o de aquisiÃ§Ã£o a alÃ­quota zero'),
  ('74', 'OperaÃ§Ã£o de aquisiÃ§Ã£o sem incidÃªncia da contribuiÃ§Ã£o'),
  ('75', 'OperaÃ§Ã£o de aquisiÃ§Ã£o por substituiÃ§Ã£o tributÃ¡ria'),
  ('98', 'Outras operaÃ§Ãµes de entrada'),
  ('99', 'Outras operaÃ§Ãµes')
) AS v(codigo, descricao)
ON CONFLICT (cliente_id, codigo) DO NOTHING;

-- 4) CST COFINS
INSERT INTO cst_cofins_codigos (cliente_id, codigo, descricao, ativo)
SELECT c.id, v.codigo, v.descricao, true
FROM clientes_azoup c
CROSS JOIN (VALUES
  ('01', 'OperaÃ§Ã£o tributÃ¡vel com alÃ­quota bÃ¡sica'),
  ('02', 'OperaÃ§Ã£o tributÃ¡vel com alÃ­quota diferenciada'),
  ('03', 'OperaÃ§Ã£o tributÃ¡vel com alÃ­quota por unidade de medida (monofÃ¡sico)'),
  ('04', 'OperaÃ§Ã£o tributÃ¡vel monofÃ¡sica - revenda a alÃ­quota zero'),
  ('05', 'OperaÃ§Ã£o tributÃ¡vel por substituiÃ§Ã£o tributÃ¡ria'),
  ('06', 'OperaÃ§Ã£o tributÃ¡vel a alÃ­quota zero'),
  ('07', 'OperaÃ§Ã£o isenta da contribuiÃ§Ã£o'),
  ('08', 'OperaÃ§Ã£o sem incidÃªncia da contribuiÃ§Ã£o'),
  ('09', 'OperaÃ§Ã£o com suspensÃ£o da contribuiÃ§Ã£o'),
  ('49', 'Outras operaÃ§Ãµes de saÃ­da'),
  ('50', 'OperaÃ§Ã£o com direito a crÃ©dito - vinculada exclusivamente a receita tributada'),
  ('51', 'OperaÃ§Ã£o com direito a crÃ©dito - vinculada exclusivamente a receita nÃ£o tributada'),
  ('52', 'OperaÃ§Ã£o com direito a crÃ©dito - vinculada exclusivamente a receita de exportaÃ§Ã£o'),
  ('53', 'OperaÃ§Ã£o com direito a crÃ©dito - vinculada a receitas tributadas e nÃ£o tributadas'),
  ('54', 'OperaÃ§Ã£o com direito a crÃ©dito - vinculada a receitas tributadas, nÃ£o tributadas e de exportaÃ§Ã£o'),
  ('55', 'CrÃ©dito presunto - operaÃ§Ã£o de entrada vinculada a receitas tributadas e nÃ£o tributadas'),
  ('56', 'CrÃ©dito presunto - operaÃ§Ã£o de entrada vinculada a receitas de exportaÃ§Ã£o'),
  ('60', 'CrÃ©dito presumido - operaÃ§Ã£o de aquisiÃ§Ã£o vinculada exclusivamente a receita tributada'),
  ('61', 'CrÃ©dito presumido - operaÃ§Ã£o de aquisiÃ§Ã£o vinculada exclusivamente a receita nÃ£o tributada'),
  ('62', 'CrÃ©dito presumido - operaÃ§Ã£o de aquisiÃ§Ã£o vinculada exclusivamente a receita de exportaÃ§Ã£o'),
  ('63', 'CrÃ©dito presumido - operaÃ§Ã£o de aquisiÃ§Ã£o vinculada a receitas tributadas e nÃ£o tributadas'),
  ('64', 'CrÃ©dito presumido - operaÃ§Ã£o de aquisiÃ§Ã£o vinculada a receitas tributadas, nÃ£o tributadas e de exportaÃ§Ã£o'),
  ('65', 'CrÃ©dito presumido - operaÃ§Ã£o de aquisiÃ§Ã£o vinculada exclusivamente a receita tributada (alÃ­quota diferenciada)'),
  ('66', 'CrÃ©dito presumido - operaÃ§Ã£o de aquisiÃ§Ã£o vinculada exclusivamente a receita de exportaÃ§Ã£o (alÃ­quota diferenciada)'),
  ('67', 'CrÃ©dito presumido - operaÃ§Ã£o de aquisiÃ§Ã£o vinculada a receitas tributadas e nÃ£o tributadas (alÃ­quota diferenciada)'),
  ('70', 'OperaÃ§Ã£o de aquisiÃ§Ã£o sem direito a crÃ©dito'),
  ('71', 'OperaÃ§Ã£o de aquisiÃ§Ã£o com isenÃ§Ã£o'),
  ('72', 'OperaÃ§Ã£o de aquisiÃ§Ã£o com suspensÃ£o'),
  ('73', 'OperaÃ§Ã£o de aquisiÃ§Ã£o a alÃ­quota zero'),
  ('74', 'OperaÃ§Ã£o de aquisiÃ§Ã£o sem incidÃªncia da contribuiÃ§Ã£o'),
  ('75', 'OperaÃ§Ã£o de aquisiÃ§Ã£o por substituiÃ§Ã£o tributÃ¡ria'),
  ('98', 'Outras operaÃ§Ãµes de entrada'),
  ('99', 'Outras operaÃ§Ãµes')
) AS v(codigo, descricao)
ON CONFLICT (cliente_id, codigo) DO NOTHING;

-- 5) CST IBS/CBS (reforma tributÃ¡ria - cÃ³digos oficiais)
INSERT INTO cst_ibs_cbs_codigos (cliente_id, codigo, descricao, ativo)
SELECT c.id, v.codigo, v.descricao, true
FROM clientes_azoup c
CROSS JOIN (VALUES
  ('000', 'TributaÃ§Ã£o integral'),
  ('010', 'TributaÃ§Ã£o com alÃ­quotas uniformes (setor financeiro)'),
  ('011', 'TributaÃ§Ã£o com alÃ­quotas uniformes reduzidas (60% ou 30%)'),
  ('200', 'AlÃ­quota zero (ou reduzida: 80%, 70%, 60%, 50%, 40%, 30%)'),
  ('220', 'AlÃ­quota fixa'),
  ('400', 'IsenÃ§Ã£o'),
  ('410', 'Imunidade e nÃ£o incidÃªncia'),
  ('510', 'Diferimento (ou com reduÃ§Ã£o)'),
  ('515', 'Diferimento (ou com reduÃ§Ã£o)'),
  ('620', 'TributaÃ§Ã£o monofÃ¡sica'),
  ('800', 'Ajustes de crÃ©dito, ZFM e base de cÃ¡lculo (800-830)')
) AS v(codigo, descricao)
ON CONFLICT (cliente_id, codigo) DO NOTHING;

-- 6) CST IPI
INSERT INTO cst_ipi_codigos (cliente_id, codigo, descricao, ativo)
SELECT c.id, v.codigo, v.descricao, true
FROM clientes_azoup c
CROSS JOIN (VALUES
  ('00', 'Entrada com recuperaÃ§Ã£o de crÃ©dito'),
  ('01', 'Entrada tributada com alÃ­quota zero'),
  ('02', 'Entrada isenta'),
  ('03', 'Entrada nÃ£o-tributada'),
  ('04', 'Entrada imune'),
  ('05', 'Entrada com suspensÃ£o'),
  ('49', 'Outras entradas'),
  ('50', 'SaÃ­da tributada'),
  ('51', 'SaÃ­da tributada com alÃ­quota zero'),
  ('52', 'SaÃ­da isenta'),
  ('53', 'SaÃ­da nÃ£o-tributada'),
  ('54', 'SaÃ­da imune'),
  ('55', 'SaÃ­da com suspensÃ£o'),
  ('99', 'Outras saÃ­das')
) AS v(codigo, descricao)
ON CONFLICT (cliente_id, codigo) DO NOTHING;

-- 7) CST ICMS (Regime Normal)
INSERT INTO cst_icms_codigos (cliente_id, codigo, descricao, ativo)
SELECT c.id, v.codigo, v.descricao, true
FROM clientes_azoup c
CROSS JOIN (VALUES
  ('000', 'Tributada integralmente'),
  ('010', 'Tributada e com cobranÃ§a do ICMS por ST'),
  ('020', 'Com reduÃ§Ã£o de base de cÃ¡lculo'),
  ('030', 'Isenta ou nÃ£o tributada e com cobranÃ§a do ICMS por ST'),
  ('040', 'Isenta'),
  ('041', 'NÃ£o tributada'),
  ('050', 'SuspensÃ£o'),
  ('051', 'Diferimento'),
  ('060', 'ICMS cobrado anteriormente por ST ou por antecipaÃ§Ã£o'),
  ('070', 'Com reduÃ§Ã£o de BC e cobranÃ§a do ICMS por ST'),
  ('090', 'Outros'),
  ('100', 'Tributada integralmente (venda dentro do estado)'),
  ('101', 'Tributada com cobranÃ§a do ICMS por ST (venda dentro do estado)'),
  ('102', 'Tributada com reduÃ§Ã£o de BC (venda dentro do estado)'),
  ('200', 'Tributada integralmente (venda fora do estado)'),
  ('201', 'Tributada com cobranÃ§a do ICMS por ST (venda fora do estado)'),
  ('202', 'Tributada com reduÃ§Ã£o de BC (venda fora do estado)'),
  ('300', 'Isenta ou nÃ£o tributada (venda dentro do estado)'),
  ('400', 'Isenta (venda fora do estado)'),
  ('500', 'ICMS cobrado anteriormente por ST ou antecipaÃ§Ã£o (venda fora do estado)'),
  ('900', 'Outros (venda fora do estado)')
) AS v(codigo, descricao)
ON CONFLICT (cliente_id, codigo) DO NOTHING;

-- 8) CSOSN (Simples Nacional)
INSERT INTO csosn_codigos (cliente_id, codigo, descricao, ativo)
SELECT c.id, v.codigo, v.descricao, true
FROM clientes_azoup c
CROSS JOIN (VALUES
  ('101', 'Tributada pelo Simples Nacional com permissÃ£o de crÃ©dito'),
  ('102', 'Tributada pelo Simples Nacional sem permissÃ£o de crÃ©dito'),
  ('103', 'IsenÃ§Ã£o do ICMS no Simples Nacional para faixa de receita bruta'),
  ('201', 'Tributada pelo Simples Nacional com permissÃ£o de crÃ©dito e com cobranÃ§a do ICMS por ST'),
  ('202', 'Tributada pelo Simples Nacional sem permissÃ£o de crÃ©dito e com cobranÃ§a do ICMS por ST'),
  ('203', 'IsenÃ§Ã£o do ICMS no Simples Nacional para faixa de receita bruta e com cobranÃ§a do ICMS por ST'),
  ('300', 'Imune'),
  ('400', 'NÃ£o tributada pelo ICMS'),
  ('500', 'ICMS cobrado anteriormente por ST ou por antecipaÃ§Ã£o'),
  ('900', 'Outros')
) AS v(codigo, descricao)
ON CONFLICT (cliente_id, codigo) DO NOTHING;


-- =============================================================================
-- SOURCE (auto): frontend/database/fix_ibge_codes.sql
-- =============================================================================
-- ===============================
-- Script de CorreÃ§Ã£o: CÃ³digos IBGE (7 DÃ­gitos)
-- ===============================
-- Corrige cÃ³digos IBGE de 6 dÃ­gitos ou nulos para as cidades principais
-- garantindo a emissÃ£o correta da NF-e (Requisito SEFAZ).

-- Americana / SP (3501608)
UPDATE cidades 
SET codigo_ibge = '3501608'
WHERE (UPPER(TRIM(nome)) = 'AMERICANA' OR UPPER(TRIM(nome)) = 'AMERICANA-SP')
AND UPPER(TRIM(estado)) = 'SP';

-- SumarÃ© / SP (3552403)
UPDATE cidades 
SET codigo_ibge = '3552403'
WHERE UPPER(TRIM(nome)) = 'SUMARÃ‰'
AND UPPER(TRIM(estado)) = 'SP';

-- Santa BÃ¡rbara d'Oeste / SP (3545803)
UPDATE cidades 
SET codigo_ibge = '3545803'
WHERE (UPPER(TRIM(nome)) LIKE 'SANTA B%RBARA%OESTE%')
AND UPPER(TRIM(estado)) = 'SP';

-- Nova Odessa / SP (3533403)
UPDATE cidades 
SET codigo_ibge = '3533403'
WHERE UPPER(TRIM(nome)) = 'NOVA ODESSA'
AND UPPER(TRIM(estado)) = 'SP';

-- CosmÃ³polis / SP (3512805)
UPDATE cidades 
SET codigo_ibge = '3512805'
WHERE UPPER(TRIM(nome)) = 'COSMÃ“POLIS'
AND UPPER(TRIM(estado)) = 'SP';

-- PaulÃ­nia / SP (3536505)
UPDATE cidades 
SET codigo_ibge = '3536505'
WHERE UPPER(TRIM(nome)) = 'PAULÃNIA'
AND UPPER(TRIM(estado)) = 'SP';

-- Campinas / SP (3509502)
UPDATE cidades 
SET codigo_ibge = '3509502'
WHERE UPPER(TRIM(nome)) = 'CAMPINAS'
AND UPPER(TRIM(estado)) = 'SP';


-- =============================================================================
-- SOURCE (auto): frontend/database/regimes_tributarios_schema.sql
-- =============================================================================
-- ===============================
-- Regimes TributÃ¡rios
-- ===============================

CREATE TABLE IF NOT EXISTS regimes_tributarios (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    nome VARCHAR(80) NOT NULL,   -- 1-Simples Nacional, 2-SN excesso sublimite, 3-Regime Normal, 4-MEI
    codigo VARCHAR(20) NOT NULL, -- SN, SN_EXCESSO, RN, MEI
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_regime_codigo UNIQUE (codigo)
);

ALTER TABLE regimes_tributarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total regimes_tributarios"
ON regimes_tributarios FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- 1 - Simples Nacional
INSERT INTO regimes_tributarios (nome, codigo)
VALUES ('1-Simples Nacional', 'SN')
ON CONFLICT (codigo) DO UPDATE
SET nome = EXCLUDED.nome,
    updated_at = NOW();

-- 2 - Simples Nacional - excesso de sublimite da receita bruta
INSERT INTO regimes_tributarios (nome, codigo)
VALUES ('2-Simples Nacional - excesso de sublimite da receita bruta', 'SN_EXCESSO')
ON CONFLICT (codigo) DO UPDATE
SET nome = EXCLUDED.nome,
    updated_at = NOW();

-- 3 - Regime Normal
INSERT INTO regimes_tributarios (nome, codigo)
VALUES ('3-Regime Normal', 'RN')
ON CONFLICT (codigo) DO UPDATE
SET nome = EXCLUDED.nome,
    updated_at = NOW();

-- 4 - MEI
INSERT INTO regimes_tributarios (nome, codigo)
VALUES ('4-MEI', 'MEI')
ON CONFLICT (codigo) DO UPDATE
SET nome = EXCLUDED.nome,
    updated_at = NOW();

-- Adicionar coluna regime_id em empresas, se ainda nÃ£o existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'empresas'
          AND column_name = 'regime_id'
    ) THEN
        ALTER TABLE empresas
            ADD COLUMN regime_id UUID REFERENCES regimes_tributarios(id) ON DELETE SET NULL;
    END IF;
END $$;



-- =============================================================================
-- SOURCE (auto): frontend/database/seed_data.sql
-- =============================================================================
-- Inserir Origens de Produtos (PadrÃ£o NFe - Global)
INSERT INTO origens_produtos (codigo, descricao) VALUES 
('0', 'Nacional'),
('1', 'Estrangeira - ImportaÃ§Ã£o direta, exceto a indicada no cÃ³digo 6'),
('2', 'Estrangeira - Adquirida no mercado interno, exceto a indicada no cÃ³digo 7'),
('3', 'Nacional, mercadoria ou bem com ConteÃºdo de ImportaÃ§Ã£o superior a 40% e inferior ou igual a 70%'),
('4', 'Nacional, cuja produÃ§Ã£o tenha sido feita em conformidade com os processos produtivos bÃ¡sicos'),
('5', 'Nacional, mercadoria ou bem com ConteÃºdo de ImportaÃ§Ã£o inferior ou igual a 40%'),
('6', 'Estrangeira - ImportaÃ§Ã£o direta, sem similar nacional, constante em lista da CAMEX'),
('7', 'Estrangeira - Adquirida no mercado interno, sem similar nacional, constante em lista da CAMEX'),
('8', 'Nacional, mercadoria ou bem com ConteÃºdo de ImportaÃ§Ã£o superior a 70%')
ON CONFLICT DO NOTHING;

-- Bloco para inserir dados de teste vinculados ao primeiro cliente encontrado
DO $$
DECLARE
    v_cliente_id UUID;
    v_cat_roupas UUID;
    v_cat_calcados UUID;
BEGIN
    -- Seleciona o primeiro cliente da base (para fins de teste)
    -- SE VOCÃŠ QUISER ESPECIFICAR UM CLIENTE, SUBSTITUA PELO ID ESPECÃFICO
    SELECT id INTO v_cliente_id FROM clientes_azoup LIMIT 1;

    IF v_cliente_id IS NOT NULL THEN
        
        -- Grupos Fiscais
        INSERT INTO grupos_fiscais (nome, cliente_id) VALUES 
        ('Tributado Integralmente', v_cliente_id),
        ('Simples Nacional', v_cliente_id),
        ('SubstituiÃ§Ã£o TributÃ¡ria', v_cliente_id);

        -- Categorias
        INSERT INTO categorias (nome, cliente_id) VALUES ('Roupas', v_cliente_id) RETURNING id INTO v_cat_roupas;
        INSERT INTO categorias (nome, cliente_id) VALUES ('CalÃ§ados', v_cliente_id) RETURNING id INTO v_cat_calcados;

        -- Subcategorias (Vinculadas Ã s categorias acima)
        INSERT INTO subcategorias (nome, categoria_id, cliente_id) VALUES 
        ('Camisetas', v_cat_roupas, v_cliente_id),
        ('CalÃ§as Jeans', v_cat_roupas, v_cliente_id),
        ('Vestidos', v_cat_roupas, v_cliente_id),
        ('TÃªnis', v_cat_calcados, v_cliente_id),
        ('SandÃ¡lias', v_cat_calcados, v_cliente_id);

    ELSE
        RAISE NOTICE 'Nenhum cliente encontrado na tabela clientes_azoup. Crie um cliente antes de rodar este seed.';
    END IF;
END $$;

