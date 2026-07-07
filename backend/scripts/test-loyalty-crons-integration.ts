/**
 * Integration test: los crons de bono respetan su toggle por bono.
 *
 * Patrón: BEGIN … ROLLBACK en un único PoolClient.
 * - Las 3 funciones de cron aceptan `client?: DbClient` y lo usan para sus
 *   queries; el ROLLBACK al final revierte todas las escrituras del test.
 * - recordJobExecution usa el `query` global (auto-commit) → un par de filas
 *   en cron_job_logs quedan, pero son audit-only y no ensucian datos de negocio.
 *
 * Corre con: cd backend && npx tsx scripts/test-loyalty-crons-integration.ts
 */

import assert from 'node:assert/strict';
import { pool } from '../src/config/database.js';
import { saveLoyaltyConfig } from '../src/lib/loyalty.js';
import { birthdayBonus } from '../src/services/cron-jobs.js';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Obtener un plan_id real (FK required por memberships)
    const planRow = await client.query(`SELECT id FROM plans WHERE is_active = true LIMIT 1`);
    if (planRow.rows.length === 0) throw new Error('No hay planes activos en la BD. Ejecuta seed-plans primero.');
    const planId = planRow.rows[0].id as string;

    // Sembrar usuario con cumpleaños HOY (MM-DD) y membresía activa.
    // Columnas NOT NULL requeridas en users: email, phone, display_name.
    // role tiene default 'client'; password_hash y otros son nullable.
    const randomSuffix = Math.floor(Math.random() * 1e9);
    const u = await client.query(
      `INSERT INTO users (email, phone, display_name, date_of_birth)
       VALUES ($1, $2, 'Test Cumpleaños', (TO_CHAR(NOW() AT TIME ZONE 'America/Mexico_City', 'MM-DD') || '-1990')::date)
       RETURNING id`,
      [
        `test-cumple-${randomSuffix}@casa.test`,
        `555${randomSuffix.toString().padStart(7, '0').slice(0, 7)}`,
      ]
    );
    const userId = u.rows[0].id as string;

    // Membresía activa con end_date >= CURRENT_DATE.
    // NOT NULL requeridas: user_id, plan_id. status tiene default 'pending_payment'
    // pero la query del cron filtra status='active', así que lo ponemos explícito.
    await client.query(
      `INSERT INTO memberships (user_id, plan_id, status, start_date, end_date)
       VALUES ($1, $2, 'active', CURRENT_DATE - 10, CURRENT_DATE + 30)`,
      [userId, planId]
    );

    // ── Prueba 1: toggle OFF → no otorga ────────────────────────────────────
    await saveLoyaltyConfig(
      { enabled: true, birthday_bonus: 100, birthday_enabled: false },
      undefined,
      client
    );
    await birthdayBonus(client);
    const res1 = await client.query(
      `SELECT COUNT(*)::int AS c FROM loyalty_points WHERE user_id = $1 AND type = 'birthday'`,
      [userId]
    );
    assert.equal(res1.rows[0].c, 0, 'toggle OFF → no otorga puntos de cumpleaños');

    // ── Prueba 2: toggle ON → otorga una vez ────────────────────────────────
    await saveLoyaltyConfig(
      { enabled: true, birthday_bonus: 100, birthday_enabled: true },
      undefined,
      client
    );
    await birthdayBonus(client);
    const res2 = await client.query(
      `SELECT COUNT(*)::int AS c, COALESCE(SUM(points), 0)::int AS pts
       FROM loyalty_points WHERE user_id = $1 AND type = 'birthday'`,
      [userId]
    );
    assert.equal(res2.rows[0].c, 1, 'toggle ON → otorga exactamente 1 fila');
    assert.equal(res2.rows[0].pts, 100, 'toggle ON → otorga el monto configurado (100 pts)');

    // ── Limpieza: ROLLBACK revierte todo ────────────────────────────────────
    await client.query('ROLLBACK');
    console.log('test-loyalty-crons-integration: OK');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
