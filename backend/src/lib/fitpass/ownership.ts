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
import { familyScore } from './family.js';

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

/** Slot (fecha CDMX + HH:MM) de una schedule del panel. La ADOPCIÓN usa el slot, no la lesson. */
export function scheduleSlot(s: FpListedSchedule): { date: string; hhmm: string; key: string } {
    const { date, hhmm } = cdmxDateTime(s.lesson_time);
    return { date, hhmm, key: `${date}|${hhmm}` };
}
export const slotKey = (date: string, hhmm: string): string => `${date.slice(0, 10)}|${hhmm.slice(0, 5)}`;

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
//
// La identidad de adopción es el SLOT (fecha CDMX + HH:MM), no la lesson: el panel de Casa Shé usa
// variantes por horario ("BARRE - ABS & BUTT") y Casa Shé un solo tipo por familia. Con varias
// clases/schedules en el mismo slot se desambigua por familia (family.ts); si sigue ambiguo, solo
// se reporta. `fitpass_lesson_id` del tipo es el default únicamente para CREAR.

export type FpPlanAction = 'adopt' | 'create' | 'skip';
export type FpSkipReason =
    | 'already-owned' | 'past' | 'no-lesson' | 'shared-fingerprint' | 'ambiguous-schedules'
    | 'schedule-owned' | 'no-match' | 'no-fitpass-cap' | 'no-real-coach' | 'family-mismatch';

