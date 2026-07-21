# Painel Admin - Tela Inicial e Clientes

Este documento descreve as tabelas, campos e o funcionamento da tela inicial do painel administrativo e da tela de clientes.

## Arquivos principais

| Area | Arquivo |
|---|---|
| Tela inicial | `app/(tabs)/index.tsx` |
| Repositorio de metricas | `src/services/repos/metrics-repo.ts` |
| Tela de clientes | `app/(tabs)/clients/index.tsx` |
| Detalhe do cliente | `app/(tabs)/clients/[id].tsx` |
| Repositorio de clientes | `src/services/repos/clientes-repo.ts` |
| Filtros de clientes | `src/utils/clientes-filtro.ts` |
| Marcacao de mensagem diaria | `src/services/repos/mensagem-contato-repo.ts` |
| Congelamento de cliente | `src/services/repos/congelamento-repo.ts` |
| Tipos principais | `src/types/azoup.ts` |

## Tela Inicial do Painel Admin

### Como a tela funciona

A tela inicial usa `useQuery` com a chave `dashboard_metricas` para chamar `carregarMetricasDashboard()`.

O fluxo e:

1. Conta o total de clientes em `clientes_azoup`.
2. Busca assinaturas em `assinaturas_clientes`.
3. Busca nomes dos planos em `planos_assinatura`.
4. Busca MRR liquido via edge function `admin-stripe`, operacao `compute_mrr`.
5. Busca amostra de consumo em `credito_ia_gasto`.
6. Monta os cards de metricas e a lista "Clientes por plano".

Se a edge function de MRR falhar, o painel usa o valor local salvo em `assinaturas_clientes`.

### Cards exibidos

| Card | Origem | Regra |
|---|---|---|
| Clientes totais | `clientes_azoup` | `count(*)` |
| Assinaturas ativas | `assinaturas_clientes.status` | Status classificado como ativo |
| Em trial | `assinaturas_clientes.status` | Status classificado como trial |
| Inadimplentes | `assinaturas_clientes.status` | Status classificado como inadimplente |
| Cancelados | `assinaturas_clientes.status` | Status classificado como cancelado |
| MRR | `admin-stripe.compute_mrr` ou fallback local | Valor liquido mensal em centavos |
| Tokens medios | `credito_ia_gasto` | Media simples da coluna que contem "token" no nome |

### Bloco MRR com cupons

Esse bloco aparece quando existe retorno da edge function do Stripe ou quando ha desconto.

Campos retornados pela edge function:

| Campo | Descricao |
|---|---|
| `mrr_centavos` | MRR liquido, ja considerando descontos |
| `mrr_bruto_centavos` | MRR antes dos descontos |
| `desconto_centavos` | Soma dos descontos aplicados |
| `assinaturas_com_desconto` | Quantidade de assinaturas com cupom ativo |
| `assinaturas_consultadas` | Quantidade de assinaturas consultadas no Stripe |
| `assinaturas_com_erro` | Quantidade que falhou na consulta ao Stripe |

### Clientes por plano

A tela agrupa a assinatura atual de cada cliente por `plano_id`.

Regras:

| Campo exibido | Regra |
|---|---|
| Nome do plano | `planos_assinatura.nome` |
| Total | Ativos + inativos |
| Ativos | Assinatura com status `ativa` ou `trial` |
| Inativos | Assinatura cancelada, inadimplente, sem status conhecido ou outro status |

## Tabelas da Tela Inicial

### `clientes_azoup`

Usada para contar clientes totais.

Campos usados:

| Campo | Uso |
|---|---|
| `id` | Identificador do cliente |
| `created_at` | Data de cadastro, usada tambem na tela de clientes |
| `nome`, `email`, `telefone` | Dados basicos exibidos em outras telas |
| `stripe_customer_id` | Relacao com customer no Stripe, quando existe |

### `assinaturas_clientes`

Usada para status de assinatura, MRR local e agrupamento por plano.

Campos usados:

