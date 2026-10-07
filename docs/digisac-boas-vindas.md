# Mensagem automática Digisac

Quando um cliente novo se cadastra, o painel cria o contato na Digisac, envia a mensagem definida em Config. Suporte e grava o protocolo do chamado no detalhe do cliente.

O envio só acontece se o interruptor estiver ligado e a mensagem estiver preenchida. Vale para qualquer plano. Cada cliente recebe uma vez.

O contato fica na conexão e no departamento cujo nome é **Azoup Confec**. O nome salvo é o da pessoa (primeira letra maiúscula, resto minúsculo), um traço e a empresa em maiúsculas. Exemplo: `João henrique rodrigues - NERO CONFECÇÕES`.

## 1. Banco
No SQL Editor do Supabase, execute:
`supabase/sql/admin_digisac_boas_vindas.sql`

## 2. Secrets da Edge Function
No Supabase (Project Settings → Edge Functions → Secrets), defina:

- `DIGISAC_BASE_URL` ou `DIGISAC_API_URL` = URL da API. Exemplo: `https://azoup.digisac.io/api/v1`
- `DIGISAC_TOKEN` ou `DIGISAC_API_TOKEN` = token de acesso pessoal (Digisac → Conta → API → Tokens)
- `DIGISAC_WEBHOOK_SECRET` = uma senha longa, a mesma enviada no header do webhook
- Já existentes: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## 3. Deploy
O webhook do banco não envia o JWT do painel. A função precisa ser publicada sem verificação de JWT na borda (`supabase/config.toml`).

```bash
npx supabase functions deploy digisac-boas-vindas --project-ref SEU_REF --no-verify-jwt
```

## 4. Database Webhooks
No Supabase, em Database → Webhooks, crie dois webhooks de **INSERT**:

1. Tabela `clientes_azoup`
2. Tabela `empresas`

Os dois apontam para:
`https://SEU_PROJETO.supabase.co/functions/v1/digisac-boas-vindas`

Header HTTP:
`x-webhook-secret: o mesmo valor de DIGISAC_WEBHOOK_SECRET`

O segundo webhook só completa o envio quando o cadastro da empresa chega depois do cliente e a mensagem ainda está pendente. Empresa nova de cliente antigo não dispara outra mensagem.

## 5. Uso no painel
1. Abra **Config. Suporte**.
2. Ligue **Enviar mensagem automática** e escreva o texto.
3. Salve.
4. O protocolo do chamado aparece no detalhe do cliente, no bloco Digisac.

Se a conexão Azoup Confec for WhatsApp oficial, a Digisac pode recusar texto livre para um número novo e exigir um template aprovado. O erro fica gravado no cliente e a mensagem não sai. Conexão de WhatsApp Web aceita o texto do campo.
