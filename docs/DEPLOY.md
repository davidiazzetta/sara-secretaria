# 🚀 Hospedar a Sara (colocar no ar 24h)

Para o Kommo alcançar a Sara, ela precisa de uma URL pública (https). O caminho
mais simples é o **Railway** (também serve Render, Fly.io ou uma VPS).

## Opção recomendada: Railway

1. Crie/entre na conta em **https://railway.app/** (login com GitHub facilita).
2. **Suba o código para um repositório GitHub** (a Sara precisa estar num repo
   para o Railway puxar). Se ainda não tem, veja "Subir para o GitHub" abaixo.
3. No Railway: **New Project → Deploy from GitHub repo →** selecione o repo da Sara.
4. O Railway detecta Node automaticamente e roda `npm install` → `npm run build`
   → `npm start`. Não precisa configurar comando.
5. Em **Variables**, adicione TODAS as variáveis do seu `.env` (sem o arquivo,
   uma a uma):
   - `WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `SARA_MODEL`
   - `KOMMO_SUBDOMAIN`, `KOMMO_ACCESS_TOKEN`, `KOMMO_PIPELINE_ID`,
     `KOMMO_STAGE_NOVO_LEAD`, `KOMMO_STAGE_QUALIFICADO`, `KOMMO_STAGE_AGENDADO`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_ID`
   - `GOOGLE_REDIRECT_URI` → agora com a URL pública, ex.:
     `https://sara-production.up.railway.app/oauth/google/callback`
   - `GOOGLE_TOKEN_JSON` → deixe em branco por ora (preenche no passo 8).
6. Em **Settings → Networking → Generate Domain**, gere o domínio público.
   Anote a URL (ex.: `https://sara-production.up.railway.app`).
7. **Atualize dois lugares com essa URL pública:**
   - `GOOGLE_REDIRECT_URI` (variável acima) e também nos **URIs de
     redirecionamento autorizados** do OAuth no Google Cloud (ver SETUP-GOOGLE.md).
   - A URL do webhook no Salesbot do Kommo (ver SETUP-KOMMO.md):
     `https://SUA-URL/webhook/kommo/salesbot?secret=SEU_WEBHOOK_SECRET`
8. **Autorize o Google na URL pública:** abra `https://SUA-URL/oauth/google`,
   faça login e copie o token que aparece na tela para a variável
   `GOOGLE_TOKEN_JSON`. Isso mantém o acesso à agenda mesmo após novos deploys.

Pronto: a Sara está no ar e o Kommo consegue chamá-la.

## Subir para o GitHub (se ainda não estiver)

Dentro da pasta `sara-secretaria`:
```bash
git init
git add .
git commit -m "Sara: secretária virtual"
```
Crie um repositório vazio em github.com e siga as instruções de "push an
existing repository". O `.gitignore` já protege o `.env` e a pasta `data/`.

## Observações

- O histórico de conversas (`data/conversations.json`) é apagado a cada deploy
  no Railway. Para atendimento em andamento não se perde nada relevante, mas se
  quiser persistência total, adicione um "Volume" no Railway montado em `/data`
  ou troque o `conversationStore.ts` por Redis.
- Sempre use `https` na URL pública — o Kommo exige.
