import assert from 'node:assert/strict';
import { pool } from '../src/config/database.js';
import { resolveFacilityScope } from '../src/lib/facilityScope.js';

async function main() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const one = async (s: string, p: any[] = []) => (await c.query(s, p)).rows[0];
    const tepa = await one(`SELECT id FROM facilities WHERE name='BMB Studio Tepa'`);
    const sanmi = await one(`SELECT id FROM facilities WHERE name='BMB Studio San Miguel'`);
    assert.ok(tepa && sanmi, 'faltan sucursales sembradas');

    const recep = await one(`INSERT INTO users (email,phone,display_name,role,default_facility_id) VALUES ($1,$2,'Recep Tepa','reception',$3) RETURNING id, role, default_facility_id`,
      [`rt_${Date.now()}@t.local`, `55${Date.now()}`.slice(0,12), tepa.id]);

    const ctype = await one(`SELECT id FROM class_types LIMIT 1`);
    const uinst = await one(`INSERT INTO users (email,phone,display_name,role) VALUES ($1,$2,'Coach','instructor') RETURNING id`, [`co_${Date.now()}@t.local`, `56${Date.now()}`.slice(0,12)]);
    const inst = await one(`INSERT INTO instructors (user_id,display_name) VALUES ($1,'Coach') RETURNING id`, [uinst.id]);
    const mk = async (fac: string) => one(`INSERT INTO classes (class_type_id,instructor_id,facility_id,date,start_time,end_time,max_capacity,is_free,status) VALUES ($1,$2,$3,CURRENT_DATE,'10:00','10:50',8,false,'scheduled') RETURNING id, facility_id`, [ctype.id, inst.id, fac]);
    const classTepa = await mk(tepa.id);
    const classSanMi = await mk(sanmi.id);

    const scope = resolveFacilityScope({ role: 'reception', assignedFacilityId: recep.default_facility_id, requestedFacilityId: null });
    assert.equal(scope.kind, 'facility');
    const allowed = (cls: any) => scope.kind === 'facility' && cls.facility_id === scope.facilityId;
    assert.equal(allowed(classTepa), true, 'recepcionista de Tepa SÍ opera clase de Tepa');
    assert.equal(allowed(classSanMi), false, 'recepcionista de Tepa NO opera clase de San Miguel');

    const adminScope = resolveFacilityScope({ role: 'admin', assignedFacilityId: null, requestedFacilityId: null });
    assert.equal(adminScope.kind, 'all', 'admin ve ambas');

    await c.query('ROLLBACK');
    console.log('test-multisucursal-integration: OK');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('test-multisucursal-integration: FAIL'); console.error(e); process.exitCode = 1;
  } finally { c.release(); await pool.end(); }
}
main();
