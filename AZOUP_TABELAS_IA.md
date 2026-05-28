# Azoup - Mapa de Tabelas para IA

## Escopo
- Este documento resume as tabelas SQL encontradas nos scripts de schema/migration do repositório Azoup.
- Objetivo: permitir que uma IA entenda rapidamente o papel de cada tabela, seus domínios e relações prováveis.
- Fonte: arquivos SQL em `frontend/database` e `backend`.

## Convenções para IA
- `tenant`: quando existir `cliente_id` ou `empresa_id`, trate como isolamento por cliente/empresa.
- `billing`: tabelas ligadas a assinatura, cobrança, trial e Stripe.
- `fiscal/NFe`: tabelas de emissão/documentação fiscal.
- `comercial`: cadastro de produtos, vendas e pedidos.
- `producao`: ordens de produção, roteiro, kanban e custos.
- `financeiro`: contas a pagar/receber, caixa, DRE e previsões.

## 1) Identidade e base de clientes
- `clientes_azoup`: cadastro principal de clientes da plataforma Azoup (tenant raiz do sistema).
- `usuarios`: usuários vinculados aos clientes/empresas com perfil de acesso ao sistema.
- `tipos_usuario`: catálogo de perfis/permissões funcionais de usuário.
- `usuario_tutorial_flags`: controle de onboarding/tutorial já visto por usuário.
- `password_reset_challenges`: desafios/tokens de recuperação de senha.
- `cidades`: base de cidades (normalmente usada em endereços e fiscal).
- `empresas`: empresas vinculadas ao cliente (multiempresa dentro do tenant).
- `empresa_tipos_confeccao`: tipos/características de confecção por empresa.

## 2) Assinatura, billing e administração
- `planos_assinatura`: definição dos planos (preço base, limites, regras).
- `assinaturas_clientes`: assinatura ativa/histórica por cliente (status, período, plano).
- `historico_faturas`: histórico de faturas/cobranças por cliente/assinatura.
- `billing_webhook_events`: idempotência e rastreio de eventos Stripe webhook processados.
- `assinatura_limites_override`: sobrescrita de limites por cliente (usuários, empresas, armazenamento, tokens).
- `admin_billing_settings`: configurações globais de billing (ex.: dias de trial padrão).
- `admin_coupons`: cupons/promotion codes gerados para novos assinantes.
- `admin_users`: usuários administrativos do painel com papéis (owner/manager/viewer).
- `admin_audit_logs`: trilha de auditoria de ações administrativas sensíveis.

## 3) Consumo de IA e recursos auxiliares
- `credito_ia_gasto`: ledger de consumo/gasto de créditos de IA por cliente/empresa/ação.
- `configuracao_prompt_ia`: configurações de prompt e parâmetros para geração com IA.
- `venda_imagem_ia`: geração/armazenamento de imagens por IA no contexto comercial.

## 4) Cadastro de produtos e estruturas comerciais
- `categorias`: categorias de produto.
- `subcategorias`: subcategorias ligadas a categorias.
- `origens_produtos`: origem/classificação de origem do produto.
- `produtos`: cadastro principal de produtos.
- `produto_cor_tamanho`: grade SKU por variação de cor/tamanho.
- `produto_cor_tamanho_tabela_preco`: preço por tabela para cada variação (multi-preço).
- `tabela_precos`: tabelas de preço (atacado, varejo, etc.).
- `modelo_etiqueta`: modelos de etiqueta para impressão/identificação de produto.
- `produto_imagem`: imagens vinculadas ao produto.
- `produto_ficha_tecnica`: ficha técnica consolidada do produto.
- `produto_fase_custo`: custo por fase produtiva do produto.

## 5) Matérias-primas e ficha técnica
- `tecidos`: cadastro de tecidos.
- `tipo_tecido`: catálogo de tipos de tecido.
- `tecido_cor`: cores disponíveis por tecido.
- `aviamentos`: cadastro de aviamentos/insumos auxiliares.
- `aviamento_cor_tamanho`: variações de aviamento por cor/tamanho.
- `ficha_tecnica_consumo_tecido`: consumo de tecido por produto/ficha.
- `ficha_tecnica_consumo_tecido_tamanho`: consumo de tecido detalhado por tamanho.
- `ficha_tecnica_consumo_aviamento`: consumo de aviamento por produto/ficha.
- `ficha_tecnica_consumo_aviamento_tamanho`: consumo de aviamento detalhado por tamanho.

## 6) Vendas, pedido e faturamento comercial
- `origem_pedido`: origem do pedido/venda (canal ou fonte).
- `venda`: cabeçalho da venda/pedido (cliente, status, totais, etapa).
- `venda_itens`: itens da venda/pedido com produto, quantidade e preços.
- `venda_kanban_coluna`: configuração de colunas/estágios do kanban de vendas.
- `tipo_operacao`: natureza/tipo de operação comercial/fiscal da venda.
- `tipo_pagamento`: catálogo de tipos de pagamento.
- `condicao_pagamento`: condições de pagamento (prazo/regra de parcelamento).
- `venda_forma_pagamento`: formas de pagamento aplicadas a uma venda.
- `venda_parcela`: parcelas de pagamento da venda.
- `venda_faturamento`: eventos de faturamento de venda (documentação e status).
- `venda_faturamento_itens`: itens vinculados ao faturamento da venda.

