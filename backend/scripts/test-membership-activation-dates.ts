import assert from 'node:assert/strict';
import { addDaysToDate, cdmxToday } from '../src/lib/schedule.js';
import { resolvePaidMembershipDates } from '../src/lib/membershipActivation.js';

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

const explicit = await resolvePaidMembershipDates(db, {
  userId: 'client-2', durationDays: 30, explicitStartDate: '2026-09-10', today: '2026-08-29',
});
assert.deepEqual(explicit, {
  startDate: '2026-09-10', endDate: '2026-10-10', previousMembershipId: null,
});

console.log('✅ Casa Shé: fecha nocturna, vigencia inclusiva y programación explícita');
