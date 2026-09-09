import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { assertMembershipDailyLimit, MembershipDailyLimitError } from '../src/lib/membershipDailyLimit.js';
import { toDbClient } from '../src/lib/membershipSelection.js';

// Fast contract tests also run without PostgreSQL.
let queries = 0;
const emptyDb = { query: async () => { queries++; return { rows: [{ locked: true }], rowCount: 1 }; } };
await assertMembershipDailyLimit({ db: emptyDb, userId: 'u', classId: 'c', remaining: 3 });
assert.equal(queries, 0, 'bounded packs must not acquire a daily limit');
await assert.rejects(
  assertMembershipDailyLimit({ db: { query: async () => ({ rows: [{ locked: false }], rowCount: 1 }) }, userId: 'u', classId: 'c', remaining: null }),
  (e: any) => e instanceof MembershipDailyLimitError && e.code === 'BOOKING_IN_PROGRESS',
);
const routes = readFileSync(new URL('../src/routes/bookings.ts', import.meta.url), 'utf8');
assert.equal((routes.match(/await assertMembershipDailyLimit\(/g) ?? []).length, 3, 'self-service, admin and bulk must enforce');
const waitlist = readFileSync(new URL('../src/lib/waitlist.ts', import.meta.url), 'utf8');
assert.equal((waitlist.match(/await assertMembershipDailyLimit\(/g) ?? []).length, 2, 'join and promotion must enforce');

// Optional real PostgreSQL tests, isolated schema, never app/customer data.
if (process.env.TEST_DATABASE_URL) {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Use a local test database only');
  const pool = new pg.Pool({ connectionString: url.toString() });
  const a = await pool.connect();
  const b = await pool.connect();
  const schema = `daily_test_${randomUUID().replaceAll('-', '')}`;
  const userId = randomUUID();
  const classes = [randomUUID(), randomUUID(), randomUUID()];
  const bookingId = randomUUID();
  const check = (client: pg.PoolClient, classId = classes[1], excludeBookingId?: string) =>
    assertMembershipDailyLimit({ db: toDbClient(client), userId, classId, remaining: null, excludeBookingId });
  const rejectsLimit = (promise: Promise<void>) => assert.rejects(promise, (e: any) => e.code === 'MEMBERSHIP_DAILY_LIMIT');
  try {
    await a.query(`CREATE SCHEMA ${schema}`);
    for (const client of [a, b]) await client.query(`SET search_path TO ${schema}`);
    await a.query(`CREATE TABLE classes (id uuid PRIMARY KEY, date date, status text);
      CREATE TABLE bookings (id uuid PRIMARY KEY, user_id uuid, class_id uuid, status text)`);
    await a.query(`INSERT INTO classes VALUES ($1, '2026-09-14', 'scheduled'), ($2, '2026-09-14', 'scheduled'), ($3, '2026-09-15', 'scheduled')`, classes);
    await a.query('BEGIN');
    await check(a, classes[0]);
    await a.query(`INSERT INTO bookings VALUES ($1, $2, $3, 'confirmed')`, [bookingId, userId, classes[0]]);
    await rejectsLimit(check(a)); // Also catches a second class in one bulk transaction.
    await b.query('BEGIN');
    await assert.rejects(check(b), (e: any) => e.code === 'BOOKING_IN_PROGRESS');
    await b.query('ROLLBACK');
    await a.query('COMMIT');
    await b.query('BEGIN');
    await rejectsLimit(check(b)); // Retried request sees the committed booking.
    await b.query('ROLLBACK');
    await a.query('BEGIN');
    await check(a, classes[2]); // Unlimited across separate days.
    await check(a, classes[0], bookingId); // Promotion doesn't conflict with itself.
    for (const status of ['waitlist', 'attended', 'no_show']) {
      await a.query('UPDATE bookings SET status = $1', [status]);
      await rejectsLimit(check(a));
    }
    await a.query(`UPDATE bookings SET status = 'cancelled'`);
    await check(a);
    await a.query(`UPDATE bookings SET status = 'confirmed'; UPDATE classes SET status = 'cancelled' WHERE id = '${classes[0]}'`);
    await check(a);
    await a.query('ROLLBACK');
    // Rollback must release the lock and leave no new booking behind.
    await b.query('BEGIN');
    await check(b, classes[2]);
    await b.query('ROLLBACK');
    console.log('PostgreSQL: daily limits, statuses, promotion exclusion, bulk and concurrency OK');
  } finally {
    await a.query('ROLLBACK');
    await b.query('ROLLBACK');
    await a.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    a.release(); b.release(); await pool.end();
  }
}
console.log('test-membership-daily-limit: OK');
