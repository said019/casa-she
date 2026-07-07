import { query, queryOne } from '../config/database.js';

export interface FinalizeBarOpts { provider: string; paymentRef: string | null; }

// Marca pagada una orden de barra al confirmarse el pago con tarjeta. Idempotente.
export async function finalizeBarOrder(barOrderId: string, opts: FinalizeBarOpts): Promise<void> {
  const o = await queryOne<{ payment_status: string }>(`SELECT payment_status FROM bar_orders WHERE id = $1`, [barOrderId]);
  if (!o) { console.warn('finalizeBarOrder: no existe', barOrderId); return; }
  if (o.payment_status === 'paid') return; // idempotente
  await query(
    `UPDATE bar_orders SET payment_status='paid', mp_payment_id=$1, provider=$2, updated_at=NOW() WHERE id=$3`,
    [opts.paymentRef, opts.provider, barOrderId]);
  console.log(`finalizeBarOrder ${opts.paymentRef} → bar_order ${barOrderId} pagada`);
}
