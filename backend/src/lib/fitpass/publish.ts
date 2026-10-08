/**
 * publish — adoptar y publicar clases de Casa Shé en FitPass.
 *
 *  - `adoptExistingFitpassSchedules(from,to,{dryRun})`: primer paso seguro en producción. Si el
 *    fingerprint (lessonId|fecha CDMX|HH:MM) de una clase empata con EXACTAMENTE UNA schedule
 *    activa del panel (y ninguna otra clase de Casa Shé comparte ese fingerprint), la clase
 *    reclama su ownership y el tope del canal = el cupo TOTAL que ya configuró el estudio.
 *    Ambiguo / sin match: solo se reporta. NUNCA crea nada en el panel.
 *  - `previewFitpassPublish`: dry-run completo (adoptaría / crearía / saltaría y por qué).
 *  - `publishClassToFitpass` / `extendFitpassWeek`: CREAN schedules nuevas; solo si
 *    FITPASS_PUBLISH_ENABLED=true (default apagado). Tras crear se re-lista y se reclama solo
 *    si el fingerprint devuelve exactamente 1 schedule (el POST devuelve HTML sin id confiable).
 */
import { filas, type ClienteTx } from '../db-tx.js';
import { GYM_DEFAULT_COACH } from '../gym-config.js';
import { localDateStr, addDaysToDateStr } from '../mx-time.js';
import { withFitpassLock } from './locks.js';
import { logFitpassCron } from './cron-log.js';
import {
    claimFitpassScheduleOwnership, findActiveSchedules, fpFingerprint, getFitpassScheduleOwner,
    loadFitpassPlanClasses, planFitpassPublish, type FpListedSchedule, type FpPlanClassRow, type FpPlanItem,
} from './ownership.js';
import { computeFitpassScheduleCapacity } from './availability.js';
import {
    classStartedAlready, fitpassPublishEnabled, getPanelCtx, listWindow, minutesBetween, type PanelCtx,
} from './panel.js';

export interface PublishReport {
    from: string;
    to: string;
    dryRun: boolean;
    publishEnabled: boolean;
    items: FpPlanItem[];
    counts: { adopt: number; create: number; skip: number; adopted: number; created: number; failed: number };
    skipReasons: Record<string, number>;
    /** Schedules activas del panel que ninguna clase de Casa Shé reclamó (informativo). */
    unmatchedSchedules: number;
    errors: string[];
    skipped?: string;
}

export interface PublishCoreOpts {
    ctx: PanelCtx;
    db?: ClienteTx;
    now?: Date;
    dryRun: boolean;
    /** true: puede crear schedules. Adopción pura = false. */
    allowCreate: boolean;
    /** Si se indica, solo esas clases. */
    classIds?: string[];
    throttleMs?: number;
}

function emptyReport(from: string, to: string, dryRun: boolean): PublishReport {
    return {
        from, to, dryRun, publishEnabled: fitpassPublishEnabled(), items: [],
        counts: { adopt: 0, create: 0, skip: 0, adopted: 0, created: 0, failed: 0 },
        skipReasons: {}, unmatchedSchedules: 0, errors: [],
    };
}

/** Fija el tope del canal al cupo del panel (nunca sobre la capacidad ni bajo lo ya reservado). */
async function setAdoptedCap(classId: string, availability: number, capacity: number, fpBooked: number, db?: ClienteTx): Promise<number> {
    const cap = Math.max(Math.min(Math.max(0, availability), capacity), Math.min(fpBooked, capacity));
    await filas(db,
        `INSERT INTO channel_inventory (class_id, channel, max_spots) VALUES ($1, 'fitpass', $2)
         ON CONFLICT (class_id, channel) DO UPDATE SET max_spots = EXCLUDED.max_spots, updated_at = NOW()`,
        [classId, cap]);
    return cap;
}

