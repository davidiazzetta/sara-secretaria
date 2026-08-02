# 📅 Conectar o Google Agenda

A Sara marca as consultas na agenda do Dr. David. A autorização é feita **uma
única vez** e o acesso fica salvo.

## Passo a passo

1. Acesse o **Google Cloud Console**: https://console.cloud.google.com/
2. Crie um projeto (ex.: "Sara Agenda").
3. Ative a **Google Calendar API** em *APIs e serviços → Biblioteca*.
4. Em *APIs e serviços → Tela de consentimento OAuth*:
   - tipo **Externo**;
   - adicione o e-mail do Dr. David como **usuário de teste** (assim funciona
     sem precisar de verificação pública).
5. Em *APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth*:
   - tipo **Aplicativo da Web**;
   - em **URIs de redirecionamento autorizados**, adicione:
     ```
     http://localhost:3000/oauth/google/callback
     ```
     (em produção, use a URL pública do seu servidor + `/oauth/google/callback`).
6. Copie o **Client ID** e o **Client Secret** e preencha no `.env`:
   ```
   GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=xxxxx
   GOOGLE_REDIRECT_URI=http://localhost:3000/oauth/google/callback
   GOOGLE_CALENDAR_ID=primary
   ```
   - `GOOGLE_CALENDAR_ID=primary` usa a agenda principal da conta. Para uma
     agenda específica, use o ID dela (encontrado nas configurações da agenda).

## Autorizar

Com a Sara rodando (`npm run dev`):

1. Abra `http://localhost:3000/oauth/google`.
2. Faça login com a conta do Dr. David e conceda o acesso.
3. Pronto — o token fica salvo em `data/google-token.json` e a Sara já agenda.

## Como a agenda é usada

- A Sara só oferece horários **realmente livres** (horário comercial, dias úteis).
- Ao escolher, cria uma **reserva de 15 min** marcada como `[RESERVADO]`.
- Se o paciente confirmar, a reserva vira a consulta definitiva com nome, idade
  e relato na descrição.
- Se não confirmar em 15 min, a reserva é **apagada automaticamente** e o horário
  volta a ficar livre.
