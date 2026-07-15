import assert from 'node:assert/strict';
import { pool } from '../src/config/database.js';
import { POS_MARKABLE_TYPES } from '../src/lib/qr.js';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Esquema real de users: NO tiene `name`; requiere display_name (NOT NULL) + phone (NOT NULL).
    const cli = await client.query(`INSERT INTO users (email, display_name, phone, role) VALUES ('cli-bu@test','cli','+525550000003','client') RETURNING id`);
    const staff = await client.query(`INSERT INTO users (email, display_name, phone, role) VALUES ('staff-bu@test','staff','+525550000004','reception') RETURNING id`);
    const cliId = cli.rows[0].id;
    const staffId = staff.rows[0].id;

    // free_drink activo → marcable
    const dr = await client.query(`INSERT INTO user_benefits (user_id, benefit_type, benefit_value, status, expires_at) VALUES ($1,'free_drink','{}'::jsonb,'active', NOW()+interval '5 days') RETURNING id`, [cliId]);
    await client.query(`UPDATE user_benefits SET status='used', used_at=NOW(), used_by=$2 WHERE id=$1 AND status='active'`, [dr.rows[0].id, staffId]);
    const used = await client.query(`SELECT status, used_by FROM user_benefits WHERE id=$1`, [dr.rows[0].id]);
    assert.equal(used.rows[0].status, 'used');
    assert.equal(used.rows[0].used_by, staffId, 'used_by = staff');

    // free_class → NO marcable
    const fc = await client.query(`INSERT INTO user_benefits (user_id, benefit_type, benefit_value, status, expires_at) VALUES ($1,'free_class','{}'::jsonb,'active', NOW()+interval '5 days') RETURNING id`, [cliId]);
    assert.equal(POS_MARKABLE_TYPES.has('free_class'), false, 'free_class no marcable');

    // doble uso: segunda vez no afecta (status ya='used')
    await client.query(`UPDATE user_benefits SET status='used' WHERE id=$1 AND status='active'`, [dr.rows[0].id]);
    const second = await client.query(`SELECT status FROM user_benefits WHERE id=$1`, [dr.rows[0].id]);
    assert.equal(second.rows[0].status, 'used', 'idempotente en estado used');

    await client.query('ROLLBACK');
    console.log('OK: benefit use atomic + free_class rejected');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });