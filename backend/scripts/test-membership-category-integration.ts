/**
 * Integración (requiere PostgreSQL con migraciones 030/031 aplicadas).
 * Valida el ciclo reservar→cancelar con reembolso al bucket correcto por categoría.
 * Todo corre dentro de una transacción que se revierte (ROLLBACK) al final:
 * no deja datos en la base.
 *
 * Uso: DATABASE_URL=postgresql://user@localhost:5432/bmb_studio_dev npx tsx scripts/test-membership-category-integration.ts
 */
import assert from 'node:assert/strict';
import { pool } from '../src/config/database.js';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const oneVal = async (sql: string, params: any[] = []) => (await client.query(sql, params)).rows[0];

    // Referencias sembradas por la migración 031
    const reformerType = await oneVal(`SELECT id FROM class_types WHERE name = 'Pilates Reformer'`);
    const multiType = await oneVal(`SELECT id FROM class_types WHERE name = 'Yoga'`);
    const facility = await oneVal(`SELECT id FROM facilities WHERE name = 'BMB Studio Tepa'`);
    const plan = await oneVal(`SELECT id FROM plans WHERE name = 'Mixta 12'`);
    assert.ok(reformerType && multiType && facility && plan, 'faltan datos sembrados (031)');

    // Fixtures
    const uniq = Date.now();
    const user = await oneVal(
      `INSERT INTO users (email, phone, display_name) VALUES ($1,$2,'Test Cat') RETURNING id`,
      [`cat_${uniq}@test.local`, `55${uniq}`.slice(0, 12)],
    );
    const instructor = await oneVal(
      `INSERT INTO instructors (user_id, display_name) VALUES ($1,'Coach Test') RETURNING id`,
      [user.id],
    );

    // Membresía Mixta: 6 reformer + 6 multi, activa, vigente
    const m = await oneVal(
      `INSERT INTO memberships (user_id, plan_id, status, reformer_remaining, multi_remaining,
                               start_date, end_date, cancellation_limit, cancellations_used)
       VALUES ($1,$2,'active',6,6, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 2, 0)
       RETURNING id`,
      [user.id, plan.id],
    );

    // Clases (a 3 días → dentro de reembolso, ventana 12h)
    const mkClass = async (typeId: string) => (await oneVal(
      `INSERT INTO classes (class_type_id, instructor_id, facility_id, date, start_time, end_time,
                            max_capacity, is_free, status)
       VALUES ($1,$2,$3, CURRENT_DATE + INTERVAL '3 days', '10:00','10:50', 8, false, 'scheduled')
       RETURNING id`,
      [typeId, instructor.id, facility.id],
    )).id;
    const reformerClass = await mkClass(reformerType.id);
    const multiClass = await mkClass(multiType.id);

    const remaining = async () => oneVal(
      `SELECT reformer_remaining AS r, multi_remaining AS mu FROM memberships WHERE id = $1`, [m.id],
    );

    // --- Caso REFORMER: reservar (descuenta reformer) y cancelar (reembolsa reformer) ---
    const bR = await oneVal(
      `INSERT INTO bookings (class_id, user_id, membership_id, status, consumed_category)
       VALUES ($1,$2,$3,'confirmed','reformer') RETURNING id`,
      [reformerClass, user.id, m.id],
    );
    await client.query(`UPDATE memberships SET reformer_remaining = reformer_remaining - 1 WHERE id = $1`, [m.id]);
    let bal = await remaining();
    assert.equal(bal.r, 5, 'tras reservar reformer, reformer_remaining debe ser 5');
    assert.equal(bal.mu, 6, 'multi no debe cambiar al reservar reformer');

    const cancelR = await oneVal(`SELECT * FROM cancel_booking($1::uuid,$2::uuid,false)`, [bR.id, user.id]);
    assert.equal(cancelR.out_refunded, true, 'cancelación reformer dentro de ventana debe reembolsar');
    bal = await remaining();
    assert.equal(bal.r, 6, 'reembolso debe devolver el crédito al bucket reformer (=6)');
    assert.equal(bal.mu, 6, 'multi no debe cambiar al reembolsar reformer');

    // --- Caso MULTI: reservar (descuenta multi) y cancelar (reembolsa multi) ---
    const bM = await oneVal(
      `INSERT INTO bookings (class_id, user_id, membership_id, status, consumed_category)
       VALUES ($1,$2,$3,'confirmed','multi') RETURNING id`,
      [multiClass, user.id, m.id],
    );
    await client.query(`UPDATE memberships SET multi_remaining = multi_remaining - 1 WHERE id = $1`, [m.id]);
    bal = await remaining();
    assert.equal(bal.mu, 5, 'tras reservar multi, multi_remaining debe ser 5');
    assert.equal(bal.r, 6, 'reformer no debe cambiar al reservar multi');

    const cancelM = await oneVal(`SELECT * FROM cancel_booking($1::uuid,$2::uuid,false)`, [bM.id, user.id]);
    assert.equal(cancelM.out_refunded, true, 'cancelación multi dentro de ventana debe reembolsar');
    bal = await remaining();
    assert.equal(bal.mu, 6, 'reembolso debe devolver el crédito al bucket multi (=6)');
    assert.equal(bal.r, 6, 'reformer no debe cambiar al reembolsar multi');

    await client.query('ROLLBACK');
    console.log('test-membership-category-integration: OK (reformer y multi reembolsan al bucket correcto)');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('test-membership-category-integration: FAIL');
    console.error(e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
