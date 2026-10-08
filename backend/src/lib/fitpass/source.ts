/**
 * Import de reservas FitPass (scraper del panel) + registro de recepción (walk-in).
 * Port de Hundred `fitpass-source.ts` adaptado a Casa Shé.
 *
 * Reglas (GOTCHAS de Hundred):
 *  - Clase por lesson_id (autoritativo) > nombre normalizado (+ alias) > coach, sobre fecha+hora LOCAL
 *    (CDMX) de la fila; ambiguo => falla VISIBLE ('failed'), nunca al azar.
 *  - sourceRef ya enlazado => se respeta SU clase y SU usuaria (FitPass conserva la hora vieja tras mover).
 *  - Nunca rechaza por cupo (overbooked en partner_metadata). Solo recepción (prospectivo) valida cupo.
 *  - CANCELADO cancela solo la reserva con la misma external_ref (o legacy sin ref): regla "Letty".
 *  - ASISTIÓ crea el check-in automatizado y marca fp_attended_at (FitPass ya lo sabe).
 *  - Usuarias fantasma source='fitpass' con membresía activa del plan interno 'Fitpass' => platformMember.ts
 *    las excluye de toda notificación automática.
 */
import type { PoolClient } from 'pg';
import { pool } from '../../config/database.js';
import { fitpassClassAliases } from '../gym-config.js';
import { withFitpassLock } from './locks.js';
import {
    type Db, blocksFitpassReactivation, cancelFitpassBooking, confirmFitpassCheckin,
    findActiveFitpassBookingForPair, findFitpassBookingByRef, fitpassStudioCancellationMetadata,
    upsertFitpassBooking, FitpassBookingError,
} from './partner-bookings.js';

export type FitpassReservationStatus = 'reserved' | 'attended' | 'cancelled';

export type FitpassErrorCode =
    | 'CLASS_NOT_FOUND' | 'CLASS_FULL' | 'FITPASS_QUOTA_EXHAUSTED' | 'FITPASS_NOT_CONFIGURED' | 'INVALID_INPUT';

export class FitpassError extends Error {
    constructor(public code: FitpassErrorCode, message: string) {
        super(message);
        this.name = 'FitpassError';
    }
}

export interface FitpassSourceRow {
    sourceRef?: string;
    displayName: string;
    fitpassMemberRef?: string;
    classId?: string;
    classLookup?: { date: string; startTime: string; className?: string; fitpassLessonId?: number; coachName?: string };
    status: FitpassReservationStatus;
}

export type FitpassImportRowOutcome = 'created' | 'updated' | 'cancelled' | 'skipped' | 'failed';

export interface FitpassImportRowResult {
    index: number;
    outcome: FitpassImportRowOutcome;
    bookingId?: string;
    checkinId?: string;
    reason?: string;
    overbooked?: boolean;
    error?: FitpassErrorCode | 'UNKNOWN';
    message?: string;
}

export interface FitpassImportResult {
    summary: { total: number; created: number; updated: number; cancelled: number; skipped: number; failed: number };
    rows: FitpassImportRowResult[];
    /** reservas importadas que excedieron el aforo (se subió max_capacity en 1) */
    overbooked: number;
    overbookedRefs: string[];
    /** 'locked' si FP_IMPORT estaba tomado. */
    skipped?: string;
}

// ── Normalización ───────────────────────────────────────────────────────────