/** Núcleo sin locks (testeable con panel falso y BD en transacción). */
export async function publishFitpassCore(window: { from: string; to: string }, o: PublishCoreOpts): Promise<PublishReport> {
    const now = o.now ?? new Date();
    const report = emptyReport(window.from, window.to, o.dryRun);
    let classes = await loadFitpassPlanClasses(window.from, window.to, o.db);
    if (o.classIds) classes = classes.filter((c) => o.classIds!.includes(c.class_id));
    const schedules = await listWindow(o.ctx, window.from, window.to);

    const items = await planFitpassPublish(classes, schedules, {
        now,
        defaultCoach: GYM_DEFAULT_COACH,
        allowCreate: o.allowCreate,
        capacityFor: (c) => computeFitpassScheduleCapacity(c.fp_cap, c.capacity, c.total_booked, c.fp_booked),
        ownerOf: (classId, sid) => getFitpassScheduleOwner(classId, sid, o.db),
        startsInPast: (c, n) => classStartedAlready(c, n),
    });
    report.items = items;
    const byClass = new Map(classes.map((c) => [c.class_id, c]));
    for (const it of items) {
        if (it.action === 'skip') { report.counts.skip++; report.skipReasons[it.reason!] = (report.skipReasons[it.reason!] ?? 0) + 1; }
        else report.counts[it.action]++;
    }
    const claimed = new Set<number>(items.filter((i) => i.action === 'adopt').map((i) => i.scheduleId!));
    for (const c of classes) if (c.mapped_slot) claimed.add(Number(c.mapped_slot));
    report.unmatchedSchedules = schedules.filter((s) => s.disabled !== true && !claimed.has(Number(s.id))).length;
    if (o.dryRun) return report;

    for (const it of items) {
        const cls = byClass.get(it.classId)!;
        try {
            if (it.action === 'adopt') {
                await claimFitpassScheduleOwnership(it.classId, it.scheduleId!, o.db);
                await setAdoptedCap(it.classId, it.availability ?? 0, Number(cls.capacity), Number(cls.fp_booked), o.db);
                report.counts.adopted++;
            } else if (it.action === 'create') {
                const ok = await createAndClaim(o.ctx, cls, it, o.db);
                if (ok) report.counts.created++; else report.counts.failed++;
                await new Promise((r) => setTimeout(r, o.throttleMs ?? 200));
            }
        } catch (e) {
            report.counts.failed++;
            report.errors.push(`${it.classId}: ${(e as Error).message.slice(0, 160)}`);
        }
    }
    return report;
}

/** Crea la schedule, re-lista y reclama SOLO si el fingerprint devuelve exactamente 1. */
async function createAndClaim(ctx: PanelCtx, cls: FpPlanClassRow, it: FpPlanItem, db?: ClienteTx): Promise<boolean> {
    const lessonId = Number(cls.lesson_id);
    await ctx.panel.createSchedule({
        gymId: ctx.gymId, lessonId,
        instructorName: (cls.coach || '').trim() || GYM_DEFAULT_COACH,
        startDate: cls.date.slice(0, 10), lessonTime: cls.hhmm,
        length: minutesBetween(cls.hhmm, cls.end_hhmm),
        lessonAvailability: it.availability!, multiple: false,
    });
    const after = await listWindow(ctx, cls.date.slice(0, 10), cls.date.slice(0, 10));
    const matches = findActiveSchedules(after, fpFingerprint(lessonId, cls.date, cls.hhmm));
    if (matches.length !== 1) return false; // no se reclama a ciegas; el próximo ciclo la adopta si ya es única
    await claimFitpassScheduleOwnership(cls.class_id, Number(matches[0].id), db);
    return true;
}

// ── Entradas públicas (con locks y panel real) ───────────────────────────────

type Opts = { dryRun?: boolean };