| Campo | Uso |
|---|---|
| `id` | Identificador da assinatura |
| `cliente_id` | Vinculo com `clientes_azoup.id` |
| `plano_id` | Vinculo com `planos_assinatura.id` |
| `status` | Classificacao como ativa, trial, inadimplente ou cancelada |
| `stripe_subscription_id` | Consulta da assinatura no Stripe |
| `valor_mensal_atual` | Valor mensal atual em reais; atualizado pelo sync de MRR |
| `valor_atual_centavos` | Compatibilidade legada para valor em centavos |
| `data_inicio` | Inicio da assinatura |
| `criado_em`, `atualizado_em` | Ordenacao para escolher a assinatura mais recente |
| `usuarios_adicionais`, `empresas_adicionais` | Adicionais exibidos no detalhe do cliente |
| `usuarios_extras`, `empresas_extras` | Campos legados de adicionais |
| `credito_ia_limite_mensal`, `credito_ia_saldo_plano`, `credito_ia_extra` | Creditos de IA no detalhe |

### `planos_assinatura`

Usada para nomes dos planos e valores base.

Campos usados:

| Campo | Uso |
|---|---|
| `id` | Identificador do plano |
| `nome` | Nome exibido no dashboard e clientes |
| `valor_mensal_centavos` | Valor base legado |
| `preco_base` | Preco base em reais |
| `usuarios_inclusos` | Limite de usuarios do plano |
| `empresas_incluidas` | Empresas incluidas no plano |
| `armazenamento_gb` | Limite de armazenamento |
| `credito_ia_mensal` | Creditos de IA do plano |
| `limite_nfe_mensal` | Limite de NF-e mensal |
| `limite_empresas_enterprise` | Limite usado para regras enterprise |
| `stripe_price_id_base` | Price base no Stripe |
| `stripe_product_id` | Product no Stripe |
| `ativo`, `exibir_para_clientes`, `requer_cliente_logado` | Flags de exibicao e uso |

### `credito_ia_gasto`

Usada somente para o card "Tokens medios (amostra)".

Campos usados:

| Campo | Uso |
|---|---|
| Campo contendo `token` no nome | O codigo detecta a primeira coluna cujo nome contem `token` e calcula a media |

## Tela de Clientes

### Como a tela funciona

A tela de clientes usa `useQuery` com a chave `clientes_azoup_admin` para chamar `listarClientesAzoup()`.

O fluxo e:

1. Busca todos os clientes em `clientes_azoup`, ordenados por `created_at desc`.
2. Para os clientes encontrados, busca dados relacionados:
   - assinaturas em `assinaturas_clientes`;
   - limites personalizados em `assinatura_limites_override`;
   - historico financeiro em `historico_faturas`;
   - empresa matriz em `empresas`;
   - planos em `planos_assinatura`;
   - mensagem diaria em `admin_cliente_mensagem_diaria`;
   - congelamento em `admin_cliente_congelamento`.
3. Monta uma visao administrativa (`ClienteAzoupAdminView`) com os dados calculados.
4. Aplica filtros locais de busca, status e periodo.
5. Renderiza os cards de clientes.

### Dados exibidos no card do cliente

| Campo exibido | Origem |
|---|---|
| Nome do cliente | `nome_fantasia`, `nome`, `razao_social`, `email` ou fallback com `id` |
| Empresa matriz | `empresas.nome_fantasia` ou `empresas.razao_social` |
| CNPJ da matriz | `empresas.cnpj` |
| E-mail | `clientes_azoup.email` |
| Telefone | `clientes_azoup.telefone` ou `clientes_azoup.celular` |
| Cliente desde | `clientes_azoup.created_at`, fallback para data da assinatura |
| Plano | `planos_assinatura.nome` |
| Valor atual | `assinaturas_clientes.valor_atual_centavos`, `valor_mensal_atual` ou `planos_assinatura.valor_mensal_centavos` |
| Status da assinatura | `assinaturas_clientes.status` |
| Falhas | Quantidade de `historico_faturas.status = falhou` |
| Meses com pendencia | Meses de faturas com status `aberto` ou `falhou` |
| Congelado / chamar agora | `admin_cliente_congelamento` |
| Mensagem enviada hoje | `admin_cliente_mensagem_diaria` |

### Acoes da lista de clientes

| Acao | Como funciona |
|---|---|
| Abrir detalhe | Link para `/clients/[id]` |
| Marcar mensagem enviada hoje | Upsert em `admin_cliente_mensagem_diaria`; depois abre a tela Conversas com o cliente selecionado |
| Desmarcar mensagem enviada hoje | Delete em `admin_cliente_mensagem_diaria` para a data atual |
| Abrir WhatsApp | Usa telefone/celular para montar URL do WhatsApp |

