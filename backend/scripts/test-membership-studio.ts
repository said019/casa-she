import assert from 'node:assert/strict';
import { studioBookingError } from '../src/lib/membershipStudio.js';

assert.equal(studioBookingError(null, 'fac-wunda', 'Wunda'), null);
assert.equal(studioBookingError('fac-wunda', 'fac-wunda', 'Wunda'), null);
const msg = studioBookingError('fac-wunda', 'fac-barre', 'Wunda');
assert.ok(msg && msg.includes('Wunda'), 'debe mencionar el estudio atado');
assert.ok(msg && msg.toLowerCase().includes('individual'), 'debe mencionar paquete individual');
assert.ok(studioBookingError('fac-wunda', null, 'Wunda'));

console.log('test-membership-studio: OK');
