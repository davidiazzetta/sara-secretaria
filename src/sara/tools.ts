import type Anthropic from '@anthropic-ai/sdk';

/**
 * Definição das ferramentas (tools) que a Sara pode chamar durante a conversa.
 * O Claude decide QUANDO chamar; a execução real fica em src/sara/brain.ts.
 */

export const SARA_TOOLS: Anthropic.Tool[] = [
  {
    name: 'listar_horarios_livres',
    description:
      'Lista os horários realmente livres na agenda do Dr. David para um local. ' +
      'Use antes de oferecer horários ao paciente. Nunca invente horários.',
    input_schema: {
      type: 'object',
      properties: {
        local: {
          type: 'string',
          enum: ['criciuma', 'sombrio', 'nova veneza'],
          description: 'Cidade/local de atendimento escolhido pelo paciente.',
        },
      },
      required: ['local'],
    },
  },
  {
    name: 'reservar_horario',
    description:
      'Reserva um horário por 15 minutos (trava de segurança contra concorrência). ' +
      'Use assim que o paciente escolher um horário, ANTES de coletar o cadastro completo.',
    input_schema: {
      type: 'object',
      properties: {
        inicioISO: {
          type: 'string',
          description: 'Início do horário escolhido, em ISO 8601 (veio de listar_horarios_livres).',
        },
        local: {
          type: 'string',
          enum: ['criciuma', 'sombrio', 'nova veneza'],
        },
        nomePaciente: { type: 'string' },
      },
      required: ['inicioISO', 'local', 'nomePaciente'],
    },
  },
  {
    name: 'confirmar_consulta',
    description:
      'Confirma definitivamente a consulta no Google Agenda. Só use quando tiver ' +
      'TODOS os dados do cadastro (nome, nascimento, CPF, WhatsApp e relato).',
    input_schema: {
      type: 'object',
      properties: {
        nomePaciente: { type: 'string' },
        idade: { type: 'string', description: 'Idade ou data de nascimento.' },
        relato: { type: 'string', description: 'Breve relato do quadro.' },
      },
      required: ['nomePaciente'],
    },
  },
  {
    name: 'cancelar_consulta',
    description:
      'Cancela a consulta/reserva atual e libera o horário. Use em caso de desistência.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'atualizar_lead',
    description:
      'Atualiza o lead no CRM Kommo: define o nome, move de estágio no funil e/ou ' +
      'registra uma anotação da triagem. Use para manter o CRM sempre em dia.',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string' },
        estagio: {
          type: 'string',
          enum: ['novoLead', 'qualificado', 'agendado'],
          description:
            'novoLead = acabou de chegar; qualificado = é particular e quer agendar; ' +
            'agendado = consulta confirmada.',
        },
        nota: { type: 'string', description: 'Anotação livre sobre o atendimento.' },
      },
    },
  },
];