### Filtros da lista

| Filtro | Regra |
|---|---|
| Busca | Nome, e-mail ou telefone |
| Todos | Nao filtra por status |
| Ativo | Assinatura classificada como ativa |
| Trial | Assinatura classificada como trial |
| Inativo | Cancelado, inadimplente, outro ou sem assinatura |
| Congelado | `admin_cliente_congelamento.congelado = true` |
| Chamar | Cliente congelado com `data_retorno <= hoje` |
| Periodo | Filtra por `clientes_azoup.created_at` |

## Detalhe do Cliente

### Como funciona

O detalhe usa `montarVisaoCliente(clienteId)` para buscar e montar todos os dados de um cliente.

Principais blocos:

| Bloco | Dados |
|---|---|
| Congelar / chamar de novo | `admin_cliente_congelamento` |
| Uso do sistema | Metricas de uso via edge function ou fallback local |
| Assinatura | Assinatura atual, plano, valor, adicionais e Stripe subscription |
| Historico de conversas | `admin_cliente_conversas` |
| Financeiro | `historico_faturas` |
| Limites | Plano + assinatura + overrides |
| Personalizacao de limites | Atualiza `assinatura_limites_override` e/ou `assinaturas_clientes` |

### Congelar cliente

Tabela: `admin_cliente_congelamento`.

Campos:

| Campo | Uso |
|---|---|
| `cliente_id` | Cliente congelado |
| `congelado` | Se o acompanhamento esta congelado |
| `data_retorno` | Data para chamar novamente |
| `observacao` | Motivo ou instrucoes para o contato |
| `admin_email` | E-mail do admin que alterou |
| `updated_at` | Ultima alteracao |
| `created_at` | Criacao do registro |

Regras:

- Congelar faz `upsert` com `congelado = true`.
- Descongelar faz `upsert` com `congelado = false`, `data_retorno = null` e `observacao = null`.
- A lista destaca como "Chamar agora" quando `data_retorno` e menor ou igual a data atual no Brasil.

### Uso do sistema

Primeiro tenta buscar pela edge function `admin-stripe`, operacao `get_cliente_metricas`.

Campos retornados:

| Campo | Descricao |
|---|---|
| `empresas_cadastradas` | Quantidade em `empresas` |
| `produtos_cadastrados` | Quantidade em `produtos` |
| `vendas` | Quantidade em `venda` |
| `ordens_producao` | Quantidade em `producao_op` |
| `notas_fiscais_emitidas` | Quantidade calculada de notas geradas |
| `ultimo_acesso` | Ultimo login ou ultima atividade |
| `ultimo_acesso_fonte` | `auth` ou `atividade` |

Fallback local:

| Tabela | Campo de filtro |
|---|---|
| `empresas` | `cliente_id` |
| `produtos` | `cliente_id` |
| `venda` | `cliente_id_tenant` |
| `producao_op` | `cliente_id_tenant` |
| `nota_fiscal` | Relacionamentos por cliente/venda/faturamento/empresa |

## Tabelas da Tela de Clientes

### `clientes_azoup`

Campos usados:

| Campo | Uso |
|---|---|
| `id` | Identificador e rota do detalhe |
| `created_at` | Ordenacao, "Cliente desde" e filtro por periodo |
| `nome`, `razao_social`, `nome_fantasia` | Nome exibido |
| `email` | E-mail exibido e busca |
| `telefone`, `celular` | Contato e WhatsApp |
| `cpf`, `documento` | Documento quando disponivel |
| `stripe_customer_id` | Vinculo com Stripe |
| `qtde_user`, `usuarios_extra`, `empresas_extra` | Dados legados/compatibilidade |
| `credito_plano`, `credito_extra`, `credito_ia_mes_ref` | Creditos de IA legados |
| `updated_at` | Atualizacao do cadastro |

### `assinaturas_clientes`

Campos usados:

