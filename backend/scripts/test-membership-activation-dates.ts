import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addDaysToDate, cdmxToday } from '../src/lib/schedule.js';
import {
  civilDate,
  MembershipDateInputError,
  resolvePaidMembershipDates,
  resolveStaffMembershipDates,
} from '../src/lib/membershipActivation.js';

assert.equal(
  cdmxToday(new Date('2026-08-30T05:30:00Z')),
  '2026-08-29',
  'una compra nocturna debe conservar el día civil del estudio',
);
assert.equal(addDaysToDate('2028-02-27', 2), '2028-02-29');

const calls: Array<{ sql: string; params?: unknown[] }> = [];
const db = {
  async query(sql: string, params?: unknown[]) {
    calls.push({ sql, params });
    if (sql.includes('FROM memberships')) {
      return { rows: [{ id: 'current', end_date: '2026-08-31' }] };
    }
    return { rows: [] };
  },
};

const automatic = await resolvePaidMembershipDates(db, {
  userId: 'client-1', durationDays: 30, today: '2026-08-29',
});
assert.deepEqual(automatic, {
  startDate: '2026-08-29',
  // end_date es inclusiva: nuevo tramo 01-sep + 30 días.
  endDate: '2026-10-01',
  previousMembershipId: 'current',
});
assert.match(calls[0].sql, /pg_advisory_xact_lock/);
assert.match(calls[1].sql, /FOR UPDATE/);
assert.doesNotMatch(calls[1].sql, /start_date\s*<=/);

const explicit = await resolvePaidMembershipDates(db, {
  userId: 'client-2', durationDays: 30, explicitStartDate: '2026-09-10', today: '2026-08-29',
});
assert.deepEqual(explicit, {
  startDate: '2026-09-10', endDate: '2026-10-10', previousMembershipId: null,
});

const futureDb = {
  async query(sql: string) {
    return sql.includes('FROM memberships')
      ? { rows: [{ id: 'future-paid', end_date: '2026-10-10' }] }
      : { rows: [] };
  },
};
const preservesFuture = await resolvePaidMembershipDates(futureDb, {
  userId: 'client-future', durationDays: 30, today: '2026-08-29',
});
assert.deepEqual(preservesFuture, {
  startDate: '2026-08-29',
  endDate: '2026-11-10',
  previousMembershipId: 'future-paid',
});

const staffToday = await resolveStaffMembershipDates(db, {
  userId: 'client-staff',
  durationDays: 30,
  requestedStartDate: '2026-08-29',
  requestedEndDate: '2026-09-28',
  today: '2026-08-29',
});
assert.equal(staffToday.endDate, '2026-10-01');
assert.equal(staffToday.mode, 'automatic');
const staffFuture = await resolveStaffMembershipDates(db, {
  userId: 'client-scheduled',
  durationDays: 30,
  requestedStartDate: '2026-09-10',
  requestedEndDate: '2026-10-15',
  today: '2026-08-29',
});
assert.deepEqual(staffFuture, {
  startDate: '2026-09-10', endDate: '2026-10-15', previousMembershipId: null, mode: 'scheduled',
});

assert.equal(civilDate('2026-13-40'), null);
assert.equal(civilDate('2026-02-29'), null);
assert.equal(civilDate('2028-02-29'), '2028-02-29');
await assert.rejects(
  () => resolveStaffMembershipDates(db, {
    userId: 'bad-date', durationDays: 30, requestedStartDate: '2026-99-99', today: '2026-08-29',
  }),
  MembershipDateInputError,
);

const membershipsRoute = readFileSync(new URL('../src/routes/memberships.ts', import.meta.url), 'utf8');
assert.ok(
  (membershipsRoute.match(/resolveStaffMembershipDates\(client/g) || []).length >= 3,
  'assign, assign-cash y activate deben resolver vigencia dentro de la transacción',
);
const cashRoute = readFileSync(new URL('../src/routes/cash-shifts.ts', import.meta.url), 'utf8');
assert.match(cashRoute, /resolveStaffMembershipDates\(client/);
assert.doesNotMatch(cashRoute, /Elige cuándo inicia la membresía/);

console.log('✅ Casa Shé: noche, futuro pagado, rutas staff y fechas reales');
