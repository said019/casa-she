/**
 * Ciclo de sincronización FitPass (cron FITPASS_SYNC cada 2 min y disparos manuales).
 *
 *   FP_SYNC_CYCLE ─ login + fetchReservationsRows(hoy-1 → hoy+14, CDMX)
 *                 ─ importFitpassReservations (FP_IMPORT)
 *                 ─ afterImport()  <- punto de extensión: 2B/integración cuelga aquí reconcileFitpassPool
 *                 ─ reconcileFitpassAttendance (reintenta asistencias pendientes)
 *
 * Si el import falla o se omite NO se llama a afterImport (no se publica cupo con un snapshot viejo).
 * Todo intento queda en cron_job_logs (job FITPASS_SYNC); lock ocupado => skip retryable.
 */
import { query } from '../../config/database.js';
import { FitPassScraper, type FitpassImportRow } from '../scrapers/fitpass.js';
import { addDays } from '../mx-time.js';
import { getFitpassCreds } from './credentials.js';
import { withFitpassLock } from './locks.js';
import { logFitpassCron } from './cron-log.js';
import { importFitpassReservations, type FitpassImportResult } from './source.js';
import { reconcileFitpassAttendance } from './attendance.js';

export const FITPASS_SYNC_JOB = 'FITPASS_SYNC';

let defaultAfterImport: (() => Promise<void>) | null = null;
/** Registra el hook por defecto (lo usa el cron). 2B/integración: setFitpassAfterImportHook(reconcilePoolAndPush). */
export function setFitpassAfterImportHook(fn: (() => Promise<void>) | null): void {
    defaultAfterImport = fn;
}

export type FitpassSyncCycleStatus = 'ok' | 'cycle-skipped' | 'no-creds' | 'fetch-failed' | 'import-failed' | 'after-import-failed';

export interface FitpassSyncCycleOptions {
    from?: Date;
    to?: Date;
    actorUserId?: string | null;
    /** Hook tras un import exitoso (p. ej. reconcileFitpassPool de la fase 2B). */
    afterImport?: () => Promise<void>;
    /** Inyección para tests: reemplaza login+fetch. */
    fetchRows?: (from: Date, to: Date) => Promise<FitpassImportRow[]>;
    /** Inyección para tests: reemplaza la reconciliación de asistencia. */
    reconcileAttendance?: () => Promise<{ pending: number; ok: number; failed: number }>;
    /** Solo tests: cliente transaccional para el import (SAVEPOINT por fila). */
    importDb?: import('pg').PoolClient;
    /** false = no escribe en cron_job_logs (dry-run). */
    log?: boolean;
}

export interface FitpassSyncCycleResult {
    status: FitpassSyncCycleStatus;
    retryable: boolean;
    fetched?: number;
    import?: FitpassImportResult['summary'];
    errors?: string[];
    attendance?: { pending: number; ok: number; failed: number };
    error?: string;
}

function sampleErrors(r: FitpassImportResult): string[] {
    return r.rows.filter((x) => x.outcome === 'failed').slice(0, 8).map((x) => `${x.error}: ${x.message}`);
}

/**
 * La tabla de reservaciones trae el NOMBRE de la disciplina pero no su lesson_id. Se completa por nombre
 * exacto (normalizado) contra el catálogo vivo de lessons para que class_types.fitpass_lesson_id sea
 * la llave autoritativa del import. PURA.
 */
export function attachLessonIds(rows: FitpassImportRow[], lessons: Array<{ id: number; name: string }>): FitpassImportRow[] {
    const norm = (x: string) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const byName = new Map<string, number | null>();
    for (const l of lessons) {
        const k = norm(l.name);
        byName.set(k, byName.has(k) && byName.get(k) !== l.id ? null : l.id); // nombre repetido => no se adivina
    }
    return rows.map((r) => {
        const lk = r.classLookup;
        if (!lk || lk.fitpassLessonId || !lk.className) return r;
        const id = byName.get(norm(lk.className));
        return id ? { ...r, classLookup: { ...lk, fitpassLessonId: id } } : r;
    });
}

