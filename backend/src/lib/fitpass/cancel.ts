/**
 * cancel — cancelar en FitPass la schedule de una clase de Casa Shé que se canceló.
 *
 * Dos tiempos (igual que el retiro de TotalPass):
 *  1. `marcarCancelacionFitpass` — solo BD, sin red: deja el outbox en
 *     partner_class_mappings (sync_status='pending_delete'). Corre dentro de cancelClassWithRefunds,
 *     así que cae en la MISMA transacción que la cancelación (día cerrado, lote, evento…).
 *  2. `procesarCancelacionesFitpass` — con red, bajo FP_MUTATE: cancelSchedule(id)
 *     (`_method=patch`, multiple=false: solo esa instancia). 404/410 = ya cancelada = idempotente.
 *     Se dispara al vuelo tras el commit y por el cron FITPASS_RETRY.
 *
 * Solo se cancelan schedules DUEÑAS (con external_slot_id en el mapping). Una schedule legacy
 * no reclamada jamás se toca. Si la clase volvió a 'scheduled' antes de ejecutar, el outbox se
 * deshace sin tocar el panel.
 */
import { filas, type ClienteTx } from '../db-tx.js';
import { FitPassHttpError } from '../scrapers/fitpass.js';
import type { PanelCtx } from './panel.js';

export async function marcarCancelacionFitpass(classId: string, db?: ClienteTx): Promise<boolean> {
    const marcar = filas<{ class_id: string }>(db,
        `UPDATE partner_class_mappings
            SET sync_status = 'pending_delete', sync_error = NULL, updated_at = NOW(),
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('fitpass_cancel', jsonb_build_object('queued_at', NOW()))
          WHERE channel = 'fitpass' AND class_id = $1 AND external_slot_id IS NOT NULL AND sync_enabled = true
          RETURNING class_id`, [classId]);
    if (db) return (await marcar).length > 0; // en transacción el error se propaga y revierte todo
    return marcar.then((r) => r.length > 0, (e: any) => { console.error('[fp-cancel] no se pudo marcar:', e?.message); return false; });
}

export interface FpCancelSummary { pendientes: number; canceladas: number; yaCanceladas: number; revertidas: number; fallidas: number; skipped?: string }

export async function procesarCancelacionesFitpass(o: { ctx: PanelCtx; db?: ClienteTx; limit?: number }): Promise<FpCancelSummary> {
    const s: FpCancelSummary = { pendientes: 0, canceladas: 0, yaCanceladas: 0, revertidas: 0, fallidas: 0 };
    const rows = await filas<{ class_id: string; external_slot_id: string; class_status: string }>(o.db,
        `SELECT pcm.class_id, pcm.external_slot_id, c.status::text AS class_status
           FROM partner_class_mappings pcm JOIN classes c ON c.id = pcm.class_id
          WHERE pcm.channel = 'fitpass' AND pcm.sync_status = 'pending_delete' AND pcm.external_slot_id IS NOT NULL
          ORDER BY pcm.updated_at LIMIT $1`, [o.limit ?? 50]);
    s.pendientes = rows.length;
    for (const r of rows) {
        if (r.class_status !== 'cancelled') {
            // Se reactivó antes de ejecutar: no tocar el panel.
            await filas(o.db, `UPDATE partner_class_mappings SET sync_status = 'synced', metadata = metadata - 'fitpass_cancel', updated_at = NOW()
                                WHERE class_id = $1 AND channel = 'fitpass'`, [r.class_id]);
            s.revertidas++;
            continue;
        }
        try {
            let ya = false;
            try {
                await o.ctx.panel.cancelSchedule(Number(r.external_slot_id), { cancelRecurrence: false });
            } catch (e) {
                if (e instanceof FitPassHttpError && (e.status === 404 || e.status === 410)) ya = true; else throw e;
            }
            await filas(o.db,
                `UPDATE partner_class_mappings
                    SET sync_status = 'skipped', sync_enabled = false, sync_error = NULL, updated_at = NOW(),
                        metadata = (COALESCE(metadata,'{}'::jsonb) - 'fitpass_cancel') || jsonb_build_object('fitpass_cancelled_at', NOW())
                  WHERE class_id = $1 AND channel = 'fitpass'`, [r.class_id]);
            if (ya) s.yaCanceladas++; else s.canceladas++;
        } catch (e) {
            s.fallidas++;
            await filas(o.db,
                `UPDATE partner_class_mappings SET sync_error = $2, updated_at = NOW() WHERE class_id = $1 AND channel = 'fitpass'`,
                [r.class_id, `cancel-failed: ${(e as Error).message.slice(0, 200)}`]);
        }
    }
    return s;
}
