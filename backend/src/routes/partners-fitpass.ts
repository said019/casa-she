/**
 * Rutas admin de FitPass — montadas en /api/partners/fitpass (antes que /api/partners).
 *
 *   GET    /credentials/status        estado enmascarado (sin password)
 *   POST   /credentials               {email,password,gym_id}: valida login real + fetchLessons, guarda cifrado, is_enabled=true
 *   DELETE /credentials               deshabilita (conserva credenciales cifradas)
 *   GET    /lessons                   disciplinas EN VIVO del panel de FitPass
 *   POST   /lessons/auto-map          class_types <- lessons por nombre normalizado + alias (nunca pisa mapeos manuales)
 *   PUT    /class-types/:id/lesson    {fitpass_lesson_id?|null, fitpass_quota} (lesson omitida = se conserva)
 *   GET    /attendees?date=           (recepción) asistentes FitPass del día
 *   POST   /attendees                 (recepción) {classId, displayName, fitpassMemberRef?}
 *   DELETE /attendees/:bookingId      (recepción) {reason?}
 *   POST   /bulk-import               {rows[]} -> 409 FITPASS_SYNC_LOCKED si hay un ciclo en curso
 *   POST   /import-reservations       {from_date?, to_date?} importa del panel (bajo FP_SYNC_CYCLE)
 *   POST   /sync-now                  ciclo completo -> {ok, summary}
 *   GET    /sync-status               {last_run_at, success, details}
 *   GET    /publish-preview?from&to   dry-run: qué se adoptaría / crearía / saltaría (solo lectura)
 *   POST   /adopt                     {from,to,dry_run=true}: reclama schedules existentes (nunca crea)
 *
 * Acceso: sólo cuentas admin / super_admin. `authenticate` mapea recepción -> role 'admin', así que
 * además se exige accountRole real (recepción NO administra credenciales de partners).
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { logAction } from '../lib/audit.js';
import { query } from '../config/database.js';
import { FitPassScraper } from '../lib/scrapers/fitpass.js';
import {
    getFitpassScraper, getFitpassCredentialsStatus, saveFitpassCreds, disableFitpass,
    FitpassNotConfiguredError, maskEmail,
} from '../lib/fitpass/credentials.js';
import { autoMapLessons, setClassTypeLesson } from '../lib/fitpass/lessons.js';
import { queryOne } from '../config/database.js';
import { hasPermission } from '../lib/permissions.js';
import { withFitpassLock } from '../lib/fitpass/locks.js';
import {
    FitpassError, importFitpassReservations, registerFitpassAttendee, cancelFitpassAttendee,
    listFitpassAttendeesForDate, type FitpassErrorCode,
} from '../lib/fitpass/source.js';
import { runFitpassSyncCycle, getFitpassSyncStatus } from '../lib/fitpass/sync-cycle.js';
import { safeErrorMessage } from '../lib/scrapers/sanitize.js';
import { localDateStr, addDaysToDateStr } from '../lib/mx-time.js';
import { adoptExistingFitpassSchedules, previewFitpassPublish } from '../lib/fitpass/publish.js';

const router = Router();

function requireAccountAdmin(req: Request, res: Response, next: NextFunction) {
    const acct = req.user?.accountRole;
    if (acct !== 'admin' && acct !== 'super_admin') {
        return res.status(403).json({ error: 'Acceso denegado', message: 'Sólo administradoras pueden gestionar FitPass' });
    }
    next();
}

const guard = [authenticate, requireRole('admin', 'super_admin'), requireAccountAdmin];

/** Mensaje seguro para el cliente (nunca eco de password/cookies/CSRF). */
function panelErrorMessage(err: unknown): string {
    return safeErrorMessage(err);
}

function handlePanelError(res: Response, label: string, err: unknown) {
    if (err instanceof FitpassNotConfiguredError) {
        return res.status(409).json({ error: 'FITPASS_NOT_CONFIGURED', message: err.message });
    }
    console.error(`[partners/fitpass] ${label}:`, panelErrorMessage(err));
    return res.status(502).json({ error: 'FITPASS_PANEL_ERROR', message: panelErrorMessage(err) });
}

router.get('/credentials/status', ...guard, async (_req: Request, res: Response) => {
    try {
        res.json(await getFitpassCredentialsStatus());
    } catch (err) {
        console.error('[partners/fitpass] status:', panelErrorMessage(err));
        res.status(500).json({ error: 'Error al leer el estado de FitPass' });
    }
});

const credentialsSchema = z.object({
    email: z.string().trim().email().max(200),
    password: z.string().min(1).max(200),
    gym_id: z.coerce.number().int().positive(),
});

