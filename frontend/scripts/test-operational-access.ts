import assert from 'node:assert/strict';
import { isReceptionAccount, withOperationalAccess } from '../src/lib/operationalAccess';

const reception = withOperationalAccess({ role: 'reception' } as any);
assert.equal(reception.role, 'admin');
assert.equal(reception.account_role, 'reception');
assert.equal(isReceptionAccount(reception), true);

const admin = withOperationalAccess({ role: 'admin' } as any);
assert.equal(admin.role, 'admin');
assert.equal(admin.account_role, 'admin');
assert.equal(isReceptionAccount(admin), false);

assert.deepEqual(withOperationalAccess(reception), reception, 'la normalización debe ser idempotente');
console.log('✓ recepción usa UI admin sin perder su rol real');
