/**
 * Fechas en la zona horaria del estudio.
 *
 * Regla: NUNCA usar `d.toISOString().slice(0, 10)` para obtener "la fecha"
 * de una clase o de una ventana de import. toISOString() convierte a UTC:
 * después de las 6pm hora CDMX ya es "mañana" en UTC y toda la ventana se
 * corre un día — el cron nocturno dejaba de importar las reservas de las
 * clases vespertinas y el reconciliador de TotalPass podía cancelar reservas
 * reales porque la clase "no aparecía" en un feed que nunca la pidió.
 *
 * La zona es configurable por despliegue (GYM_TIMEZONE) para que un gimnasio
 * en Baja California (UTC-7/-8 con DST) no herede el reloj de CDMX.
 */

export const GYM_TIMEZONE = process.env.GYM_TIMEZONE || 'America/Mexico_City';

/** Fecha YYYY-MM-DD en la zona del estudio ('en-CA' formatea ISO). */
export function localDateStr(d: Date = new Date(), tz: string = GYM_TIMEZONE): string {
    return d.toLocaleDateString('en-CA', { timeZone: tz });
}

/** Suma días sin mutar el original. */
export function addDays(d: Date, days: number): Date {
    const r = new Date(d);
    r.setDate(r.getDate() + days);
    return r;
}

/** Suma días a una fecha YYYY-MM-DD (aritmética de calendario, sin zona). */
export function addDaysToDateStr(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T12:00:00Z`); // mediodía: lejos de cualquier borde
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** Offset (ms) de la zona `tz` en el instante `at`. CDMX → -6h (negativo). */
function tzOffsetMs(at: Date, tz: string): number {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    const p: Record<string, string> = {};
    for (const part of dtf.formatToParts(at)) p[part.type] = part.value;
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return asUtc - at.getTime();
}

/** Instante UTC real de `dateStr hh:mm` hora local del gym (DST-aware). */
export function localDateTimeUtc(dateStr: string, hhmm: string, tz: string = GYM_TIMEZONE): Date {
    const base = new Date(`${dateStr}T${hhmm}:00Z`).getTime();
    let guess = new Date(base);
    for (let i = 0; i < 2; i++) {
        guess = new Date(base - tzOffsetMs(guess, tz));
    }
    return guess;
}

/**
 * Instante UTC de la medianoche local de `dateStr` en la zona del gym.
 *
 * Reemplaza el patrón `new Date(`${date}T06:00:00.000Z`)` que asumía UTC-6
 * fijo: correcto para CDMX hoy, pero mal para un gym en Baja California
 * (UTC-7/-8 con DST). Dos pasadas para que la corrección no se desfase si
 * justo cruza un cambio de horario.
 */
export function localMidnightUtc(dateStr: string, tz: string = GYM_TIMEZONE): Date {
    const base = new Date(`${dateStr}T00:00:00Z`).getTime();
    let guess = new Date(base);
    for (let i = 0; i < 2; i++) {
        guess = new Date(base - tzOffsetMs(guess, tz));
    }
    return guess;
}
