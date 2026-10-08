/**
 * outbox — ejecuta los pendientes de FitPass (cancelaciones y ediciones) bajo FP_MUTATE.
 * `dispararFitpassOutbox()` al vuelo tras el commit (agrupa ráfagas); `retryFitpassOutbox()` lo usa el cron.
 */
import { query } from '../../config/database.js';
import { withFitpassLock } from './locks.js';
import { getPanelCtx } from './panel.js';
import { procesarCancelacionesFitpass, type FpCancelSummary } from './cancel.js';
import { procesarEdicionesFitpass, type FpEditSummary } from './edit.js';

export async function retryFitpassOutbox(): Promise<{ cancel: FpCancelSummary | null; edit: FpEditSummary | null; skipped?: string }> {
    // Sin pendientes no hay por qué hacer login al panel.
    const [hay] = await query<{ n: number }>(
        `SELECT count(*)::int AS n FROM partner_class_mappings WHERE channel = 'fitpass' AND sync_status IN ('pending_delete','pending_resync')`);
    if (!hay || hay.n === 0) return { cancel: null, edit: null, skipped: 'nothing-pending' };
    const out = await withFitpassLock('FP_MUTATE', async () => {
        const ctx = await getPanelCtx();
        if (!ctx) return { cancel: null, edit: null, skipped: 'not-configured' };
        const cancel = await procesarCancelacionesFitpass({ ctx });
        const edit = await procesarEdicionesFitpass({ ctx });
        return { cancel, edit };
    });
    return out ?? { cancel: null, edit: null, skipped: 'lock-busy' };
}

let timer: ReturnType<typeof setTimeout> | null = null;
export function dispararFitpassOutbox(): void {
    if (timer) return;
    timer = setTimeout(() => {
        timer = null;
        void retryFitpassOutbox().catch((e) => console.error('[fp-outbox]', (e as Error).message));
    }, 2000);
    (timer as any).unref?.();
}
