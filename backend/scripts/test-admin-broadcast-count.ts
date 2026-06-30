import assert from 'node:assert/strict';
import { countBroadcastRecipients } from '../src/routes/admin-push.js';

async function main() {
    const n = await countBroadcastRecipients();
    assert.ok(typeof n === 'number' && n >= 0, 'debe devolver un número >= 0');
    console.log('test-admin-broadcast-count OK (recipients=' + n + ')');
    process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
