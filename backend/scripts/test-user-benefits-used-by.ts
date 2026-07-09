import assert from 'node:assert/strict';
import { pool } from '../src/config/database.js';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // La columna used_by debe existir y ser nullable
    const col = await client.query(
      `SELECT column_name, is_nullable, data_type
       FROM information_schema.columns
       WHERE table_name = 'user_benefits' AND column_name = 'used_by'`
    );
    assert.equal(col.rows.length, 1, 'la columna user_benefits.used_by debe existir');
    assert.equal(col.rows[0].is_nullable, 'YES', 'used_by debe ser nullable');
    assert.equal(col.rows[0].data_type, 'uuid', 'used_by debe ser uuid');

    // Un INSERT válido con used_by = NULL debe funcionar.
    // Nota: la tabla users exige email, phone y display_name NOT NULL (sin columna `name`).
    const userRes = await client.query(
      `INSERT INTO users (email, phone, display_name, role)
       VALUES ('t-ub@test', '5550000000', 't', 'client')
       RETURNING id`
    );
    const userId = userRes.rows[0].id;
    const ins = await client.query(
      `INSERT INTO user_benefits (user_id, benefit_type, benefit_value, status, expires_at, used_by)
       VALUES ($1, 'free_drink', '{"kind":"free_drink"}'::jsonb, 'active', NOW() + interval '10 days', NULL)
       RETURNING id, used_by`,
      [userId]
    );
    assert.equal(ins.rows[0].used_by, null, 'used_by acepta NULL');

    await client.query('ROLLBACK');
    console.log('OK: used_by existe y es nullable');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });