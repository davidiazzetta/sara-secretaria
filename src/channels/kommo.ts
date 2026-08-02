import { config } from '../config.js';

/**
 * Cliente do Kommo (antigo amoCRM).
 *
 * O Kommo é a central que conecta WhatsApp, Instagram, Facebook e Messenger.
 * A Sara conversa apenas com o Kommo:
 *   - o Kommo avisa a Sara quando chega uma mensagem (webhook -> src/index.ts);
 *   - a Sara responde e atualiza o lead pela API do Kommo (este arquivo).
 *
 * Autenticação: token de acesso de longa duração (integração privada).
 * Docs: https://developers.kommo.com/
 */

interface KommoFetchOpts {
  method?: string;
  body?: unknown;
}

async function kommoFetch<T = unknown>(pathname: string, opts: KommoFetchOpts = {}): Promise<T> {
  const url = `${config.kommo.baseUrl()}${pathname}`;
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${config.kommo.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const texto = await res.text();
    throw new Error(`Kommo API ${res.status} em ${pathname}: ${texto}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/**
 * Mensagem recebida, já normalizada a partir do webhook do Kommo.
 * O formato bruto do webhook varia; a extração fica em src/index.ts.
 */
export interface MensagemRecebida {
  leadId: number;
  contatoId?: number;
  chatId?: string;
  texto: string;
  nomeContato?: string;
  canal?: string; // whatsapp | instagram | facebook | ...
}

/**
 * Envia uma mensagem de texto de volta ao paciente pelo mesmo chat.
 *
 * ATENÇÃO: o endpoint exato para enviar mensagem depende de como os canais
 * estão conectados no Kommo (Salesbot, Chats API ou webhook de resposta).
 * O caminho mais robusto e recomendado é responder via SALESBOT: o Salesbot
 * chama a Sara por webhook e a Sara devolve o texto na própria resposta HTTP.
 * Ver docs/SETUP-KOMMO.md. A função abaixo cobre a Chats API para casos diretos.
 */
export async function enviarMensagem(chatId: string, texto: string): Promise<void> {
  // Placeholder para a Chats API. Em muitas contas, a resposta é devolvida
  // diretamente ao Salesbot (ver src/index.ts -> rota /webhook/kommo/salesbot).
  await kommoFetch(`/api/v4/chats/${chatId}/messages`, {
    method: 'POST',
    body: { text: texto },
  }).catch((err) => {
    // Não derruba o atendimento se o envio direto falhar; loga para diagnóstico.
    console.error('[kommo] Falha ao enviar via Chats API:', err.message);
  });
}

/** Adiciona uma anotação (nota) ao lead — útil para registrar a triagem. */
export async function adicionarNota(leadId: number, texto: string): Promise<void> {
  await kommoFetch(`/api/v4/leads/${leadId}/notes`, {
    method: 'POST',
    body: [{ note_type: 'common', params: { text: texto } }],
  });
}

/**
 * Atualiza o lead no CRM: move de estágio e/ou renomeia.
 * É assim que "convertemos o contato em consulta": o lead caminha pelo funil
 * (Novo lead -> Qualificado -> Agendado).
 */
export async function atualizarLead(opts: {
  leadId: number;
  nome?: string;
  estagio?: 'novoLead' | 'qualificado' | 'agendado';
  nota?: string;
}): Promise<void> {
  const body: Record<string, unknown> = {};
  if (opts.nome) body.name = opts.nome;
  if (opts.estagio) {
    const statusId = config.kommo.stages[opts.estagio];
    if (statusId) {
      body.status_id = statusId;
      if (config.kommo.pipelineId) body.pipeline_id = config.kommo.pipelineId;
    }
  }
  if (Object.keys(body).length > 0) {
    await kommoFetch(`/api/v4/leads/${opts.leadId}`, { method: 'PATCH', body });
  }
  if (opts.nota) await adicionarNota(opts.leadId, opts.nota);
}
