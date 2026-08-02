import 'dotenv/config';

/**
 * Configuração central. Lê o arquivo .env e valida o mínimo necessário
 * para a Sara rodar. Falha cedo, com mensagem clara, se algo faltar.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Variável de ambiente obrigatória ausente: ${name}. ` +
        `Copie o arquivo .env.example para .env e preencha os valores.`,
    );
  }
  return value.trim();
}

function optional(name: string, fallback = ''): string {
  return (process.env[name] ?? fallback).trim();
}

export const config = {
  port: Number(optional('PORT', '3000')),
  webhookSecret: required('WEBHOOK_SECRET'),

  anthropic: {
    apiKey: required('ANTHROPIC_API_KEY'),
    model: optional('SARA_MODEL', 'claude-sonnet-5'),
  },

  kommo: {
    // Opcionais até o Kommo ser configurado — a Sara sobe e funciona (cérebro +
    // agenda) mesmo sem eles; o envio/CRM via Kommo só passa a operar depois.
    subdomain: optional('KOMMO_SUBDOMAIN'),
    accessToken: optional('KOMMO_ACCESS_TOKEN'),
    pipelineId: Number(optional('KOMMO_PIPELINE_ID', '0')),
    stages: {
      novoLead: Number(optional('KOMMO_STAGE_NOVO_LEAD', '0')),
      qualificado: Number(optional('KOMMO_STAGE_QUALIFICADO', '0')),
      agendado: Number(optional('KOMMO_STAGE_AGENDADO', '0')),
    },
    baseUrl(): string {
      return `https://${this.subdomain}.kommo.com`;
    },
  },

  google: {
    clientId: optional('GOOGLE_CLIENT_ID'),
    clientSecret: optional('GOOGLE_CLIENT_SECRET'),
    redirectUri: optional(
      'GOOGLE_REDIRECT_URI',
      'http://localhost:3000/oauth/google/callback',
    ),
    calendarId: optional('GOOGLE_CALENDAR_ID', 'primary'),
  },
} as const;

/** Fuso horário da clínica (Santa Catarina). Usado em toda a agenda. */
export const CLINIC_TIMEZONE = 'America/Sao_Paulo';
