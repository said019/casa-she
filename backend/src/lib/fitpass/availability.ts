/**
 * availability — cupo de Casa Shé hacia FitPass.
 *
 * `lesson_availability` del panel es la capacidad TOTAL del schedule (reservas FitPass +
 * lugares realmente disponibles), NO los lugares restantes. Empujar solo los libres dejaría
 * una clase con 2 reservas y 1 libre en 2/2: la app de FitPass la mostraría agotada.
 * Por eso se empuja `channelCapCeiling` (misma fórmula única que TotalPass).
 *
 * Solo se actualizan schedules DUEÑAS (mapping con external_slot_id) y NUNCA una `disabled`
 * (updateSchedule sobre una cancelada la re-habilita). Jamás adopta schedules legacy aquí.
 */
import { filas, type ClienteTx } from '../db-tx.js';
import { withFitpassLock } from './locks.js';
import { channelCapCeiling } from '../totalpass/caps.js';
import { localDateStr, addDaysToDateStr } from '../mx-time.js';
import { GYM_DEFAULT_COACH } from '../gym-config.js';
import { cdmxDateTime, fpFingerprint, scheduleFingerprint, type FpListedSchedule } from './ownership.js';
import { classStartedAlready, getPanelCtx, listWindow, type PanelCtx } from './panel.js';

/** Capacidad TOTAL que recibe el schedule de FitPass. */
export function computeFitpassScheduleCapacity(
    cap: number | null, capacity: number, totalBooked: number, fpBooked: number, reserveSpots = 0,
): number {
    return channelCapCeiling(capacity, Math.max(0, totalBooked) + Math.max(0, Math.floor(reserveSpots)), fpBooked, cap);
}

export type PoolItemOutcome = 'changed' | 'unchanged' | 'failed' | 'skipped';
export interface FitpassPoolSummary {
    evaluated: number; changed: number; unchanged: number; failed: number; skipped: number;
    skippedReasons: Record<string, number>;
    skipped_all?: string;
}

interface PoolRow {
    class_id: string; date: string; hhmm: string; capacity: number; lesson_id: number | null;
    external_slot_id: string; fp_cap: number | null; total_booked: number; fp_booked: number; sync_status: string;
}

const POOL_SELECT = `
    SELECT c.id AS class_id, c.date::text AS date, substr(c.start_time::text,1,5) AS hhmm,
           c.max_capacity AS capacity, ct.fitpass_lesson_id AS lesson_id,
           pcm.external_slot_id, pcm.sync_status, ci.max_spots AS fp_cap,
           (SELECT count(*) FROM bookings b WHERE b.class_id = c.id AND b.status IN ('confirmed','checked_in'))::int AS total_booked,
           (SELECT count(*) FROM bookings b WHERE b.class_id = c.id AND b.status IN ('confirmed','checked_in') AND b.channel = 'fitpass')::int AS fp_booked
      FROM classes c
      JOIN class_types ct ON ct.id = c.class_type_id
      JOIN partner_class_mappings pcm ON pcm.class_id = c.id AND pcm.channel = 'fitpass'
           AND pcm.external_slot_id IS NOT NULL AND pcm.sync_enabled = true
           AND pcm.sync_status IN ('synced','pending_resync')
      LEFT JOIN channel_inventory ci ON ci.class_id = c.id AND ci.channel = 'fitpass'
     WHERE c.status = 'scheduled'`;

/** Empuja la capacidad a UNA schedule del panel conservando todo lo demás. */
async function pushCapacity(ctx: PanelCtx, sched: FpListedSchedule, desired: number): Promise<void> {
    const { date, hhmm } = cdmxDateTime(sched.lesson_time);
    await ctx.panel.updateSchedule(Number(sched.id), {
        gymId: ctx.gymId,
        lessonId: Number(sched.lesson!.id),
        instructorName: sched.instructor?.name || GYM_DEFAULT_COACH,
        startDate: date,
        lessonTime: hhmm,
        length: sched.length || 60,
        lessonAvailability: desired,
        multiple: false,
    });
}

/** Evalúa una fila del pool contra el snapshot y empuja si cambió. */
export async function reconcileOne(
    ctx: PanelCtx, row: PoolRow, byId: Map<number, FpListedSchedule>, now: Date,
): Promise<{ outcome: PoolItemOutcome; reason?: string }> {
    if (classStartedAlready(row, now)) return { outcome: 'skipped', reason: 'started' };
    const sched = byId.get(Number(row.external_slot_id));
    if (!sched) return { outcome: 'skipped', reason: 'not-in-window' };
    if (sched.disabled === true) return { outcome: 'skipped', reason: 'disabled' }; // nunca re-habilitar
    if (row.lesson_id == null || scheduleFingerprint(sched) !== fpFingerprint(row.lesson_id, row.date, row.hhmm)) {
        return { outcome: 'skipped', reason: 'slot-mismatch' }; // edición pendiente: la mueve el outbox
    }
    const desired = computeFitpassScheduleCapacity(row.fp_cap, row.capacity, row.total_booked, row.fp_booked);
    if (Number(sched.lesson_availability) === desired) return { outcome: 'unchanged' };
    try {
        await pushCapacity(ctx, sched, desired);
        return { outcome: 'changed' };
    } catch (e) {
        console.error(`[fp-pool] updateSchedule(${sched.id}):`, (e as Error).message);
        return { outcome: 'failed', reason: (e as Error).message.slice(0, 120) };
    }
}

