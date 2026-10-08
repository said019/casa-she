/**
 * fitpass-admin — CLI de operación de la integración FitPass (se corre a mano, nunca como cron).
 *
 *   npx tsx scripts/fitpass-admin.ts <subcomando> [opciones]
 *
 * Necesita en el entorno: DATABASE_URL y APP_ENCRYPTION_KEY (>=32 chars, la misma que usa el servidor).
 *
 *   status                                   estado de credenciales, mapeo, schedules adoptadas, cupo, última sync
 *   save-creds                               lee FITPASS_EMAIL, FITPASS_PASSWORD, FITPASS_GYM_ID del ENTORNO (nunca de argv),
 *                                            valida login real + fetchLessons y guarda cifrado + habilita
 *   seed-lessons                             aplica el mapeo de lesson por defecto (migración 128) si falta; idempotente
 *   adopt --from YYYY-MM-DD --to YYYY-MM-DD [--apply]
 *                                            dry-run por defecto. --apply reclama las schedules (ownership) y fija el tope fitpass
 *                                            = lesson_availability del panel. NUNCA crea ni edita nada en el panel
 *   import --from YYYY-MM-DD --to YYYY-MM-DD [--apply]
 *                                            dry-run por defecto: trae las reservas reales y reporta qué empataría / fallaría
 *                                            (transacción con ROLLBACK). --apply importa de verdad bajo FP_SYNC_CYCLE
 *   publish-preview --from YYYY-MM-DD --to YYYY-MM-DD
 *                                            solo lectura: qué se adoptaría / crearía / saltaría y por qué
 *
 * Nunca imprime la contraseña, cookies ni tokens CSRF. Este script solo LEE del panel de FitPass.
 */
import { pool } from '../src/config/database.js';
import { FitPassScraper } from '../src/lib/scrapers/fitpass.js';
import {
    getFitpassCreds, getFitpassCredentialsStatus, getFitpassScraper, saveFitpassCreds, maskEmail,
} from '../src/lib/fitpass/credentials.js';
import { FITPASS_MIGRATIONS } from '../src/lib/fitpass/migrations.js';
import { withFitpassLock } from '../src/lib/fitpass/locks.js';
import { adoptExistingFitpassSchedules, previewFitpassPublish, type PublishReport } from '../src/lib/fitpass/publish.js';
import { fitpassPublishEnabled } from '../src/lib/fitpass/panel.js';
import { importFitpassReservations, type FitpassSourceRow } from '../src/lib/fitpass/source.js';
import { attachLessonIds, getFitpassSyncStatus } from '../src/lib/fitpass/sync-cycle.js';
import { addDaysToDateStr } from '../src/lib/mx-time.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── utilidades ──────────────────────────────────────────────────────────────

