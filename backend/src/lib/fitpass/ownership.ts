/**
 * ownership — identidad y dueño de las schedules de FitPass.
 *
 * FitPass no tiene API: una schedule del panel se identifica por el fingerprint
 * `lessonId|fecha|HH:MM` en hora del estudio (CDMX). `lesson_time` de listSchedules es UTC
 * REAL (09:00 CDMX = 15:00Z; después de las 6pm CDMX el UTC ya es "mañana"), así que SIEMPRE
 * se convierte antes de comparar.
 *
 * Una schedule activa pertenece a UNA clase (índice único uq_partner_fitpass_slot_owner,
 * migración 126). El dueño vive en partner_class_mappings(channel='fitpass').external_slot_id.
 * Una schedule `disabled` (cancelada) nunca se toca: un updateSchedule la RE-HABILITA.
 *
 * Todas las funciones con BD aceptan `db` opcional (transacción ajena, p. ej. tests).
 */
import { filas, type ClienteTx } from '../db-tx.js';
import { GYM_TIMEZONE } from '../mx-time.js';

export interface FpListedSchedule {
    id: number;
    lesson_time: string;
    start_date?: string;
    length?: number;
    lesson_availability: number;
    parent_id?: number | null;
    lesson?: { id: number; name?: string };
    instructor?: { id?: number; name?: string };
    disabled?: boolean;
}

/** Fecha y hora (HH:MM) del estudio de un instante UTC. */
export function cdmxDateTime(iso: string | Date): { date: string; hhmm: string } {
    const d = iso instanceof Date ? iso : new Date(iso);
    if (Number.isNaN(d.getTime())) throw new Error(`lesson_time inválido: ${String(iso)}`);
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: GYM_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)!.value;
    return { date: `${get('year')}-${get('month')}-${get('day')}`, hhmm: `${get('hour')}:${get('minute')}` };
}

export function fpFingerprint(lessonId: number, date: string, hhmm: string): string {
    return `${lessonId}|${date.slice(0, 10)}|${hhmm.slice(0, 5)}`;
}

/** Fingerprint de una schedule del panel (null si no trae lesson). */
export function scheduleFingerprint(s: FpListedSchedule): string | null {
    const lessonId = s.lesson?.id;
    if (lessonId == null) return null;
    const { date, hhmm } = cdmxDateTime(s.lesson_time);
    return fpFingerprint(Number(lessonId), date, hhmm);
}

/** Schedules ACTIVAS (no disabled) con ese fingerprint. */
export function findActiveSchedules(schedules: FpListedSchedule[], fingerprint: string): FpListedSchedule[] {
    return schedules.filter((s) => s.disabled !== true && scheduleFingerprint(s) === fingerprint);
}

export interface FitpassMappingRow {
    class_id: string;
    external_slot_id: string | null;
    sync_enabled: boolean;
    sync_status: string;
    sync_error: string | null;
    metadata: Record<string, any> | null;
}

export async function getFitpassMapping(classId: string, db?: ClienteTx): Promise<FitpassMappingRow | null> {
    const [row] = await filas<FitpassMappingRow>(db,
        `SELECT class_id, external_slot_id, sync_enabled, sync_status, sync_error, metadata
           FROM partner_class_mappings WHERE class_id = $1 AND channel = 'fitpass'`, [classId]);
    return row ?? null;
}

/** Id de OTRA clase que ya es dueña de esa schedule (o null). */
export async function getFitpassScheduleOwner(classId: string, scheduleId: number, db?: ClienteTx): Promise<string | null> {
    const [owner] = await filas<{ class_id: string }>(db,
        `SELECT class_id FROM partner_class_mappings
          WHERE channel = 'fitpass' AND external_slot_id = $1 AND class_id <> $2 LIMIT 1`,
        [String(scheduleId), classId]);
    return owner?.class_id ?? null;
}

/**
 * Reclama el dueño de una schedule. Nunca reemplaza un id distinto ya asociado a la clase
 * (un cambio real debe MOVER esa misma schedule) ni roba una schedule de otra clase.
 */
