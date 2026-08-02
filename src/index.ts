import express, { type Request, type Response } from 'express';
import { config } from './config.js';
import { processarMensagem } from './sara/brain.js';
import type { MensagemRecebida } from './channels/kommo.js';
import { enviarMensagem } from './channels/kommo.js';
import { iniciarExpiradorDeReservas } from './scheduler/reservas.js';
import {
  getGoogleAuthUrl,
  saveGoogleTokenFromCode,
  isGoogleConnected,
} from './calendar/googleCalendar.js';

/**
 * Servidor da Sara. Expõe:
 *  - /                     -> painel simples de status
 *  - /webhook/kommo/salesbot -> chamado pelo Salesbot do Kommo a cada mensagem
 *  - /oauth/google         -> autoriza o acesso à agenda (o Dr. David abre 1x)
 *  - /oauth/google/callback-> recebe o token do Google
 */

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

/** Painel de status — mostra rapidamente se tudo está conectado. */
app.get('/', (_req, res) => {
  res.send(`
    <html lang="pt-BR"><head><meta charset="utf-8">
    <title>Sara — Secretária Virtual</title>
    <style>body{font-family:system-ui;max-width:640px;margin:40px auto;padding:0 16px;color:#222}
    .ok{color:#0a7d34}.no{color:#b00020}code{background:#f2f2f2;padding:2px 6px;border-radius:4px}</style>
    </head><body>
    <h1>👩‍💼 Sara — Secretária Virtual do Dr. David Iazzetta</h1>
    <p>Status do servidor: <b class="ok">no ar</b></p>
    <ul>
      <li>Google Agenda: ${
        isGoogleConnected()
          ? '<b class="ok">conectado ✔</b>'
          : '<b class="no">não conectado</b> — <a href="/oauth/google">autorizar agora</a>'
      }</li>
      <li>Kommo: configurado para <code>${config.kommo.subdomain}.kommo.com</code></li>
      <li>Modelo do cérebro: <code>${config.anthropic.model}</code></li>
    </ul>
    <p>Webhook do Salesbot (configure no Kommo):<br>
    <code>POST /webhook/kommo/salesbot</code></p>
    </body></html>
  `);
});

/**
 * Webhook do Salesbot do Kommo.
 *
 * Fluxo recomendado: no Salesbot, adicione um passo "Enviar requisição" que
 * chama esta rota a cada mensagem do paciente. A Sara devolve o texto na
 * própria resposta HTTP, e o Salesbot envia esse texto de volta ao paciente
 * (funciona igual para WhatsApp, Instagram, Facebook e Messenger).
 *
 * Segurança: o Salesbot deve enviar ?secret=SEU_WEBHOOK_SECRET.
 */
app.post('/webhook/kommo/salesbot', async (req: Request, res: Response) => {
  if (req.query.secret !== config.webhookSecret) {
    return res.status(401).json({ erro: 'segredo_invalido' });
  }
  try {
    const msg = extrairMensagem(req.body);
    if (!msg || !msg.texto) {
      return res.json({ resposta: '' });
    }
    const resposta = await processarMensagem(msg);

    // Se o chatId estiver presente, também tentamos enviar diretamente.
    if (msg.chatId) enviarMensagem(msg.chatId, resposta).catch(() => {});

    // Devolve para o Salesbot exibir ao paciente.
    return res.json({ resposta });
  } catch (err) {
    console.error('[webhook] Erro ao processar mensagem:', err);
    return res.status(500).json({ erro: 'falha_interna' });
  }
});

/**
 * Extrai uma mensagem normalizada do corpo do webhook.
 * O formato do Kommo/Salesbot varia conforme a configuração; tentamos os
 * campos mais comuns e deixamos claro onde ajustar (ver docs/SETUP-KOMMO.md).
 */
function extrairMensagem(body: any): MensagemRecebida | null {
  if (!body) return null;

  // Formato 1: você mesmo monta o corpo no passo "Enviar requisição" do Salesbot
  // (recomendado — mais previsível). Ex.: { lead_id, text, name, channel, chat_id }
  if (body.lead_id || body.leadId) {
    return {
      leadId: Number(body.lead_id ?? body.leadId),
      texto: String(body.text ?? body.texto ?? ''),
      nomeContato: body.name ?? body.nome,
      canal: body.channel ?? body.canal,
      chatId: body.chat_id ?? body.chatId,
    };
  }

  // Formato 2: payload nativo de webhook de mensagens do Kommo (mais aninhado).
  const talk = body?.message?.add?.[0] ?? body?.talk;
  if (talk) {
    return {
      leadId: Number(talk.entity_id ?? talk.lead_id ?? 0),
      texto: String(talk.text ?? ''),
      nomeContato: talk.author?.name,
      chatId: talk.chat_id,
      canal: talk.origin,
    };
  }

  return null;
}

// ----- Autorização do Google Agenda (feita uma única vez) -----

app.get('/oauth/google', (_req, res) => {
  res.redirect(getGoogleAuthUrl());
});

app.get('/oauth/google/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  if (!code) return res.status(400).send('Faltou o parâmetro "code".');
  try {
    const tokenJson = await saveGoogleTokenFromCode(code);
    res.send(
      '<h2>✅ Google Agenda conectado com sucesso!</h2>' +
        '<p>A Sara já pode agendar consultas.</p>' +
        '<p><b>Para hospedagem:</b> copie o valor abaixo e cole na variável de ' +
        'ambiente <code>GOOGLE_TOKEN_JSON</code> do seu serviço (assim o acesso ' +
        'sobrevive aos deploys). Se estiver rodando só local, pode ignorar.</p>' +
        `<textarea style="width:100%;height:120px;font-family:monospace">${tokenJson}</textarea>`,
    );
  } catch (err) {
    res.status(500).send(`Erro ao conectar o Google: ${(err as Error).message}`);
  }
});

app.listen(config.port, () => {
  console.log(`\n👩‍💼 Sara no ar em http://localhost:${config.port}`);
  console.log(`   Cérebro: Claude (${config.anthropic.model})`);
  console.log(`   Kommo:   ${config.kommo.subdomain}.kommo.com`);
  console.log(
    `   Google:  ${isGoogleConnected() ? 'conectado' : 'PENDENTE — abra /oauth/google'}\n`,
  );
  iniciarExpiradorDeReservas();
});
