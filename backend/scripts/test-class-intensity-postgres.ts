import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { classIntensityDDL } from '../src/lib/classIntensity.js';
import { copiarSemana } from '../src/lib/copy-week.js';

const url = new URL(process.env.TEST_DATABASE_URL || '');
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'Local test DB required');
const pool = new pg.Pool({ connectionString: url.toString() });
const db = await pool.connect();
const schema = `intensity_${randomUUID().replaceAll('-', '')}`;
try {
  await db.query('BEGIN');
  await db.query(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema}`);
  await db.query(`
    CREATE TYPE class_status AS ENUM ('scheduled', 'cancelled');
    CREATE TABLE schedules (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE class_types (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
    CREATE TABLE classes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), schedule_id uuid,
      class_type_id uuid, instructor_id uuid, facility_id uuid, date date,
      start_time time, end_time time, max_capacity int, status class_status DEFAULT 'scheduled');
    CREATE UNIQUE INDEX slot ON classes (date,start_time,instructor_id,class_type_id,facility_id) WHERE status='scheduled';
    CREATE TABLE channel_inventory (class_id uuid, channel text, max_spots int);
    CREATE TABLE studio_closed_days (date date);
    CREATE FUNCTION studio_today() RETURNS date LANGUAGE SQL AS $$ SELECT DATE '2026-09-10' $$;
  `);
  await db.query(classIntensityDDL);
  await db.query(classIntensityDDL); // Repeated deployment is safe.
  const schedule = (await db.query(`INSERT INTO schedules (intensity) VALUES (1) RETURNING id`)).rows[0].id;
  const type = (await db.query(`INSERT INTO class_types (name) VALUES ('Pilates Mat') RETURNING id`)).rows[0].id;
  const instructor = randomUUID(), facility = randomUUID();
  for (const [day, intensity, status] of [[14, 3, 'scheduled'], [15, null, 'scheduled'], [16, 2, 'cancelled']] as const) {
    await db.query(`INSERT INTO classes (schedule_id,class_type_id,instructor_id,facility_id,date,start_time,end_time,max_capacity,status,intensity)
      VALUES ($1,$2,$3,$4,$5,'08:00','09:00',8,$6,$7)`, [schedule,type,instructor,facility,`2026-09-${day}`,status,intensity]);
  }
  const params = { fromWeekStart: '2026-09-14', toWeekStart: '2026-09-21', includeCancelled: true };
  assert.equal((await copiarSemana(db, { ...params, dryRun: true })).creadas, 3);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM classes')).rows[0].n, 3);
  assert.equal((await copiarSemana(db, params)).creadas, 3);
  assert.deepEqual((await db.query(`SELECT intensity FROM classes WHERE date >= '2026-09-21' ORDER BY date`)).rows.map(r => r.intensity), [3,null,2]);
  assert.equal((await copiarSemana(db, params)).creadas, 0, 'repeated copy stays idempotent');
  assert.equal((await db.query('SELECT intensity FROM schedules')).rows[0].intensity, 1, 'session values do not change the template');
  for (const table of ['classes', 'schedules']) {
    await db.query('SAVEPOINT invalid_value');
    await assert.rejects(db.query(`UPDATE ${table} SET intensity=4`), (e: any) => e.code === '23514');
    await db.query('ROLLBACK TO SAVEPOINT invalid_value');
  }
  console.log('PostgreSQL intensity: DDL, range, copy, null, cancelled, dry-run, idempotency and isolation OK');
} finally {
  await db.query('ROLLBACK'); // Includes all test schema/data.
  db.release(); await pool.end();
}