router.post('/credentials', ...guard, async (req: Request, res: Response) => {
    const parsed = credentialsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors });
    }
    const { email, password, gym_id } = parsed.data;
    try {
        // Validación REAL antes de persistir: login + lectura de disciplinas.
        const scraper = new FitPassScraper();
        try {
            await scraper.login({ email, password });
        } catch (err) {
            return res.status(400).json({ error: 'FITPASS_LOGIN_FAILED', message: 'FitPass rechazó el login: revisa correo y contraseña.' , detail: panelErrorMessage(err) });
        }
        let lessons: Awaited<ReturnType<FitPassScraper['fetchLessons']>>;
        try {
            lessons = await scraper.fetchLessons();
        } catch (err) {
            return res.status(400).json({ error: 'FITPASS_LESSONS_FAILED', message: 'Login correcto pero no se pudieron leer las disciplinas.', detail: panelErrorMessage(err) });
        }
        await saveFitpassCreds({ email, password, gymId: gym_id, verifiedAt: new Date().toISOString() }, req.user!.userId);
        await logAction(query, {
            adminUserId: req.user!.userId,
            actionType: 'fitpass_credentials_saved',
            entityType: 'platform_credentials',
            entityId: 'fitpass',
            description: `Credenciales FitPass guardadas (${maskEmail(email)}, gym ${gym_id})`,
            newData: { email: maskEmail(email), gym_id, lessons: lessons.length },
            req,
        });
        res.json({ ok: true, lessons: lessons.length, status: await getFitpassCredentialsStatus() });
    } catch (err) {
        console.error('[partners/fitpass] save credentials:', panelErrorMessage(err));
        res.status(500).json({ error: 'No se pudieron guardar las credenciales' });
    }
});

router.delete('/credentials', ...guard, async (req: Request, res: Response) => {
    try {
        await disableFitpass(req.user!.userId);
        await logAction(query, {
            adminUserId: req.user!.userId,
            actionType: 'fitpass_disabled',
            entityType: 'platform_credentials',
            entityId: 'fitpass',
            description: 'Canal FitPass deshabilitado',
            req,
        });
        res.json({ ok: true, status: await getFitpassCredentialsStatus() });
    } catch (err) {
        console.error('[partners/fitpass] disable:', panelErrorMessage(err));
        res.status(500).json({ error: 'No se pudo deshabilitar FitPass' });
    }
});

router.get('/lessons', ...guard, async (_req: Request, res: Response) => {
    try {
        const scraper = await getFitpassScraper();
        res.json({ lessons: await scraper.fetchLessons() });
    } catch (err) {
        handlePanelError(res, 'lessons', err);
    }
});

router.post('/lessons/auto-map', ...guard, async (req: Request, res: Response) => {
    try {
        const scraper = await getFitpassScraper();
        const lessons = await scraper.fetchLessons();
        const result = await autoMapLessons(lessons.map((l) => ({ id: l.id, name: l.name })));
        await logAction(query, {
            adminUserId: req.user!.userId,
            actionType: 'fitpass_lessons_auto_map',
            entityType: 'class_types',
            entityId: null,
            description: `Auto-mapeo de disciplinas FitPass: ${result.applied} asignadas`,
            newData: { applied: result.applied, skipped: result.skipped.length },
            req,
        });
        res.json({ applied: result.applied, assignments: result.assignments, skipped: result.skipped });
    } catch (err) {
        handlePanelError(res, 'auto-map', err);
    }
});

const lessonSchema = z.object({
    // Omitido = conservar el mapeo actual (solo cambia el cupo); null = quitarlo.
    fitpass_lesson_id: z.number().int().positive().nullable().optional(),
    fitpass_quota: z.number().int().min(0).max(500),
});

router.put('/class-types/:id/lesson', ...guard, async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'ID de tipo de clase inválido' });
    const parsed = lessonSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors });
    }
    try {
        const row = await setClassTypeLesson(id, parsed.data.fitpass_lesson_id, parsed.data.fitpass_quota);
        if (!row) return res.status(404).json({ error: 'Tipo de clase no encontrado' });
        await logAction(query, {
            adminUserId: req.user!.userId,
            actionType: 'fitpass_class_type_lesson',
            entityType: 'class_types',
            entityId: id,
            description: `Mapeo FitPass de "${row.name}": lesson ${row.fitpass_lesson_id ?? 'ninguna'}, cupo ${row.fitpass_quota}`,
            newData: parsed.data,
            req,
        });
        res.json(row);
    } catch (err) {
        console.error('[partners/fitpass] class-type lesson:', panelErrorMessage(err));
        res.status(500).json({ error: 'No se pudo guardar el mapeo' });
    }
});

// ── Recepción: asistentes del día ───────────────────────────────────────────
// Recepción tiene role operativo 'admin' (authenticate lo mapea); el rol REAL está en accountRole.
async function requireReceptionOrAdmin(req: Request, res: Response, next: NextFunction) {
    const acct = req.user?.accountRole;
    if (acct === 'admin' || acct === 'super_admin') return next();
    if (acct !== 'reception') return res.status(403).json({ error: 'Acceso denegado' });
    try {
        const row = await queryOne<{ role: string; permissions: unknown; is_reception_master: boolean }>(
            `SELECT role, permissions, is_reception_master FROM users WHERE id=$1`, [req.user!.userId]);
        if (row && hasPermission(row as any, 'reservas')) return next();
        return res.status(403).json({ error: 'No tienes permiso para esta acción.' });
    } catch (err) {
        console.error('[partners/fitpass] permiso recepción:', panelErrorMessage(err));
        return res.status(500).json({ error: 'Error de autorización' });
    }
}
const receptionGuard = [authenticate, requireRole('admin', 'super_admin'), requireReceptionOrAdmin];

function fitpassErrorStatus(code: FitpassErrorCode): number {
    switch (code) {
        case 'CLASS_NOT_FOUND': return 404;
        case 'CLASS_FULL': case 'FITPASS_QUOTA_EXHAUSTED': return 409;
        default: return 400;
    }
}

router.get('/attendees', ...receptionGuard, async (req: Request, res: Response) => {
    const date = String(req.query.date || localDateStr());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date debe ser YYYY-MM-DD' });
    try {
        res.json(await listFitpassAttendeesForDate(date));
    } catch (err) {
        console.error('[partners/fitpass] attendees:', panelErrorMessage(err));
        res.status(500).json({ error: 'Error al obtener asistentes FitPass' });
    }
});

const registerSchema = z.object({
    classId: z.string().uuid(),
    displayName: z.string().trim().min(2).max(120),
    fitpassMemberRef: z.string().max(50).optional(),
});

router.post('/attendees', ...receptionGuard, async (req: Request, res: Response) => {
    const parsed = registerSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors });
    try {
        const result = await registerFitpassAttendee({ ...parsed.data, actorUserId: req.user!.userId });
        res.status(201).json(result);
    } catch (err) {
        if (err instanceof FitpassError) return res.status(fitpassErrorStatus(err.code)).json({ error: err.message, code: err.code });
        console.error('[partners/fitpass] register attendee:', panelErrorMessage(err));
        res.status(500).json({ error: 'Error al registrar asistente FitPass' });
    }
});

router.delete('/attendees/:bookingId', ...receptionGuard, async (req: Request, res: Response) => {
    const id = String(req.params.bookingId);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'ID de reserva inválido' });
    try {
        const reason = String(req.body?.reason || 'Cancelado por recepción').slice(0, 300);
        const done = await cancelFitpassAttendee(id, reason, req.user!.userId);
        if (!done) return res.status(404).json({ error: 'Reserva FitPass no encontrada' });
        res.json({ message: 'Asistente FitPass cancelado' });
    } catch (err) {
        console.error('[partners/fitpass] cancel attendee:', panelErrorMessage(err));
        res.status(500).json({ error: 'Error al cancelar asistente' });
    }
});

// ── Importación ─────────────────────────────────────────────────────────────
const bulkRowSchema = z.object({
    sourceRef: z.string().min(1).max(120).optional(),
    displayName: z.string().trim().min(2).max(120),
    fitpassMemberRef: z.string().max(50).optional(),
    classId: z.string().uuid().optional(),
    classLookup: z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date debe ser YYYY-MM-DD'),
        startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'startTime debe ser HH:MM o HH:MM:SS'),
        className: z.string().max(120).optional(),
        fitpassLessonId: z.number().int().positive().optional(),
        coachName: z.string().max(120).optional(),
    }).optional(),
    status: z.enum(['reserved', 'attended', 'cancelled']),
}).refine((r) => !!r.classId || !!r.classLookup, { message: 'classId o classLookup requerido', path: ['classId'] });

const LOCKED = { error: 'FitPass se está sincronizando. Reintenta en unos segundos.', code: 'FITPASS_SYNC_LOCKED', retryable: true };

router.post('/bulk-import', ...guard, async (req: Request, res: Response) => {
    const parsed = z.object({ rows: z.array(bulkRowSchema).min(1).max(1000) }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors });
    try {
        const result = await withFitpassLock('FP_SYNC_CYCLE', () => importFitpassReservations(parsed.data.rows, req.user!.userId));
        if (result === null || result.skipped === 'locked') return res.status(409).json(LOCKED);
        res.json(result);
    } catch (err) {
        console.error('[partners/fitpass] bulk-import:', panelErrorMessage(err));
        res.status(500).json({ error: 'Error al importar reservas FitPass' });
    }
});