async function defaultFetch(from: Date, to: Date): Promise<FitpassImportRow[]> {
    const creds = await getFitpassCreds();
    if (!creds) throw new NoCredsError();
    const scraper = new FitPassScraper(creds.panelUrl);
    await scraper.login({ email: creds.email, password: creds.password });
    const rows = await scraper.fetchReservationsRows(from, to);
    try {
        return attachLessonIds(rows, await scraper.fetchLessons());
    } catch (e) {
        console.warn('[fitpass-sync] no se pudo leer el catálogo de lessons; el import resuelve por nombre:', (e as Error).message);
        return rows;
    }
}

class NoCredsError extends Error {
    constructor() { super('FitPass no está configurado o está deshabilitado'); }
}

export async function runFitpassSyncCycle(opts: FitpassSyncCycleOptions = {}): Promise<FitpassSyncCycleResult> {
    const now = new Date();
    const from = opts.from ?? addDays(now, -1);
    const to = opts.to ?? addDays(now, 14);
    const log = opts.log !== false;

    const result = await withFitpassLock('FP_SYNC_CYCLE', async (): Promise<FitpassSyncCycleResult> => {
        let rows: FitpassImportRow[];
        try {
            rows = await (opts.fetchRows ?? defaultFetch)(from, to);
        } catch (e) {
            if (e instanceof NoCredsError) return { status: 'no-creds', retryable: false, error: e.message };
            return { status: 'fetch-failed', retryable: true, error: (e as Error).message };
        }
        let imp: FitpassImportResult = {
            summary: { total: 0, created: 0, updated: 0, cancelled: 0, skipped: 0, failed: 0 }, rows: [],
        };
        if (rows.length > 0) {
            try {
                imp = await importFitpassReservations(rows, opts.actorUserId ?? null, { db: opts.importDb });
            } catch (e) {
                return { status: 'import-failed', retryable: true, fetched: rows.length, error: (e as Error).message };
            }
            if (imp.skipped) {
                return { status: 'cycle-skipped', retryable: true, fetched: rows.length, import: imp.summary, error: `importación omitida: ${imp.skipped}` };
            }
        }
        const base = { fetched: rows.length, import: imp.summary };
        if (imp.summary.failed > 0) {
            const errors = sampleErrors(imp);
            // Un fallo visible (p. ej. clase ambigua) no impide atender el resto, pero el ciclo no cuenta como limpio.
            return { status: 'import-failed', retryable: false, ...base, errors, error: `${imp.summary.failed} fallos de importación` };
        }
        const hook = opts.afterImport ?? defaultAfterImport;
        if (hook) {
            try {
                await hook();
            } catch (e) {
                return { status: 'after-import-failed', retryable: true, ...base, error: (e as Error).message };
            }
        }
        let attendance: FitpassSyncCycleResult['attendance'];
        try {
            attendance = await (opts.reconcileAttendance ?? reconcileFitpassAttendance)();
        } catch (e) {
            console.error('[fitpass-sync] reconcile asistencia:', (e as Error).message);
        }
        return { status: 'ok', retryable: false, ...base, attendance };
    });

    const final: FitpassSyncCycleResult = result ?? { status: 'cycle-skipped', retryable: true, error: 'ciclo en curso (lock ocupado); se reintentará' };
    if (log && final.status !== 'no-creds') {
        await logFitpassCron(FITPASS_SYNC_JOB, final.status === 'ok', final);
    }
    return final;
}

export async function getFitpassSyncStatus(): Promise<{ last_run_at: string | null; success: boolean | null; details: unknown }> {
    const r = await query<{ executed_at: string; success: boolean; details: string | null }>(
        `SELECT executed_at, success, details FROM cron_job_logs WHERE job_name=$1 ORDER BY executed_at DESC LIMIT 1`,
        [FITPASS_SYNC_JOB],
    );
    const row = r[0];
    if (!row) return { last_run_at: null, success: null, details: null };
    let details: unknown = row.details;
    try { if (row.details) details = JSON.parse(row.details); } catch { /* texto plano */ }
    return { last_run_at: new Date(row.executed_at).toISOString(), success: row.success, details };
}
