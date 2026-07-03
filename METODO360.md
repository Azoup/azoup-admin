# Método Confecção 360 — Documentação técnica

Documento de referência para implementar a **tela administrativa** de edição do Método 360 (checklist, vídeos, critérios) e para entender como o ERP consome os dados.

**Migration SQL:** `frontend/database/migration_metodo360.sql`  
**App (tenant):** menu `Metodo360` em `DashboardScreen.js` → `Metodo360Screen.js`

---

## 1. Visão geral

O **Método Confecção 360** é uma trilha de onboarding com **7 missões fixas**. Cada missão tem um **checklist editável no banco** (itens, telas, vídeos, critérios de conclusão automática).

| Camada | O que é | Onde mora |
|--------|---------|-----------|
| **Missões (7)** | Título, objetivo, resultado, dica WhatsApp | **Código** — `frontend/src/constants/metodo360Missions.js` (não está no banco hoje) |
| **Itens de checklist** | Nome, tela, vídeo, critério, ordem | **Banco** — `metodo360_checklist_itens` |
| **Vídeos** | YouTube, título | **Banco** — `suporte_videos` (FK no item) |
| **Progresso** | Por conta cliente Azoup | **Banco** — `metodo360_progresso_cliente` |
| **Troféu** | Jornada 100% concluída | **Banco** — `metodo360_conclusao_cliente` |

O progresso é por **`clientes_azoup`** (tenant), não por usuário individual. Todos os usuários da mesma conta compartilham o mesmo progresso.

---

## 2. Diagrama de relacionamento

```mermaid
erDiagram
    suporte_videos ||o{ metodo360_checklist_itens : "suporte_video_id"
    metodo360_checklist_itens ||o{ metodo360_progresso_cliente : "checklist_item_id"
    clientes_azoup ||o{ metodo360_progresso_cliente : "cliente_id"
    clientes_azoup ||o| metodo360_conclusao_cliente : "cliente_id"

    suporte_videos {
        uuid id PK
        text titulo
        text youtube_url
        text categoria
        boolean ativo
    }

    metodo360_checklist_itens {
        uuid id PK
        int missao_numero "1-7"
        text nome
        text tela_referencia
        uuid suporte_video_id FK
        text criterio_verificacao
        int ordem
        boolean ativo
    }

    metodo360_progresso_cliente {
        uuid id PK
        uuid cliente_id FK
        uuid checklist_item_id FK
        timestamptz video_visto_em
        timestamptz concluido_em
    }

    metodo360_conclusao_cliente {
        uuid cliente_id PK
        timestamptz concluido_em
        int tentativas
    }
```

---

## 3. Tabelas do banco

### 3.1 `metodo360_checklist_itens` (editável pelo admin)

Template global dos itens de checklist. **Não** é por tenant — uma única lista vale para todas as confecções.

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|-------------|-----------|
| `id` | UUID | PK | Gerado automaticamente |
| `missao_numero` | INTEGER | Sim | Missão de **1 a 7** (CHECK no banco) |
| `nome` | TEXT | Sim | Texto exibido no checklist |
| `tela_referencia` | TEXT | Não | Chave do menu do ERP (ex.: `Products`, `Vendas`) — botão "Ir para…" |
| `suporte_video_id` | UUID | Não | FK → `suporte_videos(id)` ON DELETE SET NULL |
| `criterio_verificacao` | TEXT | Não | Chave de verificação automática (ver seção 6) |
| `ordem` | INTEGER | Sim | Ordem dentro da missão (menor = primeiro) |
| `ativo` | BOOLEAN | Sim | `false` = oculto no app (soft delete) |
| `created_at` | TIMESTAMPTZ | Auto | |
| `updated_at` | TIMESTAMPTZ | Auto | Atualizar ao salvar no admin |

**Índice:** `(missao_numero, ordem)` WHERE `ativo = TRUE`.

**RLS atual (app tenant):** apenas `SELECT` para `authenticated`, filtro `ativo = TRUE`.  
**Admin:** precisa de políticas com **service role** ou role admin para `INSERT` / `UPDATE` / `DELETE` (hoje não há policy de escrita para tenants).

---

### 3.2 `metodo360_progresso_cliente` (somente leitura no admin; gerado pelo app)

Progresso de cada item por conta (`clientes_azoup`).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | PK |
| `cliente_id` | UUID | FK → `clientes_azoup(id)` |
| `checklist_item_id` | UUID | FK → `metodo360_checklist_itens(id)` ON DELETE CASCADE |
| `video_visto_em` | TIMESTAMPTZ | Quando o usuário marcou o vídeo como assistido |
| `concluido_em` | TIMESTAMPTZ | Quando o item foi concluído (vídeo + critério) |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

