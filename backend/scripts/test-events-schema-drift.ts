// Integration test (Postgres real): que la tabla `events` tenga TODAS las columnas que
// el código le escribe.
//
// Nace de un bug real: 012_event_config_columns.sql declaraba waitlist_enabled y sus
// hermanas, pero nunca se aplicaron en producción. POST /api/events las INSERTA siempre,
// así que crear un evento desde el panel de admin devolvía 500 con
// "column waitlist_enabled does not exist" — y nadie se enteró porque el .sql existía.
//
// La lección: que una migración esté escrita NO significa que corrió. Este test compara
// contra la BD real en vez de contra los archivos.
import assert from 'node:assert/strict';
import { pool } from '../src/config/database.js';

// Columnas que routes/events.ts escribe o lee explícitamente por nombre.
const REQUIRED_EVENT_COLUMNS = [
  'id', 'type', 'title', 'description', 'instructor_name', 'instructor_photo',
  'date', 'start_time', 'end_time', 'location', 'capacity', 'registered',
  'price', 'currency', 'early_bird_price', 'early_bird_deadline',
  'member_discount', 'image', 'requirements', 'includes', 'tags', 'status', 'created_by',
  'waitlist_enabled', 'required_payment', 'wallet_pass', 'auto_reminders', 'allow_cancellations',
];

const REQUIRED_REGISTRATION_COLUMNS = [
  'id', 'event_id', 'user_id', 'name', 'email', 'phone', 'status', 'amount',
  'payment_method', 'payment_reference', 'paid_at', 'checked_in', 'waitlist_position',
  // Migration 116 — el detalle del evento las lee cuando hay sesión.
  'payment_proof_url', 'payment_proof_file_name', 'transfer_date',
  // Migration 117 — pago con tarjeta vía MercadoPago.
  'mp_checkout_url', 'mp_payment_id', 'provider', 'hold_expires_at',
];

async function missingColumns(c: any, table: string, required: string[]): Promise<string[]> {
  const { rows } = await c.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1`, [table]);
  const present = new Set(rows.map((r: any) => r.column_name));
  return required.filter((col) => !present.has(col));
}

async function main() {
  const c = await pool.connect();
  try {
    const missingEvents = await missingColumns(c, 'events', REQUIRED_EVENT_COLUMNS);
    assert.deepEqual(missingEvents, [],
      `Faltan columnas en \`events\`: ${missingEvents.join(', ')}. Crear un evento desde el panel va a dar 500.`);

    const missingRegs = await missingColumns(c, 'event_registrations', REQUIRED_REGISTRATION_COLUMNS);
    assert.deepEqual(missingRegs, [],
      `Faltan columnas en \`event_registrations\`: ${missingRegs.join(', ')}. Abrir un evento va a dar 500.`);

    // Prueba viva: el INSERT real de POST /api/events, revertido.
    // Atrapa desajustes que la lista de arriba no vea (tipos, NOT NULL sin default, enums).
    await c.query('BEGIN');
    await c.query(
      `INSERT INTO events (
         type, title, description, instructor_name, date, start_time, end_time,
         location, capacity, price, currency, member_discount, requirements,
         includes, tags, status,
         waitlist_enabled, required_payment, wallet_pass, auto_reminders, allow_cancellations
       ) VALUES (
         'special', 'Drift probe', 'Evento de prueba del test de esquema', 'Test',
         CURRENT_DATE + 1, '10:00', '11:00', 'Casa Shé', 5, 100, 'MXN', 0, '',
         '[]'::jsonb, '[]'::jsonb, 'draft',
         true, true, true, false, false
       )`
    );
    await c.query('ROLLBACK');

    console.log('✅ test-events-schema-drift: el esquema de eventos coincide con lo que escribe el código');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => { console.error('❌ test-events-schema-drift:', e.message || e); process.exit(1); });
