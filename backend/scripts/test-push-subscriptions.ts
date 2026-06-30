import assert from 'node:assert/strict';
import { query } from '../src/config/database.js';

async function main() {
    // Tomar un usuario cliente cualquiera para el FK
    const users = await query<{ id: string }>(`SELECT id FROM users LIMIT 1`);
    assert.ok(users[0], 'se necesita al menos un usuario en la BD');
    const userId = users[0].id;
    const endpoint = 'https://example.com/test-endpoint-' + Date.now();

    // upsert por endpoint
    const upsert = async () => query(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, last_active_at = now()`,
        [userId, endpoint, 'p256', 'auth', 'test-agent'],
    );
    await upsert();
    await upsert(); // segunda vez: NO debe duplicar

    const count = await query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
    assert.equal(count[0].n, '1', 'el upsert por endpoint no debe duplicar');

    // delete
    await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
    const after = await query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
    assert.equal(after[0].n, '0');

    console.log('test-push-subscriptions OK');
    process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
