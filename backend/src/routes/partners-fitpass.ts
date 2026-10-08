/**
 * Rutas admin de FitPass — montadas en /api/partners/fitpass (antes que /api/partners).
 *
 *   GET    /credentials/status        estado enmascarado (sin password)
 *   POST   /credentials               {email,password,gym_id}: valida login real + fetchLessons, guarda cifrado, is_enabled=true
 *   DELETE /credentials               deshabilita (conserva credenciales cifradas)
 *   GET    /lessons                   disciplinas EN VIVO del panel de FitPass
 *   POST   /lessons/auto-map          class_types <- lessons por nombre normalizado + alias (nunca pisa mapeos manuales)
 *   PUT    /class-types/:id/lesson    {fitpass_lesson_id?|null, fitpass_quota} (lesson omitida = se conserva)
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
import { adoptExistingFitpassSchedules, previewFitpassPublish } from '../lib/fitpass/publish.js';
import { localDateStr, addDaysToDateStr } from '../lib/mx-time.js';

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
    const msg = err instanceof Error ? err.message : String(err);
    return msg.replace(/authenticity_token=[^&\s]+/gi, 'authenticity_token=[redacted]').slice(0, 300);
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
