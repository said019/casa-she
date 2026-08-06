// Integration test (Postgres real) para el pago de eventos con tarjeta.
// Cubre lo que un test puro no puede: la idempotencia bajo FOR UPDATE y que la
// liberación de holds NO toque las transferencias pendientes.
// Espeja el patrón de test-bar-points-integration.ts: BEGIN → seed → assert → ROLLBACK.
import assert from 'node:assert/strict';
import { pool } from '../src/config/database.js';
import { finalizeEventRegistration, releaseExpiredEventHolds } from '../src/lib/eventFulfillment.js';

async function main() {
  const c = await pool.connect();
  const one = async (s: string, p: any[] = []) => (await c.query(s, p)).rows[0];
  try {
    await c.query('BEGIN');

    const stamp = Date.now();
    const user = await one(
      `INSERT INTO users (email, phone, display_name) VALUES ($1, $2, 'Evento Tarjeta Test') RETURNING id`,
      [`evcard_${stamp}@t.local`, `59${stamp}`.slice(0, 12)]);

    const event = await one(
      `INSERT INTO events (type, title, description, instructor_name, date, start_time, end_time,
                           location, capacity, price, status)
       VALUES ('workshop', 'Evento Test Tarjeta', 'Descripción de prueba para el test',
               'Instructora Test', CURRENT_DATE + 7, '10:00', '11:00', 'Casa Shé', 5, 350, 'published')
       RETURNING id`);

    // --- Inscripción pagada con tarjeta, hold vivo ---
    const reg = await one(
      `INSERT INTO event_registrations (event_id, user_id, name, email, status, amount, payment_method, hold_expires_at)
       VALUES ($1, $2, 'Evento Tarjeta Test', $3, 'pending', 350, 'card', NOW() + INTERVAL '30 minutes')
       RETURNING id`,
      [event.id, user.id, `evcard_${stamp}@t.local`]);

    // El trigger ya apartó el lugar.
    let ev = await one(`SELECT registered FROM events WHERE id = $1`, [event.id]);
    assert.equal(Number(ev.registered), 1, 'pending aparta el lugar');

    // --- finalizeEventRegistration confirma ---
    await finalizeEventRegistration(reg.id, { provider: 'mercadopago', paymentRef: 'mp-1', paidAmount: 350 }, c);
    let row = await one(`SELECT status, paid_at, hold_expires_at, mp_payment_id FROM event_registrations WHERE id = $1`, [reg.id]);
    assert.equal(row.status, 'confirmed', 'la inscripción queda confirmada');
    assert.ok(row.paid_at, 'se sella paid_at');
    assert.equal(row.hold_expires_at, null, 'el hold se limpia al confirmar');
    assert.equal(row.mp_payment_id, 'mp-1', 'guarda el id de pago de MP');

    let pays = await c.query(`SELECT id FROM payments WHERE reference_id = 'mp-1'`);
    assert.equal(pays.rows.length, 1, 'registra UN pago');

    // --- Idempotencia: el reintento del webhook no debe duplicar el pago ---
    await finalizeEventRegistration(reg.id, { provider: 'mercadopago', paymentRef: 'mp-1', paidAmount: 350 }, c);
    pays = await c.query(`SELECT id FROM payments WHERE reference_id = 'mp-1'`);
    assert.equal(pays.rows.length, 1, 'reintento NO duplica el pago');

    // --- Liberación de holds vencidos ---
    // (a) tarjeta vencida → se libera
    const expired = await one(
      `INSERT INTO event_registrations (event_id, user_id, name, email, status, amount, payment_method, hold_expires_at)
       VALUES ($1, NULL, 'Hold Vencido', $2, 'pending', 350, 'card', NOW() - INTERVAL '1 minute')
       RETURNING id`,
      [event.id, `expired_${stamp}@t.local`]);

    // (b) transferencia pendiente → NUNCA se toca, aunque no tenga hold
    const transfer = await one(
      `INSERT INTO event_registrations (event_id, user_id, name, email, status, amount, payment_method)
       VALUES ($1, NULL, 'Transferencia Pendiente', $2, 'pending', 350, 'transfer')
       RETURNING id`,
      [event.id, `transfer_${stamp}@t.local`]);

    // (c) tarjeta con hold vivo → tampoco se toca
    const alive = await one(
      `INSERT INTO event_registrations (event_id, user_id, name, email, status, amount, payment_method, hold_expires_at)
       VALUES ($1, NULL, 'Hold Vivo', $2, 'pending', 350, 'card', NOW() + INTERVAL '10 minutes')
       RETURNING id`,
      [event.id, `alive_${stamp}@t.local`]);

    const releasedCount = await releaseExpiredEventHolds(event.id, c);
    assert.equal(releasedCount, 1, 'libera exactamente un hold');

    row = await one(`SELECT status FROM event_registrations WHERE id = $1`, [expired.id]);
    assert.equal(row.status, 'cancelled', 'el hold vencido de tarjeta se libera');

    row = await one(`SELECT status FROM event_registrations WHERE id = $1`, [transfer.id]);
    assert.equal(row.status, 'pending', 'la transferencia pendiente NO se toca');

    row = await one(`SELECT status FROM event_registrations WHERE id = $1`, [alive.id]);
    assert.equal(row.status, 'pending', 'el hold vivo NO se toca');

    // El trigger devolvió el lugar liberado al cupo.
    ev = await one(`SELECT registered FROM events WHERE id = $1`, [event.id]);
    assert.equal(Number(ev.registered), 3, 'el lugar liberado vuelve al cupo (confirmada + transfer + hold vivo)');

    console.log('✅ test-events-card-payment: todas las aserciones pasaron');
  } finally {
    await c.query('ROLLBACK');
    c.release();
    await pool.end();
  }
}

main().catch((e) => { console.error('❌ test-events-card-payment:', e); process.exit(1); });