export async function claimFitpassScheduleOwnership(classId: string, scheduleId: number, db?: ClienteTx): Promise<void> {
    if (!Number.isFinite(scheduleId)) throw new Error('FitPass devolvió un schedule ID inválido.');
    const current = await getFitpassMapping(classId, db);
    if (current?.external_slot_id && String(current.external_slot_id) !== String(scheduleId)) {
        throw new Error(`La clase ${classId} ya tiene la schedule FitPass ${current.external_slot_id}; no se adoptará ${scheduleId}.`);
    }
    if (await getFitpassScheduleOwner(classId, scheduleId, db)) {
        throw new Error(`La schedule ${scheduleId} de FitPass ya pertenece a otra clase.`);
    }
    await filas(db,
        `INSERT INTO partner_class_mappings
           (class_id, channel, external_slot_id, sync_enabled, sync_status, sync_error, metadata, last_synced_at)
         VALUES ($1, 'fitpass', $2, true, 'synced', NULL, '{}'::jsonb, NOW())
         ON CONFLICT (class_id, channel) DO UPDATE
           SET external_slot_id = EXCLUDED.external_slot_id, sync_enabled = true,
               sync_status = 'synced', sync_error = NULL, last_synced_at = NOW(), updated_at = NOW()`,
        [classId, String(scheduleId)]);
}

// ── Plan: qué se adoptaría / crearía / saltaría ──────────────────────────────

export type FpPlanAction = 'adopt' | 'create' | 'skip';
export type FpSkipReason =
    | 'already-owned' | 'past' | 'no-lesson' | 'shared-fingerprint' | 'ambiguous-schedules'
    | 'schedule-owned' | 'no-match' | 'no-fitpass-cap' | 'no-real-coach';

export interface FpPlanItem {
    classId: string;
    date: string;
    hhmm: string;
    title: string;
    lessonId: number | null;
    fingerprint: string | null;
    action: FpPlanAction;
    reason?: FpSkipReason;
    scheduleId?: number;
    /** adopt: cupo total configurado en el panel. create: cupo con el que se crearía. */
    availability?: number;
}

export interface FpPlanClassRow {
    class_id: string;
    date: string;
    hhmm: string;
    end_hhmm: string;
    title: string;
    coach: string | null;
    capacity: number;
    lesson_id: number | null;
    mapped_slot: string | null;
    fp_cap: number | null;
    total_booked: number;
    fp_booked: number;
}

const COACH_PLACEHOLDER = /^(por asignar|sin asignar|sin coach|tbd|pendiente)$/i;
export function isRealCoach(name: string | null | undefined, defaultCoach: string): boolean {
    const n = (name || '').trim();
    return !!n && n.toLowerCase() !== defaultCoach.trim().toLowerCase() && !COACH_PLACEHOLDER.test(n);
}

/** Clases candidatas (programadas, en la ventana, con lesson mapeada) con sus conteos. */
export async function loadFitpassPlanClasses(from: string, to: string, db?: ClienteTx): Promise<FpPlanClassRow[]> {
    return filas<FpPlanClassRow>(db,
        `SELECT c.id AS class_id, c.date::text AS date, substr(c.start_time::text,1,5) AS hhmm,
                substr(c.end_time::text,1,5) AS end_hhmm, ct.name AS title, i.display_name AS coach,
                c.max_capacity AS capacity, ct.fitpass_lesson_id AS lesson_id,
                pcm.external_slot_id AS mapped_slot, ci.max_spots AS fp_cap,
                (SELECT count(*) FROM bookings b WHERE b.class_id = c.id AND b.status IN ('confirmed','checked_in'))::int AS total_booked,
                (SELECT count(*) FROM bookings b WHERE b.class_id = c.id AND b.status IN ('confirmed','checked_in') AND b.channel = 'fitpass')::int AS fp_booked
           FROM classes c
           JOIN class_types ct ON ct.id = c.class_type_id
           LEFT JOIN instructors i ON i.id = c.instructor_id
           LEFT JOIN partner_class_mappings pcm ON pcm.class_id = c.id AND pcm.channel = 'fitpass'
           LEFT JOIN channel_inventory ci ON ci.class_id = c.id AND ci.channel = 'fitpass'
          WHERE c.status = 'scheduled' AND c.date BETWEEN $1::date AND $2::date
          ORDER BY c.date, c.start_time`, [from, to]);
}

