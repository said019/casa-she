// evaluarInscripcion / inscribirEnClase / buscarCandidatas (lib/inscripcion.ts):
// una sola regla para mostrar (candidatas) y para cobrar (admin-book).
// Corre contra la base LOCAL dentro de una transacción que se revierte.
//
// Correr con: DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/test-inscripcion.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/config/database.js';
import { toDbClient } from '../src/lib/membershipSelection.js';
import { evaluarInscripcion, inscribirEnClase, buscarCandidatas } from '../src/lib/inscripcion.js';

assert.ok(/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? ''), 'solo base LOCAL');

// ── Cableado: las rutas usan la regla compartida ────────────────────────────
const leer = (r: string) => readFileSync(fileURLToPath(new URL(r, import.meta.url)), 'utf8');
const bookings = leer('../src/routes/bookings.ts');
assert.match(bookings, /evaluarInscripcion\(toDbClient\(client\)/, 'admin-book usa evaluarInscripcion');
assert.match(bookings, /inscribirEnClase\(toDbClient\(client\)/, 'admin-book usa inscribirEnClase');
assert.match(bookings, /bloquear: true/, 'admin-book evalúa bloqueando');
const classes = leer('../src/routes/classes.ts');
assert.match(classes, /router\.get\('\/:id\/candidatas'/, 'existe GET /:id/candidatas');
assert.match(classes, /requireRole\('admin', 'super_admin', 'reception'\)/);
assert.match(leer('../src/lib/membershipSelection.ts'), /bloquear \? 'FOR UPDATE OF m' : ''/, 'bloquear:false quita FOR UPDATE');
console.log('  cableado: OK');

async function main() {
    const c = await pool.connect();
    const db = toDbClient(c);
    try {
        await c.query('BEGIN');
        const tag = randomUUID().slice(0, 8);
        const one = async (sql: string, p: unknown[] = []) => (await c.query(sql, p)).rows[0];

        const ins = await one(`SELECT id FROM instructors LIMIT 1`);
        const facA = await one(`SELECT id FROM facilities LIMIT 1`);
        const facB = await one(`INSERT INTO facilities (name) VALUES ($1) RETURNING id`, [`Otro ${tag}`]);
        const ctMulti = await one(`SELECT id FROM class_types WHERE category = 'multi' LIMIT 1`);
        const ctSalsa = await one(`SELECT id FROM class_types WHERE category = 'reformer' LIMIT 1`);
        assert.ok(ins && facA && ctMulti && ctSalsa, 'la base local necesita coach, sucursal y tipos de ambas bolsas');

        let hora = 0;
        const clase = async (ct: string, o: { cap?: number; dias?: number; fac?: string; free?: boolean; status?: string } = {}) =>
            (await one(
                `INSERT INTO classes (class_type_id, instructor_id, facility_id, date, start_time, end_time, max_capacity, is_free, status)
                 VALUES ($1, $2, $3, CURRENT_DATE + $4::int, $5::time, $5::time + interval '50 minutes', $6, $7, $8) RETURNING id`,
                [ct, ins.id, o.fac ?? facA.id, o.dias ?? 40, `0${4 + (hora++ % 5)}:${10 + hora}`, o.cap ?? 8, !!o.free, o.status ?? 'scheduled'],
            )).id as string;
        const usuario = async (nombre: string, role = 'client', activo = true) =>
            (await one(
                `INSERT INTO users (email, phone, display_name, role, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [`${nombre.replace(/\W/g, '').toLowerCase()}.${tag}@test.local`, `55${Math.floor(Math.random() * 1e8)}`, nombre, role, activo],
            )).id as string;
        const plan = async (nombre: string) => (await one(
            `INSERT INTO plans (name, price, duration_days) VALUES ($1, 100, 30) RETURNING id`, [nombre])).id as string;
        const membresia = async (u: string, p: string, o: { multi?: number | null; salsa?: number | null; fac?: string; fin?: string } = {}) =>
            (await one(
                `INSERT INTO memberships (user_id, plan_id, status, reformer_remaining, multi_remaining, start_date, end_date, facility_id)
                 VALUES ($1, $2, 'active', $3, $4, CURRENT_DATE - 1, ${o.fin ? `'${o.fin}'::date` : 'CURRENT_DATE + 90'}, $5) RETURNING id`,
                [u, p, o.salsa === undefined ? 0 : o.salsa, o.multi === undefined ? 0 : o.multi, o.fac ?? null])).id as string;

        const pOcho = await plan(`Paquete 8 Clases ${tag}`);
        const pIlim = await plan(`Ilimitado ${tag}`);
        const cl = await clase(ctMulti.id);
        const sal = await clase(ctSalsa.id);

        const ev = (userId: string, classId: string, extra: Record<string, unknown> = {}) =>
            evaluarInscripcion(db, { userId, classId, cortesia: false, bloquear: false, ...extra } as any);

        // puede: paquete acotado, bolsa de la clase
        const ana = await usuario(`Ana Pérez ${tag}`);
        const mAna = await membresia(ana, pOcho, { multi: 3, salsa: 0 });
        let r: any = await ev(ana, cl);
        assert.equal(r.estado, 'puede');
        assert.deepEqual({ id: r.membresia.id, plan: r.membresia.plan, restantes: r.membresia.restantes }, { id: mAna, plan: `Paquete 8 Clases ${tag}`, restantes: 3 });
        assert.match(r.membresia.vence, /^\d{4}-\d{2}-\d{2}$/);
        // la bolsa importa: Salsa no tiene créditos con ese plan
        r = await ev(ana, sal);
        assert.equal(r.estado, 'sin_creditos'); assert.equal(r.mensaje, 'Sin créditos de Salsa');
        // ilimitado → restantes null
        const ili = await usuario(`Ilimi ${tag}`);
        await membresia(ili, pIlim, { multi: null, salsa: 0 });
        r = await ev(ili, cl);
        assert.equal(r.estado, 'puede'); assert.equal(r.membresia.restantes, null);
        // sin membresía
        const sin = await usuario(`Sinplan ${tag}`);
        assert.equal((await ev(sin, cl) as any).estado, 'sin_membresia');
        // sin créditos (membresía vigente pero en 0 en la bolsa)
        const cero = await usuario(`Ceros ${tag}`);
        await membresia(cero, pOcho, { multi: 0 });
        r = await ev(cero, cl); assert.equal(r.estado, 'sin_creditos'); assert.equal(r.mensaje, 'Sin créditos de Clases');
        // membresía vencida → sin_membresia
        const venc = await usuario(`Vencida ${tag}`);
        await c.query(`INSERT INTO memberships (user_id, plan_id, status, multi_remaining, reformer_remaining, start_date, end_date)
                       VALUES ($1, $2, 'active', 5, 0, CURRENT_DATE - 60, CURRENT_DATE - 1)`, [venc, pOcho]);
        assert.equal((await ev(venc, cl) as any).estado, 'sin_membresia');
        // otro estudio
        const otro = await usuario(`Otroestudio ${tag}`);
        await membresia(otro, pOcho, { multi: 5, fac: facB.id });
        r = await ev(otro, cl); assert.equal(r.estado, 'otro_estudio'); assert.match(r.mensaje, /solo para el estudio/);
        // cortesía: puede sin membresía
        r = await ev(sin, cl, { cortesia: true }); assert.deepEqual(r, { estado: 'puede', membresia: null });
        // clase gratis: puede sin membresía
        const gratis = await clase(ctMulti.id, { free: true });
        assert.deepEqual(await ev(sin, gratis), { estado: 'puede', membresia: null });
        // clase cancelada
        const canc = await clase(ctMulti.id, { status: 'cancelled' });
        assert.equal((await ev(ana, canc) as any).estado, 'clase_cancelada');
        // clase llena (cap 1) + ignorarCupo
        const llena = await clase(ctMulti.id, { cap: 1 });
        const relleno = await usuario(`Relleno ${tag}`);
        await c.query(`INSERT INTO bookings (class_id, user_id, status) VALUES ($1, $2, 'confirmed')`, [llena, relleno]);
        assert.equal((await ev(ana, llena) as any).estado, 'clase_llena');
        assert.equal((await ev(ana, llena, { ignorarCupo: true }) as any).estado, 'puede');
        // clase inexistente
        await assert.rejects(ev(ana, randomUUID()), /Clase no encontrada/);
        // limite_diario: ilimitada ya inscrita ese día en otra clase
        const otraMismoDia = await clase(ctMulti.id, { dias: 40 });
        await inscribirEnClase(db, { userId: ili, classId: cl, membresiaId: (await ev(ili, cl) as any).membresia.id, cortesia: false, reservadaPor: null });
        r = await ev(ili, otraMismoDia); assert.equal(r.estado, 'limite_diario'); assert.equal(r.code, 'MEMBERSHIP_DAILY_LIMIT');
        // ya_inscrita
        assert.equal((await ev(ili, cl) as any).estado, 'ya_inscrita');
        console.log('  evaluarInscripcion: todos los estados · OK');

        // inscribirEnClase descuenta 1 de la bolsa y registra; cortesía no descuenta
        const ev2: any = await evaluarInscripcion(db, { userId: ana, classId: cl, cortesia: false, bloquear: true });
        const b = await inscribirEnClase(db, { userId: ana, classId: cl, membresiaId: ev2.membresia.id, cortesia: false, reservadaPor: null });
        assert.equal(b.membership_id, mAna); assert.equal(b.consumed_category, 'multi'); assert.equal(b.is_free_booking, false);
        assert.equal((await one(`SELECT multi_remaining FROM memberships WHERE id = $1`, [mAna])).multi_remaining, 2);
        const bc = await inscribirEnClase(db, { userId: sin, classId: cl, membresiaId: null, cortesia: true, reservadaPor: null });
        assert.equal(bc.is_free_booking, true); assert.equal(bc.membership_id, null);
        console.log('  inscribirEnClase: descuenta / cortesía no descuenta · OK');

        // Candidatas y la regla de cobro coinciden: bloquear true === bloquear false para cada alumna
        const clz = await clase(ctMulti.id, { dias: 55 });
        const cands = await buscarCandidatas(db, clz, tag);
        const nombres = cands.map(x => x.nombre);
        for (const n of ['Ana', 'Ilimi', 'Sinplan', 'Ceros', 'Vencida', 'Otroestudio', 'Relleno']) {
            assert.ok(nombres.some(x => x.startsWith(n)), `candidata ${n} debe aparecer`);
        }
        assert.ok(cands.length <= 8, 'máximo 8');
        for (const cand of cands) {
            const bloq: any = await evaluarInscripcion(db, { userId: cand.userId, classId: clz, cortesia: false, bloquear: true });
            assert.equal((cand as any).estado, bloq.estado, `candidatas y admin-book coinciden para ${cand.nombre}`);
            assert.deepEqual((cand as any).membresia, bloq.membresia);
            assert.equal((cand as any).mensaje, bloq.mensaje);
        }
        // y inscribir solo funciona cuando dice 'puede'
        const anaCand: any = cands.find(x => x.nombre.startsWith('Ana'));
        assert.equal(anaCand.estado, 'puede');
        // forma del resultado
        assert.deepEqual(Object.keys(anaCand).sort(), ['email', 'estado', 'membresia', 'nombre', 'telefono', 'userId']);
        console.log('  candidatas == admin-book (mismo estado/membresía/mensaje) · OK');

        // Búsqueda sin acentos ni espacios extra, mínimo 2 caracteres
        const raul = await usuario(`Raúl  Sánchez ${tag}`);
        assert.ok((await buscarCandidatas(db, clz, `raul sanchez ${tag}`)).some(x => x.userId === raul), 'sin acentos ni espacios');
        assert.deepEqual(await buscarCandidatas(db, clz, 'a'), []);
        assert.deepEqual(await buscarCandidatas(db, clz, ' '), []);

        // Staff, coaches y desactivadas fuera
        await usuario(`Coach ${tag}`, 'instructor');
        await usuario(`Recepcion ${tag}`, 'reception');
        await usuario(`Admin ${tag}`, 'admin');
        await usuario(`Inactiva ${tag}`, 'client', false);
        const todos = (await buscarCandidatas(db, clz, tag)).map(x => x.nombre);
        for (const n of ['Coach', 'Recepcion', 'Admin', 'Inactiva']) assert.ok(!todos.some(x => x.startsWith(n)), `${n} no debe aparecer`);
        console.log('  staff/coaches/inactivas excluidas · búsqueda sin acentos · OK');

        await c.query('ROLLBACK');
        console.log('test-inscripcion: OK');
    } catch (e) {
        await c.query('ROLLBACK').catch(() => { /* best-effort */ });
        throw e;
    } finally {
        c.release();
    }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e?.stack || e); process.exit(1); });
