# Pré-cadastro ASAAS — contrato Confec

Contrato para implementar no **Confec** (`RNWebSupabase`) o fluxo de convite gerado pelo painel admin. O painel grava o pré-cadastro e o link; o Confec completa dados, cobra no ASAAS e provisiona o login.

## 1. Objetivo

Admin pré-cadastra o lead no painel, define plano/módulos/quantidades e preços (com override). Gera link. Cliente abre no Confec, completa o que faltou, escolhe mensal/anual, paga no ASAAS (fluxo atual) e já pode logar com o e-mail do pré-cadastro e senha `12345678`. No login Confec, se a senha for essa (ou flag `deve_trocar_senha`), forçar troca.

## 2. URL do convite

- Produção: `https://confec.azoup.com.br/convite/{token}`
- Dev: mesma rota no app Confec (deep link / React Navigation).
- `token`: UUID opaco único (não usar `cliente_id` cru na URL).

## 3. Tabela compartilhada `admin_pre_cadastros`

Criada no Supabase pelo painel (`supabase/sql/migration_admin_pre_cadastros.sql`). Confec lê/atualiza via API (service role no backend) — não depende de RLS anônima.

### Campos principais

| Campo | Tipo | Uso |
| --- | --- | --- |
| `id` | uuid | PK |
| `token` | text unique | URL |
| `status` | text | `rascunho` \| `link_gerado` \| `preenchendo` \| `aguardando_pagamento` \| `pago` \| `cancelado` \| `expirado` |
| `plano_id` | int | FK `planos_assinatura` |
| `usuarios_adicionais` | int | extras Confec |
| `empresas_adicionais` | int | CNPJs extras |
| `pdv_assentos` | int | PDV por assento |
| `ecommerce_lojas` | int | lojas |
| `conciliacao_contas` | int | contas |
| `valor_mensal_calculado` | numeric | quote automático |
| `valor_mensal_override` | numeric null | admin pode mudar |
| `valor_anual_calculado` | numeric | 12 × mensal com desconto anual |
| `valor_anual_override` | numeric null | admin pode mudar (total ano) |
| `desconto_anual_percent_usado` | numeric | snapshot de `admin_billing_settings.desconto_plano_anual_percent` |
| `cliente_id` | uuid null | ao materializar `clientes_azoup` |
| `empresa_id` | uuid null | após criar empresa |
| `assinatura_id` | bigint null | após checkout |
| `criado_por_admin` | text | quem gerou |
| `expira_em` | timestamptz null | opcional |
| `criado_em` / `atualizado_em` | timestamptz | auditoria |

### Dados do titular (espelho `SignUpScreen`)

`nome_dono`, `cpf`, `email`, `telefone`, `pais_codigo` (default `1058`).

Endereço do titular (`cep`, `rua`, `numero`, `bairro`, `cidade`, `estado`) **é o mesmo da empresa**: o painel grava espelhado e o Confec, ao materializar `clientes_azoup`, usa o endereço da empresa.

### Dados da empresa (espelho `CompanySignUpScreen`)

`cnpj`, `razao_social`, `nome_fantasia`, `ie`, `cep_empresa`, `rua_empresa`, `numero_empresa`, `bairro_empresa`, `cidade_empresa`, `estado_empresa`, `regime_tributario`, `apuracao_pis_cofins` (nullable; cliente completa o resto).

Regra: admin preenche o que tiver; campos vazios = obrigatórios na tela do Convite no Confec. **Não pedir endereço do titular no convite** — só o da empresa.

## 4. Cotação (mesma regra do Confec hoje)

Reutilizar `backend/billingQuote.js` → `quoteSubscription`:

| Linha | Quantidade | Preço |
| --- | --- | --- |
| `plano` | 1 | `planos_assinatura.preco_base` |
| `usuarios` | `usuarios_adicionais` | `preco_usuario_adicional` |
| `empresas` | `empresas_adicionais` | `preco_cnpj_adicional` (fallback 199) |
| `pdv` | `pdv_assentos` | `admin_billing_settings.preco_pdv_assento` (default 97) — **por assento** |
| `ecommerce` | `ecommerce_lojas` | `preco_ecommerce_loja` (default 97) |
| `conciliacao` | `conciliacao_contas` | `preco_conciliacao_conta` |

**Mensal cobrado:** `valor_mensal_override ?? valor_mensal_calculado`.

**Anual (fidelidade mensal com desconto):** aplicar `%` de `desconto_plano_anual_percent` sobre o mensal efetivo. Mensalidade anual = mensal × (1 − %/100). Total ano = mensalidade anual × 12. Overrides: `valor_anual_override` substitui o total ano.

Mínimo ASAAS: R$ 5,00 (`ASAAS_MIN_BRL`).

## 5. Telas Confec

### 5.1 `ConvitePreCadastroScreen` — `/convite/:token`

