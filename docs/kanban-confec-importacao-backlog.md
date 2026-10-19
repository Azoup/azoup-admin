# Kanban Confec — especificação para importação (Backlog)

Documento para gerar SQL de importação dos cards da coluna **Backlog** de outro sistema para o painel Azoup (`confec_kanban_cards`).

**Destino da importação nesta fase:** apenas coluna `backlog`.  
**Seção do sistema:** sempre `Outros`.  
**Tela:** texto livre derivado do título/descrição do ticket de origem (ver regras abaixo).

---

## 1. Visão geral

| Item | Valor |
|------|--------|
| Tabela principal | `public.confec_kanban_cards` |
| Coluna do quadro (status) | slug `backlog` |
| Sequence do número do ticket | `public.confec_kanban_ticket_number_seq` |
| Schema SQL base | `supabase/sql/admin_confec_kanban.sql` |
| Campos de nota/seção | `supabase/sql/admin_confec_notas_atualizacao.sql` |

O card é um ticket de suporte/ajuste do Confec. Fluxo de colunas:

| Ordem | Título | `status` (slug) | Uso |
|------:|--------|-----------------|-----|
| 0 | Backlog | `backlog` | Entrada / fila (importar aqui) |
| 1 | Analisados | `analisados` | Já analisados |
| 2 | Em andamento | `em-andamento` | Em desenvolvimento |
| 3 | Validação | `validacao` | Revisão antes de publicar |
| 4 | Finalizados | `finalizados` | Concluído / nota publicada |

Para importação do backlog antigo: **`status = 'backlog'`**, `completed_at = null`, campos de nota (`nota_*`) nulos.

---

## 2. Tabela `confec_kanban_cards` — campos

| Coluna | Tipo | Obrigatório | Default / regra | Descrição |
|--------|------|:-----------:|-----------------|-----------|
| `id` | `uuid` | sim | `gen_random_uuid()` | PK |
| `ticket_number` | `integer` | sim | sequence (trigger) | Número único do ticket (`#0001`…). Pode omitir no INSERT e deixar o trigger preencher |
| `title` | `text` | **sim** | — | Título curto do ticket |
| `description` | `text` | não | `null` | Observações do ticket / problema (texto “de negócio”) |
| `dev_notes` | `text` | não | `null` | Observações / correções DEV (solução técnica) |
| `cliente_id` | `uuid` | não | `null` | FK → `clientes_azoup(id)` ON DELETE SET NULL. Só preencher se o UUID existir neste projeto |
| `analista_email` | `text` | não | `null` | E-mail do analista (admin do painel) |
| `desenvolvedor_email` | `text` | não | `null` | E-mail do desenvolvedor |
| `created_by_email` | `text` | não | `null` | Quem criou o ticket |
| `status` | `text` | **sim** | — | Slug da coluna. Import: **`backlog`** |
| `position` | `integer` | sim | `0` | Ordem dentro da coluna (0, 1, 2…). Menor = mais acima |
| `completed_at` | `timestamptz` | não | `null` | Só preenchido em Finalizados. Import backlog: **`null`** |
| `secao` | `text` | não* | `null` | Seção do sistema (lista fechada). Import: **`Outros`** |
| `tela` | `text` | não* | `null` | Nome da tela do Confec (texto livre). Import: derivar do texto |
| `tela_nova` | `boolean` | sim | `false` | `true` se for tela nova. Import: **`false`** |
| `nota_linha` | `text` | não | `null` | Linha curta da nota de atualização (IA). Import: **`null`** |
| `nota_detalhe` | `text` | não | `null` | Detalhe da nota (bullets). Import: **`null`** |
| `nota_gerada_em` | `timestamptz` | não | `null` | Quando a IA gerou a nota. Import: **`null`** |
| `created_at` | `timestamptz` | sim | `now()` | Pode mapear a data de criação do sistema antigo |
| `updated_at` | `timestamptz` | sim | `now()` | Atualizado pelo trigger em insert |

\* `secao` e `tela` são obrigatórios **só ao mover para Finalizados**. No backlog podem ir preenchidos (recomendado na importação).

### Valores válidos de `secao`

Exato (case-sensitive):

- `Vendas`
- `Produção`
- `Financeiro`
- `Cadastros`
- `Estoque`
- `Agenda`
- `Outros`

**Para esta importação:** sempre `secao = 'Outros'`.

---

