import assert from 'node:assert/strict';
import { pool } from '../src/config/database.js';
import { capacityError } from '../src/lib/schedule.js';

async function main() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const one = async (s: string, p: any[] = []) => (await c.query(s, p)).rows[0];

    const tepa = await one(`SELECT id FROM facilities WHERE name='BMB Studio Tepa'`);
    const ct = await one(`SELECT id, category FROM class_types WHERE category='reformer' LIMIT 1`);
    assert.ok(tepa && ct, 'faltan fixtures (facility/class_type reformer)');
    const u = await one(`INSERT INTO users (email,phone,display_name,role) VALUES ($1,$2,'Inst Test','instructor') RETURNING id`, [`inst_${Date.now()}@t.local`, `55${Date.now()}`.slice(0,12)]);
    const inst = await one(`INSERT INTO instructors (user_id, display_name) VALUES ($1,'Inst Test') RETURNING id`, [u.id]);

    // (a) schedule con facility_id se guarda
    const sched = await one(
      `INSERT INTO schedules (class_type_id, instructor_id, facility_id, day_of_week, start_time, end_time, max_capacity, is_recurring, is_active)
       VALUES ($1,$2,$3,1,'07:10','08:00',8,true,true) RETURNING *`,
      [ct.id, inst.id, tepa.id]);
    assert.equal(sched.facility_id, tepa.id, 'schedule guarda facility_id');

    // (b) la clase generada copia facility_id del schedule
    const cls = await one(
      `INSERT INTO classes (schedule_id, class_type_id, instructor_id, facility_id, date, start_time, end_time, max_capacity)
       VALUES ($1,$2,$3,$4,CURRENT_DATE,'07:10','08:00',8) RETURNING *`,
      [sched.id, ct.id, inst.id, sched.facility_id]);
    assert.equal(cls.facility_id, tepa.id, 'clase copia facility_id');

    // (c) filtro por facility + category encuentra la clase
    const filtered = await c.query(
      `SELECT c.id FROM classes c JOIN class_types t ON t.id=c.class_type_id
       WHERE c.date=CURRENT_DATE AND c.facility_id=$1 AND t.category='reformer'`, [tepa.id]);
    assert.ok(filtered.rows.find((r: any) => r.id === cls.id), 'filtro facility+category encuentra la clase');

    // (d) backfill: clase con facility NULL se rellena desde el schedule
    const nullCls = await one(
      `INSERT INTO classes (schedule_id, class_type_id, instructor_id, date, start_time, end_time, max_capacity)
       VALUES ($1,$2,$3,CURRENT_DATE,'09:10','10:00',8) RETURNING id`, [sched.id, ct.id, inst.id]);
    await c.query(`UPDATE classes c SET facility_id=s.facility_id FROM schedules s WHERE c.schedule_id=s.id AND c.facility_id IS NULL AND s.facility_id IS NOT NULL`);
    assert.equal((await one(`SELECT facility_id FROM classes WHERE id=$1`, [nullCls.id])).facility_id, tepa.id, 'backfill llena facility_id');

    // (e) cap Reformer
    assert.equal(capacityError('reformer', 8), null);
    assert.ok(capacityError('reformer', 9));

    await c.query('ROLLBACK');
    console.log('test-calendar-integration: OK');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('test-calendar-integration: FAIL'); console.error(e); process.exitCode = 1;
  } finally { c.release(); await pool.end(); }
}
main();
