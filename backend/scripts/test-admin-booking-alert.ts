import assert from 'node:assert/strict';
import {
    buildAdminBookingAlertMessage,
    getAdminBookingAlertRecipients,
} from '../src/lib/admin-booking-alert.js';

assert.deepEqual(
    getAdminBookingAlertRecipients('+52 55 3886 1972, +52 55 4182 2309; +525541822309'),
    ['+525538861972', '+525541822309'],
    'accepts multiple recipients, normalizes spaces, and removes duplicates',
);

assert.deepEqual(
    getAdminBookingAlertRecipients('invalid, +525541822309'),
    ['+525541822309'],
    'ignores invalid recipients',
);

const message = buildAdminBookingAlertMessage({
    clientName: 'Ana Pérez',
    className: 'Reformer',
    date: '2026-07-30',
    time: '08:00',
    instructorName: 'Regina',
    facilityName: 'Condesa',
});

assert.match(message, /Nueva reserva en Casa Shé/);
assert.match(message, /Ana Pérez/);
assert.match(message, /Reformer · jueves 30 jul, 08:00/);
assert.match(message, /Coach: Regina/);
assert.match(message, /Sede: Condesa/);

console.log('test-admin-booking-alert: OK');
