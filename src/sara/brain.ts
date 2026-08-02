import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { SARA_SYSTEM_PROMPT } from './systemPrompt.js';
import { SARA_TOOLS } from './tools.js';
import {
  getConversa,
  salvarConversa,
  type ConversaEstado,
} from '../store/conversationStore.js';
import * as agenda from '../calendar/googleCalendar.js';
import * as kommo from '../channels/kommo.js';
import type { MensagemRecebida } from '../channels/kommo.js';

/**
 * O cérebro da Sara. Recebe uma mensagem do paciente, conversa com o Claude
 * (executando ferramentas quando ele pedir) e devolve o texto de resposta.
 */

const client = new Anthropic({ apiKey: config.anthropic.apiKey });
const MAX_ITERACOES = 6; // trava contra loop infinito de tool calls

export async function processarMensagem(msg: MensagemRecebida): Promise<string> {
  const estado = getConversa(msg.leadId);

  // Guarda contexto leve do canal/nome já na primeira mensagem.
  if (msg.canal) estado.contexto.canal = msg.canal;
  if (msg.nomeContato && !estado.contexto.nomePaciente) {
    estado.contexto.nomePaciente = msg.nomeContato;
  }

  estado.messages.push({ role: 'user', content: msg.texto });

  let respostaFinal = '';

  for (let i = 0; i < MAX_ITERACOES; i++) {
    const resposta = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: 1024,
      system: SARA_SYSTEM_PROMPT,
      tools: SARA_TOOLS,
      messages: estado.messages,
    });

    estado.messages.push({ role: 'assistant', content: resposta.content });

    // Acumula qualquer texto que a Sara tenha escrito.
    for (const bloco of resposta.content) {
      if (bloco.type === 'text') respostaFinal += bloco.text;
    }

    if (resposta.stop_reason !== 'tool_use') break;

    // Executa todas as ferramentas pedidas e devolve os resultados.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const bloco of resposta.content) {
      if (bloco.type !== 'tool_use') continue;
      const resultado = await executarFerramenta(
        bloco.name,
        bloco.input as Record<string, unknown>,
        msg,
        estado,
      );
      toolResults.push({
        type: 'tool_result',
        tool_use_id: bloco.id,
        content: JSON.stringify(resultado),
      });
    }
    estado.messages.push({ role: 'user', content: toolResults });
  }

  salvarConversa(msg.leadId, estado);
  return respostaFinal.trim() || 'Só um instante, já te respondo. 🙂';
}

/** Ponte entre o nome da ferramenta pedida pelo Claude e a execução real. */
async function executarFerramenta(
  nome: string,
  input: Record<string, unknown>,
  msg: MensagemRecebida,
  estado: ConversaEstado,
): Promise<unknown> {
  try {
    switch (nome) {
      case 'listar_horarios_livres': {
        const local = String(input.local);
        estado.contexto.localEscolhido = local;
        const livres = await agenda.listarHorariosLivres({ local });
        return { horarios: livres };
      }

      case 'reservar_horario': {
        const r = await agenda.reservarHorario({
          inicioISO: String(input.inicioISO),
          local: String(input.local),
          nomePaciente: String(input.nomePaciente),
        });
        if (r.ok) {
          estado.contexto.eventIdReserva = r.eventId;
          estado.contexto.horarioEscolhidoISO = String(input.inicioISO);
        }
        return r;
      }

      case 'confirmar_consulta': {
        if (!estado.contexto.eventIdReserva) {
          return { ok: false, motivo: 'nenhuma_reserva_ativa' };
        }
        const r = await agenda.confirmarConsulta({
          eventId: estado.contexto.eventIdReserva,
          nomePaciente: String(input.nomePaciente),
          idade: input.idade ? String(input.idade) : undefined,
          relato: input.relato ? String(input.relato) : undefined,
        });
        // Move o lead para "Agendado" no CRM.
        await kommo.atualizarLead({
          leadId: msg.leadId,
          nome: String(input.nomePaciente),
          estagio: 'agendado',
          nota:
            `Consulta agendada pela Sara.\n` +
            (input.relato ? `Relato: ${input.relato}` : ''),
        });
        return r;
      }

      case 'cancelar_consulta': {
        if (estado.contexto.eventIdReserva) {
          await agenda.cancelarConsulta(estado.contexto.eventIdReserva);
          estado.contexto.eventIdReserva = undefined;
          estado.contexto.horarioEscolhidoISO = undefined;
        }
        return { ok: true };
      }

      case 'atualizar_lead': {
        await kommo.atualizarLead({
          leadId: msg.leadId,
          nome: input.nome ? String(input.nome) : undefined,
          estagio: input.estagio as 'novoLead' | 'qualificado' | 'agendado' | undefined,
          nota: input.nota ? String(input.nota) : undefined,
        });
        if (input.nome) estado.contexto.nomePaciente = String(input.nome);
        return { ok: true };
      }

      default:
        return { ok: false, motivo: `ferramenta_desconhecida:${nome}` };
    }
  } catch (err) {
    console.error(`[brain] Erro ao executar ferramenta ${nome}:`, err);
    return { ok: false, erro: (err as Error).message };
  }
}
