import assert from 'node:assert/strict';
import { pool } from '../src/config/database.js';
import { finalizePaidOrder } from '../src/lib/orderFulfillment.js';

async function main() {
  const c = await pool.connect();
  let createdOrderId: string | null = null;
  let createdUserId: string | null = null;
  try {
    await c.query('BEGIN');
    const one = async (s: string, p: any[] = []) => (await c.query(s, p)).rows[0];

    // (a) dedupe de webhooks
    await c.query(`INSERT INTO stripe_webhook_events (event_id, type) VALUES ('evt_test_1','checkout.session.completed') ON CONFLICT (event_id) DO NOTHING`);
    const dup = await c.query(`INSERT INTO stripe_webhook_events (event_id, type) VALUES ('evt_test_1','checkout.session.completed') ON CONFLICT (event_id) DO NOTHING RETURNING event_id`);
    assert.equal(dup.rows.length, 0, 'segundo event_id no reprocesa (dedupe)');
    await c.query('ROLLBACK'); // limpia el evento de prueba (estaba en la tx)

    // (b) finalizePaidOrder idempotente — corre FUERA de la tx (usa pool), por eso cleanup explícito
    const oneP = async (s: string, p: any[] = []) => (await pool.query(s, p)).rows[0];
    const user = await oneP(`INSERT INTO users (email,phone,display_name) VALUES ($1,$2,'Cliente Stripe Test') RETURNING id`,
      [`stripe_${Date.now()}@t.local`, `59${Date.now()}`.slice(0,12)]);
    createdUserId = user.id;
    const planRow = await oneP(`SELECT id, COALESCE(price,0) price, duration_days FROM plans LIMIT 1`);
    assert.ok(planRow, 'falta un plan sembrado');
    const order = await oneP(`INSERT INTO orders (user_id, plan_id, order_number, subtotal, total_amount, currency, status, payment_method, payment_provider)
       VALUES ($1,$2,$3,$4,$4,'MXN','pending_payment','card','stripe') RETURNING id`,
      [user.id, planRow.id, 'TEST-'+Date.now(), planRow.price || 100]);
    createdOrderId = order.id;

    await finalizePaidOrder(order.id, { provider: 'stripe', paymentRef: 'pi_test_1' });
    await finalizePaidOrder(order.id, { provider: 'stripe', paymentRef: 'pi_test_1' }); // 2ª vez: idempotente

    const memCount = await oneP(`SELECT COUNT(*)::int n FROM memberships WHERE order_id = $1`, [order.id]);
    assert.equal(memCount.n, 1, 'finalizePaidOrder crea exactamente 1 membresía aunque se llame 2 veces');
    const ord = await oneP(`SELECT status, payment_provider, stripe_payment_intent_id FROM orders WHERE id=$1`, [order.id]);
    assert.equal(ord.status, 'approved');
    assert.equal(ord.payment_provider, 'stripe');
    assert.equal(ord.stripe_payment_intent_id, 'pi_test_1');

    console.log('test-stripe-integration: OK');
  } catch (e) {
    console.error('test-stripe-integration: FAIL'); console.error(e); process.exitCode = 1;
  } finally {
    // cleanup explícito de lo creado fuera de la tx
    try {
      if (createdOrderId) {
        await pool.query(`DELETE FROM payments WHERE membership_id IN (SELECT id FROM memberships WHERE order_id=$1)`, [createdOrderId]);
        await pool.query(`DELETE FROM memberships WHERE order_id=$1`, [createdOrderId]);
        await pool.query(`DELETE FROM orders WHERE id=$1`, [createdOrderId]);
      }
      if (createdUserId) await pool.query(`DELETE FROM users WHERE id=$1`, [createdUserId]);
    } catch (ce) { console.error('cleanup error:', ce); }
    c.release();
    await pool.end();
  }
}
main();
