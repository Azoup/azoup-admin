# Google Calendar no painel ADM

## 1. Banco
No SQL Editor do Supabase, execute:
`supabase/sql/admin_google_calendar.sql`

## 2. Google Cloud Console
1. Crie um projeto (ou use um existente).
2. Ative **Google Calendar API**.
3. Em **APIs e serviços → Credenciais**, crie **OAuth client ID** do tipo **Aplicativo da Web**.
4. Em **URIs de redirecionamento autorizados**, adicione:
   `https://SEU_PROJETO.supabase.co/functions/v1/google-calendar/oauth_callback`
5. Copie **Client ID** e **Client Secret**.

Scopes usados: `calendar` e `userinfo.email`.

## 3. Secrets da Edge Function
No Supabase (Project Settings → Edge Functions → Secrets), defina:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` = o mesmo URI do passo 2.4
- `PAINEL_PUBLIC_URL` = URL pública do painel (ex.: `https://seu-painel.vercel.app` ou `http://localhost:8081` em dev)
- Já existentes: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`

## 4. Deploy
```bash
npx supabase functions deploy google-calendar --project-ref SEU_REF
npx supabase functions deploy admin-stripe --project-ref SEU_REF
```
(`admin-stripe` precisa do redeploy para aceitar a tela `agendamentos` em `telas_acesso`.)

## 5. Uso no painel
1. Login como **owner**.
2. Abra **Agendamentos** → **Conectar Google** (conta da empresa).
3. Escolha a agenda principal se houver mais de uma.
4. Clique **Sincronizar**.
5. Eventos com e-mail igual ao do cliente vinculam sozinhos; os demais usam **Vincular ao cliente**.
6. No **Acompanhamento**, a próxima reunião do card usa o próximo evento Google vinculado (fallback: data da ficha).
