# Cupom para cliente que paga pelo ASAAS

O cupom é criado no **painel admin**. O cliente digita o código no **Confec**, na tela de pagamento. O Confec calcula o desconto e manda para o ASAAS só o valor já com o desconto.

Não criar cupom dentro do painel do ASAAS. A assinatura do ASAAS tem um único valor. O desconto já vai dentro desse valor.

O mesmo código serve para Stripe e ASAAS. Quem define o provedor é a conta do cliente (`clientes_azoup.provedor_pagamento`), gravada no link de cadastro. O cliente não troca de provedor depois.

- Cadastro ASAAS: `https://confec.azoup.com.br/planos/asaas`
- Cadastro Stripe: `https://confec.azoup.com.br/planos`

## O que o painel admin grava

Uma linha em `public.admin_coupons`, no mesmo Supabase do Confec. O painel já faz isso hoje para o Stripe. Para o ASAAS não existe outra tabela de cupom.

| Campo | Obrigatório | Uso |
| --- | --- | --- |
| `code` | sim | Código que o cliente digita. Único. O Confec compara sem diferenciar maiúsculas. |
| `discount_type` | sim | `percent` ou `amount`. |
| `discount_value` | sim | Percentual (10 = 10%) ou valor em reais. |
| `duration` | sim | `once`, `repeating` ou `forever`. |
| `duration_in_months` | se `repeating` | Quantos meses o desconto vale. |
| `plan_id` | não | Id de `planos_assinatura`. Vazio = vale em qualquer plano. Preenchido = só naquele plano. |
| `redeem_by` | não | Data limite para **usar o código pela primeira vez**. |
| `max_redemptions` | não | Quantas contas podem usar o código. Vazio = sem limite. |
| `active` | sim | `false` impede uso novo. Não apaga o desconto de quem já aplicou. |
| `stripe_coupon_id` | sim, hoje | A coluna ainda é obrigatória no banco. Continua preenchida pelo cupom do Stripe. |
| `stripe_promotion_code_id` | sim, hoje | Idem. O Confec ASAAS não envia esse id ao ASAAS. |
| `created_by_admin` | não | Quem criou, para auditoria. |

O painel continua criando o cupom no Stripe junto, como já faz. Assim o mesmo código funciona para os dois provedores. O ASAAS não recebe esse cupom do Stripe. Ele recebe o valor calculado pelo Confec a partir desses campos.

## Onde o cliente aplica

Na tela de pagamento do Confec, antes de cartão, PIX ou boleto. O código vai no checkout (`promo_code`).

Crédito de IA não entra no cupom. Continua cobrança avulsa, sem desconto.

Quem já está pagando e quer um cupom novo aplica de novo no Confec. O painel não cola o cupom numa conta. Ele só publica o código.

## Como o Confec calcula

O desconto incide no **total da mensalidade**, não só no preço do plano:

plano + usuários extras + empresas extras + assentos de PDV + lojas de e-commerce − cupom.

Exemplo: plano R$ 499, 2 usuários a R$ 39, 1 empresa a R$ 49, 1 PDV a R$ 97. Subtotal R$ 723. Cupom de 10% deixa a cobrança em R$ 650,70. É esse valor que o Confec grava na assinatura do ASAAS.

Regras do total:

- Desconto percentual não passa de 100%.
- Desconto em reais não deixa o total negativo.
- Total R$ 0 vira cortesia: a conta fica ativa e **não** cria assinatura no ASAAS.
- Total entre R$ 0,01 e R$ 4,99 é recusado. O mínimo do ASAAS é R$ 5,00.
- Ao contratar ou tirar serviço, o percentual é recalculado em cima do novo subtotal. O valor novo entra na **próxima** cobrança. A cobrança que já foi gerada (PIX ou boleto em aberto) não muda.

## Por quanto tempo vale

O Confec copia o cupom para `assinatura_cupons` no momento em que o checkout é aceito. Cada cobrança **paga** conta um ciclo (`ciclos_aplicados`).

| Duração | Efeito |
| --- | --- |
| `once` | Só a primeira mensalidade paga. A seguinte vai cheia. |
| `repeating` | Vale por `duration_in_months` mensalidades pagas. Depois vai cheia. |
| `forever` | Toda mensalidade, inclusive quando o cliente soma serviço. |

Quando os ciclos acabam, o Confec manda o valor cheio na próxima atualização da assinatura. Cobrança já emitida permanece com o valor antigo.

Se o cupom está preso a um `plan_id` e o cliente troca de plano, o desconto cai. Cupom com `plan_id` vazio acompanha a troca.

## Limite de usos

`max_redemptions` conta as duas pontas:

- usos no Stripe (`times_redeemed` do promotion code);
- linhas em `assinatura_cupons` com aquele `admin_coupon_id` (clientes ASAAS).

A soma não pode passar do limite. O painel, ao mostrar “quantas vezes foi usado”, precisa somar as duas. Olhar só o Stripe esconde quem pagou pelo ASAAS.

## O que o painel não faz

- Não chama a API do ASAAS para criar cupom, assinatura ou desconto.
- Não escolhe o provedor do cliente. Isso já ficou gravado no cadastro.
- Não aplica o código numa conta específica. Quem aplica é o cliente, no Confec.
- Não altera `assinatura_cupons`. Essa tabela é só do Confec, fechada para o navegador.

Desativar o cupom (`active = false`) impede código novo. Quem já tem o cupom ativo na assinatura segue até o fim da duração.
