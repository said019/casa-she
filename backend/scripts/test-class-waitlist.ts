// Integration: lista de espera en clases + candado de nómina.
// Levanta el server real en PORT_TEST y pega por HTTP como el frontend.
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool } from '../src/config/database.js';

const PORT = 3198;
const B = `http://localhost:${PORT}/api`;
const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const one = async (s: string, p: any[] = []) => (await pool.query(s, p)).rows[0];

async function http(method: string, url: string, token?: string, body?: unknown) {
    const res = await fetch(`${B}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json: any = null;
    try { json = await res.json(); } catch { /* sin body */ }
    return { status: res.status, json };
}

async function login(email: string): Promise<string> {
    const r = await http('POST', '/auth/login', undefined, { email, password: 'Wl.Test1234!' });
    assert.equal(r.status, 200, `login ${email}: ${JSON.stringify(r.json)}`);
    return r.json.token;
}

async function waitForHealth(timeoutMs = 90_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try { if ((await fetch(`${B}/health`)).ok) return; } catch { /* boot */ }
        await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error('server no respondió /api/health');
}

/** Crea usuario con password conocida. role: client|admin */
async function mkUser(email: string, role: string, hash: string): Promise<string> {
    const u = await one(
        `INSERT INTO users (email,phone,display_name,role,password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [email, `55${Date.now()}${Math.floor(Math.random() * 90 + 10)}`.slice(0, 12), `WL ${role}`, role, hash]);
    return u.id;
}

/** Membresía activa con créditos para la categoría dada. */
async function mkMembership(userId: string, reformer: number, multi: number): Promise<string> {
    const plan = await one(`SELECT id FROM plans WHERE is_active = true AND price > 0 ORDER BY price LIMIT 1`);
    const m = await one(
        `INSERT INTO memberships (user_id, plan_id, status, reformer_remaining, multi_remaining, payment_method, start_date, end_date, cancellation_limit)
         VALUES ($1,$2,'active',$3,$4,'cash',CURRENT_DATE,CURRENT_DATE + 60,2) RETURNING id`,
        [userId, plan.id, reformer, multi]);
    return m.id;
}

/** Clase reformer en fecha/hora dadas con cupo dado (instructor real). */
async function mkClass(date: string, startTime: string, capacity: number): Promise<string> {
    const ct = await one(`SELECT id FROM class_types WHERE category='reformer' AND is_active = true LIMIT 1`);
    const inst = await one(`SELECT id FROM instructors WHERE is_active = true LIMIT 1`);
    const fac = await one(`SELECT id FROM facilities WHERE is_active = true LIMIT 1`);
    const c = await one(
        `INSERT INTO classes (class_type_id, instructor_id, facility_id, date, start_time, end_time, max_capacity, status)
         VALUES ($1,$2,$3,$4,$5,($5::time + interval '50 minutes')::time,$6,'scheduled') RETURNING id`,
        [ct.id, inst.id, fac.id, date, startTime, capacity]);
    return c.id;
}

function isoDateDaysAhead(days: number): string {
    const d = new Date(Date.now() + days * 86400_000);
    return d.toISOString().slice(0, 10);
}

async function main() {
    const server: ChildProcess = spawn('npx', ['tsx', 'src/index.ts'], {
        cwd: BACKEND_DIR,
        env: { ...process.env, PORT: String(PORT), DISABLE_WHATSAPP: 'true', ENABLE_CRON_JOBS: 'false' },
        stdio: 'ignore',
    });
    const userIds: string[] = [];
    const classIds: string[] = [];
    try {
        await waitForHealth();

        // ── Task 1: la política mergea defaults sin pisar lo existente ──
        const pol = await one(`SELECT value FROM system_settings WHERE key = 'booking_policies'`);
        assert.ok(pol, 'booking_policies debe existir');
        assert.equal(typeof pol.value.allow_waitlist, 'boolean', 'allow_waitlist default');
        assert.equal(typeof pol.value.auto_promote_waitlist, 'boolean', 'auto_promote_waitlist default');
        assert.equal(typeof pol.value.waitlist_cutoff_hours, 'number', 'waitlist_cutoff_hours default');
        assert.equal(typeof pol.value.waitlist_max_size, 'number', 'waitlist_max_size default');
        // No pisó la config previa del estudio:
        assert.equal(pol.value.cancellation_hours, 12, 'cancellation_hours existente intacto');
        // Enum extendido para la notificación in-app de promoción:
        const enumRow = await one(`SELECT 1 AS ok FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                                   WHERE t.typname='notification_type' AND e.enumlabel='waitlist_promoted'`);
        assert.ok(enumRow?.ok, "enum notification_type debe incluir 'waitlist_promoted'");

        // ── Task 2: entrada a la lista ──
        const hash = bcrypt.hashSync('Wl.Test1234!', 10);
        const ts = Date.now();
        const aId = await mkUser(`wl_a_${ts}@t.local`, 'client', hash); userIds.push(aId);
        const bId = await mkUser(`wl_b_${ts}@t.local`, 'client', hash); userIds.push(bId);
        const cId = await mkUser(`wl_c_${ts}@t.local`, 'client', hash); userIds.push(cId);
        const sinCreditoId = await mkUser(`wl_x_${ts}@t.local`, 'client', hash); userIds.push(sinCreditoId);
        const adminId = await mkUser(`wl_admin_${ts}@t.local`, 'admin', hash); userIds.push(adminId);
        await mkMembership(aId, 4, 0);
        const mB = await mkMembership(bId, 4, 0);
        await mkMembership(cId, 4, 0);
        await mkMembership(sinCreditoId, 0, 4); // crédito multi, la clase será reformer
        const tokA = await login(`wl_a_${ts}@t.local`);
        const tokB = await login(`wl_b_${ts}@t.local`);
        const tokC = await login(`wl_c_${ts}@t.local`);
        const tokX = await login(`wl_x_${ts}@t.local`);
        const tokAdmin = await login(`wl_admin_${ts}@t.local`);

        const cls = await mkClass(isoDateDaysAhead(3), '10:00', 1); classIds.push(cls);

        // A llena la clase (reserva normal)
        const rA = await http('POST', '/bookings', tokA, { classId: cls });
        assert.equal(rA.status, 201, `reserva A: ${JSON.stringify(rA.json)}`);

        // B sin flag → 400 enriquecido
        const full = await http('POST', '/bookings', tokB, { classId: cls });
        assert.equal(full.status, 400);
        assert.equal(full.json.error, 'Clase llena');
        assert.equal(full.json.waitlistAvailable, true, 'debe ofrecer waitlist');
        assert.equal(full.json.waitlistSize, 0);

        // B con flag → 201 posición 1, sin gastar crédito
        const wB = await http('POST', '/bookings', tokB, { classId: cls, waitlist: true });
        assert.equal(wB.status, 201, `waitlist B: ${JSON.stringify(wB.json)}`);
        assert.equal(wB.json.status, 'waitlist');
        assert.equal(wB.json.waitlist_position, 1);
        const credB = await one(`SELECT reformer_remaining FROM memberships WHERE id = $1`, [mB]);
        assert.equal(credB.reformer_remaining, 4, 'entrar a la lista NO gasta crédito');

        // C con flag → posición 2
        const wC = await http('POST', '/bookings', tokC, { classId: cls, waitlist: true });
        assert.equal(wC.json.waitlist_position, 2);

        // B doble entrada → 400
        const dup = await http('POST', '/bookings', tokB, { classId: cls, waitlist: true });
        assert.equal(dup.status, 400, 'doble entrada debe rechazarse');

        // Sin crédito de la categoría → 400
        const noCred = await http('POST', '/bookings', tokX, { classId: cls, waitlist: true });
        assert.equal(noCred.status, 400, 'sin crédito de la categoría no entra');

        // Fila llena (max_size=2 temporal) → 400
        await pool.query(`UPDATE system_settings SET value = value || '{"waitlist_max_size":2}' WHERE key='booking_policies'`);
        const dId = await mkUser(`wl_d_${ts}@t.local`, 'client', hash); userIds.push(dId);
        await mkMembership(dId, 4, 0);
        const tokD = await login(`wl_d_${ts}@t.local`);
        const fullQueue = await http('POST', '/bookings', tokD, { classId: cls, waitlist: true });
        assert.equal(fullQueue.status, 400, 'fila llena debe rechazar');
        await pool.query(`UPDATE system_settings SET value = value || '{"waitlist_max_size":5}' WHERE key='booking_policies'`);

        // Corte: clase llena a <2h no acepta entradas a la fila
        const soonRow = await one(`SELECT (NOW() AT TIME ZONE 'America/Mexico_City')::date::text AS d,
                                          to_char((NOW() AT TIME ZONE 'America/Mexico_City') + interval '1 hour','HH24:MI') AS t`);
        const clsSoon = await mkClass(soonRow.d, soonRow.t, 1); classIds.push(clsSoon);
        await pool.query(`UPDATE classes SET current_bookings = max_capacity WHERE id = $1`, [clsSoon]);
        const soon = await http('POST', '/bookings', tokD, { classId: clsSoon, waitlist: true });
        assert.equal(soon.status, 400, 'dentro del corte no se entra a la lista');

        // Política apagada → ni se ofrece ni se entra
        await pool.query(`UPDATE system_settings SET value = value || '{"allow_waitlist":false}' WHERE key='booking_policies'`);
        const off = await http('POST', '/bookings', tokD, { classId: cls, waitlist: true });
        assert.equal(off.status, 400, 'con allow_waitlist=false no se entra');
        const off400 = await http('POST', '/bookings', tokD, { classId: cls });
        assert.equal(off400.json.waitlistAvailable, false, 'apagada no se ofrece');
        await pool.query(`UPDATE system_settings SET value = value || '{"allow_waitlist":true}' WHERE key='booking_policies'`);

        // ── Task 3: salir de la fila ──
        // B (#1) se sale; C (#2) debe compactarse a #1; contador de B intacto.
        const exitB = await http('POST', `/bookings/${wB.json.id}/cancel`, tokB, {});
        assert.equal(exitB.status, 200, `salir de fila: ${JSON.stringify(exitB.json)}`);
        const afterExit = await one(`SELECT cancellations_used FROM memberships WHERE id = $1`, [mB]);
        assert.equal(Number(afterExit.cancellations_used ?? 0), 0, 'salir de la fila NO quema cancelaciones');
        const cPos = await one(`SELECT waitlist_position FROM bookings WHERE id = $1`, [wC.json.id]);
        assert.equal(cPos.waitlist_position, 1, 'C debe compactarse a #1');
        // El cupo de la clase no se movió:
        const cupoTras = await one(`SELECT current_bookings, max_capacity FROM classes WHERE id = $1`, [cls]);
        assert.equal(cupoTras.current_bookings, 1, 'salir de la fila no toca el cupo');

        // ── Task 4: promoción automática ──
        // Estado: A confirmada, C es #1 en fila. A cancela → C se promueve.
        const credCAntes = await one(`SELECT m.reformer_remaining FROM memberships m WHERE m.user_id = $1 AND m.status='active'`, [cId]);
        const cancelA = await http('POST', `/bookings/${rA.json.id}/cancel`, tokA, {});
        assert.equal(cancelA.status, 200);
        const cRow = await one(`SELECT status, waitlist_position, consumed_category FROM bookings WHERE id = $1`, [wC.json.id]);
        assert.equal(cRow.status, 'confirmed', 'C debe quedar confirmada');
        assert.equal(cRow.consumed_category, 'reformer');
        const credCDespues = await one(`SELECT m.reformer_remaining FROM memberships m WHERE m.user_id = $1 AND m.status='active'`, [cId]);
        assert.equal(Number(credCDespues.reformer_remaining), Number(credCAntes.reformer_remaining) - 1, 'crédito cobrado al promover');
        const notifC = await one(`SELECT 1 AS ok FROM notifications WHERE user_id = $1 AND type = 'waitlist_promoted'`, [cId]);
        assert.ok(notifC?.ok, 'la promovida recibe notificación in-app');

        // Corte: con cupo libre por cancelación pero clase a <2h no se promueve.
        const clsLate = await mkClass(isoDateDaysAhead(3), '11:00', 1); classIds.push(clsLate);
        const rD2 = await http('POST', '/bookings', tokD, { classId: clsLate });
        assert.equal(rD2.status, 201);
        const wA2 = await http('POST', '/bookings', tokA, { classId: clsLate, waitlist: true });
        assert.equal(wA2.status, 201, `waitlist A2: ${JSON.stringify(wA2.json)}`);
        // Mover la clase a dentro de 1h (ya con la fila armada):
        await pool.query(`UPDATE classes SET date = (NOW() AT TIME ZONE 'America/Mexico_City')::date,
                          start_time = ((NOW() AT TIME ZONE 'America/Mexico_City') + interval '1 hour')::time
                          WHERE id = $1`, [clsLate]);
        const cancelD2 = await http('POST', `/bookings/${rD2.json.id}/cancel`, tokAdmin, {}); // admin bypass de ventana
        assert.equal(cancelD2.status, 200, `cancel admin: ${JSON.stringify(cancelD2.json)}`);
        const a2Row = await one(`SELECT status FROM bookings WHERE id = $1`, [wA2.json.id]);
        assert.equal(a2Row.status, 'waitlist', 'dentro del corte NO se promueve');

        // auto_promote apagado → tampoco se promueve.
        await pool.query(`UPDATE system_settings SET value = value || '{"auto_promote_waitlist":false}' WHERE key='booking_policies'`);
        const clsNoAuto = await mkClass(isoDateDaysAhead(4), '12:00', 1); classIds.push(clsNoAuto);
        const rB3 = await http('POST', '/bookings', tokB, { classId: clsNoAuto });
        assert.equal(rB3.status, 201, `reserva B3: ${JSON.stringify(rB3.json)}`);
        const wD3 = await http('POST', '/bookings', tokD, { classId: clsNoAuto, waitlist: true });
        assert.equal(wD3.status, 201, `waitlist D3: ${JSON.stringify(wD3.json)}`);
        await http('POST', `/bookings/${rB3.json.id}/cancel`, tokB, {});
        const d3Row = await one(`SELECT status FROM bookings WHERE id = $1`, [wD3.json.id]);
        assert.equal(d3Row.status, 'waitlist', 'sin auto_promote NO se promueve');
        await pool.query(`UPDATE system_settings SET value = value || '{"auto_promote_waitlist":true}' WHERE key='booking_policies'`);

        // ── Task 5: gestión por staff ──
        // Estado en cls: C confirmada (promovida), fila vacía. Rearmar fila con A y B.
        const wA4 = await http('POST', '/bookings', tokA, { classId: cls, waitlist: true });
        const wB4 = await http('POST', '/bookings', tokB, { classId: cls, waitlist: true });
        assert.equal(wA4.json.waitlist_position, 1, `fila A4: ${JSON.stringify(wA4.json)}`);
        assert.equal(wB4.json.waitlist_position, 2, `fila B4: ${JSON.stringify(wB4.json)}`);

        // GET agrupado por clase
        const q = await http('GET', `/bookings/waitlist`, tokAdmin);
        assert.equal(q.status, 200, `GET waitlist: ${JSON.stringify(q.json)}`);
        const grupo = (q.json as any[]).find(g => g.class_id === cls);
        assert.ok(grupo, 'la clase con fila aparece');
        assert.equal(grupo.queue.length, 2);
        assert.equal(grupo.queue[0].waitlist_position, 1);

        // Cliente NO puede ver la gestión
        const qCli = await http('GET', `/bookings/waitlist`, tokA);
        assert.equal(qCli.status, 403, 'cliente no gestiona la fila');

        // Reordenar: B sube a #1
        const up = await http('PATCH', `/bookings/${wB4.json.id}/waitlist-position`, tokAdmin, { direction: 'up' });
        assert.equal(up.status, 200, `reorder: ${JSON.stringify(up.json)}`);
        const bPos = await one(`SELECT waitlist_position FROM bookings WHERE id = $1`, [wB4.json.id]);
        assert.equal(bPos.waitlist_position, 1);

        // Quitar a A: compacta (B queda #1, fila de 1)
        const rm = await http('POST', `/bookings/${wA4.json.id}/waitlist-remove`, tokAdmin, {});
        assert.equal(rm.status, 200, `remove: ${JSON.stringify(rm.json)}`);
        const sizeNow = await one(`SELECT COUNT(*) AS n FROM bookings WHERE class_id = $1 AND status='waitlist'`, [cls]);
        assert.equal(Number(sizeNow.n), 1);

        // Promote manual SIN cupo → 400
        const noRoom = await http('POST', `/bookings/${wB4.json.id}/waitlist-promote`, tokAdmin, {});
        assert.equal(noRoom.status, 400, 'sin cupo no hay promoción manual');

        // Liberar cupo con auto_promote APAGADO para probar manual puro.
        await pool.query(`UPDATE system_settings SET value = value || '{"auto_promote_waitlist":false}' WHERE key='booking_policies'`);
        await http('POST', `/bookings/${wC.json.id}/cancel`, tokAdmin, {});
        const manual = await http('POST', `/bookings/${wB4.json.id}/waitlist-promote`, tokAdmin, {});
        assert.equal(manual.status, 200, `promote manual: ${JSON.stringify(manual.json)}`);
        const b4Row = await one(`SELECT status FROM bookings WHERE id = $1`, [wB4.json.id]);
        assert.equal(b4Row.status, 'confirmed', 'promoción manual confirma');
        await pool.query(`UPDATE system_settings SET value = value || '{"auto_promote_waitlist":true}' WHERE key='booking_policies'`);

        // Audit del staff quedó registrado
        const audit = await one(`SELECT 1 AS ok FROM admin_actions WHERE admin_user_id = $1 AND action_type = 'waitlist_promoted'`, [adminId]);
        assert.ok(audit?.ok, 'promoción manual auditada');

        // ── Task 6: cambio de instructor → nómina ──
        const inst1 = await one(`SELECT id FROM instructors WHERE is_active = true ORDER BY display_name LIMIT 1`);
        const inst2 = await one(`SELECT id FROM instructors WHERE is_active = true AND id <> $1 ORDER BY display_name LIMIT 1`, [inst1.id]);
        const hoyMx = (await one(`SELECT (NOW() AT TIME ZONE 'America/Mexico_City')::date::text AS d`)).d;
        const clsDone = await mkClass(hoyMx, '08:00', 5); classIds.push(clsDone);
        await pool.query(`UPDATE classes SET status='completed', instructor_id=$2 WHERE id=$1`, [clsDone, inst1.id]);
        const mes = (await one(`SELECT to_char(date_trunc('month', date), 'YYYY-MM') AS m FROM classes WHERE id=$1`, [clsDone])).m;

        const payrollAntes = await http('GET', `/coach-payroll?month=${mes}`, tokAdmin);
        assert.equal(payrollAntes.status, 200, `payroll: ${JSON.stringify(payrollAntes.json).slice(0, 200)}`);
        const count1Before = payrollAntes.json.rows.find((r: any) => r.instructor_id === inst1.id).classes_count;

        // Cambiar instructor SIN payout → sin warning, conteo vivo se mueve YA
        const upd = await http('PUT', `/classes/${clsDone}`, tokAdmin, { instructorId: inst2.id });
        assert.equal(upd.status, 200, `PUT clase: ${JSON.stringify(upd.json)}`);
        assert.equal(upd.json.payrollWarning ?? null, null, 'sin payout no hay warning');
        const rows1 = (await http('GET', `/coach-payroll?month=${mes}`, tokAdmin)).json.rows;
        assert.equal(rows1.find((r: any) => r.instructor_id === inst1.id).classes_count, count1Before - 1, 'inst1 pierde la clase YA');
        const auditCambio = await one(`SELECT 1 AS ok FROM admin_actions WHERE action_type='class_instructor_changed' AND entity_id=$1::uuid`, [clsDone]);
        assert.ok(auditCambio?.ok, 'cambio de instructor auditado');

        // Con payout del mes para inst2 → warning presente al moverla de vuelta
        await pool.query(`INSERT INTO coach_payouts (instructor_id, period_month, classes_count, pay_rate_per_class, amount, paid_by)
                          VALUES ($1, ($2||'-01')::date, 1, 100, 100, $3)`, [inst2.id, mes, adminId]);
        const upd2 = await http('PUT', `/classes/${clsDone}`, tokAdmin, { instructorId: inst1.id });
        assert.equal(upd2.status, 200);
        assert.ok(upd2.json.payrollWarning, 'mes pagado debe traer payrollWarning');
        await pool.query(`DELETE FROM coach_payouts WHERE instructor_id=$1 AND period_month=($2||'-01')::date`, [inst2.id, mes]);

        console.log('✅ test-class-waitlist: OK');
    } finally {
        if (userIds.length) {
            for (const sql of [
                `DELETE FROM admin_actions WHERE admin_user_id = ANY($1)`,
                `DELETE FROM notifications WHERE user_id = ANY($1)`,
                `DELETE FROM loyalty_points WHERE user_id = ANY($1)`,
                `DELETE FROM payments WHERE user_id = ANY($1)`,
                `DELETE FROM bookings WHERE user_id = ANY($1)`,
                `DELETE FROM memberships WHERE user_id = ANY($1)`,
                `DELETE FROM users WHERE id = ANY($1)`,
            ]) { try { await pool.query(sql, [userIds]); } catch (e: any) { console.error('cleanup:', e.message); } }
        }
        if (classIds.length) {
            try { await pool.query(`DELETE FROM bookings WHERE class_id = ANY($1)`, [classIds]); } catch { /* ya */ }
            try { await pool.query(`DELETE FROM classes WHERE id = ANY($1)`, [classIds]); } catch (e: any) { console.error('cleanup classes:', e.message); }
        }
        server.kill('SIGTERM');
        await pool.end();
    }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
