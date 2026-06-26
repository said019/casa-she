import assert from 'node:assert/strict';
import { buildAuditRow } from '../src/lib/audit.js';

// old/new se serializan a JSON; entity_id se mapea; sin req → ip/user_agent null
const r1 = buildAuditRow({
  adminUserId: 'a1', actionType: 'credits_modified', entityType: 'membership',
  entityId: 'm1', description: 'ajuste', oldData: { multi_remaining: 8 }, newData: { multi_remaining: 5 },
});
assert.equal(r1.admin_user_id, 'a1');
assert.equal(r1.action_type, 'credits_modified');
assert.equal(r1.entity_type, 'membership');
assert.equal(r1.entity_id, 'm1');
assert.equal(r1.description, 'ajuste');
assert.equal(r1.old_data, '{"multi_remaining":8}');
assert.equal(r1.new_data, '{"multi_remaining":5}');
assert.equal(r1.ip_address, null);
assert.equal(r1.user_agent, null);

// old/new ausentes → null; description ausente → null; entityId ausente → null
const r2 = buildAuditRow({
  adminUserId: 'a1', actionType: 'cash_movement', entityType: 'cash_shift',
  newData: { type: 'cash_out', amount: 100 },
});
assert.equal(r2.old_data, null);
assert.equal(r2.new_data, '{"type":"cash_out","amount":100}');
assert.equal(r2.description, null);
assert.equal(r2.entity_id, null);

// req → captura ip + user-agent (header en minúsculas)
const r3 = buildAuditRow({
  adminUserId: 'a1', actionType: 'x', entityType: 'user',
  req: { ip: '127.0.0.1', headers: { 'user-agent': 'jest' } },
});
assert.equal(r3.ip_address, '127.0.0.1');
assert.equal(r3.user_agent, 'jest');

// user-agent no-string → null (defensivo)
const r4 = buildAuditRow({ adminUserId: 'a1', actionType: 'x', entityType: 'user', req: { headers: {} } });
assert.equal(r4.ip_address, null);
assert.equal(r4.user_agent, null);

console.log('test-audit: OK');
