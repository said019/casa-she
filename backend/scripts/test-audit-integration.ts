import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { pool } from '../src/config/database.js';
import { logAction } from '../src/lib/audit.js';

async function main() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const exec = (t: string, p?: any[]) => c.query(t, p);
    const one = async (s: string, p: any[] = []) => (await c.query(s, p)).rows[0];

    // admin que ejecuta las acciones (FK admin_actions.admin_user_id → users.id)
    const admin = await one(
      `INSERT INTO users (email, phone, display_name, role) VALUES ($1, $2, 'Audit Admin', 'admin') RETURNING id`,
      [`auditadmin_${Date.now()}@t.local`, `56${Date.now()}`.slice(0, 12)]
    );
    const membershipId = randomUUID();
    const shiftId = randomUUID();

    // 1) credits_modified con old/new
    await logAction(exec, {
      adminUserId: admin.id, actionType: 'credits_modified', entityType: 'membership',
      entityId: membershipId, description: 'ajuste',
      oldData: { multi_remaining: 8 }, newData: { multi_remaining: 5 },
    });
    // 2) cash_movement solo new
    await logAction(exec, {
      adminUserId: admin.id, actionType: 'cash_movement', entityType: 'cash_shift',
      entityId: shiftId, newData: { type: 'cash_out', amount: 100 },
    });

    // El SELECT del endpoint (misma query) devuelve ambas filas con admin_name
    const rows = (await c.query(
      `SELECT a.*, u.display_name AS admin_name, u.role AS admin_role
       FROM admin_actions a LEFT JOIN users u ON u.id = a.admin_user_id
       WHERE a.admin_user_id = $1 ORDER BY a.created_at DESC`,
      [admin.id]
    )).rows;
    assert.equal(rows.length, 2, 'se registraron 2 acciones');

    const credits = rows.find((r: any) => r.action_type === 'credits_modified');
    assert.ok(credits, 'existe credits_modified');
    assert.equal(credits.entity_type, 'membership');
    assert.equal(credits.entity_id, membershipId);
    assert.equal(credits.admin_name, 'Audit Admin');
    assert.equal(credits.admin_role, 'admin');
    // jsonb se devuelve ya parseado como objeto JS
    assert.deepEqual(credits.old_data, { multi_remaining: 8 });
    assert.deepEqual(credits.new_data, { multi_remaining: 5 });

    const cash = rows.find((r: any) => r.action_type === 'cash_movement');
    assert.ok(cash, 'existe cash_movement');
    assert.equal(cash.old_data, null, 'sin old_data → null');
    assert.deepEqual(cash.new_data, { type: 'cash_out', amount: 100 });

    // Filtro por action_type (como hace el endpoint)
    const onlyCash = (await c.query(
      `SELECT * FROM admin_actions WHERE admin_user_id = $1 AND action_type = $2`,
      [admin.id, 'cash_movement']
    )).rows;
    assert.equal(onlyCash.length, 1, 'filtro por action devuelve solo cash_movement');

    await c.query('ROLLBACK');
    console.log('test-audit-integration: OK');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('test-audit-integration: FAIL'); console.error(e); process.exitCode = 1;
  } finally {
    c.release(); await pool.end();
  }
}
main();
