import { google, calendar_v3 } from 'googleapis';
import fs from 'node:fs';
import path from 'node:path';
import { config, CLINIC_TIMEZONE } from '../config.js';

/**
 * Integração com o Google Agenda.
 *
 * Responsável por:
 *  - listar horários livres,
 *  - reservar um horário por 15 minutos (trava de concorrência),
 *  - confirmar a consulta (criar o evento definitivo),
 *  - cancelar/liberar um horário.
 *
 * O token de acesso do Google é guardado em ./data/google-token.json depois que
 * o Dr. David autoriza uma vez pelo fluxo em /oauth/google (ver README).
 */

const TOKEN_PATH = path.resolve('data', 'google-token.json');
const RESERVA_DURACAO_MIN = 15; // trava de segurança
const CONSULTA_DURACAO_MIN = 30; // duração padrão de uma consulta

/** Endereços dos locais de atendimento, usados no título/local do evento. */
export const LOCAIS: Record<string, string> = {
  criciuma: 'Clinigastro Hospital Dia — Rua Antônio de Lucca, 50, Pio Corrêa, Criciúma/SC',
  sombrio: 'Clínica Sombrio — Rua Dr. Antonio Botinni, 46, Sombrio/SC',
  'nova veneza': 'Hospital São Marcos — Rua Dr. Carlos Gorini, 17, Nova Veneza/SC',
};

/**
 * Lê o token salvo. Em hospedagem com disco efêmero (Railway/Render), o token
 * pode vir da variável de ambiente GOOGLE_TOKEN_JSON, que sobrevive a deploys.
 * O arquivo em disco tem prioridade (uso local); o env var é o fallback.
 */
function carregarToken(): Record<string, unknown> | null {
  if (fs.existsSync(TOKEN_PATH)) {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
  }
  const envToken = process.env.GOOGLE_TOKEN_JSON?.trim();
  if (envToken) {
    try {
      return JSON.parse(envToken);
    } catch {
      console.error('[google] GOOGLE_TOKEN_JSON está mal formatado (não é JSON válido).');
    }
  }
  return null;
}

function buildOAuthClient() {
  const client = new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri,
  );
  const tokens = carregarToken();
  if (tokens) {
    client.setCredentials(tokens);
    // Persiste o refresh automático de tokens em disco (quando há disco gravável).
    client.on('tokens', (t) => {
      try {
        const current = carregarToken() ?? {};
        fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
        fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...current, ...t }, null, 2));
      } catch {
        /* disco somente-leitura em produção: o refresh_token do env já basta */
      }
    });
  }
  return client;
}

/** URL que o Dr. David abre uma única vez para autorizar o acesso à agenda. */
export function getGoogleAuthUrl(): string {
  const client = buildOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar'],
  });
}

/**
 * Troca o "code" do callback do Google pelo token, salva em disco (quando
 * possível) e devolve o JSON do token — útil para colar em GOOGLE_TOKEN_JSON
 * no serviço de hospedagem e manter o acesso após os deploys.
 */
export async function saveGoogleTokenFromCode(code: string): Promise<string> {
  const client = buildOAuthClient();
  const { tokens } = await client.getToken(code);
  const json = JSON.stringify(tokens);
  try {
    fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  } catch {
    /* disco somente-leitura: o retorno abaixo permite guardar via env var */
  }
  return json;
}

export function isGoogleConnected(): boolean {
  return carregarToken() !== null;
}

function calendarClient(): calendar_v3.Calendar {
  return google.calendar({ version: 'v3', auth: buildOAuthClient() });
}

export interface HorarioLivre {
  /** ISO 8601 com fuso, ex.: 2026-08-05T14:00:00-03:00 */
  inicio: string;
  /** Rótulo amigável, ex.: "terça, 05/08 às 14:00" */
  label: string;
}

/**
 * Lista horários livres para um local nos próximos dias.
 * Estratégia simples: gera slots de horário comercial e remove os que já têm
 * evento (ocupado, reservado ou confirmado) no Google Agenda.
 */
export async function listarHorariosLivres(opts: {
  local: string;
  diasAFrente?: number;
  maxSlots?: number;
}): Promise<HorarioLivre[]> {
  const dias = opts.diasAFrente ?? 10;
  const maxSlots = opts.maxSlots ?? 6;
  const cal = calendarClient();

  const agora = new Date();
  const fim = new Date(agora.getTime() + dias * 24 * 60 * 60 * 1000);

  const { data } = await cal.events.list({
    calendarId: config.google.calendarId,
    timeMin: agora.toISOString(),
    timeMax: fim.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
  });
  const ocupados = (data.items ?? [])
    .filter((e) => e.start?.dateTime)
    .map((e) => new Date(e.start!.dateTime!).getTime());

  const slots: HorarioLivre[] = [];
  const HORAS_COMERCIAIS = [9, 10, 11, 14, 15, 16, 17];

  for (let d = 1; d <= dias && slots.length < maxSlots; d++) {
    const dia = new Date(agora.getTime() + d * 24 * 60 * 60 * 1000);
    const diaSemana = dia.getDay();
    if (diaSemana === 0 || diaSemana === 6) continue; // pula fim de semana

    for (const hora of HORAS_COMERCIAIS) {
      if (slots.length >= maxSlots) break;
      const inicio = new Date(dia);
      inicio.setHours(hora, 0, 0, 0);
      if (inicio.getTime() <= agora.getTime()) continue;

      const conflito = ocupados.some(
        (t) => Math.abs(t - inicio.getTime()) < CONSULTA_DURACAO_MIN * 60 * 1000,
      );
      if (conflito) continue;

      slots.push({ inicio: inicio.toISOString(), label: formatarLabel(inicio) });
    }
  }
  return slots;
}

