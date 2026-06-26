/**
 * Catarsis Studio - Cron Jobs Admin API
 *
 * Endpoints para administrar y ejecutar jobs manualmente
 */

import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { query } from '../config/database.js';
import { cronJobs } from '../services/cron-jobs.js';

const router = Router();

// ============================================
// EJECUTAR JOBS MANUALMENTE
// ============================================

/**
 * POST /api/cron/run/:jobName
 * Ejecutar un job específico manualmente
 */
router.post('/run/:jobName', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    const { jobName } = req.params;

    const jobMap: Record<string, () => Promise<void>> = {
        'generate-classes': cronJobs.generateRecurringClasses,
        'request-reviews': cronJobs.requestReviews,
        'expiring-memberships': cronJobs.notifyExpiringMemberships,
        'mark-expired': cronJobs.markExpiredMemberships,
        'cleanup-orders': cronJobs.cleanupExpiredOrders,
        'mark-no-shows': cronJobs.markNoShows,
        'auto-check-in': cronJobs.autoCheckIn,
        'expire-reviews': cronJobs.expireReviewRequests,
    };

    const job = jobMap[jobName];
    if (!job) {
        return res.status(404).json({
            error: 'Job no encontrado',
            availableJobs: Object.keys(jobMap),
        });
    }

    try {
        console.log(`[CRON] Manual execution of ${jobName} by ${req.user?.email}`);
        const startTime = Date.now();

        await job();

        const duration = Date.now() - startTime;

        res.json({
            success: true,
            message: `Job ${jobName} ejecutado correctamente`,
            duration: `${duration}ms`,
        });
    } catch (error) {
        console.error(`Error ejecutando job ${jobName}:`, error);
        res.status(500).json({
            error: 'Error ejecutando job',
            details: String(error),
        });
    }
});

/**
 * GET /api/cron/jobs
 * Listar todos los jobs disponibles y su próxima ejecución
 */
router.get('/jobs', authenticate, requireRole('admin'), async (_req: Request, res: Response) => {
    const jobs = [
        {
            name: 'generate-classes',
            description: 'Generar clases recurrentes para los próximos 14 días',
            schedule: 'Diario 3:00 AM',
            cron: '0 3 * * *',
        },
        {
            name: 'reminders-24h',
            description: 'Enviar recordatorios de clases 24 horas antes',
            schedule: 'Cada hora',
            cron: '0 * * * *',
        },
        {
            name: 'reminders-2h',
            description: 'Enviar recordatorios de clases 2 horas antes',
            schedule: 'Cada 30 minutos',
            cron: '15,45 * * * *',
        },
        {
            name: 'request-reviews',
            description: 'Solicitar reseñas 2 horas después de clase',
            schedule: 'Cada hora',
            cron: '30 * * * *',
        },
        {
            name: 'expiring-memberships',
            description: 'Notificar membresías por vencer (7, 3, 1 días)',
            schedule: 'Diario 10:00 AM',
            cron: '0 10 * * *',
        },
        {
            name: 'mark-expired',
            description: 'Marcar membresías expiradas',
            schedule: 'Diario 00:05 AM',
            cron: '5 0 * * *',
        },
        {
            name: 'cleanup-orders',
            description: 'Cancelar órdenes pendientes después de 48h',
            schedule: 'Cada 6 horas',
            cron: '0 */6 * * *',
        },
        {
            name: 'mark-no-shows',
            description: 'Marcar no-shows y completar clases',
            schedule: 'Cada 30 minutos',
            cron: '5,35 * * * *',
        },
        {
            name: 'expire-reviews',
            description: 'Expirar solicitudes de reseña después de 7 días',
            schedule: 'Diario 2:00 AM',
            cron: '0 2 * * *',
        },
    ];

    res.json({ jobs });
});

/**
 * GET /api/cron/logs
 * Ver historial de ejecución de jobs
 */
router.get('/logs', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { jobName, limit = 50 } = req.query;

        let whereClause = '';
        const params: (string | number)[] = [];

        if (jobName) {
            params.push(jobName as string);
            whereClause = `WHERE job_name = $${params.length}`;
        }

        params.push(Number(limit));

        const logs = await query<{
            id: string;
            job_name: string;
            success: boolean;
            details: string | null;
            executed_at: string;
        }>(`
            SELECT * FROM cron_job_logs
            ${whereClause}
            ORDER BY executed_at DESC
            LIMIT $${params.length}
        `, params);

        res.json({ logs });
    } catch (error) {
        // Table might not exist yet
        res.json({ logs: [], message: 'No hay logs todavía' });
    }
});

/**
 * GET /api/cron/stats
 * Estadísticas de ejecución de jobs
 */
router.get('/stats', authenticate, requireRole('admin'), async (_req: Request, res: Response) => {
    try {
        const stats = await query<{
            job_name: string;
            total_runs: string;
            successful_runs: string;
            failed_runs: string;
            last_run: string;
            last_success: string;
        }>(`
            SELECT
                job_name,
                COUNT(*) as total_runs,
                COUNT(*) FILTER (WHERE success = true) as successful_runs,
                COUNT(*) FILTER (WHERE success = false) as failed_runs,
                MAX(executed_at) as last_run,
                MAX(executed_at) FILTER (WHERE success = true) as last_success
            FROM cron_job_logs
            WHERE executed_at > NOW() - INTERVAL '7 days'
            GROUP BY job_name
            ORDER BY job_name
        `);

        res.json({
            stats: stats.map(s => ({
                jobName: s.job_name,
                totalRuns: parseInt(s.total_runs),
                successfulRuns: parseInt(s.successful_runs),
                failedRuns: parseInt(s.failed_runs),
                successRate: Math.round((parseInt(s.successful_runs) / parseInt(s.total_runs)) * 100),
                lastRun: s.last_run,
                lastSuccess: s.last_success,
            })),
        });
    } catch {
        res.json({ stats: [] });
    }
});

/**
 * DELETE /api/cron/logs
 * Limpiar logs antiguos
 */
router.delete('/logs', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { daysOld = 30 } = req.query;

        const result = await query(`
            DELETE FROM cron_job_logs
            WHERE executed_at < NOW() - INTERVAL '${Number(daysOld)} days'
            RETURNING id
        `);

        res.json({
            success: true,
            deletedCount: result.length,
        });
    } catch (error) {
        res.status(500).json({ error: 'Error limpiando logs' });
    }
});

export default router;
