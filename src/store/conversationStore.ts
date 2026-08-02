import type Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Armazenamento do histórico de conversa por lead.
 *
 * Implementação simples em disco (data/conversations.json). Suficiente para
 * começar. Para produção com volume alto, troque por Redis ou um banco de dados
 * mantendo a mesma interface (get/append/reset).
 */

const DATA_PATH = path.resolve('data', 'conversations.json');

export interface ConversaEstado {
  /** Histórico no formato que o Claude espera. */
  messages: Anthropic.MessageParam[];
  /** Dados úteis coletados durante a triagem (memória de trabalho). */
  contexto: {
    nomePaciente?: string;
    canal?: string;
    localEscolhido?: string;
    eventIdReserva?: string;
    horarioEscolhidoISO?: string;
  };
  atualizadoEm: number;
}

type Store = Record<string, ConversaEstado>;

function carregar(): Store {
  if (!fs.existsSync(DATA_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8')) as Store;
  } catch {
    return {};
  }
}

function salvar(store: Store): void {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(store, null, 2));
}

export function getConversa(leadId: number): ConversaEstado {
  const store = carregar();
  return (
    store[leadId] ?? { messages: [], contexto: {}, atualizadoEm: Date.now() }
  );
}

export function salvarConversa(leadId: number, estado: ConversaEstado): void {
  const store = carregar();
  estado.atualizadoEm = Date.now();
  store[leadId] = estado;
  salvar(store);
}

export function resetConversa(leadId: number): void {
  const store = carregar();
  delete store[leadId];
  salvar(store);
}
