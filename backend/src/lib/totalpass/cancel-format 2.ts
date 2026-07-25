/**
 * cancel-format — formato del tope de cancelación (maxTimeToCancel) para el
 * CREATE de eventos individuales de TotalPass.
 *
 * Portado de Hundred (totalpass-cancel-policy.ts), adelgazado a solo la pieza
 * pura que necesita el publicador oficial de Casa Shé.
 *
 * TotalPass solo acepta maxTimeToCancel al crear una clase individual en el
 * formato del panel: "YYYY-MM-DD hh:mm AM/PM" en hora LOCAL del gym (un ISO le
 * devuelve 400). El cálculo es DST-aware: obtiene el instante real del inicio
 * (localDateTimeUtc, que respeta la zona configurada del estudio) y lo formatea
 * de vuelta a la hora de pared con Intl — consistente con el guard "too-soon"
 * del publicador. Un offset fijo -6 fallaría en un gym de Baja California.
 */
import { localDateTimeUtc, GYM_TIMEZONE } from '../mx-time.js';

/** Horas antes de la clase en que se cierra la cancelación en TotalPass
 *  (decisión del negocio; evita cancelaciones de último momento). Fuente única. */
export const TP_CANCEL_HOURS = 4;

/**
 * Deadline de cancelación (inicio − hoursBefore) en el formato que acepta el
 * CREATE del panel de TotalPass: "YYYY-MM-DD hh:mm AM/PM", hora local del gym.
 *
 * @param dateYmd    fecha de la clase "YYYY-MM-DD"
 * @param startTime  hora de inicio "HH:MM" (24h)
 * @param hoursBefore horas antes del inicio que cierra la cancelación
 * @param tz         zona del gym (default GYM_TIMEZONE)
 */
export function formatTpCancelDeadlinePanel(
    dateYmd: string,
    startTime: string,
    hoursBefore: number,
    tz: string = GYM_TIMEZONE,
): string {
    const deadline = new Date(localDateTimeUtc(dateYmd, startTime, tz).getTime() - hoursBefore * 3600 * 1000);
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: true,
    }).formatToParts(deadline);
    const p = (t: string) => parts.find((x) => x.type === t)?.value ?? '';
    return `${p('year')}-${p('month')}-${p('day')} ${p('hour')}:${p('minute')} ${p('dayPeriod').toUpperCase()}`;
}
