/**
 * panel — acceso al panel de FitPass para las operaciones de publicación/cupo/cancelación.
 *
 * `FitpassPanel` es la parte del scraper que se usa aquí; los tests inyectan un falso (sin red).
 */
import type { FitPassScraper } from '../scrapers/fitpass.js';
import { getFitpassCreds, getFitpassScraper, FitpassNotConfiguredError } from './credentials.js';
import { localDateTimeUtc, localMidnightUtc, addDaysToDateStr } from '../mx-time.js';
import type { FpListedSchedule } from './ownership.js';

export type FitpassPanel = Pick<FitPassScraper, 'listSchedules' | 'createSchedule' | 'updateSchedule' | 'cancelSchedule'>;

export interface PanelCtx {
    panel: FitpassPanel;
    gymId: number;
}

/** Publicar/editar/mover schedules en FitPass está APAGADO salvo FITPASS_PUBLISH_ENABLED=true. */
export function fitpassPublishEnabled(): boolean {
    return String(process.env.FITPASS_PUBLISH_ENABLED || '').toLowerCase() === 'true';
}

/** Panel + gym_id reales (login). null si FitPass no está configurado/habilitado. */
export async function getPanelCtx(): Promise<PanelCtx | null> {
    try {
        const creds = await getFitpassCreds();
        if (!creds) return null;
        const panel = await getFitpassScraper();
        return { panel, gymId: Number(creds.gymId) };
    } catch (e) {
        if (e instanceof FitpassNotConfiguredError) return null;
        throw e;
    }
}

/** Schedules del panel para las fechas locales [from, to] (inclusive). */
export async function listWindow(ctx: PanelCtx, from: string, to: string): Promise<FpListedSchedule[]> {
    const rows = await ctx.panel.listSchedules(ctx.gymId, localMidnightUtc(from), localMidnightUtc(addDaysToDateStr(to, 1)));
    return rows as unknown as FpListedSchedule[];
}

export const classStartedAlready = (c: { date: string; hhmm: string }, now: Date): boolean =>
    localDateTimeUtc(c.date.slice(0, 10), c.hhmm).getTime() <= now.getTime();

/** Minutos entre dos HH:MM (mínimo 30 por si faltara end_time). */
export function minutesBetween(startHhmm: string, endHhmm: string): number {
    const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const d = m(endHhmm) - m(startHhmm);
    return d >= 15 ? d : 60;
}
