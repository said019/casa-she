import { query, queryOne } from '../config/database.js';

export interface FinalizeBarOpts { provider: string; paymentRef: string | null; paidAmount?: number | null; }

// Marca pagada una orden de barra al confirmarse el pago con tarjeta. Idempotente.
export async function finalizeBarOrder(barOrderId: string, opts: FinalizeBarOpts): Promise<void> {
  const o = await queryOne<{ payment_status: string; total_mxn: string }>(
    `SELECT payment_status, total_mxn FROM bar_orders WHERE id = $1`, [barOrderId]);
  if (!o) { console.warn('finalizeBarOrder: no existe', barOrderId); return; }
  if (o.payment_status === 'paid') return; // idempotente
  // Reconciliación: MP debe haber cobrado exactamente total_mxn (subtotal + recargo).
  // Un desajuste indica que el recargo no se cobró o hubo manipulación del monto.
  if (opts.paidAmount != null) {
    const expected = Number(o.total_mxn);
    if (Number.isFinite(expected) && Math.abs(Number(opts.paidAmount) - expected) > 0.01) {
      console.warn(`finalizeBarOrder: monto pagado ($${opts.paidAmount}) != total esperado ($${expected}) para bar_order ${barOrderId}`);
    }
  }
  await query(
    `UPDATE bar_orders SET payment_status='paid', mp_payment_id=$1, provider=$2, updated_at=NOW() WHERE id=$3`,
    [opts.paymentRef, opts.provider, barOrderId]);
  console.log(`finalizeBarOrder ${opts.paymentRef} → bar_order ${barOrderId} pagada`);
}