| Campo | Uso |
|---|---|
| `id` | Identificador da assinatura |
| `cliente_id` | Vinculo com cliente |
| `plano_id` | Vinculo com plano |
| `status` | Status exibido e filtros |
| `stripe_subscription_id` | Botao de status detalhado Stripe |
| `stripe_customer_id` | Relacao com Stripe |
| `data_inicio` | Inicio e dias como assinante |
| `data_fim`, `trial_fim`, `cancel_at_period_end` | Dados de ciclo/status |
| `valor_mensal_atual` | Valor atual em reais |
| `valor_atual_centavos` | Valor atual em centavos (legado) |
| `usuarios_adicionais`, `empresas_adicionais` | Adicionais atuais |
| `usuarios_extras`, `empresas_extras` | Campos legados de adicionais |
| `credito_ia_limite_mensal`, `credito_ia_saldo_plano`, `credito_ia_extra`, `credito_ia_mes_ref` | Limites e saldos de IA |
| `periodo_inicio`, `periodo_fim` | Periodo da assinatura |
| `stripe_status` | Status Stripe sincronizado |
| `stripe_item_id_base`, `stripe_item_id_usuario_adicional`, `stripe_item_id_empresa_adicional` | Itens Stripe |
| `criado_em`, `atualizado_em` | Ordenacao para assinatura atual |

### `planos_assinatura`

Campos usados:

| Campo | Uso |
|---|---|
| `id` | Vinculo com assinatura |
| `nome` | Nome do plano |
| `valor_mensal_centavos`, `preco_base` | Valor do plano |
| `usuarios_inclusos`, `empresas_incluidas` | Limites base |
| `armazenamento_gb`, `credito_ia_mensal`, `limite_nfe_mensal` | Limites do plano |
| `preco_usuario_adicional`, `preco_cnpj_adicional` | Valores adicionais |
| `limite_empresas_enterprise` | Regra enterprise |
| `stripe_product_id`, `stripe_price_id_base`, `stripe_price_id` | Stripe |
| `ativo`, `tem_upgrades`, `is_enterprise`, `exibir_para_clientes`, `requer_cliente_logado` | Flags |

### `historico_faturas`

Campos usados:

| Campo | Uso |
|---|---|
| `id` | Identificador da fatura |
| `cliente_id` | Vinculo com cliente |
| `assinatura_id` | Vinculo com assinatura |
| `stripe_invoice_id` | Fatura Stripe |
| `valor_centavos` | Valor da fatura |
| `moeda` | Moeda |
| `status` | Falhas, abertos e historico financeiro |
| `periodo_inicio`, `periodo_fim` | Mes de referencia |
| `data_vencimento`, `data_pagamento` | Datas financeiras |
| `tentativa_falha` | Tentativas falhas |
| `created_at` | Ordenacao/fallback de periodo |

### `empresas`

Campos usados na lista:

| Campo | Uso |
|---|---|
| `id` | Identificador |
| `cliente_id` | Vinculo com cliente |
| `razao_social`, `nome_fantasia` | Nome da matriz |
| `cnpj` | CNPJ exibido |
| `empresa_matriz` | Filtro para buscar matriz |
| `ativo` | Status da empresa |
| `created_at` | Data de criacao |

### `assinatura_limites_override`

Campos usados no detalhe e na edicao de limites:

| Campo | Uso |
|---|---|
| `id` | Identificador |
| `cliente_id` | Vinculo com cliente |
| `usuarios_limite_override` ou `limite_usuarios` | Override de usuarios |
| `empresas_limite_override` ou `limite_empresas` | Override de empresas |
| `armazenamento_gb_override` ou `limite_armazenamento_gb` | Override de armazenamento |
| `credito_ia_override` ou `limite_tokens_ia_mes` | Override de IA |
| `active` | Se o override esta ativo |
| `motivo` | Motivo informado pelo admin |
| `updated_by_admin`, `atualizado_por_admin_id` | Admin responsavel |
| `atualizado_em` | Data de atualizacao |

### `admin_cliente_mensagem_diaria`

Campos:

| Campo | Uso |
|---|---|
| `cliente_id` | Cliente marcado |
| `data_marcacao` | Data da marcacao; reset automatico por dia |
| `admin_email` | Admin que marcou |
| `updated_at` | Atualizacao |

### `admin_cliente_congelamento`

Campos:

| Campo | Uso |
|---|---|
| `cliente_id` | Cliente congelado |
| `congelado` | Estado do congelamento |
| `data_retorno` | Data para chamar novamente |
| `observacao` | Observacao do admin |
| `admin_email` | Admin que alterou |
| `updated_at` | Atualizacao |
| `created_at` | Criacao |

### `admin_cliente_conversas`

Campos:

