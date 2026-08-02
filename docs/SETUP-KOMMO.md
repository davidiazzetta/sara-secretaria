# 🔗 Conectar os canais e o Salesbot (Kommo)

O Kommo é a central que já conecta WhatsApp, Instagram, Facebook e Messenger.
A Sara conversa apenas com o Kommo — ele cuida da entrega em cada rede.

## Parte 1 — Conectar os canais (você faz dentro do Kommo)

No Kommo, em **Configurações → Comunicação / Canais**, conecte:

- **WhatsApp** (via WhatsApp Business API oficial ou o conector do Kommo);
- **Instagram** e **Facebook/Messenger** (conecte suas páginas/perfis);
- outros canais que desejar.

> Essa parte é feita 100% dentro do Kommo, com os logins das suas contas. A Sara
> não precisa das senhas das redes — o Kommo já intermedeia tudo.

## Parte 2 — Criar a integração privada (token de acesso)

1. No Kommo, vá em **Configurações → Integrações → Criar integração** (ou
   "Desenvolvedores").
2. Crie uma **integração privada**.
3. Gere uma **chave de acesso de longa duração** (long-lived token).
4. Preencha no `.env` da Sara:
   ```
   KOMMO_SUBDOMAIN=suaconta        # de https://suaconta.kommo.com
   KOMMO_ACCESS_TOKEN=eyJ0...      # a chave de longa duração
   ```

## Parte 3 — Descobrir os IDs do funil e estágios

A Sara move o lead pelo funil (Novo lead → Qualificado → Agendado). Para isso
precisa dos IDs. Rode este comando (com o token já no `.env`) e anote os números:

```bash
curl -s https://SUACONTA.kommo.com/api/v4/leads/pipelines \
  -H "Authorization: Bearer SEU_TOKEN" | jq
```

Preencha no `.env`:
```
KOMMO_PIPELINE_ID=123456
KOMMO_STAGE_NOVO_LEAD=1000001
KOMMO_STAGE_QUALIFICADO=1000002
KOMMO_STAGE_AGENDADO=1000003
```

## Parte 4 — Ligar o Salesbot à Sara

O jeito mais robusto de a Sara responder é pelo **Salesbot** do Kommo:

1. Em **Automação → Salesbot**, crie um bot acionado quando chega uma mensagem
   nova de um lead.
2. Adicione um passo **"Enviar requisição" (webhook)** com:
   - **URL:** `https://SEU-SERVIDOR/webhook/kommo/salesbot?secret=SEU_WEBHOOK_SECRET`
     (o `SEU_WEBHOOK_SECRET` é o mesmo valor do `.env`).
   - **Método:** `POST`
   - **Corpo (JSON):** monte assim para ficar previsível —
     ```json
     {
       "lead_id": "{{lead.id}}",
       "text": "{{message.text}}",
       "name": "{{contact.name}}",
       "channel": "{{message.source}}",
       "chat_id": "{{talk.id}}"
     }
     ```
     (Os nomes exatos das variáveis podem variar; use as disponíveis no editor
     do Salesbot. O importante é enviar `lead_id` e `text`.)
3. Adicione um passo **"Enviar mensagem"** usando a resposta da requisição
   (campo `resposta` que a Sara devolve) para responder ao paciente.

> A Sara devolve o texto no campo `resposta` da resposta HTTP. É esse texto que
> o Salesbot deve enviar de volta ao paciente — funciona igual em todos os canais.

## Segurança

O `WEBHOOK_SECRET` garante que só o seu Kommo consiga acionar a Sara. Use um
valor longo e aleatório e mantenha-o igual no `.env` e na URL do Salesbot.