## 7) Produção e chão de fábrica
- `roteiros_producao`: roteiros de produção (sequência macro de fases).
- `roteiro_producao_fases`: fases de cada roteiro de produção.
- `producao_op`: ordem de produção (OP) principal.
- `producao_op_item`: itens/partes da OP.
- `producao_op_defeito`: registro de defeitos na OP.
- `producao_op_defeito_item`: detalhamento de defeitos por item da OP.
- `producao_faccionista_pagamento`: pagamento a faccionista por produção.
- `producao_faccionista_pagamento_op`: vínculo pagamento-faccionista com OPs.
- `producao_faccionista_pagamento_extra`: extras/ajustes no pagamento de faccionista.

## 8) Estoque e inventário
- `estoque_movimentacao`: movimentações de estoque (entrada/saída/ajuste/transferência).
- `estoque_inventario`: cabeçalho de inventário físico.
- `estoque_inventario_item`: itens contados no inventário e divergências.

## 9) Financeiro (receber/pagar/caixa/DRE)
- `centros_custo`: centros de custo para classificação gerencial.
- `plano_contas`: plano de contas contábil/gerencial.
- `contas_receber`: títulos a receber.
- `parcelas_contas_receber`: parcelamento de contas a receber.
- `recebimentos_contas_receber`: baixas/recebimentos efetivos.
- `juros_desconto_receber_log`: log de juros/descontos aplicados no recebimento.
- `contas_pagar`: títulos a pagar.
- `parcelas_contas_pagar`: parcelamento de contas a pagar.
- `pagamentos_contas_pagar`: pagamentos efetivos de contas a pagar.
- `historico_pagamentos_cp`: histórico de alterações/eventos em pagamentos de contas a pagar.
- `movimentacoes_fluxo_caixa`: lançamentos de fluxo de caixa.
- `contas_correntes`: contas correntes bancárias/caixa e seus saldos.
- `periodos_dre`: períodos de apuração para DRE.
- `grupos_dre`: agrupadores de linhas da DRE.
- `linhas_dre`: linhas/estruturas da DRE.
- `previsoes_financeiras`: previsões financeiras futuras (orçado/projetado).

## 10) Fiscal e NFe
- `nota_fiscal`: cabeçalho da nota fiscal (emitente, destinatário, totais, status).
- `nota_fiscal_item`: itens da nota fiscal.
- `nota_fiscal_pagamento`: pagamentos vinculados à nota fiscal.
- `nota_fiscal_parcela`: parcelas de cobrança da nota fiscal.
- `nota_fiscal_transporte`: dados de transporte/volumes/frete da nota fiscal.
- `nota_fiscal_inutilizacao`: controle de inutilização de numeração fiscal.
- `nota_fiscal_cce`: histórico de Carta de Correção Eletrônica (CC-e).
- `nfe_xml_logs`: registro de armazenamento/geração de XML de NFe.
- `manifesto_nfe_estado`: estado/andamento de manifesto de NFe.
- `paises`: base de países para endereçamento fiscal.
- `ibge_municipios`: base de municípios/códigos IBGE.

## 11) Parâmetros e códigos fiscais
- `regimes_tributarios`: regimes tributários (Simples, Presumido, etc.).
- `grupo_fiscal_config`: configuração tributária principal por grupo fiscal.
- `grupo_fiscal_regra`: regras tributárias detalhadas por cenário.
- `grupos_fiscais`: agrupamento fiscal aplicado a produtos.
- `cfop_codigos`: tabela de códigos CFOP.
- `cst_icms_codigos`: códigos CST de ICMS.
- `csosn_codigos`: códigos CSOSN.
- `cst_pis_codigos`: códigos CST de PIS.
- `cst_cofins_codigos`: códigos CST de COFINS.
- `cst_ipi_codigos`: códigos CST de IPI.
- `cst_ibs_cbs_codigos`: códigos relacionados a IBS/CBS (reforma tributária).
- `class_trib_codigos`: códigos de classificação tributária complementares.
- `empresa_certificado`: certificado digital da empresa para emissão fiscal.
- `empresa_logo`: logo/identidade visual usada em documentos.

## 12) Auditoria e rastreabilidade operacional
- `audit_estornos`: auditoria de estornos/undo realizados no sistema.

## Relações principais (visão IA)
- `clientes_azoup` 1:N `empresas`, `usuarios`, `assinaturas_clientes`, `historico_faturas`.
- `planos_assinatura` 1:N `assinaturas_clientes`.
- `assinaturas_clientes` 1:N `historico_faturas`; 1:0..1 `assinatura_limites_override` (por cliente ativo).
- `venda` 1:N `venda_itens`, `venda_forma_pagamento`, `venda_parcela`, `venda_faturamento`.
- `venda_faturamento` 1:N `venda_faturamento_itens`.
- `nota_fiscal` 1:N `nota_fiscal_item`, `nota_fiscal_pagamento`, `nota_fiscal_parcela`.
- `contas_receber` 1:N `parcelas_contas_receber`, `recebimentos_contas_receber`.
- `contas_pagar` 1:N `parcelas_contas_pagar`, `pagamentos_contas_pagar`.
- `producao_op` 1:N `producao_op_item`, `producao_op_defeito`.
- `produtos` 1:N `produto_cor_tamanho`, `produto_imagem`, `produto_ficha_tecnica`.

## Notas para uso por IA
- Ao responder perguntas de negócio, priorize filtros por `cliente_id`/`empresa_id`.
- Em billing, diferencie "limite do plano" (`planos_assinatura`) de "exceção negociada" (`assinatura_limites_override`).
- Em fiscal, trate `nota_fiscal` como entidade central e os demais objetos como satélites.
- Em financeiro, separe eventos previstos (`previsoes_financeiras`) de realizados (`pagamentos`/`recebimentos`/`fluxo_caixa`).
- Em vendas e produção, conecte `venda -> itens -> produto` e `produto -> ficha técnica -> consumo -> produção`.