function fold(s: string): string {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Nombre de clase FitPass -> clave comparable con class_types.name (aplica FITPASS_CLASS_ALIASES). */
export function normalizeImportClassName(s: string): string {
    const n = fold(s);
    const alias = fitpassClassAliases();
    const hit = alias[n] ?? alias[String(s || '').toLowerCase().trim()];
    return hit ? fold(hit) : n;
}

function normalizeCoach(s: string): string {
    return fold(s);
}

export function normalizeHHMMSS(t: string): string {
    return t.length === 5 ? `${t}:00` : t;
}

// ── Resolución de clase ─────────────────────────────────────────────────────

interface Candidate { id: string; ct_name: string; fitpass_lesson_id: number | null; coach_name: string | null }

/** Palabras que identifican la FAMILIA de una disciplina (FitPass usa variantes por horario). */
export const FAMILY_KEYWORDS = ['barre', 'pilates', 'mat', 'sculpt', 'abs', 'vinyasa', 'dharma', 'rocket', 'ashtanga', 'navakarana', 'flow', 'flex', 'yoga'];

/** Palabras genéricas pesan 1; las que nombran la disciplina pesan 3. */
const SECONDARY_KEYWORDS = new Set(['mat', 'abs', 'yoga']);
const kwWeight = (k: string) => (SECONDARY_KEYWORDS.has(k) ? 1 : 3);

export function familyKeywords(name: string): Set<string> {
    const words = new Set(fold(name).split(' '));
    return new Set(FAMILY_KEYWORDS.filter((k) => words.has(k)));
}

/**
 * PURA: elige una clase entre candidatas del mismo (fecha, hora CDMX) o lanza CLASS_NOT_FOUND visible.
 * Casa Shé tiene UN class_type por familia y FitPass publica VARIANTES por slot ("BARRE - ABS & BUTT",
 * "PILATES MAT - GAP"), así que el lesson_id NO es autoritativo (solo fija un default por tipo). Orden:
 *   (c) una sola candidata en el slot -> esa;
 *   (d) varias: nombre exacto (con alias) -> familia (palabras clave compartidas, gana el mayor traslape)
 *       -> igualdad de lesson_id -> coach; si sigue ambiguo falla VISIBLE.
 * (a) enlace por external_ref y (b) ownership por partner_class_mappings se resuelven antes (la fila no
 * expone el schedule id, así que (b) no aplica al feed de reservaciones).
 */
export function pickCandidate(
    candidates: Candidate[],
    lk: { date: string; startTime: string; className?: string; fitpassLessonId?: number; coachName?: string },
): string {
    const slot = `${lk.date} ${lk.startTime}`;
    if (candidates.length === 0) throw new FitpassError('CLASS_NOT_FOUND', `Sin clase para ${slot}`);
    if (candidates.length === 1) return candidates[0].id;

    const byCoach = (set: Candidate[]): string | null => {
        if (!lk.coachName) return null;
        const nc = normalizeCoach(lk.coachName);
        const m = set.filter((c) => c.coach_name && normalizeCoach(c.coach_name) === nc);
        return m.length === 1 ? m[0].id : null;
    };
    const byLesson = (set: Candidate[]): Candidate[] | null => {
        if (lk.fitpassLessonId == null || lk.fitpassLessonId <= 0) return null;
        const m = set.filter((c) => c.fitpass_lesson_id != null && Number(c.fitpass_lesson_id) === Number(lk.fitpassLessonId));
        return m.length ? m : null;
    };
    const resolveIn = (set: Candidate[]): string | null => {
        if (set.length === 1) return set[0].id;
        const l = byLesson(set);
        if (l?.length === 1) return l[0].id;
        return byCoach(l ?? set);
    };

    let pool = candidates;
    if (lk.className) {
        const norm = normalizeImportClassName(lk.className);
        const exact = candidates.filter((c) => fold(c.ct_name) === norm);
        if (exact.length === 1) return exact[0].id;
        if (exact.length > 1) pool = exact;
        else {
            const fp = familyKeywords(lk.className);
            const scored = candidates.map((c) => {
                const ck = familyKeywords(c.ct_name);
                return { c, n: [...ck].filter((k) => fp.has(k)).reduce((a, k) => a + kwWeight(k), 0) };
            });
            const best = Math.max(0, ...scored.map((x) => x.n));
            if (best > 0) pool = scored.filter((x) => x.n === best).map((x) => x.c);
        }
    }
    const hit = resolveIn(pool);
    if (hit) return hit;
    throw new FitpassError('CLASS_NOT_FOUND',
        `Varias clases en ${slot} y no se pudo identificar el tipo (lesson=${lk.fitpassLessonId ?? '?'}, nombre=${lk.className ?? '?'}, coach=${lk.coachName ?? '?'}). Revisa el mapeo o el feed.`);
}

export async function resolveClassIdForImport(db: Db, row: FitpassSourceRow): Promise<string> {
    if (row.classId) {
        const r = await db.query(`SELECT id FROM classes WHERE id=$1`, [row.classId]);
        if (!r.rows[0]) throw new FitpassError('CLASS_NOT_FOUND', 'Clase no encontrada');
        return r.rows[0].id;
    }
    if (!row.classLookup) throw new FitpassError('INVALID_INPUT', 'classId o classLookup requerido');
    const lk = row.classLookup;
    const r = await db.query<Candidate>(
        `SELECT c.id, ct.name AS ct_name, ct.fitpass_lesson_id, i.display_name AS coach_name
           FROM classes c
           JOIN class_types ct ON ct.id = c.class_type_id
           LEFT JOIN instructors i ON i.id = c.instructor_id
          WHERE c.date = $1::date AND c.start_time = $2::time AND c.status <> 'cancelled'
          ORDER BY c.created_at ASC`,
        [lk.date, normalizeHHMMSS(lk.startTime)],
    );
    return pickCandidate(r.rows, lk);
}

// ── Usuarias fantasma + membresía interna ───────────────────────────────────

function slugify(name: string): string {
    return fold(name).replace(/ /g, '-').slice(0, 40);
}

export async function findOrCreateFitpassUser(db: Db, displayName: string): Promise<{ id: string; display_name: string }> {
    const name = displayName.trim();
    const byName = await db.query(
        `SELECT id, display_name FROM users WHERE source='fitpass' AND lower(display_name)=lower($1) LIMIT 1`, [name]);
    if (byName.rows[0]) return byName.rows[0];
    const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const email = `${slugify(name) || 'fitpass'}-${stamp}@fitpass.casashe.local`;
    const phone = `+0000${Date.now().toString().slice(-7)}`;
    const ins = await db.query(
        `INSERT INTO users (display_name, email, phone, role, source) VALUES ($1,$2,$3,'client','fitpass')
         RETURNING id, display_name`,
        [name, email, phone],
    );
    return ins.rows[0];
}

/** Membresía ACTIVA del plan interno 'Fitpass' (como TotalPass): gatea las notificaciones. */
export async function ensureFitpassMembership(db: Db, userId: string): Promise<string | null> {
    const plan = (await db.query(
        `SELECT id, reformer_credits, multi_credits, class_limit FROM plans
          WHERE is_internal = true AND lower(name)='fitpass' LIMIT 1`)).rows[0];
    if (!plan) return null;
    const ex = await db.query(`SELECT id FROM memberships WHERE user_id=$1 AND plan_id=$2 AND status='active' LIMIT 1`, [userId, plan.id]);
    if (ex.rows[0]) return ex.rows[0].id;
    const c = await db.query(
        `INSERT INTO memberships (user_id, plan_id, start_date, end_date, status, reformer_remaining, multi_remaining, classes_remaining, payment_method, activated_at)
         VALUES ($1,$2, studio_today(), studio_today() + INTERVAL '365 days', 'active', $3,$4,$5,'plataforma', NOW())
         RETURNING id`,
        [userId, plan.id, plan.reformer_credits, plan.multi_credits, plan.class_limit],
    );
    return c.rows[0].id;
}

// ── Una fila del import ─────────────────────────────────────────────────────

type RowOut = Omit<FitpassImportRowResult, 'index'>;

async function importSingleRow(db: Db, row: FitpassSourceRow, actor: string | null): Promise<RowOut> {
    if (row.status === 'cancelled') {
        let booking: { id: string; class_id: string } | null = null;
        if (row.sourceRef) {
            const byRef = await findFitpassBookingByRef(db, row.sourceRef);
            if (byRef) booking = byRef.status === 'cancelled' ? null : { id: byRef.id, class_id: byRef.class_id };
            if (byRef && byRef.status === 'cancelled') return { outcome: 'skipped', reason: 'ya-cancelada', bookingId: byRef.id };
        }
        if (!booking) {
            let classId: string;
            try {
                classId = await resolveClassIdForImport(db, row);
            } catch (e) {
                if (e instanceof FitpassError) return { outcome: 'skipped', reason: 'no-se-pudo-ubicar-clase-para-cancelar' };
                throw e;
            }
            const u = (await db.query(
                `SELECT id FROM users WHERE source='fitpass' AND lower(display_name)=lower($1) LIMIT 1`, [row.displayName.trim()])).rows[0];
            if (u) {
                // Regla Letty: solo la misma external_ref o una legacy sin ref.
                const dup = (await db.query(
                    `SELECT id, class_id FROM bookings
                      WHERE channel='fitpass' AND class_id=$1 AND user_id=$2 AND status<>'cancelled'
                        AND (external_ref IS NULL OR external_ref=$3) LIMIT 1`,
                    [classId, u.id, row.sourceRef ?? null])).rows[0];
                if (dup) booking = dup;
            }
        }
        if (!booking) return { outcome: 'skipped', reason: 'no-active-booking-found' };
        await cancelFitpassBooking(db, booking.id, 'Cancelado por import FitPass');
        return { outcome: 'cancelled', bookingId: booking.id };
    }

    const existingByRef = row.sourceRef ? await findFitpassBookingByRef(db, row.sourceRef) : null;
    const classId = existingByRef?.class_id || await resolveClassIdForImport(db, row);

    const k = (await db.query(`SELECT status FROM classes WHERE id=$1`, [classId])).rows[0];
    if (!k) throw new FitpassError('CLASS_NOT_FOUND', 'Clase no encontrada');
    if (k.status === 'cancelled') throw new FitpassError('CLASS_NOT_FOUND', 'Clase cancelada');

    const user = existingByRef
        ? { id: existingByRef.user_id }
        : await findOrCreateFitpassUser(db, row.displayName);
    const membershipId = await ensureFitpassMembership(db, user.id);

    const meta: Record<string, unknown> = { imported_by: actor, imported_at: new Date().toISOString() };
    if (row.fitpassMemberRef) meta.fitpass_member_ref = row.fitpassMemberRef;
    if (row.sourceRef) meta.source_ref = row.sourceRef;
    meta.fp_name = row.displayName;

    const pairBefore = !existingByRef ? await findActiveFitpassBookingForPair(db, classId, user.id) : null;
    const up = await upsertFitpassBooking(db, {
        classId, userId: user.id, membershipId, externalRef: row.sourceRef || null, partnerMetadata: meta,
    });
    if (up.blocked) {
        return { outcome: 'skipped', reason: 'cancelada-manualmente-por-el-estudio', bookingId: up.booking.id };
    }
    const isExisting = !!(existingByRef || pairBefore) || !up.created;

    let checkinId: string | undefined;
    if (row.status === 'attended') {
        const c = await confirmFitpassCheckin(db, {
            bookingId: up.booking.id, userId: user.id, classId, externalRef: row.sourceRef || null,
            validationMethod: 'automated', payload: { source: 'fitpass-import' }, markFpAttended: true,
        });
        checkinId = c.checkinId ?? undefined;
    }
    const overbooked = up.created && up.booking.partner_metadata?.overbooked === true;
    return { outcome: isExisting ? 'updated' : 'created', bookingId: up.booking.id, checkinId, overbooked: overbooked || undefined };
}

/** Ejecuta fn en transacción (cliente nuevo) o en SAVEPOINT si el caller pasó su propio cliente. */
async function inRowTx<T>(external: PoolClient | undefined, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    if (external) {
        await external.query('SAVEPOINT fp_row');
        try {
            const r = await fn(external);
            await external.query('RELEASE SAVEPOINT fp_row');
            return r;
        } catch (e) {
            await external.query('ROLLBACK TO SAVEPOINT fp_row');
            throw e;
        }
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const r = await fn(client);
        await client.query('COMMIT');
        return r;
    } catch (e) {
        await client.query('ROLLBACK').catch(() => { /* noop */ });
        throw e;
    } finally {
        client.release();
    }
}

export interface ImportOptions {
    /** Solo tests / dry-run: cliente con BEGIN propio (el import usa SAVEPOINT por fila). */
    db?: PoolClient;
    onProgress?: (processed: number, total: number) => void;
    /** No toma FP_IMPORT (el caller ya serializa). */
    skipLock?: boolean;
}

export async function importFitpassReservations(
    rows: FitpassSourceRow[], actorUserId: string | null, opts: ImportOptions = {},
): Promise<FitpassImportResult> {
    const run = () => importInner(rows, actorUserId, opts);
    if (opts.skipLock) return run();
    const r = await withFitpassLock('FP_IMPORT', run);
    return r ?? {
        summary: { total: rows.length, created: 0, updated: 0, cancelled: 0, skipped: 0, failed: 0 },
        rows: [], overbooked: 0, overbookedRefs: [], skipped: 'locked',
    };
}

async function importInner(rows: FitpassSourceRow[], actor: string | null, opts: ImportOptions): Promise<FitpassImportResult> {
    const results: FitpassImportRowResult[] = [];
    const summary = { total: rows.length, created: 0, updated: 0, cancelled: 0, skipped: 0, failed: 0 };
    let overbooked = 0;
    const overbookedRefs: string[] = [];
    for (let i = 0; i < rows.length; i++) {
        try {
            const out = await inRowTx(opts.db, (c) => importSingleRow(c, rows[i], actor));
            results.push({ index: i, ...out });
            summary[out.outcome] += 1;
            if (out.overbooked) { overbooked++; overbookedRefs.push(rows[i].sourceRef ?? `fila ${i}`); }
        } catch (err) {
            if (err instanceof FitpassError || err instanceof FitpassBookingError) {
                results.push({ index: i, outcome: 'failed', error: err.code as FitpassErrorCode, message: err.message });
            } else {
                console.error(`[fitpass-import] fila ${i} falló:`, (err as Error)?.message);
                results.push({ index: i, outcome: 'failed', error: 'UNKNOWN', message: (err as Error)?.message || 'Error desconocido' });
            }
            summary.failed += 1;
        } finally {
            opts.onProgress?.(i + 1, rows.length);
        }
    }
    return { summary, rows: results, overbooked, overbookedRefs: overbookedRefs.slice(0, 20) };
}

// ── Recepción (walk-in) ─────────────────────────────────────────────────────

export interface RegisterAttendeeParams { classId: string; displayName: string; fitpassMemberRef?: string; actorUserId: string }

export async function registerFitpassAttendee(p: RegisterAttendeeParams, db?: PoolClient) {
    return inRowTx(db, async (c) => {
        const k = (await c.query(
            `SELECT c.status, ci.max_spots AS fp_cap FROM classes c
               LEFT JOIN channel_inventory ci ON ci.class_id=c.id AND ci.channel='fitpass' WHERE c.id=$1`, [p.classId])).rows[0];
        if (!k) throw new FitpassError('CLASS_NOT_FOUND', 'Clase no encontrada');
        if (k.status === 'cancelled') throw new FitpassError('CLASS_NOT_FOUND', 'Clase cancelada');
        if (k.fp_cap == null || Number(k.fp_cap) === 0) {
            throw new FitpassError('FITPASS_NOT_CONFIGURED', 'FitPass no tiene cupo configurado para esta clase');
        }
        const user = await findOrCreateFitpassUser(c, p.displayName);
        const membershipId = await ensureFitpassMembership(c, user.id);
        const meta: Record<string, unknown> = { registered_by: p.actorUserId };
        if (p.fitpassMemberRef) meta.fitpass_member_ref = p.fitpassMemberRef;
        const existing = await findActiveFitpassBookingForPair(c, p.classId, user.id);
        if (existing) return { bookingId: existing.id, userId: user.id, checkinId: null as string | null };
        let up;
        try {
            up = await upsertFitpassBooking(c, {
                classId: p.classId, userId: user.id, membershipId, externalRef: null,
                partnerMetadata: meta, enforceCapacity: true, bookedBy: p.actorUserId,
            });
        } catch (e) {
            if (e instanceof FitpassBookingError) throw new FitpassError(e.code, e.message);
            throw e;
        }
        const ck = await confirmFitpassCheckin(c, {
            bookingId: up.booking.id, userId: user.id, classId: p.classId, externalRef: null,
            validationMethod: 'manual_reception', payload: { actor: p.actorUserId },
        });
        await c.query(`UPDATE bookings SET checked_in_by=$2 WHERE id=$1`, [up.booking.id, p.actorUserId]);
        return { bookingId: up.booking.id, userId: user.id, checkinId: ck.checkinId };
    });
}

export async function cancelFitpassAttendee(bookingId: string, reason: string, actorUserId: string, db?: PoolClient): Promise<boolean> {
    return inRowTx(db, async (c) => {
        const b = (await c.query(`SELECT id, external_ref, status FROM bookings WHERE id=$1 AND channel='fitpass'`, [bookingId])).rows[0];
        if (!b) return false;
        // La marca impide que el siguiente import reactive la reserva (FitPass no deja des-reservar desde el panel).
        await cancelFitpassBooking(c, bookingId, reason,
            fitpassStudioCancellationMetadata({ externalRef: b.external_ref ?? null, reason, actorUserId }));
        return true;
    });
}

export interface FitpassAttendeeRow {
    booking_id: string; user_id: string; display_name: string; fitpass_member_ref: string | null;
    class_id: string; class_date: string; class_start_time: string; class_name: string; checkin_status: string | null;
}

export async function listFitpassAttendeesForDate(date: string): Promise<FitpassAttendeeRow[]> {
    const r = await pool.query<FitpassAttendeeRow>(
        `SELECT b.id AS booking_id, u.id AS user_id, u.display_name,
                b.partner_metadata->>'fitpass_member_ref' AS fitpass_member_ref,
                c.id AS class_id, c.date::text AS class_date, c.start_time::text AS class_start_time,
                ct.name AS class_name,
                (SELECT ck.status FROM checkins ck WHERE ck.booking_id=b.id AND ck.channel='fitpass'
                  ORDER BY ck.created_at DESC LIMIT 1) AS checkin_status
           FROM bookings b
           JOIN users u ON u.id=b.user_id
           JOIN classes c ON c.id=b.class_id
           JOIN class_types ct ON ct.id=c.class_type_id
          WHERE b.channel='fitpass' AND c.date=$1::date AND b.status<>'cancelled'
          ORDER BY c.start_time ASC, u.display_name ASC`,
        [date],
    );
    return r.rows;
}

export { blocksFitpassReactivation };
