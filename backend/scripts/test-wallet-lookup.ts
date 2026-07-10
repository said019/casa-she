import assert from 'node:assert/strict';
import { pool, queryOne } from '../src/config/database.js';
import { verifyQrPayload } from '../src/lib/qr.js';
import { createHash } from 'node:crypto';

async function buildRaw(userId: string, ms: string | null, expiresAt: number) {
  const secret = process.env.CHECKIN_SECRET || 'walletclub-dev';
  const h = createHash('sha256').update(`${userId}:${ms || 'none'}:${expiresAt}:${secret}`).digest('hex');
  return Buffer.from(JSON.stringify({ t: 'checkin', m: userId, ms, e: expiresAt, h })).toString('base64url');
}

async function resolveLookup(input: { qrPayload?: string; membershipId?: string; userId?: string }): Promise<string | null> {
  if (input.userId) return input.userId;
  if (input.qrPayload) {
    const v = verifyQrPayload(input.qrPayload);
    if (!v) return null;
    return v.userId;
  }
  if (input.membershipId) {
    const m = await queryOne<{ user_id: string }>(`SELECT user_id FROM memberships WHERE id = $1`, [input.membershipId]);
    return m?.user_id ?? null;
  }
  return null;
}

async function main() {
  const client = await pool.connect();
  let cliId: string | null = null;
  let planId: string | null = null;
  let memId: string | null = null;
  try {
    // Adapted: real `users` table has NO `name` column; requires `phone` + `display_name` NOT NULL.
    // Inserts are COMMITTED so the pool-backed `queryOne` in resolveLookup can see them
    // (pool uses a different connection — uncommitted rows in a tx are invisible to it).
    const cli = await client.query(
      `INSERT INTO users (email, display_name, phone, role, loyalty_points)
       VALUES ('cli-lk@test', 'cli', '5550000001', 'client', 250) RETURNING id`
    );
    cliId = cli.rows[0].id;

    // vía userId
    assert.equal(await resolveLookup({ userId: cliId }), cliId, 'userId directo');

    // vía qrPayload válido
    const future = Math.floor(Date.now() / 1000) + 3600;
    assert.equal(await resolveLookup({ qrPayload: await buildRaw(cliId, null, future) }), cliId, 'qrPayload válido');

    // vía membershipId — memberships.plan_id is NOT NULL, so insert a plan first.
    const plan = await client.query(
      `INSERT INTO plans (name, price, duration_days) VALUES ('plan-lk-test', 0, 30) RETURNING id`
    );
    planId = plan.rows[0].id;
    const mem = await client.query(
      `INSERT INTO memberships (user_id, plan_id, status) VALUES ($1, $2, 'active') RETURNING id`,
      [cliId, planId]
    );
    memId = mem.rows[0].id;
    assert.equal(await resolveLookup({ membershipId: memId }), cliId, 'membershipId crudo');

    // membershipId inexistente
    assert.equal(await resolveLookup({ membershipId: '00000000-0000-0000-0000-000000000099' }), null, 'membership inexistente → null');

    // qrPayload expirado
    const past = Math.floor(Date.now() / 1000) - 3600;
    assert.equal(await resolveLookup({ qrPayload: await buildRaw(cliId, null, past) }), null, 'expirado → null');

    console.log('OK: lookup resuelve las 3 vías');
  } finally {
    // Cleanup committed test rows.
    try {
      if (memId) await client.query(`DELETE FROM memberships WHERE id = $1`, [memId]);
      if (planId) await client.query(`DELETE FROM plans WHERE id = $1`, [planId]);
      if (cliId) await client.query(`DELETE FROM users WHERE id = $1`, [cliId]);
    } catch (e) {
      console.error('cleanup error:', e);
    }
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });