/** Router admin de credenciales de partners (TotalPass, Fase 2 — Task 12).
 *
 * Nunca devuelve secretos en claro: el GET solo expone banderas has_* y el
 * PUT solo escribe los campos presentes en el body (allowlist fija).
 */
import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/database.js';
import { logAction } from '../lib/audit.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { totalPassOfficialFromDb, totalPassPlanId } from '../lib/totalpass/client.js';
import { registerTotalPassCheckinWebhook } from './partner-webhooks.js';
import { withPgAdvisoryLock } from '../lib/totalpass/lock.js';
import { publishTotalPassIndividualClasses } from '../lib/totalpass/publish.js';
import { reconcileTotalpassPool } from '../lib/totalpass/pool.js';
import { syncTotalPassReservations } from '../lib/totalpass/source.js';
import { renewTotalPassToken } from '../lib/totalpass/token.js';
import { localDateStr, addDaysToDateStr } from '../lib/mx-time.js';

const router = Router();

interface TotalPassCredentialsRow {
    is_enabled: boolean;
    partner_api_key: string | null;
    place_api_key: string | null;
    unit_id: string | null;
    place_name: string | null;
    token_expires_at: string | null;
}

function toStatusShape(row: TotalPassCredentialsRow) {
    return {
        is_enabled: row.is_enabled,
        has_partner_key: Boolean(row.partner_api_key),
        has_place_key: Boolean(row.place_api_key),
        unit_id: row.unit_id,
        place_name: row.place_name,
        token_expires_at: row.token_expires_at,
    };
}

// ============================================
// GET /api/partners/totalpass — estado de las credenciales (sin secretos)
// ============================================
router.get('/totalpass', authenticate, requireRole('admin', 'super_admin'), async (_req: Request, res: Response) => {
    try {
        const row = await queryOne<TotalPassCredentialsRow>(
            `SELECT is_enabled, partner_api_key, place_api_key, unit_id, place_name, token_expires_at
               FROM platform_credentials WHERE channel = 'totalpass'`
        );
        if (!row) return res.status(404).json({ error: 'Canal TotalPass no encontrado' });
        res.json(toStatusShape(row));
    } catch (error) {
        console.error('GET /partners/totalpass error:', error);
        res.status(500).json({ error: 'Error al obtener configuración de TotalPass' });
    }
});

// ============================================
// PUT /api/partners/totalpass — guarda credenciales (allowlist, UPSERT parcial)
// ============================================
router.put('/totalpass', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { partner_api_key, place_api_key, unit_id } = req.body ?? {};

        const sets: string[] = [];
        const params: any[] = [];

        // Solo escribe los campos presentes en el body; strings vacíos no sobreescriben
        // el valor guardado (evita borrar una llave por accidente con un submit vacío).
        if (typeof partner_api_key === 'string' && partner_api_key.trim() !== '') {
            params.push(partner_api_key.trim());
            sets.push(`partner_api_key = $${params.length}`);
        }
        if (typeof place_api_key === 'string' && place_api_key.trim() !== '') {
            params.push(place_api_key.trim());
            sets.push(`place_api_key = $${params.length}`);
        }
        if (typeof unit_id === 'string' && unit_id.trim() !== '') {
            params.push(unit_id.trim());
            sets.push(`unit_id = $${params.length}`);
        }

        if (sets.length > 0) {
            params.push(req.user!.userId);
            sets.push(`updated_by = $${params.length}`);
            await query(
                `UPDATE platform_credentials SET ${sets.join(', ')}, updated_at = NOW() WHERE channel = 'totalpass'`,
                params
            );

            try {
                await logAction(query, {
                    adminUserId: req.user!.userId,
                    actionType: 'totalpass_credentials_updated',
                    entityType: 'platform_credentials',
                    entityId: 'totalpass',
                    description: 'Credenciales de TotalPass actualizadas',
                    newData: {
                        partner_api_key: typeof partner_api_key === 'string' && partner_api_key.trim() !== '' ? '(actualizada)' : undefined,
                        place_api_key: typeof place_api_key === 'string' && place_api_key.trim() !== '' ? '(actualizada)' : undefined,
                        unit_id: typeof unit_id === 'string' && unit_id.trim() !== '' ? unit_id.trim() : undefined,
                    },
                    req,
                });
            } catch (auditErr) {
                console.error('[partners/totalpass PUT] audit failed (no bloquea):', auditErr);
            }
        }

        const row = await queryOne<TotalPassCredentialsRow>(
            `SELECT is_enabled, partner_api_key, place_api_key, unit_id, place_name, token_expires_at
               FROM platform_credentials WHERE channel = 'totalpass'`
        );
        if (!row) return res.status(404).json({ error: 'Canal TotalPass no encontrado' });
        res.json(toStatusShape(row));
    } catch (error) {
        console.error('PUT /partners/totalpass error:', error);
        res.status(500).json({ error: 'Error al guardar configuración de TotalPass' });
    }
});

// ============================================
// POST /api/partners/totalpass/test — prueba de conexión real (getPlace)
// ============================================
router.post('/totalpass/test', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const client = await totalPassOfficialFromDb();
        if (!client) return res.status(400).json({ error: 'Faltan credenciales de TotalPass' });

        let place: Record<string, any>;
        try {
            place = await client.getPlace();
        } catch (netErr: any) {
            console.error('POST /partners/totalpass/test error:', netErr);
            return res.status(502).json({ error: `No se pudo autenticar con TotalPass: ${netErr?.message || netErr}` });
        }

        const planId = totalPassPlanId(place);
        if (!planId) return res.status(409).json({ error: 'TotalPass no devolvió un plan para este place' });

        const placeName = String(place?.name || place?.identifier || '');
        await query(
            `UPDATE platform_credentials SET is_enabled = true, place_name = $1, updated_at = NOW() WHERE channel = 'totalpass'`,
            [placeName || null]
        );

        try {
            await logAction(query, {
                adminUserId: req.user!.userId,
                actionType: 'totalpass_connection_tested',
                entityType: 'platform_credentials',
                entityId: 'totalpass',
                description: `Prueba de conexión TotalPass OK (place: ${placeName || 'sin nombre'})`,
                newData: { placeName, planId },
                req,
            });
        } catch (auditErr) {
            console.error('[partners/totalpass/test] audit failed (no bloquea):', auditErr);
        }

        res.json({ ok: true, placeName, planId });
    } catch (error) {
        console.error('POST /partners/totalpass/test error:', error);
        res.status(500).json({ error: 'Error al probar la conexión con TotalPass' });
    }
});

// ============================================
// POST /api/partners/totalpass/webhook/register — registra el webhook de
// CHECKIN ante TotalPass (Fase 6, Task 16). Requiere PUBLIC_BASE_URL/APP_URL
// (la URL pública del backend) y credenciales ya guardadas.
// ============================================
router.post('/totalpass/webhook/register', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { webhookId, raw } = await registerTotalPassCheckinWebhook();

        try {
            await logAction(query, {
                adminUserId: req.user!.userId,
                actionType: 'totalpass_webhook_registered',
                entityType: 'platform_credentials',
                entityId: 'totalpass',
                description: `Webhook de check-in TotalPass registrado (id: ${webhookId ?? 'desconocido'})`,
                newData: { webhookId },
                req,
            });
        } catch (auditErr) {
            console.error('[partners/totalpass/webhook/register] audit failed (no bloquea):', auditErr);
        }

        res.json({ ok: true, webhookId, raw });
    } catch (error: any) {
        console.error('POST /partners/totalpass/webhook/register error:', error);
        res.status(502).json({ error: error?.message || 'Error al registrar el webhook de TotalPass' });
    }
});

// ============================================
// POST /api/partners/totalpass/run/:job — trigger manual de los jobs de
// TotalPass (Fase 7, Task 17), para probar sin esperar al cron.
// job ∈ {publish, pool, import, renew}; cualquier otro valor → 400.
//
// publish/pool/import corren bajo el MISMO advisory lock que su cron
// homólogo (471003/471002/471001 — ver lib/totalpass/lock.ts) para que un
// trigger manual nunca se solape con una corrida de cron en curso (ni al
// revés): si el lock está ocupado, responde con `locked: true` en vez de
// correr encima. `renew` no usa lock (es idempotente: solo pide y persiste
// un token nuevo).
// ============================================
router.post('/totalpass/run/:job', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    const { job } = req.params;
    try {
        let summary: unknown;

        switch (job) {
            case 'publish':
                summary = await withPgAdvisoryLock(471003, () =>
                    publishTotalPassIndividualClasses(localDateStr(), addDaysToDateStr(localDateStr(), 21)),
                );
                break;
            case 'pool':
                summary = await withPgAdvisoryLock(471002, () => reconcileTotalpassPool());
                break;
            case 'import':
                summary = await withPgAdvisoryLock(471001, () => syncTotalPassReservations());
                break;
            case 'renew': {
                const client = await totalPassOfficialFromDb();
                if (!client) {
                    summary = { skipped: 'no-client' };
                } else {
                    await renewTotalPassToken();
                    summary = { ok: true };
                }
                break;
            }
            default:
                return res.status(400).json({ error: `job desconocido: ${job}. Usa publish, pool, import o renew.` });
        }

        if (summary === null) {
            return res.json({
                ok: false,
                job,
                locked: true,
                message: 'Ya hay una corrida de este job en curso (advisory lock ocupado); intenta de nuevo en unos segundos.',
            });
        }

        try {
            await logAction(query, {
                adminUserId: req.user!.userId,
                actionType: 'totalpass_job_triggered',
                entityType: 'platform_credentials',
                entityId: 'totalpass',
                description: `Trigger manual TotalPass: ${job}`,
                newData: { job, summary },
                req,
            });
        } catch (auditErr) {
            console.error('[partners/totalpass/run] audit failed (no bloquea):', auditErr);
        }

        res.json({ ok: true, job, summary });
    } catch (error: any) {
        console.error(`POST /partners/totalpass/run/${job} error:`, error);
        res.status(500).json({ error: error?.message || `Error al ejecutar el job ${job}` });
    }
});

export default router;