**UNIQUE:** `(cliente_id, checklist_item_id)`.

**RLS:** tenant só acessa `cliente_id = get_my_cliente_id()`.

> **Atenção ao excluir item:** `ON DELETE CASCADE` apaga o progresso daquele item em todas as contas.

---

### 3.3 `metodo360_conclusao_cliente` (troféu)

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `cliente_id` | UUID | PK, FK → `clientes_azoup` |
| `concluido_em` | TIMESTAMPTZ | Quando completou as 7 missões |
| `tentativas` | INTEGER | Quantas vezes concluiu a jornada (refazer conta) |
| `updated_at` | TIMESTAMPTZ | |

Registrado automaticamente quando **todas** as missões têm 100% dos itens ativos concluídos.

---

### 3.4 `suporte_videos` (vídeos YouTube)

Tabela já existente. Usada pela tela Suporte e linkada nos itens do Método 360.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | PK — valor usado em `metodo360_checklist_itens.suporte_video_id` |
| `titulo` | TEXT | Título exibido no player |
| `youtube_url` | TEXT | URL do YouTube |
| `categoria` | TEXT | Incluir **`Método 360`** (liberado na migration) |
| `ordem` | INTEGER | Ordem na listagem de suporte |
| `ativo` | BOOLEAN | Só `true` aparece no app |
| `created_by_admin` | TEXT | Opcional — auditoria |

**RLS (app):** `SELECT` apenas se `ativo = TRUE`.  
**Admin:** cadastro/edição via service role ou painel (como os outros vídeos de suporte).

---

## 4. As 7 missões (fixas no código)

Textos das missões **não estão no banco** — estão em `frontend/src/constants/metodo360Missions.js`.

| Nº | Título | Objetivo (resumo) |
|----|--------|-------------------|
| 1 | Base no Lugar | Centralizar informações da confecção |
| 2 | WhatsApp no Comando | Operar o ERP pelo WhatsApp |
| 3 | Produção à Vista | Visibilidade dos pedidos |
| 4 | Estoque e Vendas na Mão | Decisões com dados reais |
| 5 | Controle Financeiro | Fluxo de caixa |
| 6 | Lucro Protegido | Margem e custos |
| 7 | Rotina 360 | Rotina diária de gestão |

Cada missão também tem: `resultado`, `whatsapp` (dica exibida no painel lateral).

**Evolução futura (opcional):** criar tabela `metodo360_missoes` para editar esses textos no admin. Hoje só o **checklist** é editável via banco.

---

## 5. Como o app usa os dados

### 5.1 Fluxo de carregamento

1. **`loadMetodo360State(clienteId)`** — rápido: busca itens + progresso salvo.
2. **`syncMetodo360Progress(clienteId, usuarioId)`** — em background: verifica critérios no ERP e grava `concluido_em`.

Arquivo: `frontend/src/services/metodo360Service.js`

### 5.2 Desbloqueio de missões

- Missão **1** sempre liberada.
- Missão **N** libera quando a missão **N−1** tem todos os itens **ativos** com `concluido_em` preenchido.
- Após concluir tudo, o cliente pode **refazer**; o progresso não é apagado.

### 5.3 Conclusão de um item de checklist

Um item só marca `concluido_em` quando **ambos** forem verdadeiros (se configurados):

| Condição | Campo |
|----------|--------|
| Vídeo assistido | `suporte_video_id` preenchido **e** `video_visto_em` no progresso |
| Ação no sistema | `criterio_verificacao` preenchido **e** verificação retorna OK |

- Se **não** houver `suporte_video_id`, não exige vídeo.
- Se **não** houver `criterio_verificacao`, não exige ação no ERP.

### 5.4 Vídeo na tela de detalhe

- Acima do checklist aparece o vídeo do **primeiro item pendente** (por `ordem`) que tenha `suporte_video_id` / vídeo linkado.
- Ao concluir itens, o vídeo **avança** para o próximo pendente com vídeo.
- Botão **"Assistido"** grava `video_visto_em`.

Componente: `frontend/src/components/metodo360/Metodo360DetailView.js`

### 5.5 Home e troféu

- Card na Home enquanto não concluiu; depois só ícone de troféu no canto.
- Menu lateral: **Método 360** (`activeMenu = 'Metodo360'`).

