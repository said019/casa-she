// Oleada de seguridad (Entrega 5): recepción se mapea a rol OPERATIVO 'admin' en req.user.role,
// pero la cuenta real está en req.user.accountRole. Las guardas de privilegio deben usar esta.
//  - POST /users/:id/resend-credentials: recepción NO resetea a un admin (ni recibe su tempPassword).
//  - POST /bookings/admin-book con force: solo admin/super_admin fuerzan sobrecupo.
// Levanta el backend contra una CLON desechable de la base local (nunca producción).
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { levantarServidorLocal, http } from './helpers/servidor-local.js';

const PORT = 3213;

async function main() {
    const srv = await levantarServidorLocal(PORT);
    process.env.DATABASE_URL = srv.databaseUrl;
    const { pool } = await import('../src/config/database.js');
    const A = srv.api;
    const sql = async (s: string, p: any[] = []) => (await pool.query(s, p)).rows;
    try {
        const ts = Date.now();
        const clave = 'Clave-Admin-1';
        const hash = await bcrypt.hash(clave, 4);
        let n = 0;
        const mk = async (rol: string, tag: string) => (await sql(
            `INSERT INTO users (email, phone, display_name, role, password_hash, is_active, temp_password)
             VALUES ($1, $2, $3, $4, $5, true, false) RETURNING id, email`,
            [`${tag}-${ts}@roles.test`, `5577${String(ts).slice(-5)}${n++}`.slice(0, 10), `Test ${tag}`, rol, hash]))[0];
        const admin = await mk('admin', 'adm');
        const otroAdmin = await mk('admin', 'adm2');
        const recep = await mk('reception', 'rec');
        const alumna = await mk('client', 'alu');
        const alumna2 = await mk('client', 'alu2');
        const login = async (email: string) => (await http(A, 'POST', '/auth/login', undefined, { email, password: clave })).json.token as string;
        const tAdmin = await login(admin.email);
        const tRecep = await login(recep.email);

        // --- resend-credentials ---
        const hashAntes = (await sql('SELECT password_hash FROM users WHERE id = $1', [otroAdmin.id]))[0].password_hash;
        const rr = await http(A, 'POST', `/users/${otroAdmin.id}/resend-credentials`, tRecep, {});
        assert.equal(rr.status, 403, `recepción → admin debe ser 403, fue ${rr.status}`);
        assert.equal(rr.json.tempPassword, undefined, 'no se filtra tempPassword');
        assert.equal((await sql('SELECT password_hash FROM users WHERE id = $1', [otroAdmin.id]))[0].password_hash, hashAntes,
            'la contraseña del admin no cambió');
        const rrR = await http(A, 'POST', `/users/${recep.id}/resend-credentials`, tRecep, {});
        assert.equal(rrR.status, 403, 'recepción tampoco resetea a otra recepción/ni a sí misma');
        assert.equal((await http(A, 'POST', `/users/${alumna.id}/resend-credentials`, tRecep, {})).status, 200, 'recepción sí a una clienta');
        const ra = await http(A, 'POST', `/users/${otroAdmin.id}/resend-credentials`, tAdmin, {});
        assert.equal(ra.status, 200, `admin → admin sigue funcionando: ${JSON.stringify(ra.json)}`);
        assert.ok(typeof ra.json.tempPassword === 'string');

        // --- admin-book con force ---
        const instr = (await sql(`SELECT id FROM instructors LIMIT 1`))[0];
        const tipo = (await sql(`INSERT INTO class_types (name, category, max_capacity) VALUES ($1, 'multi', 8) RETURNING id`, [`RolesTest ${ts}`]))[0];
        const claseLlena = async (hora: string) => {
            const id = (await sql(
                `INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity)
                 VALUES ($1, $2, (NOW() AT TIME ZONE 'America/Mexico_City')::date + 3, $3, $4, 1) RETURNING id`,
                [tipo.id, instr.id, hora, hora.replace(/^(\d\d)/, (h) => String(Number(h) + 1).padStart(2, '0'))]))[0].id as string;
            await sql(`INSERT INTO bookings (class_id, user_id, status) VALUES ($1, $2, 'confirmed')`, [id, otroAdmin.id]);
            return id;
        };
        const c1 = await claseLlena('09:00');
        const c2 = await claseLlena('10:00');
        const conteo = async (c: string) => (await sql(`SELECT count(*)::int n FROM bookings WHERE class_id = $1 AND status = 'confirmed'`, [c]))[0].n;
        void conteo;

        const fr = await http(A, 'POST', '/bookings/admin-book', tRecep, { classId: c1, userId: alumna.id, force: true, free: true });
        assert.equal(fr.status, 400, `recepción con force sobre clase llena → 400, fue ${fr.status} ${JSON.stringify(fr.json)}`);
        assert.equal(fr.json.error, 'Clase llena');
        assert.equal(await conteo(c1), 1, 'recepción no logra sobrecupo');

        const fa = await http(A, 'POST', '/bookings/admin-book', tAdmin, { classId: c2, userId: alumna2.id, force: true, free: true });
        // El cupo lo frena solo la guarda de rol: a admin NO lo rechaza con "Clase llena". (La base
        // local además tiene un CHECK de capacidad que impide el sobrecupo real → 500 aguas abajo;
        // es previo a esta oleada y no es lo que se prueba aquí.)
        assert.notEqual(fa.json.error, 'Clase llena', `admin con force pasa la guarda de cupo: ${fa.status} ${JSON.stringify(fa.json)}`);

        console.log('test-roles-recepcion: OK');
    } finally {
        await srv.detener();
        try { const { pool } = await import('../src/config/database.js'); await pool.end(); } catch { /* noop */ }
    }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
