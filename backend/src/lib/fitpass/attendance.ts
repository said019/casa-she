/**
 * Asistencia Casa Shé -> FitPass.
 *
 * Check-in en Casa Shé de una reserva channel='fitpass' => POST /attendance_lists/{external_ref}/attend
 * (_method=patch) y marca partner_metadata.fp_attended_at. Fire-and-forget: si falla (típico: check-in antes
 * de que empiece la clase => 404) el check-in local ya quedó y reconcileFitpassAttendance lo reintenta
 * (checked_in de las últimas 36 h, clase ya iniciada, sin fp_attended_at).
 */
import { pool, query } from '../../config/database.js';
import { FitPassScraper, fitpassAttendanceResponseMatches } from '../scrapers/fitpass.js';
import { getFitpassCreds } from './credentials.js';

export interface PushResult { ok: boolean; status?: number; reason?: string }

type Attender = Pick<FitPassScraper, 'markAttendance'>;

async function pushWith(scraper: Attender, reservationId: string): Promise<PushResult> {
    try {
        const r = await scraper.markAttendance(reservationId);
        const attended = fitpassAttendanceResponseMatches(r.raw, 'attended');
        return { ok: r.status === 200 && attended, status: r.status, reason: attended ? undefined : 'response-did-not-confirm-attendance' };
    } catch (e) {
        return { ok: false, reason: (e as Error).message };
    }
}

async function loginScraper(): Promise<FitPassScraper | null> {
    const creds = await getFitpassCreds();
    if (!creds) return null;
    const scraper = new FitPassScraper(creds.panelUrl);
    await scraper.login({ email: creds.email, password: creds.password });
    return scraper;
}

export async function pushFitpassAttendance(reservationId: string): Promise<PushResult> {
    try {
        const scraper = await loginScraper();
        if (!scraper) return { ok: false, reason: 'no-creds' };
        return await pushWith(scraper, reservationId);
    } catch (e) {
        return { ok: false, reason: (e as Error).message };
    }
}

async function markOk(bookingId: string): Promise<void> {
    await query(
        `UPDATE bookings SET partner_metadata = (COALESCE(partner_metadata,'{}'::jsonb) - 'fp_attendance_error' - 'fp_attendance_pending_at')
                || jsonb_build_object('fp_attended_at', now()::text, 'fp_attendance_state', 'attended')
          WHERE id=$1`, [bookingId]);
}

async function markFail(bookingId: string, reason: string): Promise<void> {
    await query(
        `UPDATE bookings SET partner_metadata = COALESCE(partner_metadata,'{}'::jsonb)
                || jsonb_build_object('fp_attendance_error', $2::text, 'fp_attendance_pending_at', now()::text)
          WHERE id=$1`, [bookingId, reason.slice(0, 300)]).catch(() => { /* noop */ });
}

/**
 * Llamar (con `void`) tras un check-in. Acepta uno o varios ids; ignora los que no son FitPass
 * (una sola consulta barata) y usa una sola sesión del panel para todos. Nunca lanza.
 */
export async function reflectFitpassAttendance(bookingIds: string | string[]): Promise<void> {
    try {
        const ids = Array.isArray(bookingIds) ? bookingIds : [bookingIds];
        if (!ids.length) return;
        const r = await pool.query<{ id: string; external_ref: string }>(
            `SELECT id, external_ref FROM bookings
              WHERE id = ANY($1::uuid[]) AND channel='fitpass' AND external_ref IS NOT NULL
                AND status='checked_in' AND partner_metadata->>'fp_attended_at' IS NULL`, [ids]);
        if (!r.rows.length) return;
        const scraper = await loginScraper();
        if (!scraper) return;
        for (const b of r.rows) {
            const res = await pushWith(scraper, String(b.external_ref));
            if (res.ok) await markOk(b.id);
            else {
                await markFail(b.id, res.reason ?? String(res.status ?? 'unknown'));
                console.warn(`[fp-attendance] ${b.id}: ${res.reason ?? res.status} (se reintentará)`);
            }
        }
    } catch (e) {
        console.error('[fp-attendance]', (e as Error).message);
    }
}

export interface PendingAttendance { id: string; external_ref: string }

/** Selección de pendientes (expuesta para tests). */
export async function selectPendingFitpassAttendance(): Promise<PendingAttendance[]> {
    const r = await pool.query<PendingAttendance>(
        `SELECT b.id, b.external_ref
           FROM bookings b JOIN classes c ON c.id=b.class_id
          WHERE b.channel='fitpass' AND b.external_ref IS NOT NULL
            AND b.status='checked_in'
            AND b.checked_in_at >= now() - interval '36 hours'
            AND (c.date + c.start_time) <= (now() AT TIME ZONE 'America/Mexico_City')
            AND b.partner_metadata->>'fp_attended_at' IS NULL
          ORDER BY b.checked_in_at ASC`);
    return r.rows;
}

export async function reconcileFitpassAttendance(
    scraperOverride?: Attender,
): Promise<{ pending: number; ok: number; failed: number }> {
    const pending = await selectPendingFitpassAttendance();
    if (!pending.length) return { pending: 0, ok: 0, failed: 0 };
    let scraper: Attender | null = scraperOverride ?? null;
    if (!scraper) {
        try {
            scraper = await loginScraper();
        } catch (e) {
            console.error('[fp-reconcile] login error:', (e as Error).message);
            return { pending: pending.length, ok: 0, failed: pending.length };
        }
        if (!scraper) return { pending: pending.length, ok: 0, failed: 0 };
    }
    let ok = 0, failed = 0;
    for (const b of pending) {
        const res = await pushWith(scraper, String(b.external_ref));
        if (res.ok) { await markOk(b.id); ok++; }
        else { failed++; await markFail(b.id, res.reason ?? String(res.status ?? 'unknown')); }
    }
    return { pending: pending.length, ok, failed };
}
