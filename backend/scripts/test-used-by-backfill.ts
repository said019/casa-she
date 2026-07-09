import assert from 'node:assert/strict';
import { pool } from '../src/config/database.js';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // La tabla `users` real NO tiene columna `name`; requiere `phone` + `display_name` NOT NULL.
    const staffRes = await client.query(
      `INSERT INTO users (email, display_name, phone, role) VALUES ('staff-ub@test','staff','000','reception') RETURNING id`
    );
    const cliRes = await client.query(
      `INSERT INTO users (email, display_name, phone, role) VALUES ('cli-ub@test','cli','000','client') RETURNING id`
    );
    const staffId = staffRes.rows[0].id;
    const cliId = cliRes.rows[0].id;

    // Simula el UPDATE que hace bookings.ts al consumir free_class, con used_by
    const b = await client.query(
      `INSERT INTO user_benefits (user_id, benefit_type, benefit_value, status, expires_at)
       VALUES ($1, 'free_class', '{"kind":"free_class"}'::jsonb, 'active', NOW() + interval '10 days')
       RETURNING id`,
      [cliId]
    );
    await client.query(
      `UPDATE user_benefits SET status = 'used', used_at = NOW(), used_by = $3, used_on_booking_id = $1
       WHERE id = $2 AND status = 'active'`,
      ['00000000-0000-0000-0000-000000000000', b.rows[0].id, staffId]
    );
    const r = await client.query(`SELECT used_by FROM user_benefits WHERE id = $1`, [b.rows[0].id]);
    assert.equal(r.rows[0].used_by, staffId, 'used_by queda poblado por el actor');

    await client.query('ROLLBACK');
    console.log('OK: backfill registra used_by');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });