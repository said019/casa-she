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
import { birthdayBonus, anniversaryBonus, streakBonus } from '../src/services/cron-jobs.js';

async function main() {
  const testStartedAt = new Date();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Obtener un plan_id real (FK required por memberships)
    const planRow = await client.query(`SELECT id FROM plans WHERE is_active = true LIMIT 1`);
    if (planRow.rows.length === 0) throw new Error('No hay planes activos en la BD. Ejecuta seed-plans primero.');
    const planId = planRow.rows[0].id as string;

    // Obtener un instructor_id y class_type_id reales (FK required por classes)
    const instructorRow = await client.query(`SELECT id FROM instructors WHERE is_active = true LIMIT 1`);
    if (instructorRow.rows.length === 0) throw new Error('No hay instructores activos en la BD.');
    const instructorId = instructorRow.rows[0].id as string;

    const classTypeRow = await client.query(`SELECT id FROM class_types WHERE is_active = true LIMIT 1`);
    if (classTypeRow.rows.length === 0) throw new Error('No hay class_types activos en la BD.');
    const classTypeId = classTypeRow.rows[0].id as string;

    // ─────────────────────────────────────────────────────────────────────────
    // BLOQUE A: birthday (usuario base reutilizado por todas las pruebas de bday)
    // ─────────────────────────────────────────────────────────────────────────
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

    // ── Prueba 3: idempotente — segunda llamada no duplica ───────────────────
    await birthdayBonus(client);
    const res3 = await client.query(
      `SELECT COUNT(*)::int AS c FROM loyalty_points WHERE user_id = $1 AND type = 'birthday'`,
      [userId]
    );
    assert.equal(res3.rows[0].c, 1, 'idempotente: no duplica');

    // ─────────────────────────────────────────────────────────────────────────
    // BLOQUE B: anniversary
    // Sembrar usuario cuyo created_at es HOY (MM-DD) pero hace exactamente 1 año.
    // El cron filtra:
    //   TO_CHAR(u.created_at, 'MM-DD') = TO_CHAR(NOW() AT TIME ZONE 'America/Mexico_City', 'MM-DD')
    //   AND u.created_at <= (CURRENT_DATE - INTERVAL '1 year')
    //
    // TO_CHAR(timestamptz, 'MM-DD') en PostgreSQL usa la timezone de la sesión
    // (normalmente UTC). Para que MM-DD coincida independientemente del offset,
    // usamos (CURRENT_DATE - INTERVAL '1 year')::timestamptz que tiene hora 00:00
    // UTC — cuyo TO_CHAR('MM-DD') devuelve la misma fecha que CURRENT_DATE - 1 año.
    // Y esa misma fecha comparada con NOW() AT TIME ZONE 'America/Mexico_City'
    // coincidirá siempre que corramos la prueba el mismo día calendario.
    // ─────────────────────────────────────────────────────────────────────────
    const suffixAnni = Math.floor(Math.random() * 1e9);
    const uAnni = await client.query(
      `INSERT INTO users (email, phone, display_name, created_at)
       VALUES ($1, $2, 'Test Aniversario',
               (CURRENT_DATE - INTERVAL '1 year')::timestamptz)
       RETURNING id`,
      [
        `test-anni-${suffixAnni}@casa.test`,
        `556${suffixAnni.toString().padStart(7, '0').slice(0, 7)}`,
      ]
    );
    const userAnniId = uAnni.rows[0].id as string;

    // Membresía activa para el usuario de aniversario
    await client.query(
      `INSERT INTO memberships (user_id, plan_id, status, start_date, end_date)
       VALUES ($1, $2, 'active', CURRENT_DATE - 5, CURRENT_DATE + 30)`,
      [userAnniId, planId]
    );

    // ── Prueba 4: anniversary toggle OFF → no otorga ─────────────────────────
    await saveLoyaltyConfig(
      { enabled: true, anniversary_bonus: 40, anniversary_enabled: false },
      undefined,
      client
    );
    await anniversaryBonus(client);
    const res4 = await client.query(
      `SELECT COUNT(*)::int AS c FROM loyalty_points WHERE user_id = $1 AND type = 'anniversary'`,
      [userAnniId]
    );
    assert.equal(res4.rows[0].c, 0, 'anniversary toggle OFF → no otorga puntos');

    // ── Prueba 5: anniversary toggle ON → otorga una vez ────────────────────
    await saveLoyaltyConfig(
      { enabled: true, anniversary_bonus: 40, anniversary_enabled: true },
      undefined,
      client
    );
    await anniversaryBonus(client);
    const res5 = await client.query(
      `SELECT COUNT(*)::int AS c, COALESCE(SUM(points), 0)::int AS pts
       FROM loyalty_points WHERE user_id = $1 AND type = 'anniversary'`,
      [userAnniId]
    );
    assert.equal(res5.rows[0].c, 1, 'anniversary toggle ON → otorga exactamente 1 fila');
    assert.equal(res5.rows[0].pts, 40, 'anniversary toggle ON → otorga el monto configurado (40 pts)');

    // ─────────────────────────────────────────────────────────────────────────
    // BLOQUE C: streak
    // El cron requiere bookings con checked_in_at en DOS semanas ISO consecutivas.
    // La CTE filtra: c.date >= CURRENT_DATE - INTERVAL '21 days'
    //   semana previa: DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days'
    //   semana actual: DATE_TRUNC('week', CURRENT_DATE)
    // Sembramos:
    //   - 2 clases: una en la semana ISO previa, otra en la semana ISO actual
    //   - 2 bookings con checked_in_at NOT NULL apuntando a esas clases
    // ─────────────────────────────────────────────────────────────────────────
    const suffixStreak = Math.floor(Math.random() * 1e9);
    const uStreak = await client.query(
      `INSERT INTO users (email, phone, display_name)
       VALUES ($1, $2, 'Test Racha')
       RETURNING id`,
      [
        `test-streak-${suffixStreak}@casa.test`,
        `557${suffixStreak.toString().padStart(7, '0').slice(0, 7)}`,
      ]
    );
    const userStreakId = uStreak.rows[0].id as string;

    // Clase en la semana ISO anterior (lunes de la semana pasada = DATE_TRUNC('week', CURRENT_DATE) - 7 days)
    const classWeekPrev = await client.query(
      `INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity, status)
       VALUES ($1, $2,
               (DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days')::date,
               '09:00', '10:00', 8, 'completed')
       RETURNING id`,
      [classTypeId, instructorId]
    );
    const classPrevId = classWeekPrev.rows[0].id as string;

    // Clase en la semana ISO actual (lunes de esta semana = DATE_TRUNC('week', CURRENT_DATE))
    const classWeekCurr = await client.query(
      `INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity, status)
       VALUES ($1, $2,
               DATE_TRUNC('week', CURRENT_DATE)::date,
               '09:00', '10:00', 8, 'completed')
       RETURNING id`,
      [classTypeId, instructorId]
    );
    const classCurrId = classWeekCurr.rows[0].id as string;

    // Booking en semana previa con checked_in_at
    await client.query(
      `INSERT INTO bookings (class_id, user_id, status, checked_in_at)
       VALUES ($1, $2, 'checked_in', NOW() - INTERVAL '7 days')`,
      [classPrevId, userStreakId]
    );

    // Booking en semana actual con checked_in_at
    await client.query(
      `INSERT INTO bookings (class_id, user_id, status, checked_in_at)
       VALUES ($1, $2, 'checked_in', NOW())`,
      [classCurrId, userStreakId]
    );

    // ── Prueba 6: streak toggle OFF → no otorga ──────────────────────────────
    await saveLoyaltyConfig(
      { enabled: true, streak_bonus: 10, streak_enabled: false },
      undefined,
      client
    );
    await streakBonus(client);
    const res6 = await client.query(
      `SELECT COUNT(*)::int AS c FROM loyalty_points WHERE user_id = $1 AND type = 'streak'`,
      [userStreakId]
    );
    assert.equal(res6.rows[0].c, 0, 'streak toggle OFF → no otorga puntos');

    // ── Prueba 7: streak toggle ON → otorga una vez ──────────────────────────
    await saveLoyaltyConfig(
      { enabled: true, streak_bonus: 10, streak_enabled: true },
      undefined,
      client
    );
    await streakBonus(client);
    const res7 = await client.query(
      `SELECT COUNT(*)::int AS c, COALESCE(SUM(points), 0)::int AS pts
       FROM loyalty_points WHERE user_id = $1 AND type = 'streak'`,
      [userStreakId]
    );
    assert.equal(res7.rows[0].c, 1, 'streak toggle ON → otorga exactamente 1 fila');
    assert.equal(res7.rows[0].pts, 10, 'streak toggle ON → otorga el monto configurado (10 pts)');

    // ── Limpieza: ROLLBACK revierte todo ────────────────────────────────────
    await client.query('ROLLBACK');
    console.log('test-loyalty-crons-integration: OK');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    // Limpiar filas de cron_job_logs que recordJobExecution escribió fuera de la
    // transacción (usa query() global auto-commit). Sólo borramos las 3 filas del
    // test en la ventana de tiempo de esta ejecución — no afecta datos reales.
    try {
      await pool.query(
        `DELETE FROM cron_job_logs
         WHERE job_name IN ('BIRTHDAY_BONUS', 'ANNIVERSARY_BONUS', 'STREAK_BONUS')
           AND executed_at >= $1`,
        [testStartedAt]
      );
    } catch {
      // best-effort: no falla el test si la tabla aún no existe
    }
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
