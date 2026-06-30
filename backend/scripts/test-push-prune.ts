import assert from 'node:assert/strict';
import { shouldPrune } from '../src/lib/web-push.js';

// 404/410 = suscripción muerta → purgar
assert.equal(shouldPrune(404), true);
assert.equal(shouldPrune(410), true);
// otros códigos → conservar
assert.equal(shouldPrune(429), false);
assert.equal(shouldPrune(500), false);
assert.equal(shouldPrune(201), false);

console.log('test-push-prune OK');