export async function adoptExistingFitpassSchedules(from: string, to: string, opts: Opts & { ctx?: PanelCtx; db?: ClienteTx } = {}): Promise<PublishReport> {
    const dryRun = opts.dryRun !== false; // por seguridad, dry-run salvo que se pida explícitamente false
    const run = async (ctx: PanelCtx) => publishFitpassCore({ from, to }, { ctx, db: opts.db, dryRun, allowCreate: false });
    if (opts.ctx) return run(opts.ctx);
    const out = await withFitpassLock('FP_MUTATE', async () => withFitpassLock('FP_PUBLISH', async () => {
        const ctx = await getPanelCtx();
        if (!ctx) return { ...emptyReport(from, to, dryRun), skipped: 'not-configured' };
        return run(ctx);
    }));
    return out ?? { ...emptyReport(from, to, dryRun), skipped: 'lock-busy' };
}

/** Vista previa: qué se adoptaría, qué se crearía (si se encendiera el flag) y qué se salta. */
export async function previewFitpassPublish(from: string, to: string, opts: { ctx?: PanelCtx; db?: ClienteTx } = {}): Promise<PublishReport> {
    const run = (ctx: PanelCtx) => publishFitpassCore({ from, to }, { ctx, db: opts.db, dryRun: true, allowCreate: true });
    if (opts.ctx) return run(opts.ctx);
    const ctx = await getPanelCtx();
    if (!ctx) return { ...emptyReport(from, to, true), skipped: 'not-configured' };
    return run(ctx);
}

/** Publica (adopta o crea) UNA clase. No-op si FITPASS_PUBLISH_ENABLED no es 'true'. */
export async function publishClassToFitpass(classId: string, opts: { ctx?: PanelCtx; db?: ClienteTx; enabled?: boolean } = {}): Promise<PublishReport | { skipped: string }> {
    if (!(opts.enabled ?? fitpassPublishEnabled())) return { skipped: 'publish-disabled' };
    const [c] = await filas<{ date: string }>(opts.db, `SELECT date::text AS date FROM classes WHERE id = $1 AND status = 'scheduled'`, [classId]);
    if (!c) return { skipped: 'class-not-found' };
    const date = c.date.slice(0, 10);
    const run = (ctx: PanelCtx) => publishFitpassCore({ from: date, to: date }, { ctx, db: opts.db, dryRun: false, allowCreate: true, classIds: [classId] });
    if (opts.ctx) return run(opts.ctx);
    const out = await withFitpassLock('FP_MUTATE', async () => withFitpassLock('FP_PUBLISH', async () => {
        const ctx = await getPanelCtx();
        return ctx ? run(ctx) : { skipped: 'not-configured' };
    }));
    return out ?? { skipped: 'lock-busy' };
}

/** Cron semanal (lunes 5:00 CDMX): repone schedules de hoy a +7 días. No-op sin el flag. */
export async function extendFitpassWeek(opts: { ctx?: PanelCtx; db?: ClienteTx; enabled?: boolean } = {}): Promise<PublishReport | { skipped: string }> {
    if (!(opts.enabled ?? fitpassPublishEnabled())) return { skipped: 'publish-disabled' };
    const from = localDateStr();
    const to = addDaysToDateStr(from, 7);
    const run = (ctx: PanelCtx) => publishFitpassCore({ from, to }, { ctx, db: opts.db, dryRun: false, allowCreate: true });
    let out: PublishReport | { skipped: string };
    if (opts.ctx) out = await run(opts.ctx);
    else {
        const r = await withFitpassLock('FP_MUTATE', async () => withFitpassLock('FP_PUBLISH', async () => {
            const ctx = await getPanelCtx();
            return ctx ? run(ctx) : { skipped: 'not-configured' };
        }));
        out = r ?? { skipped: 'lock-busy' };
    }
    if (!opts.ctx) await logFitpassCron('FITPASS_EXTEND_WEEK', !('skipped' in out && out.skipped === 'lock-busy'), 'counts' in out ? { counts: out.counts, errors: out.errors.slice(0, 5) } : out);
    return out;
}
