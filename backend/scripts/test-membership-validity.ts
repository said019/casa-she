import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { membershipValidityForClassDate } from '../src/lib/membershipValidity.js';

const base = { status: 'active', start_date: '2026-09-28', end_date: '2026-10-28' };

assert.deepEqual(membershipValidityForClassDate(base, '2026-09-27'), {
  ok: false,
  code: 'MEMBERSHIP_NOT_STARTED',
  message: 'La membresía inicia el 2026-09-28 y no cubre esta clase.',
});
assert.equal(membershipValidityForClassDate(base, '2026-09-28').ok, true);
assert.equal(membershipValidityForClassDate(base, '2026-10-28').ok, true);
assert.equal(membershipValidityForClassDate(base, '2026-10-29').ok, false);
assert.equal(membershipValidityForClassDate({ ...base, status: 'paused' }, '2026-10-01').ok, false);

const bookings = readFileSync(new URL('../src/routes/bookings.ts', import.meta.url), 'utf8');
assert.match(bookings, /FOR UPDATE OF m/);
assert.match(bookings, /membershipValidityForClassDate\(membership, dateStr\)/);
assert.match(bookings, /membershipValidityForClassDate\(membership, membershipDateOnly\(c\.date\)\)/);

const memberships = readFileSync(new URL('../src/routes/memberships.ts', import.meta.url), 'utf8');
assert.match(memberships, /startDate: dateString/);
assert.match(memberships, /MEMBERSHIP_DATE_CONFLICT/);
assert.match(memberships, /SELECT \* FROM memberships WHERE id = \$1 FOR UPDATE/);
assert.match(
  memberships,
  /router\.post\('\/assign-cash', authenticate, requireRole\('admin', 'super_admin', 'reception'\)/,
);

const cashShifts = readFileSync(new URL('../src/routes/cash-shifts.ts', import.meta.url), 'utf8');
assert.match(cashShifts, /if \(!startStr\)/);

const startPicker = readFileSync(
  new URL('../../frontend/src/components/memberships/MembershipStartPicker.tsx', import.meta.url),
  'utf8',
);
assert.match(startPicker, /Iniciar hoy/);
assert.match(startPicker, /Elegir fecha/);

console.log('test-membership-validity: OK');