1. Buscar pré-cadastro pelo token (API pública autenticada por token).
2. Se `status` inválido/expirado/pago → mensagem e parar.
3. Formulário só com **campos faltantes** (titular + empresa). Pré-preencher e **readonly** o que o admin já salvou.
4. Validar CNPJ 14 dígitos antes de seguir (ASAAS exige empresa com CNPJ).
5. Botão **Continuar** → persiste gaps (e/ou materializa `clientes_azoup` + `empresas`) → navega para resumo.

Campos mínimos no fim desta etapa:

- Titular: nome, CPF, e-mail, telefone, CEP, rua, número, bairro, cidade, estado, termos.
- Empresa: razão social, nome fantasia, CNPJ, endereço empresa (IE/regime conforme `CompanySignUpScreen`).

### 5.2 `ConviteResumoPagamentoScreen`

Exibir:

- Plano nome + linhas do pacote (usuários, empresas, PDV assentos, e-com, conciliação).
- Toggle **Mensal** | **Anual**.
- Valores: overrides do pré-cadastro se existirem; senão `POST /api/billing/asaas/pre-cadastro/:token/quote`.
- Incluso: lista das linhas da quote.

Botão pagar → fluxo ASAAS igual `PaymentScreen`: card / PIX / boleto (anual = cartão, como hoje).

Checkout grava em `assinaturas_clientes`:

- `usuarios_adicionais`, `empresas_adicionais`
- `pdv_assentos_contratados`, `ecommerce_lojas_contratadas`, `conciliacao_contas_contratadas`
- `valor_mensal_atual` = valor efetivo (override ou quote)
- cliente com `provedor_pagamento = 'asaas'`

Endpoint sugerido: `POST /api/billing/asaas/pre-cadastro/:token/checkout`:

1. Valida token + status.
2. Garante `cliente_id` / empresa / CNPJ.
3. Monta quote (com override).
4. Chama a mesma lógica interna de `checkout` em `asaasBilling.js`.
5. Atualiza `admin_pre_cadastros.status`.

### 5.3 Pós-pagamento — criar usuário

1. Após pagamento confirmado (card) ou “continuar” boleto/PIX (grace atual, se mantiver).
2. Preferir no **backend** Admin API `createUser` com senha `12345678` (não expor senha padrão no client). Alternativa: `supabase.auth.signUp`.
3. Insert `usuarios`: `cliente_id`, `nome`, `usuario` = email, `auth_id`, `ativo: true`, `eh_admin: true`.
4. Flag: `usuarios.deve_trocar_senha = true` (ou `user_metadata.force_password_change`).
5. Pré-cadastro `status = pago`.
6. Redirecionar para Login (ou auto-login + modal troca senha).

### 5.4 Login — forçar troca de senha

- Se login ok e (`deve_trocar_senha` **ou** senha usada === `12345678`): bloquear app e exigir nova senha (min 8, letras+números como `UserSignUpScreen`).
- Limpar flag após troca.

## 6. APIs Confec a criar/adaptar

| Método | Rota | Auth | Função |
| --- | --- | --- | --- |
| GET | `/api/billing/asaas/pre-cadastro/:token` | público por token | dados + missing fields + pacote + preços |
| PATCH | `/api/billing/asaas/pre-cadastro/:token` | token | completar campos |
| POST | `/api/billing/asaas/pre-cadastro/:token/quote` | token | quote respeitando override |
| POST | `/api/billing/asaas/pre-cadastro/:token/checkout` | token | checkout ASAAS |
| POST | `/api/billing/asaas/pre-cadastro/:token/provision-user` | token + pago | cria auth + usuarios |

Reaproveitar: `buildQuote` / `checkout` / `ensureCustomer` / `saveAssinatura` / webhook existente.

## 7. O que o painel grava vs o que o Confec completa

| Origem | Exemplos |
| --- | --- |
| Admin (obrigatório para gerar link) | e-mail login, `plano_id`, pacote (mesmo que 0 extras), quote |
| Admin (recomendado) | CNPJ, nome dono, CPF, celular, endereço empresa |
| Cliente no link | tudo que estiver null + termos + pagamento + ciclo |

## 8. Checklist Confec

- [ ] Rota `/convite/:token` + 2 telas (completar + resumo/pagamento).
- [ ] Não reabrir PlanSelection/Payment genérico sem travar o pacote do token.
- [ ] CNPJ obrigatório antes do checkout.
- [ ] Overrides de preço respeitados.
- [ ] Provisionamento user pós-pago com `12345678` + force change.
- [ ] Webhook ASAAS continua ativando assinatura; pré-cadastro `pago`.
- [ ] Deep link / refresh: retomar pelo token (não só sessionStorage).

## 9. Fluxo resumido

1. Painel salva `admin_pre_cadastros` com status `link_gerado`.
2. Admin copia `https://confec.azoup.com.br/convite/{token}`.
3. Cliente completa faltantes → resumo mensal/anual → ASAAS.
4. Pagamento ok → assinatura Ativo → auth com senha inicial → login exige troca.