| Campo | Uso |
|---|---|
| `id` | Identificador da conversa |
| `cliente_id` | Vinculo com cliente |
| `data_conversa` | Data da conversa |
| `hora_conversa` | Hora opcional |
| `descricao` | Conteudo da conversa |
| `admin_email` | Admin que registrou |
| `created_at` | Criacao |

### Tabelas de uso do tenant

Usadas para metricas no detalhe:

| Tabela | Campo de vinculo | Uso |
|---|---|---|
| `empresas` | `cliente_id` | Quantidade de empresas |
| `produtos` | `cliente_id` | Quantidade de produtos |
| `venda` | `cliente_id_tenant` | Quantidade de vendas e ultima atividade |
| `producao_op` | `cliente_id_tenant` | Quantidade de OPs e ultima atividade |
| `nota_fiscal` | `cliente_id_tenant`, `venda_id`, `venda_faturamento_id`, `empresa_id` | Notas fiscais emitidas |
| `venda_faturamento` | `cliente_id_tenant` | Relacao auxiliar para notas |

## Pre-requisitos para as telas funcionarem

Os nomes das tabelas de negocio acima estao corretos. Alem delas, o painel precisa destas dependencias:

### Autenticacao e permissao

| Dependencia | Uso |
|---|---|
| `admin_users` | Login do painel; so entra quem tem email ativo nessa tabela |
| Funcao SQL `painel_admin_ativo()` | RLS das tabelas administrativas |
| Edge function `admin-stripe` deployada | MRR Stripe, metricas do cliente, auditoria, perfil admin |
| Secrets da function | `STRIPE_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` |

### Tabelas administrativas obrigatorias (painel)

| Tabela | Sem ela o que quebra |
|---|---|
| `admin_users` | Login / acesso negado |
| `admin_cliente_mensagem_diaria` | Bolinha "mensagem enviada hoje" |
| `admin_cliente_congelamento` | Congelar / chamar de novo |
| `admin_cliente_conversas` | Historico de conversas no detalhe |
| `admin_audit_logs` | Auditoria de congelar/limites (tela continua, log pode falhar) |
| `assinatura_limites_override` | Overrides de limites no detalhe |

### Tabelas de negocio obrigatorias

| Tabela | Tela inicial | Clientes |
|---|---|---|
| `clientes_azoup` | Sim | Sim |
| `assinaturas_clientes` | Sim | Sim |
| `planos_assinatura` | Sim | Sim |
| `credito_ia_gasto` | Sim (tokens medios) | Nao |
| `historico_faturas` | Nao (so helper) | Sim |
| `empresas` | Nao | Sim |
| `venda`, `produtos`, `producao_op`, `nota_fiscal`, `venda_faturamento` | Nao | Sim (metricas do detalhe) |
| `usuarios` | Nao | Sim (ultimo acesso via edge function) |

### SQLs uteis deste repositorio

| Arquivo | Para que serve |
|---|---|
| `supabase/sql/painel_admin_rls_helper.sql` | Cria `painel_admin_ativo()` |
| `supabase/sql/painel_adm_rls_all.sql` | Bundle de RLS do painel |
| `supabase/sql/admin_cliente_mensagem_diaria.sql` | Mensagem diaria |
| `supabase/sql/admin_cliente_conversas.sql` | Conversas |
| `supabase/sql/admin_cliente_congelamento.sql` | Congelar cliente |
| `supabase/sql/assinatura_limites_override_rls.sql` | Limites override |
| `supabase/sql/admin_audit_logs_rls.sql` | Auditoria |

## Observacoes de manutencao

- A classificacao de status fica em `src/utils/assinatura-status.ts`.
- Os filtros da lista de clientes ficam em `src/utils/clientes-filtro.ts`.
- A tela inicial depende da edge function `admin-stripe` (`compute_mrr`) para MRR com desconto; se falhar, usa `valor_mensal_atual` local.
- O detalhe do cliente depende de `admin-stripe` (`get_cliente_metricas`) para uso do sistema; se falhar, usa contagem local.
- Se as tabelas administrativas nao existirem ou estiverem sem RLS, a leitura pode falhar e algumas informacoes nao aparecerao (a listagem tenta degradar com `console.warn`).
- Campo tipado no painel: `historico_faturas.valor_centavos` (o schema antigo do Azoup tambem pode ter `valor_total`).
