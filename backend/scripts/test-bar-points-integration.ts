// Integration test (Postgres real) para la ruta de pago con PUNTOS de la barra.
// Cubre lo que test-bar.ts (puro) NO puede: que el query de saldo con lock
// SÍ ejecuta (el bug C1 era FOR UPDATE sobre un agregado → siempre 500) y que
// spendBarPoints descuenta atómicamente dentro de la transacción.
// Espeja el patrón de test-commission-integration.ts: BEGIN → seed → assert → ROLLBACK.
import assert from 'node:assert/strict';
import { pool } from '../src/config/database.js';
import { spendBarPoints, refundBarPoints } from '../src/lib/barPoints.js';

async function main() {
  const c = await pool.connect();
  const one = async (s: string, p: any[] = []) => (await c.query(s, p)).rows[0];
  try {
    await c.query('BEGIN');

    // Cliente de prueba con 100 puntos de saldo (una entrada 'bonus').
    const user = await one(
      `INSERT INTO users (email,phone,display_name) VALUES ($1,$2,'Barra Puntos Test') RETURNING id`,
      [`barpts_${Date.now()}@t.local`, `59${Date.now()}`.slice(0, 12)]);
    await c.query(
      `INSERT INTO loyalty_points (user_id, points, type, description) VALUES ($1, 100, 'bonus', 'seed')`,
      [user.id]);

    // --- C1: el lock por usuario + SUM del saldo EJECUTA sin error ---
    // (el bug era FOR UPDATE sobre el agregado; aquí probamos el orden correcto).
    await c.query(`SELECT id FROM users WHERE id=$1 FOR UPDATE`, [user.id]);
    const balRow = await one(
      `SELECT COALESCE(SUM(points),0)::int AS bal FROM loyalty_points WHERE user_id=$1`, [user.id]);
    assert.equal(Number(balRow.bal), 100, 'saldo inicial = 100');

    // --- gasto atómico: orden creada DENTRO de la tx, luego spendBarPoints ---
    const needed = 12; // p.ej. total $120 a tasa $10/pt
    const order = await one(
      `INSERT INTO bar_orders (user_id, status, pickup_time, payment_method, payment_status,
                               subtotal_mxn, card_surcharge_mxn, total_mxn, points_spent)
       VALUES ($1,'pending',NOW()+INTERVAL '30 min','points','paid',120,0,120,$2) RETURNING id`,
      [user.id, needed]);
    await spendBarPoints(c, user.id, needed, order.id);

    const afterSpend = await one(
      `SELECT COALESCE(SUM(points),0)::int AS bal FROM loyalty_points WHERE user_id=$1`, [user.id]);
    assert.equal(Number(afterSpend.bal), 88, 'saldo tras gastar 12 pts = 88');

    // snapshot users.loyalty_points sincronizado dentro de la tx
    const snap = await one(`SELECT loyalty_points FROM users WHERE id=$1`, [user.id]);
    assert.equal(Number(snap.loyalty_points), 88, 'snapshot de users refleja el gasto');

    // --- reembolso al cancelar (staff/cliente) reintegra los puntos ---
    await refundBarPoints(c, user.id, needed, order.id);
    const afterRefund = await one(
      `SELECT COALESCE(SUM(points),0)::int AS bal FROM loyalty_points WHERE user_id=$1`, [user.id]);
    assert.equal(Number(afterRefund.bal), 100, 'saldo tras reembolso vuelve a 100');

    await c.query('ROLLBACK');
    console.log('test-bar-points-integration: OK');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('test-bar-points-integration: FAIL'); console.error(e); process.exitCode = 1;
  } finally {
    c.release(); await pool.end();
  }
}
main();
