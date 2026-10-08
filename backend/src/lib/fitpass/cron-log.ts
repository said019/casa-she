/**
 * Bitácora de crons partner en cron_job_logs (migración 127).
 *
 * API estable:
 *   logFitpassCron(jobName, success, details?) -> Promise<void>   nunca lanza
 * `details` se guarda como JSON (string u objeto). Jobs previstos: FITPASS_SYNC,
 * FITPASS_EXTEND_WEEK, fitpass_coach_sync, platform_cancel_class.
 */
import { query } from '../../config/database.js';

export async function logFitpassCron(jobName: string, success: boolean, details?: unknown): Promise<void> {
    try {
        const text = details === undefined || details === null
            ? null
            : typeof details === 'string' ? details : JSON.stringify(details);
        await query(
            `INSERT INTO cron_job_logs (job_name, success, details, executed_at) VALUES ($1, $2, $3, NOW())`,
            [jobName, success, text],
        );
    } catch (err) {
        console.error(`[fitpass-cron-log] no se pudo registrar ${jobName}:`, (err as Error).message);
    }
}
