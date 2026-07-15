import assert from 'node:assert/strict';
import { pool } from '../src/config/database.js';
import { POS_MARKABLE_TYPES } from '../src/lib/qr.js';

// Test de flags de usabilidad del endpoint staff GET /loyalty/users/:userId/benefits.
// FIX 1: todo el bloque corre dentro de la MISMA transacción (client.query) — el global
//   `query` usa otra conexión del pool y no vería filas no confirmadas, lo que haría el
//   SELECT devuelva 0 filas y el test no valide nada.
// FIX 2: la tabla `users` real no tiene columna `name`; requiere `display_name` (NOT NULL)
//   y `phone` (NOT NULL). Se usa el esquema real con RETURNING id.
async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Esquema real de `users` (sin `name`, con `display_name` + `phone` NOT NULL).
    const cli = await client.query(
      `INSERT INTO users (email, display_name, phone, role) VALUES ('cli-sb@test','cli','+525550000001','client') RETURNING id`
    );
    const cliId = cli.rows[0].id;

    // beneficios: free_drink activo, free_class activo, free_drink expirado
    await client.query(
      `INSERT INTO user_benefits (user_id, benefit_type, benefit_value, status, expires_at) VALUES ($1,'free_drink','{"kind":"free_drink"}'::jsonb,'active', NOW()+interval '10 days')`,
      [cliId]
    );
    await client.query(
      `INSERT INTO user_benefits (user_id, benefit_type, benefit_value, status, expires_at) VALUES ($1,'free_class','{"kind":"free_class"}'::jsonb,'active', NOW()+interval '10 days')`,
      [cliId]
    );
    await client.query(
      `INSERT INTO user_benefits (user_id, benefit_type, benefit_value, status, expires_at) VALUES ($1,'free_drink','{"kind":"free_drink"}'::jsonb,'active', NOW()-interval '1 day')`,
      [cliId]
    );

    // marca expirados on-the-fly (igual que el endpoint) — dentro de la tx
    await client.query(
      `UPDATE user_benefits SET status = 'expired' WHERE user_id = $1 AND status = 'active' AND expires_at < NOW()`,
      [cliId]
    );

    const rows = await client.query<{ id: string; benefit_type: string; status: string; expires_at: string }>(
      `SELECT id, benefit_type, status, expires_at FROM user_benefits WHERE user_id = $1 ORDER BY expires_at ASC`,
      [cliId]
    );
    const active = rows.rows.filter((r) => r.status === 'active');
    assert.equal(active.length, 2, 'dos beneficios activos tras marcar expirados');
    assert.equal(active.some((r) => r.benefit_type === 'free_drink'), true);
    assert.equal(active.some((r) => r.benefit_type === 'free_class'), true);

    // flags esperados
    for (const r of active) {
      const markableNow = r.status === 'active' && POS_MARKABLE_TYPES.has(r.benefit_type);
      if (r.benefit_type === 'free_drink') assert.equal(markableNow, true, 'free_drink marcable');
      if (r.benefit_type === 'free_class') assert.equal(markableNow, false, 'free_class NO marcable');
    }

    await client.query('ROLLBACK');
    console.log('OK: staff benefits flags');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});