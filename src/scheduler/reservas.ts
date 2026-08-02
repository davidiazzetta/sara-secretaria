import { isGoogleConnected, liberarReservasExpiradas } from '../calendar/googleCalendar.js';

/**
 * Verifica a cada minuto se há reservas de 15 minutos que expiraram e libera o
 * horário. Assim, se o paciente escolheu um horário mas não confirmou, a vaga
 * volta a ficar disponível para outros pacientes.
 */
export function iniciarExpiradorDeReservas(): void {
  setInterval(async () => {
    if (!isGoogleConnected()) return;
    try {
      const n = await liberarReservasExpiradas();
      if (n > 0) console.log(`[reservas] ${n} reserva(s) expirada(s) liberada(s).`);
    } catch (err) {
      console.error('[reservas] Erro ao liberar reservas expiradas:', (err as Error).message);
    }
  }, 60 * 1000);
}