### 5.6 Cache

Checklist em memória por **5 minutos** no app (`fetchMetodo360ChecklistItems`). Após editar no admin, tenants podem levar até 5 min para ver mudanças (ou recarregar com force refresh se implementado).

---

## 6. Critérios de verificação (`criterio_verificacao`)

Chaves suportadas pelo app (`frontend/src/utils/metodo360Verification.js`):

| Chave | O que verifica |
|-------|----------------|
| `clientes_min_1` | ≥ 1 em `clientes_cadastros` (`cliente_id`) |
| `produtos_min_1` | ≥ 1 em `produtos` |
| `vendas_min_1` | ≥ 1 em `venda` (`cliente_id_tenant`) |
| `usuarios_min_1` | ≥ 1 em `usuarios` |
| `empresas_min_1` | ≥ 1 em `empresas` |
| `roteiros_min_1` | ≥ 1 em `roteiros_producao` |
| `producao_op_min_1` | ≥ 1 em `producao_op` |
| `contas_pagar_min_1` | ≥ 1 em `contas_pagar` |
| `contas_receber_min_1` | ≥ 1 em `contas_receber` |
| `contas_receber_baixada_min_1` | ≥ 1 conta a receber com status `Recebido` ou `Parcialmente Recebido` |
| `estoque_saldo_min_1` | ≥ 1 linha em `vw_estoque_saldo_ponta` com `quantidade > 0` |
| `whatsapp_ia_vinculado` | API WhatsApp IA com pelo menos 1 vínculo |

Chave **inexistente** ou **vazia** → critério ignorado (não bloqueia conclusão por dados).

No admin: usar **select** com essas opções + campo texto livre para futuras chaves (exige deploy no app para novos critérios).

---

## 7. Telas do ERP (`tela_referencia`)

Valor deve ser a **chave do menu** usada em `DashboardScreen.js` (`setActiveMenu('...')`). Exemplos usados no seed:

| Chave | Tela |
|-------|------|
| `Clients` | Clientes |
| `Products` | Produtos |
| `Vendas` | Vendas (Kanban) |
| `Users` | Usuários |
| `Companies` | Empresas |
| `WhatsAppIaConfig` | WhatsApp — Assistente IA |
| `ProductionRouting` | Roteiro de Produção |
| `ProductionKanban` | Kanban Produção |
| `ProductionDashboard` | Dashboard Produção |
| `VendasDashboard` | Dashboard Vendas |
| `EstoqueDashboard` | Dashboard Estoque |
| `EstoqueRelatorioPonta` | Relatório Estoque |
| `ContasPagar` | Contas a Pagar |
| `ContasReceber` | Contas a Receber |
| `FluxoCaixa` | Fluxo de Caixa |
| `PriceTable` | Tabela de preços |

Lista completa de aliases: `WEB_TITLE_ALIASES` em `frontend/src/screens/DashboardScreen.js` (~linha 189).

---

## 8. Especificação da tela admin (sugestão)

### 8.1 Escopo mínimo

1. **Listar missões 1–7** (títulos lidos do código ou hardcoded igual ao `metodo360Missions.js`).
2. Por missão, **listar itens** de `metodo360_checklist_itens` WHERE `missao_numero = N` ORDER BY `ordem`.
3. **CRUD de itens:**
   - Criar: `nome`, `missao_numero`, `ordem`, `tela_referencia`, `criterio_verificacao`, `suporte_video_id`, `ativo`
   - Editar: mesmos campos
   - Remover: preferir `ativo = false` (soft delete) para preservar histórico de progresso; hard delete só se nunca houve progresso
4. **Vínculo de vídeo:**
   - Dropdown/autocomplete de `suporte_videos` (filtrar `categoria = 'Método 360'` ou todas as categorias)
   - Botão "Criar novo vídeo" → formulário `titulo`, `youtube_url`, `categoria` (default `Método 360`), `ordem`, `ativo`
5. **Reordenar** itens (alterar `ordem` — ex.: drag-and-drop)
6. Opcional: visualizar progresso agregado por tenant (somente leitura)

### 8.2 Autenticação admin

Usar **service role** do Supabase ou backend admin existente — **não** o cliente anon/authenticated do ERP, pois RLS do checklist não permite escrita para tenants.

Sugestão de policies (rodar no Supabase se o admin usar JWT de service role):

```sql
-- Exemplo: escrita apenas service_role (ajustar conforme padrão do painel admin)
CREATE POLICY "Admin service role checklist metodo360"
    ON public.metodo360_checklist_itens
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
```

