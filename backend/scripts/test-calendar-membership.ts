import assert from 'node:assert/strict';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { levantarServidorLocal, http } from './helpers/servidor-local.js';

// Runs against an isolated local clone. No mail credentials or production access.
const server = await levantarServidorLocal(3296);
const db = new Pool({ connectionString: server.databaseUrl });
const one = async (sql: string, args: any[] = []) => (await db.query(sql, args)).rows[0];
const failures: string[] = [];
const test = async (name: string, fn: () => Promise<void>) => {
    try { await fn(); console.log(`PASS ${name}`); }
    catch (e) { failures.push(name); console.error(`FAIL ${name}`, e); }
};
try {
    const user = async (role: string, name: string, phone: string) => one(`INSERT INTO users (email, phone, display_name, role, password_hash) VALUES ($1,$2,$3,$4,'unused') RETURNING *`, [`${name}@calendar.test`, phone, name, role]);
    const admin = await user('admin', 'calendar-admin', '5511111101');
    const receptionist = await user('reception', 'calendar-reception', '5511111102');
    const master = await user('reception', 'calendar-master', '5511111105');
    const permitted = await user('reception', 'calendar-permitted', '5511111106');
    const superAdmin = await user('super_admin', 'calendar-super', '5511111107');
    await db.query('UPDATE users SET is_reception_master=true WHERE id=$1', [master.id]);
    await db.query(`UPDATE users SET permissions='{"creditos_sin_limite":true}'::jsonb WHERE id=$1`, [permitted.id]);
    const owner = await user('client', 'calendar-owner', '5511111103');
    const guest = await user('client', 'calendar-guest', '+52 55 1111 1104');
    const token = (u: any) => jwt.sign({ userId: u.id, role: u.role }, 'prueba-local-no-es-produccion', { expiresIn: '1h' });
    const call = (method: string, path: string, body?: any, actor = admin) => http(server.api, method, path, token(actor), body);
    const plan = await one(`INSERT INTO plans(name,price,currency,duration_days,reformer_credits,multi_credits,is_active) VALUES ('Calendar plan',900,'MXN',30,3,7,true) RETURNING *`);
    const dates = await one(`SELECT (NOW() AT TIME ZONE 'America/Mexico_City')::date::text today, ((NOW() AT TIME ZONE 'America/Mexico_City')::date-3)::text past, ((NOW() AT TIME ZONE 'America/Mexico_City')::date+12)::text expiry`);
    const membership = await one(`INSERT INTO memberships(user_id,plan_id,status,start_date,end_date,reformer_remaining,multi_remaining,classes_remaining) VALUES ($1,$2,'active',$3,$4,3,7,10) RETURNING *`, [owner.id, plan.id, dates.today, dates.expiry]);
    const type = await one(`INSERT INTO class_types(name,category,max_capacity) VALUES ('Calendar fixture','multi',10) RETURNING id`);
    const instructor = await one(`SELECT id FROM instructors LIMIT 1`);
    const cls = async (date: string, status = 'scheduled') => one(`INSERT INTO classes(class_type_id,instructor_id,date,start_time,end_time,max_capacity,status) VALUES ($1,$2,$3,'12:00','13:00',10,$4) RETURNING id`, [type.id, instructor.id, date, status]);
    const upcoming = await cls(dates.expiry);
    const past = await cls(dates.past);
    const cancelled = await cls(dates.expiry, 'cancelled');
    await db.query(`INSERT INTO bookings(class_id,user_id,membership_id,status) VALUES ($1,$2,$3,'confirmed'),($1,$4,$3,'confirmed'),($5,$2,$3,'checked_in'),($5,$4,$3,'checked_in'),($6,$2,$3,'confirmed')`, [upcoming.id, owner.id, membership.id, guest.id, past.id, cancelled.id]);
    await test('summary groups attendance by actual membership AND attendee; excludes cancelled classes', async () => {
        const response = await call('GET', `/bookings/class/${upcoming.id}`);
        assert.equal(response.status, 200);
        const summary = response.json.find((r: any) => r.user_id === owner.id).membership_summary;
        assert.deepEqual(summary, { membership_id: membership.id, owner_id: owner.id, plan_name: plan.name, status: 'active', start_date: dates.today, end_date: dates.expiry, attended: 1, reserved: 1, reformer_remaining: 3, multi_remaining: 7, reformer_credits: 3, multi_credits: 7 });
        assert.equal(response.json.find((r: any) => r.user_id === guest.id).membership_summary.attended, 1);
    });
    await test('credits return updated derived balance and atomically audit', async () => {
        const r = await call('PATCH', `/memberships/${membership.id}/credits`, { multi_remaining: 5, expected_multi_remaining: 7, expected_reformer_remaining: 3, reason: 'Corrección calendario' });
        assert.equal(r.status, 200); assert.equal(r.json.classes_remaining, 8);
        const audit = await one(`SELECT new_data FROM admin_actions WHERE entity_id=$1 AND action_type='credits_modified' ORDER BY created_at DESC LIMIT 1`, [membership.id]);
        assert.equal(audit.new_data.classes_remaining, 8);
    });
    await test('stale credit write fails with 409 without overwriting balance', async () => {
        const r = await call('PATCH', `/memberships/${membership.id}/credits`, { multi_remaining: 6, expected_multi_remaining: 7, reason: 'Valor desactualizado' });
        assert.equal(r.status, 409); assert.equal(r.json.code, 'CREDITS_CHANGED');
        assert.equal((await one('SELECT multi_remaining FROM memberships WHERE id=$1', [membership.id])).multi_remaining, 5);
    });
    await test('calendar credit updates require reason even for admin', async () => {
        assert.equal((await call('PATCH', `/memberships/${membership.id}/credits`, { multi_remaining: 5, expected_multi_remaining: 5 })).status, 400);
    });
    await test('unlimited buckets cannot become finite and finite cannot become unlimited', async () => {
        await db.query('UPDATE memberships SET reformer_remaining=NULL WHERE id=$1', [membership.id]);
        assert.equal((await call('PATCH', `/memberships/${membership.id}/credits`, { reformer_remaining: 2, reason: 'No convertir ilimitado' })).status, 400);
        assert.equal((await call('PATCH', `/memberships/${membership.id}/credits`, { multi_remaining: null, reason: 'No convertir finito' })).status, 400);
    });
    await test('reception delta remains limited to three', async () => {
        assert.equal((await call('PATCH', `/memberships/${membership.id}/credits`, { multi_remaining: 20, reason: 'Fuera del límite' }, receptionist)).status, 403);
    });
    await test('privileged roles and explicitly permitted reception retain larger adjustments', async () => {
        for (const actor of [admin, superAdmin, master, permitted]) {
            assert.equal((await call('PATCH', `/memberships/${membership.id}/credits`, { multi_remaining: 20, reason: 'Ajuste autorizado' }, actor)).status, 200);
            await db.query('UPDATE memberships SET multi_remaining=5 WHERE id=$1', [membership.id]);
        }
    });
    await test('simultaneous stale writes permit only one success', async () => {
        const results = await Promise.all([4,3].map(value => call('PATCH', `/memberships/${membership.id}/credits`, { multi_remaining: value, expected_multi_remaining: 5, reason: 'Cambio simultáneo' })));
        assert.deepEqual(results.map(r => r.status).sort(), [200,409]);
        await db.query('UPDATE memberships SET multi_remaining=5 WHERE id=$1', [membership.id]);
    });
    await test('audit failure rolls credit mutation back', async () => {
        await db.query(`CREATE FUNCTION calendar_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action_type='credits_modified' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER calendar_reject_audit BEFORE INSERT ON admin_actions FOR EACH ROW EXECUTE FUNCTION calendar_reject_audit()`);
        try {
            const before = await one('SELECT multi_remaining FROM memberships WHERE id=$1', [membership.id]);
            assert.equal((await call('PATCH', `/memberships/${membership.id}/credits`, { multi_remaining: 4, reason: 'Auditoría obligatoria' })).status, 500);
            assert.deepEqual(await one('SELECT multi_remaining FROM memberships WHERE id=$1', [membership.id]), before);
        } finally { await db.query('DROP TRIGGER calendar_reject_audit ON admin_actions; DROP FUNCTION calendar_reject_audit()'); }
    });
    await test('assignment respects explicit dates and separate past payment date', async () => {
        const facility = await one('SELECT id FROM facilities LIMIT 1');
        await db.query(`INSERT INTO cash_shifts(facility_id,opened_by,status) VALUES ($1,$2,'open')`, [facility.id, admin.id]);
        const statsBefore = await call('GET', '/stats/cash-payments-today');
        const revenueBefore = await call('GET', `/reports/overview?startDate=${dates.today}&endDate=${dates.today}`);
        const r = await call('POST', '/memberships/assign', { userId: owner.id, planId: plan.id, startDate: dates.today, endDate: dates.expiry, paymentDate: dates.past, paymentMethod: 'cash', respectExplicitDates: true });
        assert.equal(r.status, 201, JSON.stringify(r.json));
        assert.equal(String(r.json.end_date).slice(0,10), dates.expiry);
        const pay = await one(`SELECT (paid_at AT TIME ZONE 'America/Mexico_City')::date::text payment_date, (created_at AT TIME ZONE 'America/Mexico_City')::date::text created_date, shift_id, facility_id FROM payments WHERE membership_id=$1`, [r.json.id]);
        assert.equal(pay.payment_date, dates.past); assert.equal(pay.created_date, dates.today); assert.equal(pay.shift_id, null);
        assert.equal(pay.facility_id, facility.id, 'backdating preserves studio while excluding today’s cash shift');
        const list = await call('GET', `/memberships?userId=${owner.id}`);
        const rows = Array.isArray(list.json) ? list.json : list.json.memberships;
        assert.equal(rows.find((m: any) => m.id === r.json.id).payment_date, dates.past);
        assert.equal((await call('GET', '/stats/cash-payments-today')).json.amountToday, statsBefore.json.amountToday, 'past payment must not inflate cash today');
        assert.equal((await call('GET', `/reports/overview?startDate=${dates.today}&endDate=${dates.today}`)).json.monthlyRevenue, revenueBefore.json.monthlyRevenue, 'past payment must not inflate revenue today');
        const transaction = await call('GET', `/payments/transactions?startDate=${dates.past}T00:00:00-06:00&endDate=${dates.past}T23:59:59-06:00`);
        assert.equal(transaction.status, 200); assert.ok(transaction.json.some((p: any) => p.membership_id === r.json.id));
    });
    await test('legacy assignment still preserves paid validity when start is today', async () => {
        const r = await call('POST', '/memberships/assign', { userId: owner.id, planId: plan.id, startDate: dates.today, endDate: dates.expiry });
        assert.equal(r.status, 201); assert.ok(String(r.json.end_date).slice(0,10) > dates.expiry);
    });
    await test('concurrent assignment retries create one membership and mismatched retries conflict', async () => {
        const body = { userId: owner.id, planId: plan.id, startDate: dates.today, endDate: dates.expiry, paymentMethod: 'cash', idempotencyKey: 'calendar-attempt-00000001' };
        const results = await Promise.all([call('POST', '/memberships/assign', body), call('POST', '/memberships/assign', body)]);
        assert.ok(results.every(r => [200,201].includes(r.status))); assert.equal(results[0].json.id, results[1].json.id);
        assert.equal((await one('SELECT count(*)::int n FROM payments WHERE membership_id=$1', [results[0].json.id])).n, 1);
        assert.equal((await call('POST', '/memberships/assign', { ...body, endDate: dates.today })).status, 409);
    });
    await test('unpaid status cannot create a completed payment', async () => {
        assert.equal((await call('POST', '/memberships/assign', { userId: owner.id, planId: plan.id, startDate: dates.today, paymentMethod: 'cash', status: 'pending_payment' })).status, 400);
    });
    await test('future and invalid payment dates rejected; inactive plans rejected', async () => {
        const body = { userId: owner.id, planId: plan.id, startDate: dates.today, paymentMethod: 'cash' };
        for (const paymentDate of ['2039-01-01', '2026-02-30', '2026-01-01T12:00:00Z']) assert.equal((await call('POST', '/memberships/assign', { ...body, paymentDate })).status, 400);
        await db.query('UPDATE plans SET is_active=false WHERE id=$1', [plan.id]);
        assert.equal((await call('POST', '/memberships/assign', body)).status, 404);
    });
    await test('duplicate standalone creation normalizes identifiers and returns only safe client identity', async () => {
        const r = await call('POST', '/users', { email: ' CALENDAR-OWNER@calendar.test ', phone: '55 1111 1103', displayName: 'Duplicate' });
        assert.equal(r.status, 409); assert.equal(r.json.code, 'YA_EXISTE'); assert.deepEqual(r.json.existingUser, { id: owner.id, display_name: owner.display_name });
        const phone = await call('POST', '/users', { email: 'other@calendar.test', phone: '5511111104', displayName: 'Duplicate phone' });
        assert.equal(phone.status, 409); assert.equal(phone.json.existingUser.id, guest.id);
        const staff = await call('POST', '/users', { email: admin.email, phone: '5599999999', displayName: 'Staff duplicate' });
        assert.equal(staff.status, 409); assert.equal(staff.json.existingUser, undefined);
    });
} finally { await db.end(); await server.detener(); }
assert.deepEqual(failures, [], `Failed calendar contracts: ${failures.join(', ')}`);