/** Quita de cualquier texto lo que no debe salir nunca (password del entorno, tokens CSRF, cookies). */
function redact(text: unknown): string {
    let s = text instanceof Error ? text.message : String(text ?? '');
    const pw = process.env.FITPASS_PASSWORD;
    if (pw && pw.length >= 3) s = s.split(pw).join('[redacted]');
    return s
        .replace(/authenticity_token=[^&\s"']+/gi, 'authenticity_token=[redacted]')
        .replace(/(_session|session_id|cookie)[^;\s]*=[^;\s]+/gi, '$1=[redacted]')
        .replace(/\s+/g, ' ')
        .slice(0, 300);
}

function line(s = ''): void { console.log(s); }

function parseArgs(argv: string[]): { cmd: string; flags: Map<string, string | true> } {
    const [cmd = '', ...rest] = argv;
    const flags = new Map<string, string | true>();
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (!a.startsWith('--')) throw new Error(`Argumento inesperado: ${a}`);
        const key = a.slice(2);
        const next = rest[i + 1];
        if (next !== undefined && !next.startsWith('--')) { flags.set(key, next); i++; } else flags.set(key, true);
    }
    return { cmd, flags };
}

function window(flags: Map<string, string | true>): { from: string; to: string } {
    const from = flags.get('from');
    const to = flags.get('to');
    if (typeof from !== 'string' || typeof to !== 'string' || !DATE_RE.test(from) || !DATE_RE.test(to) || to < from) {
        throw new Error('Indica --from YYYY-MM-DD --to YYYY-MM-DD (to >= from)');
    }
    if (addDaysToDateStr(from, 62) < to) throw new Error('El rango máximo es de 62 días');
    return { from, to };
}

function requireEnv(): void {
    if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en el entorno');
    if (!process.env.APP_ENCRYPTION_KEY || process.env.APP_ENCRYPTION_KEY.length < 32) {
        throw new Error('Falta APP_ENCRYPTION_KEY (>= 32 caracteres) en el entorno');
    }
}

// ── status ──────────────────────────────────────────────────────────────────

async function cmdStatus(): Promise<void> {
    const c = await getFitpassCredentialsStatus();
    line('FitPass — estado');
    line(`  credenciales:        ${c.configured ? 'guardadas' : 'NO configuradas'} · habilitado=${c.is_enabled}`);
    line(`  cuenta:              ${c.email_masked ?? '—'} · gym ${c.gym_id ?? '—'} · verificado ${c.verified_at ?? '—'}`);
    line(`  CRON_JOBS:           ${process.env.CRON_JOBS ? `${process.env.CRON_JOBS.split(',').filter((j) => j.trim().startsWith('FITPASS')).join(', ') || '(sin jobs FITPASS)'}` : '(vacío: FITPASS_SYNC NO corre; los de 2B son inertes sin schedules adoptadas)'}`);
    line(`  FITPASS_PUBLISH_ENABLED: ${fitpassPublishEnabled() ? 'TRUE (puede crear/mover schedules en el panel)' : 'apagado (no se crea ni mueve nada en el panel)'}`);

    const ct = (await pool.query(
        `SELECT count(*) FILTER (WHERE fitpass_lesson_id IS NOT NULL)::int AS mapeados,
                count(*) FILTER (WHERE fitpass_quota > 0)::int AS con_cupo,
                count(*)::int AS total
           FROM class_types WHERE is_active = true`)).rows[0];
    line(`  tipos de clase:      ${ct.mapeados}/${ct.total} con lesson · ${ct.con_cupo} con cupo por defecto`);

    const own = (await pool.query(
        `SELECT count(*)::int AS adoptadas,
                count(*) FILTER (WHERE m.sync_status IN ('pending_delete','pending_resync'))::int AS outbox
           FROM partner_class_mappings m JOIN classes c ON c.id = m.class_id
          WHERE m.channel = 'fitpass' AND m.external_slot_id IS NOT NULL AND m.sync_enabled = true
            AND c.date >= CURRENT_DATE`)).rows[0];
    line(`  schedules adoptadas: ${own.adoptadas} (clases futuras) · outbox pendiente ${own.outbox}`);

    const inv = (await pool.query(
        `SELECT count(*)::int AS clases, COALESCE(sum(ci.max_spots),0)::int AS lugares, COALESCE(sum(ci.booked_spots),0)::int AS reservados
           FROM channel_inventory ci JOIN classes c ON c.id = ci.class_id
          WHERE ci.channel = 'fitpass' AND ci.max_spots > 0 AND c.date >= CURRENT_DATE AND c.status <> 'cancelled'`)).rows[0];
    line(`  cupo fitpass futuro: ${inv.clases} clases · ${inv.lugares} lugares · ${inv.reservados} reservados`);

    const fp = (await pool.query(
        `SELECT count(*)::int AS n FROM bookings b JOIN classes c ON c.id = b.class_id
          WHERE b.channel = 'fitpass' AND b.status <> 'cancelled' AND c.date >= CURRENT_DATE`)).rows[0];
    line(`  reservas fitpass:    ${fp.n} activas en clases futuras`);

    const s = await getFitpassSyncStatus();
    const d = (s.details ?? {}) as Record<string, unknown>;
    line(`  última sync:         ${s.last_run_at ?? 'nunca'}${s.last_run_at ? ` · ${s.success ? 'ok' : 'con errores'}${d.status ? ` (${String(d.status)})` : ''}` : ''}`);
    if (d.error) line(`    ${redact(d.error)}`);
}

// ── save-creds ──────────────────────────────────────────────────────────────

async function cmdSaveCreds(): Promise<void> {
    const email = (process.env.FITPASS_EMAIL || '').trim();
    const password = process.env.FITPASS_PASSWORD || '';
    const gymId = Number(process.env.FITPASS_GYM_ID);
    if (!email || !password || !Number.isInteger(gymId) || gymId <= 0) {
        throw new Error('Define FITPASS_EMAIL, FITPASS_PASSWORD y FITPASS_GYM_ID en el entorno (no por argumentos)');
    }
    const scraper = new FitPassScraper();
    try { await scraper.login({ email, password }); }
    catch (e) { throw new Error(`FitPass rechazó el login: ${redact(e)}`); }
    let lessons: Awaited<ReturnType<FitPassScraper['fetchLessons']>>;
    try { lessons = await scraper.fetchLessons(); }
    catch (e) { throw new Error(`Login correcto pero no se pudieron leer las disciplinas: ${redact(e)}`); }
    await saveFitpassCreds({ email, password, gymId, verifiedAt: new Date().toISOString() }, null);
    line(`Credenciales guardadas (cifradas) y FitPass habilitado: ${maskEmail(email)} · gym ${gymId} · ${lessons.length} lessons leídas`);
}

// ── seed-lessons ────────────────────────────────────────────────────────────

async function cmdSeedLessons(): Promise<void> {
    const mig = FITPASS_MIGRATIONS.find((m) => m.n === 128);
    if (!mig) throw new Error('Migración 128 no encontrada');
    const count = async () => Number((await pool.query(`SELECT count(*)::int AS n FROM class_types WHERE fitpass_lesson_id IS NOT NULL`)).rows[0].n);
    const before = await count();
    for (const stmt of mig.statements) await pool.query(stmt);
    const after = await count();
    line(`Mapeo de lessons por defecto: ${before} -> ${after} tipos con lesson (${after - before} nuevos; nunca pisa uno existente)`);
    const sin = (await pool.query(
        `SELECT name, count(*)::int AS n FROM class_types WHERE is_active = true AND fitpass_lesson_id IS NULL GROUP BY name ORDER BY name`)).rows;
    if (sin.length) {
        line('Tipos activos SIN lesson (se mapean a mano en /admin/settings/fitpass o no aplican a FitPass):');
        for (const r of sin) line(`  - ${r.name}${r.n > 1 ? ` (x${r.n})` : ''}`);
    }
}

// ── adopt / publish-preview ─────────────────────────────────────────────────

function printPlan(r: PublishReport, verbose: boolean): void {
    line(`Ventana ${r.from}..${r.to} · ${r.dryRun ? 'DRY-RUN (no se escribe nada)' : 'APLICADO'} · publicar=${r.publishEnabled ? 'ON' : 'off'}`);
    if (r.skipped) { line(`  OMITIDO: ${r.skipped}`); return; }
    const c = r.counts;
    line(`  adoptar ${c.adopt} · crear ${c.create} · saltar ${c.skip}${r.dryRun ? '' : ` · adoptadas ${c.adopted} · creadas ${c.created} · fallidas ${c.failed}`}`);
    line(`  schedules del panel sin clase que las reclame: ${r.unmatchedSchedules}`);
    const reasons = Object.entries(r.skipReasons).sort((a, b) => b[1] - a[1]);
    if (reasons.length) line(`  motivos de salto: ${reasons.map(([k, v]) => `${k}=${v}`).join(', ')}`);
    const items = [...r.items].sort((a, b) => `${a.date}${a.hhmm}`.localeCompare(`${b.date}${b.hhmm}`));
    for (const it of items) {
        if (!verbose && it.action === 'skip' && (it.reason === 'past' || it.reason === 'already-owned')) continue;
        const tag = it.action === 'skip' ? `salta (${it.reason})` : it.action === 'adopt' ? `adopta schedule ${it.scheduleId}${it.scheduleLesson ? ` "${it.scheduleLesson}"` : ''} cupo ${it.availability ?? '?'}` : `crearía cupo ${it.availability ?? '?'}`;
        line(`  ${it.date.slice(0, 10)} ${it.hhmm}  ${it.title}  ->  ${tag}`);
    }
    for (const e of r.errors) line(`  ERROR: ${redact(e)}`);
}

async function cmdAdopt(flags: Map<string, string | true>): Promise<void> {
    const w = window(flags);
    const apply = flags.get('apply') === true;
    const r = await adoptExistingFitpassSchedules(w.from, w.to, { dryRun: !apply });
    printPlan(r, true);
    if (!apply) line('\nDry-run: no se escribió nada. Repite con --apply para reclamar las schedules y fijar el tope fitpass.');
}

async function cmdPublishPreview(flags: Map<string, string | true>): Promise<void> {
    const w = window(flags);
    printPlan(await previewFitpassPublish(w.from, w.to), true);
    line('\nSolo lectura. Crear schedules requiere además FITPASS_PUBLISH_ENABLED=true en el servidor.');
}

// ── import ──────────────────────────────────────────────────────────────────

async function cmdImport(flags: Map<string, string | true>): Promise<void> {
    const w = window(flags);
    const apply = flags.get('apply') === true;
    const creds = await getFitpassCreds();
    if (!creds) throw new Error('FitPass no está configurado o está deshabilitado (usa save-creds)');
    const scraper = await getFitpassScraper();
    const fetched = await scraper.fetchReservationsRows(new Date(`${w.from}T12:00:00Z`), new Date(`${w.to}T12:00:00Z`));
    let rows = fetched;
    try { rows = attachLessonIds(fetched, await scraper.fetchLessons()); } catch { /* el import resuelve por nombre */ }
    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    line(`Reservas leídas del panel ${w.from}..${w.to}: ${rows.length} (${Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(', ') || 'ninguna'})`);
    if (!rows.length) return;

    const run = async (db?: import('pg').PoolClient) =>
        importFitpassReservations(rows as unknown as FitpassSourceRow[], null, { db });
    let result: Awaited<ReturnType<typeof run>> | null;

    if (apply) {
        result = await withFitpassLock('FP_SYNC_CYCLE', () => run());
    } else {
        // Dry-run: todo el import dentro de una transacción que SIEMPRE se revierte.
        result = await withFitpassLock('FP_SYNC_CYCLE', async () => {
            const db = await pool.connect();
            try {
                await db.query('BEGIN');
                return await run(db);
            } finally {
                await db.query('ROLLBACK').catch(() => undefined);
                db.release();
            }
        });
    }
    if (result === null) throw new Error('Hay un ciclo de FitPass en curso (FP_SYNC_CYCLE ocupado); reintenta en unos segundos');
    if (result.skipped) throw new Error(`Importación omitida: ${result.skipped}`);

    const s = result.summary;
    line(`${apply ? 'IMPORTADO' : 'DRY-RUN (revertido, nada escrito)'}: creadas ${s.created} · actualizadas ${s.updated} · canceladas ${s.cancelled} · omitidas ${s.skipped} · fallidas ${s.failed} · sobrecupo ${result.overbooked}`);
    const fails = result.rows.filter((x) => x.outcome === 'failed');
    const byMsg = new Map<string, number>();
    for (const f of fails) byMsg.set(`${f.error}: ${redact(f.message)}`, (byMsg.get(`${f.error}: ${redact(f.message)}`) ?? 0) + 1);
    if (byMsg.size) {
        line('Motivos de falla (agrupados):');
        for (const [m, n] of [...byMsg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) line(`  x${n}  ${m}`);
        line('Filas fallidas (fecha hora · disciplina):');
        for (const f of fails.slice(0, 40)) {
            const lk = (rows[f.index] as { classLookup?: { date?: string; startTime?: string; className?: string } }).classLookup;
            line(`  ${lk?.date ?? '?'} ${lk?.startTime ?? '?'} · ${lk?.className ?? '?'}`);
        }
        if (fails.length > 40) line(`  ... y ${fails.length - 40} más`);
    }
    const skips = new Map<string, number>();
    for (const x of result.rows.filter((r) => r.outcome === 'skipped')) skips.set(x.reason ?? '?', (skips.get(x.reason ?? '?') ?? 0) + 1);
    if (skips.size) line(`Omitidas por: ${[...skips.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`);
    if (!apply) line('\nDry-run: no se escribió nada. Repite con --apply para importar.');
}

// ── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const { cmd, flags } = parseArgs(process.argv.slice(2));
    if (!cmd || cmd === 'help' || flags.has('help')) {
        line('Uso: npx tsx scripts/fitpass-admin.ts <status|save-creds|seed-lessons|adopt|import|publish-preview> [--from YYYY-MM-DD --to YYYY-MM-DD] [--apply]');
        return;
    }
    requireEnv();
    switch (cmd) {
        case 'status': return cmdStatus();
        case 'save-creds': return cmdSaveCreds();
        case 'seed-lessons': return cmdSeedLessons();
        case 'adopt': return cmdAdopt(flags);
        case 'import': return cmdImport(flags);
        case 'publish-preview': return cmdPublishPreview(flags);
        default: throw new Error(`Subcomando desconocido: ${cmd}`);
    }
}

main()
    .then(async () => { await pool.end(); })
    .catch(async (e) => {
        console.error(`ERROR: ${redact(e)}`);
        try { await pool.end(); } catch { /* noop */ }
        process.exit(1);
    });