### 8.3 Queries úteis

**Listar itens com vídeo:**

```sql
SELECT
    i.id,
    i.missao_numero,
    i.nome,
    i.tela_referencia,
    i.criterio_verificacao,
    i.ordem,
    i.ativo,
    i.suporte_video_id,
    v.titulo AS video_titulo,
    v.youtube_url
FROM metodo360_checklist_itens i
LEFT JOIN suporte_videos v ON v.id = i.suporte_video_id
ORDER BY i.missao_numero, i.ordem;
```

**Inserir item:**

```sql
INSERT INTO metodo360_checklist_itens (
    missao_numero, nome, tela_referencia, suporte_video_id,
    criterio_verificacao, ordem, ativo, updated_at
) VALUES (
    1, 'Cadastrar fornecedores', 'Suppliers', 'uuid-do-video-aqui',
    'fornecedores_min_1', 6, true, now()
);
```

**Vincular vídeo a item existente:**

```sql
UPDATE metodo360_checklist_itens
SET suporte_video_id = 'uuid-do-video',
    updated_at = now()
WHERE id = 'uuid-do-item';
```

**Desativar item (recomendado em vez de DELETE):**

```sql
UPDATE metodo360_checklist_itens
SET ativo = false, updated_at = now()
WHERE id = 'uuid-do-item';
```

**Criar vídeo para o Método 360:**

```sql
INSERT INTO suporte_videos (titulo, youtube_url, categoria, ordem, ativo)
VALUES (
    'Como cadastrar um produto',
    'https://www.youtube.com/watch?v=XXXXXXXX',
    'Método 360',
    1,
    true
)
RETURNING id;
```

### 8.4 Validações recomendadas no admin

- `missao_numero` entre 1 e 7
- `nome` não vazio
- `ordem` único por missão (ou reordenar em lote)
- `suporte_video_id` deve existir em `suporte_videos` e estar `ativo = true`
- `youtube_url` válida ao criar vídeo
- Aviso ao desativar item: tenants com progresso naquele item não perdem o histórico, mas o item some da trilha

---

## 9. Seed inicial

A migration insere **33 itens** (5+5+4+4+5+4+4 por missão) se a tabela estiver vazia. Ver `migration_metodo360.sql` linhas 93–127.

Nenhum item vem com `suporte_video_id` no seed — vídeos devem ser cadastrados no admin e vinculados depois.

---

## 10. Arquivos do frontend (referência)

| Arquivo | Função |
|---------|--------|
| `frontend/database/migration_metodo360.sql` | Schema + seed |
| `frontend/src/constants/metodo360Missions.js` | Textos das 7 missões |
| `frontend/src/constants/metodo360Theme.js` | Cores / layout |
| `frontend/src/services/metodo360Service.js` | Load, sync, progresso |
| `frontend/src/utils/metodo360Verification.js` | Critérios automáticos |
| `frontend/src/utils/metodo360Trail.js` | Trilha gamificada / status missão |
| `frontend/src/screens/Metodo360Screen.js` | Tela principal |
| `frontend/src/components/metodo360/*` | UI (home, detalhe, trilha, anel) |
| `frontend/src/components/Metodo360HomeCard.js` | Card na Home |

---

## 11. Checklist para a IA do painel admin

- [ ] Tela "Método 360" no menu administrativo
- [ ] Abas ou seletor Missão 1–7
- [ ] Tabela de itens com editar / adicionar / desativar
- [ ] Campo `nome`, select `tela_referencia`, select `criterio_verificacao`
- [ ] Select de vídeo (`suporte_videos`) + criar vídeo com categoria `Método 360`
- [ ] Reordenação (`ordem`)
- [ ] API com service role (sem depender do RLS do tenant)
- [ ] (Opcional) Migration de policies de escrita para admin
- [ ] (Futuro) Tabela `metodo360_missoes` para editar títulos/objetivos das 7 missões no banco

---

## 12. Deploy

1. Rodar `frontend/database/migration_metodo360.sql` no Supabase (se ainda não rodou).
2. Confirmar categoria `Método 360` em `suporte_videos`.
3. Cadastrar vídeos e vincular nos itens pelo admin.
4. Testar no ERP: menu **Método 360** → abrir missão → vídeo do primeiro pendente + checklist.

---

*Última atualização: alinhado ao código do repositório RNWebSupabase (Método 360 integrado ao Dashboard Azoup).*
