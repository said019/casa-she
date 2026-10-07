// POST /api/users/alta-rapida (Entrega 5): clienta + paquete + inscripción + link de acceso en
// UNA transacción. Duplicado por correo o teléfono → 409 sin escribir; una falla al inscribir
// deja la base idéntica; el camino feliz crea las cuatro cosas.
// Levanta el backend contra una CLON desechable de la base local (nunca producción).
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { levantarServidorLocal, http } from './helpers/servidor-local.js';

const PORT = 3212;

async function main() {
    const srv = await levantarServidorLocal(PORT);
    process.env.DATABASE_URL = srv.databaseUrl;
    const { pool } = await import('../src/config/database.js');
    const A = srv.api;
    const sql = async (s: string, p: any[] = []) => (await pool.query(s, p)).rows;
    const conteos = async () => (await sql(`SELECT
        (SELECT count(*) FROM users)::int users, (SELECT count(*) FROM memberships)::int memberships,
        (SELECT count(*) FROM payments)::int payments, (SELECT count(*) FROM bookings)::int bookings,
        (SELECT count(*) FROM access_links)::int links, (SELECT count(*) FROM loyalty_points)::int puntos`))[0];
    try {
        const ts = Date.now();
        const clave = 'Clave-Admin-1';
        const hash = await bcrypt.hash(clave, 4);
        const mk = async (rol: string, tag: string, tel: string) => (await sql(
            `INSERT INTO users (email, phone, display_name, role, password_hash, is_active, temp_password)
             VALUES ($1, $2, $3, $4, $5, true, false) RETURNING id, email`,
            [`${tag}-${ts}@alta.test`, tel, `Test ${tag}`, rol, hash]))[0];
        const recep = await mk('reception', 'rec', '5500000001');
        const existente = await mk('client', 'exi', '5500000002');
        const clienta = await mk('client', 'cli', '5500000003');
        const login = async (email: string) => (await http(A, 'POST', '/auth/login', undefined, { email, password: clave })).json.token as string;
        const tRecep = await login(recep.email);
        const tClienta = await login(clienta.email);

        // Fixtures: tipo de clase (bolsa "Clases" = multi), instructora, clases y planes.
        const instr = (await sql(`SELECT id FROM instructors LIMIT 1`))[0];
        assert.ok(instr, 'la base local necesita al menos una instructora');
        const tipo = (await sql(`INSERT INTO class_types (name, category, max_capacity) VALUES ($1, 'multi', 8) RETURNING id`, [`AltaTest ${ts}`]))[0];
        const nuevaClase = async (hora: string, cupo: number, extra = '') => (await sql(
            `INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity ${extra ? ',' + extra.split('=')[0] : ''})
             VALUES ($1, $2, (NOW() AT TIME ZONE 'America/Mexico_City')::date + 3, $3, $4, $5 ${extra ? ',' + extra.split('=')[1] : ''}) RETURNING id`,
            [tipo.id, instr.id, hora, hora.replace(/^(\d\d)/, (h) => String(Number(h) + 1).padStart(2, '0')), cupo]))[0].id as string;
        const plan = async (nombre: string, reformer: number, multi: number, activo = true) => (await sql(
            `INSERT INTO plans (name, price, currency, duration_days, reformer_credits, multi_credits, is_active)
             VALUES ($1, 900, 'MXN', 30, $2, $3, $4) RETURNING id`, [`${nombre} ${ts}`, reformer, multi, activo]))[0].id as string;
        const planMulti = await plan('Multi5', 0, 5);
        const planSalsa = await plan('Salsa5', 5, 0);
        const planInactivo = await plan('Viejo', 0, 5, false);
        const claseA = await nuevaClase('09:00', 8);
        const claseB = await nuevaClase('10:00', 8);
        const claseC = await nuevaClase('11:00', 8);
        const claseLlena = await nuevaClase('12:00', 1);
        await sql(`INSERT INTO bookings (class_id, user_id, status) VALUES ($1, $2, 'confirmed')`, [claseLlena, existente.id]);
        const claseCancelada = await nuevaClase('13:00', 8);
        await sql(`UPDATE classes SET status = 'cancelled' WHERE id = $1`, [claseCancelada]);

        const body = (n: number, o: Record<string, unknown> = {}) => ({
            nombre: `Alumna Nueva ${n}`, email: `Nueva${n}-${ts}@Alta.test`, telefono: `55123${String(40000 + n)}`,
            classId: claseA, planId: planMulti, metodoPago: 'cash', ...o,
        });

        // ---- Permisos y validación ----
        assert.equal((await http(A, 'POST', '/users/alta-rapida', undefined, body(1))).status, 401);
        assert.equal((await http(A, 'POST', '/users/alta-rapida', tClienta, body(1))).status, 403, 'una clienta no da de alta');
        const antesValid = await conteos();
        for (const [que, b] of [
            ['sin correo', { ...body(2), email: undefined }],
            ['correo inválido', body(2, { email: 'no-es-correo' })],
            ['nombre corto', body(2, { nombre: 'A' })],
            ['nombre largo', body(2, { nombre: 'x'.repeat(81) })],
            ['teléfono corto', body(2, { telefono: '55 1234' })],
            ['paquete sin forma de pago', body(2, { metodoPago: undefined })],
            ['paquete y cortesía', body(2, { cortesia: true })],
            ['forma de pago inválida', body(2, { metodoPago: 'gratis' })],
            ['clase no uuid', body(2, { classId: 'x' })],
        ] as const) {
            const r = await http(A, 'POST', '/users/alta-rapida', tRecep, b);
            assert.equal(r.status, 400, `${que}: ${JSON.stringify(r.json)}`);
        }
        assert.deepEqual(await conteos(), antesValid, 'la validación no escribe nada');

        // ---- Camino feliz con paquete: clienta + paquete + inscripción + link ----
        const antes = await conteos();
        const ok = await http(A, 'POST', '/users/alta-rapida', tRecep, body(10));
        assert.equal(ok.status, 201, JSON.stringify(ok.json));
        const { user, membership, booking, acceso } = ok.json;
        assert.equal(user.role, 'client');
        assert.equal(user.email, `nueva10-${ts}@alta.test`, 'el correo se guarda en minúsculas');
        assert.equal(user.password_hash, undefined);
        const fila = (await sql(`SELECT temp_password, password_hash, phone FROM users WHERE id = $1`, [user.id]))[0];
        assert.equal(fila.temp_password, false);
        assert.equal(fila.phone, '5512340010'.replace('5512340010', `55123${40010}`));
        assert.equal(membership.status, 'active');
        assert.equal(membership.plan_id, planMulti);
        assert.equal(booking.status, 'confirmed');
        assert.equal(booking.membership_id, membership.id);
        assert.equal(booking.class_id, claseA);
        const m = (await sql(`SELECT multi_remaining FROM memberships WHERE id = $1`, [membership.id]))[0];
        assert.equal(m.multi_remaining, 4, 'se descontó 1 crédito de la bolsa de la clase');
        const pago = (await sql(`SELECT amount, payment_method, status FROM payments WHERE membership_id = $1`, [membership.id]))[0];
        assert.equal(Number(pago.amount), 900);
        assert.equal(pago.payment_method, 'cash');
        assert.equal((await sql(`SELECT current_bookings FROM classes WHERE id = $1`, [claseA]))[0].current_bookings, 1);
        assert.match(acceso.url, /^http:\/\/localhost:4173\/acceso\/[A-Za-z0-9_-]{43}$/);
        assert.equal((await sql(`SELECT count(*)::int n FROM access_links WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL`, [user.id]))[0].n, 1);
        const despues = await conteos();
        assert.equal(despues.users, antes.users + 1);
        assert.equal(despues.memberships, antes.memberships + 1);
        assert.equal(despues.bookings, antes.bookings + 1);
        assert.equal(despues.links, antes.links + 1);
        // El link funciona de punta a punta: crea contraseña y entra.
        const token = acceso.url.split('/acceso/')[1];
        const entra = await http(A, 'POST', `/auth/acceso/${token}`, undefined, { password: 'Mi-Clave-2035' });
        assert.equal(entra.status, 200, JSON.stringify(entra.json));
        assert.equal((await http(A, 'GET', '/auth/me', entra.json.token)).status, 200);
        // La contraseña aleatoria original es inutilizable: ni el correo solo ni vacía entran.
        assert.equal((await http(A, 'POST', '/auth/login', undefined, { email: user.email, password: 'cualquiera' })).status, 401);

        // ---- Cortesía: sin paquete, sin pago, sin descontar ----
        const c0 = await conteos();
        const cort = await http(A, 'POST', '/users/alta-rapida', tRecep, body(11, { planId: undefined, metodoPago: undefined, cortesia: true, classId: claseB }));
        assert.equal(cort.status, 201, JSON.stringify(cort.json));
        assert.equal(cort.json.membership, null);
        assert.equal(cort.json.booking.is_free_booking, true);
        const c1 = await conteos();
        assert.equal(c1.memberships, c0.memberships);
        assert.equal(c1.payments, c0.payments);
        assert.equal(c1.bookings, c0.bookings + 1);

        // ---- Duplicado por correo (otra capitalización): 409 sin escribir ----
        const d0 = await conteos();
        const dupMail = await http(A, 'POST', '/users/alta-rapida', tRecep,
            body(12, { email: existente.email.toUpperCase(), telefono: '5599887766' }));
        assert.equal(dupMail.status, 409);
        assert.equal(dupMail.json.code, 'YA_EXISTE');
        assert.equal(dupMail.json.userId, existente.id);
        assert.equal(dupMail.json.coincidencia, 'email');
        assert.equal(dupMail.json.nombre, 'Test exi');
        assert.deepEqual(await conteos(), d0, 'duplicado por correo: no escribe nada');

        // ---- Duplicado por teléfono (otro formato, con lada): 409 sin escribir ----
        const dupTel = await http(A, 'POST', '/users/alta-rapida', tRecep,
            body(13, { telefono: '+52 (55) 0000-0002' }));
        assert.equal(dupTel.status, 409);
        assert.equal(dupTel.json.code, 'YA_EXISTE');
        assert.equal(dupTel.json.userId, existente.id);
        assert.equal(dupTel.json.coincidencia, 'telefono');
        assert.deepEqual(await conteos(), d0, 'duplicado por teléfono: no escribe nada');

        // ---- Una falla al inscribir deshace TODO (clienta, paquete, pago, bono, link) ----
        const fallas: Array<[string, Record<string, unknown>, number]> = [
            ['clase llena', { classId: claseLlena }, 400],
            ['clase cancelada', { classId: claseCancelada }, 400],
            ['clase inexistente', { classId: '00000000-0000-0000-0000-000000000000' }, 404],
            ['paquete de otra bolsa (sin créditos para la clase)', { planId: planSalsa, classId: claseC }, 400],
            ['paquete desactivado', { planId: planInactivo, classId: claseC }, 400],
            ['paquete inexistente', { planId: '00000000-0000-0000-0000-000000000000', classId: claseC }, 404],
            ['cortesía a clase llena', { planId: undefined, metodoPago: undefined, cortesia: true, classId: claseLlena }, 400],
        ];
        for (const [que, extra, status] of fallas) {
            const antesF = await conteos();
            const r = await http(A, 'POST', '/users/alta-rapida', tRecep, body(20, extra));
            assert.equal(r.status, status, `${que}: ${JSON.stringify(r.json)}`);
            assert.deepEqual(await conteos(), antesF, `${que}: no debe quedar nada`);
            assert.equal((await sql(`SELECT count(*)::int n FROM users WHERE lower(email) = $1`, [`nueva20-${ts}@alta.test`]))[0].n, 0, `${que}: la clienta no existe`);
        }
        // Y la misma alumna sí se puede registrar después, con datos buenos.
        assert.equal((await http(A, 'POST', '/users/alta-rapida', tRecep, body(20, { classId: claseC }))).status, 201);

        // ---- Altas simultáneas del mismo correo: una gana, la otra es duplicado ----
        const [p, q] = await Promise.all([
            http(A, 'POST', '/users/alta-rapida', tRecep, body(30, { classId: claseC })),
            http(A, 'POST', '/users/alta-rapida', tRecep, body(30, { classId: claseC })),
        ]);
        assert.deepEqual([p.status, q.status].sort(), [201, 409], `${p.status}/${q.status}`);
        assert.equal((await sql(`SELECT count(*)::int n FROM users WHERE lower(email) = $1`, [`nueva30-${ts}@alta.test`]))[0].n, 1);

        // ---- La extracción de la lógica de paquetes no cambió POST /memberships/assign ----
        const hoy = (await sql(`SELECT (NOW() AT TIME ZONE 'America/Mexico_City')::date::text d`))[0].d;
        const asg = await http(A, 'POST', '/memberships/assign', tRecep,
            { userId: clienta.id, planId: planMulti, startDate: hoy, paymentMethod: 'transfer' });
        assert.equal(asg.status, 201, JSON.stringify(asg.json));
        assert.equal(asg.json.status, 'active');
        assert.equal(asg.json.multi_remaining, 5);
        const pg = (await sql(`SELECT amount, payment_method FROM payments WHERE membership_id = $1`, [asg.json.id]))[0];
        assert.equal(Number(pg.amount), 900);
        assert.equal(pg.payment_method, 'transfer');

        console.log('test-alta-rapida: OK');
    } finally {
        await srv.detener();
        try { const { pool } = await import('../src/config/database.js'); await pool.end(); } catch { /* noop */ }
    }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