const importWindowSchema = z.object({
    from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Forma Hundred: {ok, fetched, created, updated, cancelled, skipped, failed, errors}. */
router.post('/import-reservations', ...guard, async (req: Request, res: Response) => {
    const parsed = importWindowSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Fechas inválidas (YYYY-MM-DD)' });
    const { from_date, to_date } = parsed.data;
    if (from_date && to_date && from_date > to_date) return res.status(400).json({ error: 'from_date no puede ser posterior a to_date' });
    try {
        const creds = await getFitpassCredentialsStatus();
        if (!creds.is_enabled) return res.json({ ok: true, disabled: true, fetched: 0 });
        const r = await runFitpassSyncCycle({
            from: from_date ? new Date(`${from_date}T12:00:00Z`) : undefined,
            to: to_date ? new Date(`${to_date}T12:00:00Z`) : undefined,
            actorUserId: req.user!.userId,
            reconcileAttendance: async () => ({ pending: 0, ok: 0, failed: 0 }),
        });
        if (r.status === 'cycle-skipped') return res.status(409).json(LOCKED);
        if (r.status === 'no-creds') return res.json({ ok: true, disabled: true, fetched: 0 });
        if (r.status === 'fetch-failed') return res.status(502).json({ error: 'FITPASS_PANEL_ERROR', message: r.error });
        res.json({ ok: r.status === 'ok', fetched: r.fetched ?? 0, ...(r.import ?? {}), errors: r.errors ?? [] });
    } catch (err) {
        handlePanelError(res, 'import-reservations', err);
    }
});

router.post('/sync-now', ...guard, async (_req: Request, res: Response) => {
    try {
        const r = await runFitpassSyncCycle({ actorUserId: _req.user!.userId });
        if (r.status === 'cycle-skipped') return res.status(409).json(LOCKED);
        if (r.status === 'no-creds') return res.status(409).json({ error: 'FITPASS_NOT_CONFIGURED', code: 'FITPASS_NOT_CONFIGURED', message: r.error });
        res.json({ ok: r.status === 'ok', summary: r });
    } catch (err) {
        handlePanelError(res, 'sync-now', err);
    }
});

router.get('/sync-status', ...guard, async (_req: Request, res: Response) => {
    try {
        res.json(await getFitpassSyncStatus());
    } catch (err) {
        console.error('[partners/fitpass] sync-status:', panelErrorMessage(err));
        res.status(500).json({ error: 'Error al leer el estado de la sincronización' });
    }
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** from/to de la query o del body; default hoy..+14, máximo 31 días. */
function parseWindow(src: any): { from: string; to: string } | { error: string } {
    const from = String(src?.from || localDateStr());
    const to = String(src?.to || addDaysToDateStr(from, 14));
    if (!DATE_RE.test(from) || !DATE_RE.test(to) || to < from) return { error: 'Rango de fechas inválido (YYYY-MM-DD)' };
    if (addDaysToDateStr(from, 31) < to) return { error: 'El rango máximo es de 31 días' };
    return { from, to };
}

// GET /publish-preview?from&to — SOLO LECTURA: qué clases se adoptarían / crearían / saltarían y por qué.
router.get('/publish-preview', ...guard, async (req: Request, res: Response) => {
    const w = parseWindow(req.query);
    if ('error' in w) return res.status(400).json({ error: w.error });
    try {
        res.json(await previewFitpassPublish(w.from, w.to));
    } catch (err) {
        handlePanelError(res, 'publish-preview', err);
    }
});

// POST /adopt {from,to,dry_run?} — reclama schedules existentes (nunca crea). dry_run=true por defecto.
router.post('/adopt', ...guard, async (req: Request, res: Response) => {
    const w = parseWindow(req.body);
    if ('error' in w) return res.status(400).json({ error: w.error });
    const dryRun = req.body?.dry_run !== false;
    try {
        const report = await adoptExistingFitpassSchedules(w.from, w.to, { dryRun });
        if (!dryRun) {
            await logAction(query, {
                adminUserId: req.user!.userId, actionType: 'fitpass_adopt', entityType: 'fitpass',
                description: `Adopción de schedules FitPass ${w.from}..${w.to}: ${report.counts.adopted} adoptadas`,
                newData: { ...w, counts: report.counts }, req,
            });
        }
        res.json(report);
    } catch (err) {
        handlePanelError(res, 'adopt', err);
    }
});

export default router;
