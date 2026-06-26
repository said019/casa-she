import assert from 'node:assert/strict';
import { isSamplePurchaseAllowed } from '../src/lib/loyalty.js';

// No active package memberships → allowed
assert.equal(isSamplePurchaseAllowed(0), true);
// Has at least one active package membership → blocked
assert.equal(isSamplePurchaseAllowed(1), false);
assert.equal(isSamplePurchaseAllowed(3), false);

console.log('test-can-buy-sample: OK');
