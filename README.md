# 👩‍💼 Sara — Secretária Virtual do Dr. David Iazzetta

A Sara é uma secretária virtual que **recebe os contatos de todos os seus canais**
(WhatsApp, Instagram, Facebook, Messenger) e os **converte em consultas
particulares** agendadas — de forma autônoma, empática e seguindo à risca as
regras da clínica.

## Como funciona (visão geral)

```
  Paciente
     │  (WhatsApp / Instagram / Facebook / Messenger)
     ▼
 ┌────────┐   webhook    ┌──────────────┐   pensa com   ┌──────────┐
 │ KOMMO  │ ───────────▶ │     SARA     │ ────────────▶ │  CLAUDE  │
 │(canais)│ ◀─────────── │ (este código)│ ◀──────────── │ (cérebro)│
 └────────┘   resposta   └──────┬───────┘               └──────────┘
                                │ agenda
                                ▼
                        ┌───────────────┐
                        │ GOOGLE AGENDA │
                        └───────────────┘
```

- **Kommo** = a central que conecta e unifica todos os canais e serve de CRM
  (o lead caminha no funil: *Novo lead → Qualificado → Agendado*).
- **Sara** (este projeto) = o serviço que recebe a mensagem do Kommo, pensa com
  o Claude e agenda no Google.
- **Claude (Anthropic)** = o cérebro que conversa em português seguindo as
  regras éticas e o fluxo de triagem.
- **Google Agenda** = onde as consultas são efetivamente marcadas, com trava de
  concorrência de 15 minutos.

## Estrutura do projeto

```
src/
├── index.ts                 Servidor + webhooks (ponto de entrada)
├── config.ts                Lê e valida o .env
├── sara/
│   ├── systemPrompt.ts      A "constituição" da Sara (personalidade e regras)
│   ├── tools.ts             Ferramentas que a Sara pode usar
│   └── brain.ts             Loop que conversa com o Claude e executa ações
├── channels/
│   └── kommo.ts             Envia mensagens e atualiza o CRM no Kommo
├── calendar/
│   └── googleCalendar.ts    Horários livres, reserva de 15 min, agendamento
├── store/
│   └── conversationStore.ts Histórico de conversa por lead
└── scheduler/
    └── reservas.ts          Libera reservas de 15 min que expiraram
docs/
├── SETUP-CLAUDE.md          Como pegar a chave da Anthropic
├── SETUP-KOMMO.md           Como conectar canais e o Salesbot
└── SETUP-GOOGLE.md          Como conectar o Google Agenda
```

## Passo a passo para colocar no ar

1. **Instalar dependências**
   ```bash
   npm install
   ```
2. **Configurar as variáveis**
   ```bash
   cp .env.example .env
   ```
   Preencha o `.env` seguindo os guias em `docs/`.
3. **Rodar em modo de desenvolvimento**
   ```bash
   npm run dev
   ```
   Acesse `http://localhost:3000` para ver o painel de status.
4. **Conectar o Google Agenda:** clique em "autorizar agora" no painel (ou abra
   `http://localhost:3000/oauth/google`) e faça login com a conta do Dr. David.
5. **Conectar os canais no Kommo:** siga `docs/SETUP-KOMMO.md` para apontar o
   Salesbot para o webhook da Sara.

## O que já está pronto e o que depende de você

| Item | Status |
|------|--------|
| Personalidade, regras éticas e fluxo de triagem da Sara | ✅ pronto |
| Cérebro com Claude (tool use) | ✅ pronto |
| Agendamento no Google Agenda + trava de 15 min | ✅ pronto |
| CRM: lead caminhando no funil do Kommo | ✅ pronto |
| Chave da Anthropic | 🔑 você gera (`docs/SETUP-CLAUDE.md`) |
| Token do Kommo + Salesbot apontando p/ a Sara | 🔑 você configura (`docs/SETUP-KOMMO.md`) |
| Credenciais OAuth do Google | 🔑 você gera (`docs/SETUP-GOOGLE.md`) |

## Onde hospedar (produção)

Em desenvolvimento roda no seu computador. Para funcionar 24h, hospede em um
serviço como Railway, Render ou uma VPS. O importante é que o servidor tenha uma
URL pública (https) para o Kommo conseguir chamar o webhook.

## Notas técnicas

- O histórico de conversa é salvo em `data/conversations.json`. Para alto volume,
  troque por Redis/banco mantendo a mesma interface em `conversationStore.ts`.
- Modelo padrão: `claude-sonnet-5` (melhor custo/qualidade para atendimento).
  Troque em `SARA_MODEL` no `.env` se quiser `claude-opus-5`.
