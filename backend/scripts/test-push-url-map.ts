import assert from 'node:assert/strict';
import { pushUrlForType } from '../src/lib/in-app-notifications.js';

assert.equal(pushUrlForType('booking_reminder'), '/app/classes');
assert.equal(pushUrlForType('class_cancelled'), '/app/classes');
assert.equal(pushUrlForType('waitlist_promoted'), '/app/classes');
assert.equal(pushUrlForType('membership_expiring'), '/app/checkout');
assert.equal(pushUrlForType('points_earned'), '/app/wallet');
// tipo no mapeado → home de la app
assert.equal(pushUrlForType('promotion'), '/app');

console.log('test-push-url-map OK');
