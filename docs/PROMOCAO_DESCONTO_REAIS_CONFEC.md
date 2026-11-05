# Promoção anual — desconto em R$ (ajuste Confec)

O painel admin já grava o tipo e o valor fixo. Sem este ajuste no Confec, o desconto em reais **não entra** na cotação nem na cobrança Asaas.

## Migration (Supabase compartilhado)

Rodar se ainda não rodou (mesmo SQL do painel):

`frontend/database/migration_asaas_promocao_desconto_reais.sql`

```sql
ALTER TABLE public.admin_billing_settings
    ADD COLUMN IF NOT EXISTS promocao_desconto_tipo text NOT NULL DEFAULT 'percent',
    ADD COLUMN IF NOT EXISTS promocao_desconto_reais numeric(12, 2) NOT NULL DEFAULT 0;

-- CHECK promocao_desconto_tipo IN ('percent', 'amount')
```

| Campo | Uso |
| --- | --- |
| `promocao_desconto_tipo` | `percent` (padrão) ou `amount` |
| `promocao_desconto_percent` | Só quando tipo = `percent` (0–100) |
| `promocao_desconto_reais` | Só quando tipo = `amount` (R$ ≥ 0 sobre o **ano cheio**) |

Quem já está em promoção **não** recalcula. Só o próximo cadastro.

## Arquivos a alterar

### 1. `backend/billingQuote.js` — `quoteAnnualPlan`

Hoje só recebe percentual. Aceitar também valor fixo:

```js
function quoteAnnualPlan(monthlyTotal, percent, amountReais = 0) {
  const mensal = roundMoney(monthlyTotal);
  const anoCheio = roundMoney(mensal * 12);
  const reais = Math.max(0, Number(amountReais) || 0);
  let desconto;
  let percentual = 0;
  if (reais > 0) {
    desconto = roundMoney(Math.min(anoCheio, reais));
    percentual = anoCheio > 0 ? Math.round((desconto / anoCheio) * 10000) / 100 : 0;
  } else {
    percentual = Math.min(100, Math.max(0, Number(percent) || 0));
    desconto = roundMoney(anoCheio * (percentual / 100));
  }
  const total = roundMoney(Math.max(0, anoCheio - desconto));
  // ... bloqueio ASAAS_MIN_BRL, maxParcelas, cortesia iguais
  return { mensal, anoCheio, percentual, desconto, total, maxParcelas, bloqueio, cortesia, descontoReais: reais > 0 ? desconto : 0 };
}
```

Atualizar testes em `backend/billingQuote.test.mjs` (caso com R$ fixo e caso ≥ ano cheio = cortesia).

### 2. `backend/asaasBilling.js` — `loadPromocaoCampanha`

No `.select(...)` incluir `promocao_desconto_tipo, promocao_desconto_reais`.

Retorno:

```js
const tipo = String(data.promocao_desconto_tipo || 'percent').toLowerCase() === 'amount' ? 'amount' : 'percent';
const percentual = Number(data.promocao_desconto_percent);
const reais = Number(data.promocao_desconto_reais);
return {
  ativa: promocaoEstaAtiva(data),
  tipo,
  percentual: tipo === 'percent' && Number.isFinite(percentual) ? Math.min(100, Math.max(0, percentual)) : 0,
  descontoReais: tipo === 'amount' && Number.isFinite(reais) ? Math.max(0, reais) : 0,
  // meses / cobrancaMes / cobrancaAno / nome / imagemUrl iguais
};
```

Em todo lugar que hoje faz:

```js
percentAnual = campanha.percentual;
const anual = quoteAnnualPlan(quote.total, percentAnual);
```

passar o reais quando for amount:

```js
const anual = quoteAnnualPlan(
  quote.total,
  campanha.tipo === 'percent' ? campanha.percentual : 0,
  campanha.tipo === 'amount' ? campanha.descontoReais : 0,
);
```

Pontos típicos: cotação (`quoteCheckout` / equivalente) e `checkoutAnual` com `ctx.promocao === true`.

Na resposta pública da cotação (`promocaoPublica`), incluir `tipo` e `descontoReais` (além de `percentual`) para a UI mostrar o texto certo.

### 3. `frontend/src/screens/PlanSelectionScreen.js`

Onde lê a campanha / mostra o desconto da promoção:

- Se `tipo === 'amount'`, exibir “R$ X de desconto no ano” (não “X%”).
- No preview local do total, se houver `descontoReais`, abater do ano cheio com `Math.min(anoCheio, descontoReais)` — o total oficial continua vindo do backend.

Não confiar no valor digitado no browser para cobrar: o servidor continua sendo a fonte.

## Comportamento esperado

| Configuração | Total do cartão |
| --- | --- |
| percent 20 | anoCheio − 20% |
| amount R$ 500 | anoCheio − 500 (teto = anoCheio) |
| amount ≥ anoCheio | total 0 → cortesia, sem cobrança Asaas |
| percent 0 / amount 0 | ano cheio sem desconto |

O Confec **não** usa o objeto `discount` FIXED/PERCENTAGE da API Asaas nesta promoção: calcula o total líquido e cria o parcelamento/cobrança com esse `value`.

## Fora de escopo

- `desconto_plano_anual_percent` da tela normal `/planos/asaas`
- Cupons `admin_coupons`
- Recalcular quem já tem `promocao_cobranca_em` / `promocao_total_ano`
