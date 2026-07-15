import assert from 'node:assert/strict';
import { isSamplePurchaseAllowed } from '../src/lib/loyalty.js';

// No active package memberships, never used sample before → allowed
assert.equal(isSamplePurchaseAllowed(0), true);
assert.equal(isSamplePurchaseAllowed(0, false), true);
// Has at least one active package membership → blocked
assert.equal(isSamplePurchaseAllowed(1), false);
assert.equal(isSamplePurchaseAllowed(3), false);
// No active package, but already used the Clase Muestra before (even if it lapsed) → blocked
assert.equal(isSamplePurchaseAllowed(0, true), false);
// Both conditions against her → still blocked
assert.equal(isSamplePurchaseAllowed(2, true), false);

console.log('test-can-buy-sample: OK');