/**
 * Reserva um horário por 15 minutos criando um evento temporário marcado como
 * [RESERVADO]. Se o horário já estiver ocupado, retorna { ok: false }.
 */
export async function reservarHorario(opts: {
  inicioISO: string;
  local: string;
  nomePaciente: string;
}): Promise<{ ok: boolean; eventId?: string; motivo?: string }> {
  const cal = calendarClient();
  const inicio = new Date(opts.inicioISO);
  const fimReserva = new Date(inicio.getTime() + CONSULTA_DURACAO_MIN * 60 * 1000);

  // Verifica conflito na hora exata.
  const { data } = await cal.events.list({
    calendarId: config.google.calendarId,
    timeMin: inicio.toISOString(),
    timeMax: fimReserva.toISOString(),
    singleEvents: true,
  });
  if ((data.items ?? []).some((e) => e.status !== 'cancelled')) {
    return { ok: false, motivo: 'horario_ja_ocupado' };
  }

  const evento = await cal.events.insert({
    calendarId: config.google.calendarId,
    requestBody: {
      summary: `[RESERVADO] ${opts.nomePaciente}`,
      location: LOCAIS[opts.local.toLowerCase()] ?? opts.local,
      description:
        `Reserva temporária criada pela Sara. Expira em ${RESERVA_DURACAO_MIN} min ` +
        `se não for confirmada.`,
      start: { dateTime: inicio.toISOString(), timeZone: CLINIC_TIMEZONE },
      end: { dateTime: fimReserva.toISOString(), timeZone: CLINIC_TIMEZONE },
      // marcador para o expirador de reservas encontrar
      extendedProperties: {
        private: {
          saraStatus: 'reservado',
          saraExpiraEm: String(Date.now() + RESERVA_DURACAO_MIN * 60 * 1000),
        },
      },
    },
  });
  return { ok: true, eventId: evento.data.id ?? undefined };
}

/** Confirma a consulta: transforma a reserva em evento definitivo. */
export async function confirmarConsulta(opts: {
  eventId: string;
  nomePaciente: string;
  idade?: string;
  relato?: string;
}): Promise<{ ok: boolean }> {
  const cal = calendarClient();
  await cal.events.patch({
    calendarId: config.google.calendarId,
    eventId: opts.eventId,
    requestBody: {
      summary: opts.nomePaciente,
      description:
        `Consulta CONFIRMADA pela Sara.\n` +
        (opts.idade ? `Idade: ${opts.idade}\n` : '') +
        (opts.relato ? `Relato: ${opts.relato}` : ''),
      extendedProperties: { private: { saraStatus: 'confirmado' } },
    },
  });
  return { ok: true };
}

/** Cancela/libera um horário (desistência ou reserva expirada). */
export async function cancelarConsulta(eventId: string): Promise<{ ok: boolean }> {
  const cal = calendarClient();
  await cal.events.delete({ calendarId: config.google.calendarId, eventId });
  return { ok: true };
}

/**
 * Varre a agenda e apaga reservas [RESERVADO] cujo prazo de 15 min já expirou.
 * Deve ser chamado periodicamente (ver src/scheduler/reservas.ts).
 */
export async function liberarReservasExpiradas(): Promise<number> {
  const cal = calendarClient();
  const agora = Date.now();
  const { data } = await cal.events.list({
    calendarId: config.google.calendarId,
    timeMin: new Date().toISOString(),
    timeMax: new Date(agora + 30 * 24 * 60 * 60 * 1000).toISOString(),
    singleEvents: true,
    privateExtendedProperty: ['saraStatus=reservado'],
    maxResults: 250,
  });
  let liberadas = 0;
  for (const e of data.items ?? []) {
    const expira = Number(e.extendedProperties?.private?.saraExpiraEm ?? 0);
    if (expira && expira < agora && e.id) {
      await cal.events.delete({ calendarId: config.google.calendarId, eventId: e.id });
      liberadas++;
    }
  }
  return liberadas;
}

function formatarLabel(d: Date): string {
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: CLINIC_TIMEZONE,
  });
  return fmt.format(d).replace(',', '').replace(' ', ', ');
}