export interface PoolCoreOpts { ctx: PanelCtx; db?: ClienteTx; now?: Date; throttleMs?: number }

/** Núcleo sin locks (testeable): reconcilia las schedules DUEÑAS de la ventana. */
export async function reconcileFitpassPoolCore(window: { from: string; to: string }, o: PoolCoreOpts): Promise<FitpassPoolSummary> {
    const now = o.now ?? new Date();
    const s: FitpassPoolSummary = { evaluated: 0, changed: 0, unchanged: 0, failed: 0, skipped: 0, skippedReasons: {} };
    const rows = await filas<PoolRow>(o.db, `${POOL_SELECT} AND c.date BETWEEN $1::date AND $2::date`, [window.from, window.to]);
    if (!rows.length) return s;
    const schedules = await listWindow(o.ctx, window.from, window.to);
    const byId = new Map(schedules.map((x) => [Number(x.id), x]));
    for (const row of rows) {
        s.evaluated++;
        const r = await reconcileOne(o.ctx, row, byId, now);
        if (r.outcome === 'skipped') { s.skipped++; s.skippedReasons[r.reason!] = (s.skippedReasons[r.reason!] ?? 0) + 1; }
        else s[r.outcome]++;
        if (r.outcome === 'changed' && (o.throttleMs ?? 120) > 0) await new Promise((res) => setTimeout(res, o.throttleMs ?? 120));
    }
    return s;
}

/**
 * Reconciliación del pool de FitPass para una ventana de fechas locales. La usa el cron
 * FITPASS_POOL (respaldo) y la integración la engancha tras cada import (`afterImport`).
 * Locks: FP_MUTATE -> FP_POOL (nunca espera: ocupado => skipped 'lock-busy').
 */
export async function reconcileFitpassPool(window?: { from?: string; to?: string }): Promise<FitpassPoolSummary> {
    const empty: FitpassPoolSummary = { evaluated: 0, changed: 0, unchanged: 0, failed: 0, skipped: 0, skippedReasons: {} };
    const from = window?.from ?? localDateStr();
    const to = window?.to ?? addDaysToDateStr(from, 21);
    const out = await withFitpassLock('FP_MUTATE', async () =>
        withFitpassLock('FP_POOL', async () => {
            const ctx = await getPanelCtx();
            if (!ctx) return { ...empty, skipped_all: 'not-configured' };
            return reconcileFitpassPoolCore({ from, to }, { ctx });
        }));
    if (out === null) return { ...empty, skipped_all: 'lock-busy' };
    return out ?? { ...empty, skipped_all: 'lock-busy' };
}

// ── Por evento: una clase ────────────────────────────────────────────────────

/** Núcleo sin locks: empuja el cupo de UNA clase dueña. */
export async function syncFitpassAvailabilityCore(classId: string, o: PoolCoreOpts): Promise<{ outcome: PoolItemOutcome | 'not-owned'; reason?: string }> {
    const [row] = await filas<PoolRow>(o.db, `${POOL_SELECT} AND c.id = $1`, [classId]);
    if (!row) return { outcome: 'not-owned' }; // sin mapping: jamás se adopta aquí
    const schedules = await listWindow(o.ctx, row.date, row.date);
    const byId = new Map(schedules.map((x) => [Number(x.id), x]));
    return reconcileOne(o.ctx, row, byId, o.now ?? new Date());
}

/** Best-effort: nunca lanza. Ocupado => el pool de respaldo lo corrige. */
export async function syncFitpassAvailabilityForClass(classId: string): Promise<void> {
    try {
        const [owned] = await filas<{ x: number }>(undefined,
            `SELECT 1 AS x FROM partner_class_mappings WHERE class_id = $1 AND channel = 'fitpass'
                AND external_slot_id IS NOT NULL AND sync_enabled = true`, [classId]);
        if (!owned) return;
        await withFitpassLock('FP_MUTATE', async () => {
            const ctx = await getPanelCtx();
            if (!ctx) return;
            await syncFitpassAvailabilityCore(classId, { ctx });
        });
    } catch (e) {
        console.error('[fp-avail] syncFitpassAvailabilityForClass:', (e as Error).message);
    }
}

const pendientes = new Map<string, ReturnType<typeof setTimeout>>();
/** Dispara el push de cupo tras un cambio (reserva/cancelación/tope), agrupando ráfagas. */
export function dispararDisponibilidadFitpass(classId: string | null | undefined): void {
    if (!classId || pendientes.has(classId)) return;
    const t = setTimeout(() => {
        pendientes.delete(classId);
        void syncFitpassAvailabilityForClass(classId);
    }, 1500);
    (t as any).unref?.();
    pendientes.set(classId, t);
}