export interface FpPlanItem {
    classId: string;
    date: string;
    hhmm: string;
    title: string;
    lessonId: number | null;
    slot: string;
    action: FpPlanAction;
    reason?: FpSkipReason;
    scheduleId?: number;
    scheduleLesson?: string;
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

/** Clases programadas de la ventana con su tipo, coach, tope FitPass y conteos. */
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
           LEFT JOIN partner_class_mappings pcm ON pcm.class_id = c.id AND pcm.channel = 'fitpass' AND pcm.sync_enabled = true
           LEFT JOIN channel_inventory ci ON ci.class_id = c.id AND ci.channel = 'fitpass'
          WHERE c.status = 'scheduled' AND c.date BETWEEN $1::date AND $2::date
          ORDER BY c.date, c.start_time`, [from, to]);
}

/** Ids de schedules que ya tienen dueño (cualquier clase, mapping activo). */
export async function loadOwnedScheduleIds(db?: ClienteTx): Promise<Set<number>> {
    const rows = await filas<{ external_slot_id: string }>(db,
        `SELECT external_slot_id FROM partner_class_mappings
          WHERE channel = 'fitpass' AND external_slot_id IS NOT NULL AND sync_enabled = true`);
    return new Set(rows.map((r) => Number(r.external_slot_id)));
}

export interface FpPlanOptions {
    now?: Date;
    defaultCoach: string;
    /** Capacidad a empujar al crear (computeFitpassScheduleCapacity). */
    capacityFor: (c: FpPlanClassRow) => number;
    /** Si false, nunca devuelve 'create' (solo adopción). */
    allowCreate: boolean;
    /** Schedules que ya son de alguna clase. */
    owned: Set<number>;
    startsInPast: (c: FpPlanClassRow, now: Date) => boolean;
}

/**
 * Plan: para cada clase decide adoptar / crear / saltar. Reglas de oro:
 *  - un slot con UNA clase elegible y UNA schedule libre adopta solo si la familia es compatible
 *    (una clase de Barre jamás adopta la schedule de Yoga que comparte horario);
 *  - con varias, adopta solo si la pareja es la única de mayor traslape de familia en AMBOS lados;
 *  - lo demás se reporta (ambiguo), nunca se adivina; las schedules disabled y las ya dueñas se ignoran.
 */
export function planFitpassPublish(classes: FpPlanClassRow[], schedules: FpListedSchedule[], opts: FpPlanOptions): FpPlanItem[] {
    const now = opts.now ?? new Date();
    const active = schedules.filter((s) => s.disabled !== true);
    const schedBySlot = new Map<string, FpListedSchedule[]>();
    for (const s of active) {
        const k = scheduleSlot(s).key;
        schedBySlot.set(k, [...(schedBySlot.get(k) ?? []), s]);
    }
    const eligible = (c: FpPlanClassRow) => c.lesson_id != null && !c.mapped_slot && !opts.startsInPast(c, now);
    const classesBySlot = new Map<string, FpPlanClassRow[]>();
    for (const c of classes) {
        if (!eligible(c)) continue;
        const k = slotKey(c.date, c.hhmm);
        classesBySlot.set(k, [...(classesBySlot.get(k) ?? []), c]);
    }
    const lessonName = (s: FpListedSchedule) => s.lesson?.name ?? '';

    const items: FpPlanItem[] = [];
    for (const c of classes) {
        const slot = slotKey(c.date, c.hhmm);
        const b = { classId: c.class_id, date: c.date, hhmm: c.hhmm, title: c.title, lessonId: c.lesson_id, slot };
        const skip = (reason: FpSkipReason, extra: Partial<FpPlanItem> = {}): FpPlanItem => ({ ...b, action: 'skip', reason, ...extra });
        if (c.lesson_id == null) { items.push(skip('no-lesson')); continue; }
        if (c.mapped_slot) { items.push(skip('already-owned', { scheduleId: Number(c.mapped_slot) })); continue; }
        if (opts.startsInPast(c, now)) { items.push(skip('past')); continue; }

        const atSlot = schedBySlot.get(slot) ?? [];
        const free = atSlot.filter((s) => !opts.owned.has(Number(s.id)));
        const peers = classesBySlot.get(slot) ?? [c];
        const compat = free.filter((s) => familyScore(c.title, lessonName(s)) > 0);

        let resolved: FpListedSchedule | null = null;
        if (peers.length === 1 && free.length === 1) {
            if (compat.length === 1) resolved = compat[0];
        } else if (compat.length > 0) {
            const top = Math.max(...compat.map((s) => familyScore(c.title, lessonName(s))));
            const best = compat.filter((s) => familyScore(c.title, lessonName(s)) === top);
            if (best.length !== 1) { items.push(skip('ambiguous-schedules')); continue; }
            const sc = best[0];
            // El lado contrario también debe ser inequívoco: ninguna otra clase empata con esa schedule.
            const rivals = peers.filter((p) => p.class_id !== c.class_id && familyScore(p.title, lessonName(sc)) >= familyScore(c.title, lessonName(sc)) && familyScore(p.title, lessonName(sc)) > 0);
            if (rivals.length > 0) { items.push(skip('shared-fingerprint')); continue; }
            resolved = sc;
        }
        if (!resolved) {
            const own = atSlot.find((s) => opts.owned.has(Number(s.id)) && familyScore(c.title, lessonName(s)) > 0);
            if (own) { items.push(skip('schedule-owned', { scheduleId: Number(own.id), scheduleLesson: lessonName(own) })); continue; }
        }
        if (resolved) {
            items.push({ ...b, action: 'adopt', scheduleId: Number(resolved.id), scheduleLesson: lessonName(resolved), availability: Number(resolved.lesson_availability) });
            continue;
        }
        // Sin schedule compatible en el slot: ¿se podría crear?
        // Hay schedules libres en el slot pero de OTRA familia (p. ej. Yoga a la misma hora que Barre):
        // nunca se adoptan; solo se reporta si no se puede crear.
        if (!opts.allowCreate) { items.push(skip(free.length > 0 ? 'family-mismatch' : 'no-match')); continue; }
        const sameFamilyPeers = peers.filter((p) => p.class_id !== c.class_id && familyScore(c.title, p.title) > 0);
        if (sameFamilyPeers.length > 0) { items.push(skip('shared-fingerprint')); continue; }
        if (!(Number(c.fp_cap) > 0)) { items.push(skip('no-fitpass-cap')); continue; }
        if (!isRealCoach(c.coach, opts.defaultCoach)) { items.push(skip('no-real-coach')); continue; }
        const availability = opts.capacityFor(c);
        if (!(availability > 0)) { items.push(skip('no-fitpass-cap')); continue; }
        items.push({ ...b, action: 'create', availability });
    }
    return items;
}
