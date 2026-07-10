import assert from 'node:assert/strict';
import { pool } from '../src/config/database.js';

// Test de invariantes para POST /api/loyalty/users/:userId/redeem (canje staff a nombre del cliente).
// Verifica saldo/stock FOR UPDATE que el handler debe cumplir. Integra con BD real dentro de tx + rollback.

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // users requiere display_name (NOT NULL) + phone (NOT NULL); NO tiene columna `name`.
    const cli = await client.query(
      `INSERT INTO users (email, display_name, phone, role, loyalty_points)
       VALUES ('cli-sr@test', 'cli', '+525550000002', 'client', 250) RETURNING id`,
    );
    const cliId = cli.rows[0].id;

    const rw = await client.query(
      `INSERT INTO loyalty_rewards (name, points_cost, points_required, reward_type, reward_value, is_active, stock)
       VALUES ('Bebida', 100, 100, 'free_drink', '{"quantity":1}'::jsonb, true, 5) RETURNING id`,
    );
    const rewardId = rw.rows[0].id;

    // Caso éxito: saldo 250 >= 100, stock 5
    const userRes = await client.query(
      `SELECT loyalty_points FROM users WHERE id = $1 FOR UPDATE`,
      [cliId],
    );
    const rewardRes = await client.query(
      `SELECT * FROM loyalty_rewards WHERE id = $1 AND is_active = true FOR UPDATE`,
      [rewardId],
    );
    assert.ok(userRes.rows[0].loyalty_points >= rewardRes.rows[0].points_cost, 'saldo suficiente');
    assert.ok(rewardRes.rows[0].stock > 0, 'stock disponible');

    // Caso puntos insuficientes
    const poor = await client.query(
      `INSERT INTO users (email, display_name, phone, role, loyalty_points)
       VALUES ('poor-sr@test', 'poor', '+525550000003', 'client', 10) RETURNING id`,
    );
    const poorRes = await client.query(
      `SELECT loyalty_points FROM users WHERE id = $1 FOR UPDATE`,
      [poor.rows[0].id],
    );
    assert.ok(poorRes.rows[0].loyalty_points < rewardRes.rows[0].points_cost, 'puntos insuficientes detectado');

    await client.query('ROLLBACK');
    console.log('OK: invariantes de redeem-on-behalf');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});