export interface FpPlanOptions {
    /** Instante "ahora" (tests). */
    now?: Date;
    defaultCoach: string;
    /** Capacidad a empujar al crear (computeFitpassScheduleCapacity). */
    capacityFor: (c: FpPlanClassRow) => number;
    /** Si false, nunca devuelve 'create' (solo adopción). */
    allowCreate: boolean;
    /** Resolver ownership ajeno (tests inyectan; por defecto BD). */
    ownerOf?: (classId: string, scheduleId: number) => Promise<string | null>;
    startsInPast: (c: FpPlanClassRow, now: Date) => boolean;
}

/**
 * Plan puro (más lectura de dueños): para cada clase decide adoptar / crear / saltar.
 * Regla de oro: solo se adopta si el fingerprint empata con EXACTAMENTE UNA schedule activa
 * y EXACTAMENTE UNA clase de Casa Shé comparte ese fingerprint.
 */
export async function planFitpassPublish(
    classes: FpPlanClassRow[], schedules: FpListedSchedule[], opts: FpPlanOptions,
): Promise<FpPlanItem[]> {
    const now = opts.now ?? new Date();
    const fpCount = new Map<string, number>();
    for (const c of classes) {
        if (c.lesson_id == null) continue;
        const fp = fpFingerprint(c.lesson_id, c.date, c.hhmm);
        fpCount.set(fp, (fpCount.get(fp) ?? 0) + 1);
    }
    const items: FpPlanItem[] = [];
    for (const c of classes) {
        const base = { classId: c.class_id, date: c.date, hhmm: c.hhmm, title: c.title, lessonId: c.lesson_id };
        const skip = (reason: FpSkipReason, extra: Partial<FpPlanItem> = {}): FpPlanItem =>
            ({ ...base, fingerprint: null, action: 'skip', reason, ...extra });
        if (c.lesson_id == null) { items.push(skip('no-lesson')); continue; }
        const fp = fpFingerprint(c.lesson_id, c.date, c.hhmm);
        const b = { ...base, fingerprint: fp };
        if (c.mapped_slot) { items.push({ ...b, action: 'skip', reason: 'already-owned', scheduleId: Number(c.mapped_slot) }); continue; }
        if (opts.startsInPast(c, now)) { items.push({ ...b, action: 'skip', reason: 'past' }); continue; }
        if ((fpCount.get(fp) ?? 0) > 1) { items.push({ ...b, action: 'skip', reason: 'shared-fingerprint' }); continue; }
        const matches = findActiveSchedules(schedules, fp);
        if (matches.length > 1) { items.push({ ...b, action: 'skip', reason: 'ambiguous-schedules' }); continue; }
        if (matches.length === 1) {
            const sid = Number(matches[0].id);
            const owner = opts.ownerOf ? await opts.ownerOf(c.class_id, sid) : null;
            if (owner) { items.push({ ...b, action: 'skip', reason: 'schedule-owned', scheduleId: sid }); continue; }
            items.push({ ...b, action: 'adopt', scheduleId: sid, availability: Number(matches[0].lesson_availability) });
            continue;
        }
        // Sin schedule: ¿se podría crear?
        if (!opts.allowCreate) { items.push({ ...b, action: 'skip', reason: 'no-match' }); continue; }
        if (!(Number(c.fp_cap) > 0)) { items.push({ ...b, action: 'skip', reason: 'no-fitpass-cap' }); continue; }
        if (!isRealCoach(c.coach, opts.defaultCoach)) { items.push({ ...b, action: 'skip', reason: 'no-real-coach' }); continue; }
        const availability = opts.capacityFor(c);
        if (!(availability > 0)) { items.push({ ...b, action: 'skip', reason: 'no-fitpass-cap' }); continue; }
        items.push({ ...b, action: 'create', availability });
    }
    return items;
}