## 3. Regras de mapeamento (sistema antigo → Confec)

Use estas regras ao gerar o SQL a partir dos cards do backlog do outro sistema:

| Campo destino | Como preencher |
|---------------|----------------|
| `status` | `'backlog'` |
| `title` | Título do card antigo (obrigatório, trim, não vazio) |
| `description` | Corpo / descrição / problema do card antigo |
| `dev_notes` | Comentários técnicos / solução DEV, se houver; senão `null` |
| `secao` | **`'Outros'`** (fixo para todos os importados) |
| `tela` | Texto curto relacionado ao ticket (ver §3.1) |
| `tela_nova` | `false` |
| `cliente_id` | `null` (salvo se houver UUID válido em `clientes_azoup`) |
| `analista_email` | E-mail do responsável no sistema antigo, se parecer e-mail válido; senão `null` |
| `desenvolvedor_email` | Idem |
| `created_by_email` | Quem criou / importou (ex.: e-mail do admin que importa) |
| `position` | Ordem estável: 0..N-1 (mais antigo = 0 ou o inverso, mas consistente) |
| `completed_at` | `null` |
| `nota_linha`, `nota_detalhe`, `nota_gerada_em` | `null` |
| `ticket_number` | Omitir no INSERT (trigger usa a sequence) **ou** usar números livres acima do `max` atual |
| `created_at` | Data de criação do card antigo, se existir; senão `now()` |

### 3.1 Como montar `tela` a partir do texto

`tela` é texto livre (nome da tela do sistema). Nesta importação:

1. Preferir um campo “tela / módulo / área” do sistema antigo, se existir.
2. Se não existir, derivar do **título** (e se vazio, dos primeiros ~60 caracteres da descrição):
   - Remover prefixos tipo `[BUG]`, `Ticket #123`, etc.
   - Pegar as primeiras 2–5 palavras significativas **ou** um trecho curto até ~40 caracteres.
   - Ex.: título `Erro ao salvar pedido no PDV` → `tela = 'Pedidos / PDV'` ou `'Erro ao salvar pedido no PDV'` (aceito).
3. Se não der para extrair nada útil: `tela = 'Importado'`.
4. Não deixar `tela` vazia se `secao` for preenchida (recomendado ter os dois).

### 3.2 O que **não** importar nesta fase

- Anexos (`confec_kanban_card_images`, `confec_kanban_card_files`) — storage separado  
- Comentários, checklist, etiquetas (podem ser fase 2)  
- Cards que não estejam no backlog do sistema antigo  
- Colunas Finalizados / notas de atualização  

---

## 4. Exemplo de INSERT (modelo)

```sql
-- Importação Backlog → Kanban Confec
-- Pré-requisito: colunas do quadro já existem (slug backlog).

insert into public.confec_kanban_cards (
  title,
  description,
  dev_notes,
  cliente_id,
  analista_email,
  desenvolvedor_email,
  created_by_email,
  status,
  position,
  completed_at,
  secao,
  tela,
  tela_nova,
  nota_linha,
  nota_detalhe,
  nota_gerada_em,
  created_at,
  updated_at
) values
(
  'Erro ao salvar pedido no PDV',           -- title
  'Ao finalizar a venda unitária o vencimento não atualiza.', -- description
  null,                                      -- dev_notes
  null,                                      -- cliente_id
  null,                                      -- analista_email
  null,                                      -- desenvolvedor_email
  'importacao@azoup.com.br',                 -- created_by_email
  'backlog',                                 -- status
  0,                                         -- position
  null,                                      -- completed_at
  'Outros',                                  -- secao (fixo na importação)
  'Pedidos / PDV',                           -- tela (derivada do texto)
  false,                                     -- tela_nova
  null,                                      -- nota_linha
  null,                                      -- nota_detalhe
  null,                                      -- nota_gerada_em
  '2026-08-10T14:00:00-03:00',               -- created_at (origem)
  now()                                      -- updated_at
);
-- ticket_number: preenchido pelo trigger confec_kanban_ticket_number
```

### Inserir vários com `position` sequencial

```sql
insert into public.confec_kanban_cards (
  title, description, status, position, secao, tela, tela_nova, created_by_email
)
select
  v.title,
  v.description,
  'backlog',
  v.ord,
  'Outros',
  v.tela,
  false,
  'importacao@azoup.com.br'
from (
  values
    (0, 'Título A', 'Descrição A', 'Tela A'),
    (1, 'Título B', 'Descrição B', 'Tela B')
) as v(ord, title, description, tela);
```

---

## 5. Tabelas relacionadas (referência; não obrigatórias no import)

### `confec_kanban_columns`

| Coluna | Tipo | Notas |
|--------|------|--------|
| `id` | uuid | PK |
| `title` | text | Ex.: `Backlog` |
| `slug` | text | Único. Cards usam este valor em `status` |
| `color` | text | Hex, ex. `#94A3B8` |
| `position` | integer | Ordem das colunas |

### `confec_kanban_labels` / `confec_kanban_card_labels`

Etiquetas opcionais (N:N). Label especial `Concluído` é usada só em Finalizados.

### `confec_kanban_card_comments`

| Coluna | Tipo |
|--------|------|
| `card_id` | uuid → cards |
| `texto` | text |
| `author_email` | text |
| `created_at` / `updated_at` | timestamptz |

### `kanban_card_checklist`

| Coluna | Tipo | Notas |
|--------|------|--------|
| `card_id` | uuid | ID do card Confec |
| `card_type` | text | Deve ser `'confec'` |
| `texto` | text | |
| `feito` | boolean | default false |
| `position` | integer | |

### Anexos

- Imagens: `confec_kanban_card_images` + Storage bucket `confec-kanban-files`  
- Arquivos: `confec_kanban_card_files` + mesmo bucket  
- Path sugerido: `{card_id}/{timestamp}-{nome_seguro}`

---

## 6. Regras de negócio úteis para quem gera o SQL

1. **Backlog importado não precisa** de `secao`/`tela` para aparecer no quadro, mas nesta importação pedimos `secao = 'Outros'` e `tela` preenchida para facilitar o fluxo depois.  
2. Ao **finalizar** (mover para `finalizados`), o painel exige `secao` válida + `tela` não vazia; aí a IA gera `nota_linha` / `nota_detalhe`.  
3. Sair de Finalizados zera `completed_at` e as notas.  
4. `cliente_id` inválido quebra o INSERT (FK). Preferir `null`.  
5. Não reutilizar `ticket_number` já existente.  
6. RLS: inserts pelo painel exigem admin ativo; SQL no SQL Editor (service role / postgres) ignora RLS.

---

## 7. Checklist para o gerador de SQL no outro chat

Envie junto os cards do backlog do sistema antigo e peça:

- [ ] Um `INSERT` (ou vários) em `public.confec_kanban_cards`
- [ ] Somente cards do backlog
- [ ] `status = 'backlog'`
- [ ] `secao = 'Outros'` em todos
- [ ] `tela` derivada do título/descrição (ou campo tela do origem)
- [ ] `tela_nova = false`
- [ ] `completed_at` e `nota_*` nulos
- [ ] `position` sequencial sem colisão óbvia
- [ ] `ticket_number` omitido (trigger) ou acima do máximo atual
- [ ] `cliente_id` null (salvo UUID conhecido deste Supabase)
- [ ] Escapar aspas simples nos textos (`'` → `''`)
- [ ] SQL idempotente ou com comentário se for reexecutável (evitar duplicar na 2ª vez)

---

## 8. Prompt sugerido (copiar para o outro chat)

```text
Gere um SQL PostgreSQL (Supabase) para importar os cards abaixo na tabela
public.confec_kanban_cards do Kanban Confec.

Regras fixas:
- status = 'backlog'
- secao = 'Outros'
- tela = texto curto relacionado ao título/descrição (máx ~40 chars); se vazio, 'Importado'
- tela_nova = false
- completed_at, nota_linha, nota_detalhe, nota_gerada_em = null
- cliente_id = null
- ticket_number: não informar (trigger preenche)
- position: 0, 1, 2... na ordem que eu listar
- created_by_email = 'importacao@azoup.com.br'
- Escapar aspas simples no SQL

Colunas a preencher no INSERT:
title, description, dev_notes, created_by_email, status, position,
secao, tela, tela_nova, created_at, updated_at

Cards de origem (backlog):
[COLE AQUI TÍTULO / DESCRIÇÃO / DATA / RESPONSÁVEL DE CADA CARD]
```

---

## 9. Conferência pós-import (opcional)

```sql
select ticket_number, title, status, secao, tela, position, created_at
from public.confec_kanban_cards
where status = 'backlog'
order by position, created_at;
```
