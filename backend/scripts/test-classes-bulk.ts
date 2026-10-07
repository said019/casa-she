// POST /api/classes/bulk: la vista previa no escribe nada; cada acción bloquea lo que
// debe; aplicar con alguna bloqueada no toca nada; aplicar escribe todo en la MISMA
// transacción (o nada si algo falla a la mitad).
// Corre contra la base LOCAL dentro de una transacción que se revierte.
//
// Correr con: DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/test-classes-bulk.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/config/database.js';
import { ADVERTENCIA_TOTALPASS, ErrorLote, LoteSchema, fechaLarga, procesarLote, type EntradaLote } from '../src/lib/classes-bulk.js';
import { localDateTimeUtc } from '../src/lib/mx-time.js';
import { conTotalpass, crearAlumna, crearClase, estadoMapping, fechaEnDias, inscribir, prepararBase, publicada } from './fixtures/clases-tx.js';

// ── Cuerpo (zod) ─────────────────────────────────────────────────────────────
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const valido = (cuerpo: Record<string, unknown>) => LoteSchema.safeParse({ classIds: [uuid(1)], vistaPrevia: true, ...cuerpo }).success;
assert.ok(valido({ accion: 'cancelar' }));
assert.ok(valido({ accion: 'cancelar', motivo: 'x'.repeat(200) }));
assert.ok(!valido({ accion: 'cancelar', motivo: 'x'.repeat(201) }), 'motivo hasta 200');
assert.ok(!valido({ accion: 'cancelar', classIds: [uuid(1), uuid(1)] }), 'sin repetidos');
assert.ok(!valido({ accion: 'cancelar', classIds: [] }), 'al menos una');
assert.ok(!valido({ accion: 'cancelar', classIds: Array.from({ length: 201 }, (_, i) => uuid(i + 1)) }), 'máximo 200');
assert.ok(valido({ accion: 'cancelar', classIds: Array.from({ length: 200 }, (_, i) => uuid(i + 1)) }));
assert.ok(!valido({ accion: 'coach' }), 'coach exige instructorId');
assert.ok(valido({ accion: 'coach', instructorId: uuid(9) }));
assert.ok(!valido({ accion: 'cupo_canal', canal: 'totalpass' }), 'cupo exige lugares');
assert.ok(!valido({ accion: 'cupo_canal', canal: 'fitpass', lugares: 2 }), 'solo canales conectados');
assert.ok(!valido({ accion: 'cupo_canal', canal: 'totalpass', lugares: -1 }));
assert.ok(valido({ accion: 'cupo_canal', canal: 'totalpass', lugares: 0 }));
assert.ok(!valido({ accion: 'mover' }), 'mover exige minutos o tipo');
assert.ok(!valido({ accion: 'mover', minutos: 0 }), 'mover 0 sin tipo no hace nada');
assert.ok(!valido({ accion: 'mover', minutos: 10 }), 'múltiplo de 15');
assert.ok(!valido({ accion: 'mover', minutos: 195 }), 'máximo 180');
assert.ok(valido({ accion: 'mover', minutos: -180 }));
assert.ok(valido({ accion: 'mover', minutos: 0, classTypeId: uuid(7) }));
assert.equal(fechaLarga('2026-11-04'), 'miércoles 4 de noviembre');
console.log('  cuerpo: OK');

// ── Cableado de la ruta ──────────────────────────────────────────────────────
const ruta = readFileSync(fileURLToPath(new URL('../src/routes/classes.ts', import.meta.url)), 'utf8');
const inicioBulk = ruta.indexOf("router.post('/bulk',");
assert.ok(inicioBulk >= 0, 'existe POST /bulk');
const bulk = ruta.slice(inicioBulk, ruta.indexOf('\n});\n', inicioBulk));
assert.match(bulk, /authenticate, requireElevated/, 'solo staff elevado');
assert.match(bulk, /BEGIN[\s\S]*procesarLote\(client[\s\S]*COMMIT/, 'todo en una transacción');
assert.match(bulk, /status\(entrada\.vistaPrevia \? 200 : 409\)/, 'aplicar con bloqueadas → 409');
console.log('  cableado: OK');

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // todo vive en una transacción que se revierte
        const base = await prepararBase(client);
        const fecha = await fechaEnDias(client, 30);
        const admin = { userId: base.admin, sucursalPermitida: null };
        const lote = (e: Partial<EntradaLote> & Pick<EntradaLote, 'classIds' | 'accion'>, actor = admin, ahora?: Date) =>
            procesarLote(client, { vistaPrevia: true, ...e }, actor, ahora);
        const porId = (r: Awaited<ReturnType<typeof lote>>, id: string) => r.respuesta.clases.find((c) => c.classId === id)!;
        const fila = async (id: string) => (await client.query(
            `SELECT status::text, instructor_id, class_type_id, to_char(start_time, 'HH24:MI') AS inicio, to_char(end_time, 'HH24:MI') AS fin
               FROM classes WHERE id = $1`, [id])).rows[0];

        // Barre 7:00 con 1 alumna (app) y 1 socia de TotalPass, publicada en TotalPass.
        const siete = await crearClase(client, base, { fecha, hora: '07:00' });
        const alumna = await crearAlumna(client, base);
        const reserva = await inscribir(client, siete, alumna);
        await conTotalpass(client, base, siete, 2, 1);
        await publicada(client, siete);
        // 8:00 vacía.
        const ocho = await crearClase(client, base, { fecha, hora: '08:00' });

        // ── 1. La vista previa cuenta y no escribe nada ──────────────────────
        const previa = await lote({ classIds: [ocho, siete], accion: 'cancelar' });
        assert.equal(previa.respuesta.aplicado, false);
        assert.deepEqual(previa.respuesta.clases.map((c) => c.classId), [siete, ocho], 'ordenadas por hora');
        assert.deepEqual(porId(previa, siete), {
            classId: siete, estado: 'ok', alumnasAvisadas: 1, sociasPorCanal: { totalpass: 1 }, sociasPierdenLugar: 0, advertencias: [],
        });
        assert.deepEqual(previa.respuesta.resumen, { ok: 2, bloqueadas: 0, alumnasAvisadas: 1, sociasPierdenLugar: 0 });
        assert.equal((await fila(siete)).status, 'scheduled');
        assert.equal((await client.query(`SELECT status::text FROM bookings WHERE id = $1`, [reserva])).rows[0].status, 'confirmed');
        assert.equal(await estadoMapping(client, siete), 'published');
        assert.equal((await client.query(`SELECT multi_remaining FROM memberships WHERE id = $1`, [alumna.membershipId])).rows[0].multi_remaining, 4);
        console.log('  vista previa: cuenta y no escribe · OK');

        // ── 2. Reglas comunes ────────────────────────────────────────────────
        const cancelada = await crearClase(client, base, { fecha, hora: '09:00' });
        await client.query(`UPDATE classes SET status = 'cancelled' WHERE id = $1`, [cancelada]);
        const otraSucursal = (await client.query(
            `INSERT INTO facilities (name) VALUES ('Sucursal de prueba ' || gen_random_uuid()) RETURNING id`)).rows[0].id as string;
        const lejos = await crearClase(client, base, { fecha, hora: '10:00', sucursal: otraSucursal });
        const noExiste = '00000000-0000-4000-8000-00000000dead';
        const comunes = await lote({ classIds: [cancelada, lejos, noExiste, ocho], accion: 'cancelar' }, { userId: base.admin, sucursalPermitida: base.sucursal });
        assert.equal(porId(comunes, cancelada).motivo, 'Ya está cancelada.');
        assert.equal(porId(comunes, lejos).motivo, 'Es de otra sucursal.');
        assert.equal(porId(comunes, noExiste).motivo, 'Esta clase ya no existe.');
        assert.equal(porId(comunes, ocho).estado, 'ok');
        assert.equal(porId(comunes, lejos).alumnasAvisadas, 0);
        assert.equal((await lote({ classIds: [lejos], accion: 'cancelar' })).respuesta.resumen.ok, 1, 'admin ve todas las sucursales');
        const empezada = await lote({ classIds: [ocho], accion: 'cancelar' }, admin, localDateTimeUtc(fecha, '08:10'));
        assert.equal(porId(empezada, ocho).motivo, 'Ya empezó.');
        const pasada = await lote({ classIds: [ocho], accion: 'cancelar' }, admin, localDateTimeUtc(fecha, '09:00'));
        assert.equal(porId(pasada, ocho).motivo, 'Ya pasó.');
        console.log('  reglas comunes: cancelada, otra sucursal, no existe, empezó, pasó · OK');

        // ── 3. coach ────────────────────────────────────────────────────────
        // coachB ya da una clase a las 6:30 en OTRA sucursal: se encima con la de 7:00, no con la de 8:00.
        await crearClase(client, base, { fecha, hora: '06:30', coach: base.coachB, sucursal: otraSucursal });
        const coach = await lote({ classIds: [siete, ocho], accion: 'coach', instructorId: base.coachB });
        assert.match(porId(coach, siete).motivo!, /ya tiene .* a las 6:30\./);
        assert.equal(porId(coach, ocho).estado, 'ok');
        const encimadas = await crearClase(client, base, { fecha, hora: '08:30', tipo: base.multi2 });
        const juntas = await lote({ classIds: [ocho, encimadas], accion: 'coach', instructorId: base.coachB });
        assert.match(porId(juntas, ocho).motivo!, /también seleccionada/);
        const misma = await lote({ classIds: [ocho], accion: 'coach', instructorId: base.coachA });
        assert.equal(porId(misma, ocho).estado, 'ok');
        assert.equal(porId(misma, ocho).advertencias.length, 1, 'ya la da esa coach');
        await assert.rejects(lote({ classIds: [ocho], accion: 'coach', instructorId: uuid(404) }), (e: unknown) => e instanceof ErrorLote && e.status === 404);
        console.log('  coach: choque en otra sucursal y dentro de la selección · OK');

        // ── 4. cupo_canal ───────────────────────────────────────────────────
        const cupo = (lugares: number) => lote({ classIds: [siete, ocho], accion: 'cupo_canal', canal: 'totalpass', lugares });
        assert.match(porId(await cupo(0), siete).motivo!, /1 socia inscrita: no puede bajar de 1/);
        assert.equal(porId(await cupo(0), ocho).estado, 'ok');
        assert.match(porId(await cupo(8), ocho).motivo!, /La clase tiene 7 lugares/);
        assert.equal((await cupo(3)).respuesta.resumen.bloqueadas, 0);
        console.log('  cupo_canal: no baja de las socias ni pasa del cupo · OK');

        // ── 5. mover ────────────────────────────────────────────────────────
        const temprano = await crearClase(client, base, { fecha, hora: '05:10' });
        assert.match(porId(await lote({ classIds: [temprano], accion: 'mover', minutos: -15 }), temprano).motivo!, /fuera del horario/);
        const noche = await crearClase(client, base, { fecha, hora: '22:00', minutos: 60 });
        assert.match(porId(await lote({ classIds: [noche], accion: 'mover', minutos: 15 }), noche).motivo!, /fuera del horario/);
        // Una de coachB a las 5:00 movida +1 h choca con su clase de las 6:30 en la otra sucursal.
        const deB = await crearClase(client, base, { fecha, hora: '05:00', coach: base.coachB });
        assert.match(porId(await lote({ classIds: [deB], accion: 'mover', minutos: 60 }), deB).motivo!, /ya tiene .* a las 6:30/);
        assert.equal(porId(await lote({ classIds: [deB], accion: 'mover', minutos: 150 }), deB).estado, 'ok', 'a las 7:30 ya no choca');
        // Mover la 7:00 publicada a las 6:00: la socia pierde su lugar; y si faltan menos de 5 h, advertencia.
        // (+1 h no se puede: coachA ya da la de las 8:00.)
        assert.match(porId(await lote({ classIds: [siete], accion: 'mover', minutos: 60 }), siete).motivo!, /ya tiene .* a las 8:00/);
        const mover = await lote({ classIds: [siete], accion: 'mover', minutos: -60 });
        assert.equal(porId(mover, siete).estado, 'ok');
        assert.equal(porId(mover, siete).sociasPierdenLugar, 1);
        assert.equal(porId(mover, siete).alumnasAvisadas, 1);
        assert.deepEqual(porId(mover, siete).advertencias, []);
        const prisa = await lote({ classIds: [siete], accion: 'mover', minutos: -60 }, admin, localDateTimeUtc(fecha, '04:30'));
        assert.deepEqual(porId(prisa, siete).advertencias, [ADVERTENCIA_TOTALPASS]);
        // Solo el tipo: TotalPass edita, nadie pierde lugar.
        assert.equal(porId(await lote({ classIds: [siete], accion: 'mover', minutos: 0, classTypeId: base.multi2 }), siete).sociasPierdenLugar, 0);
        // Cambiar de bolsa con alumnas inscritas: bloqueada. Sin alumnas: pasa (si cabe).
        assert.match(porId(await lote({ classIds: [siete], accion: 'mover', classTypeId: base.reformer }), siete).motivo!, /créditos de Clases: no puede volverse Salsa/);
        assert.equal(porId(await lote({ classIds: [ocho], accion: 'mover', classTypeId: base.reformer }), ocho).estado, 'ok');
        const grande = await crearClase(client, base, { fecha, hora: '12:00', cupo: 10 });
        assert.match(porId(await lote({ classIds: [grande], accion: 'mover', classTypeId: base.reformer }), grande).motivo!, /no puede exceder 8/);
        await assert.rejects(lote({ classIds: [ocho], accion: 'mover', classTypeId: uuid(405) }), (e: unknown) => e instanceof ErrorLote && e.status === 404);
        console.log('  mover: horario, coach, bolsa, cupo, socias que pierden lugar y advertencia · OK');

        // ── 6. Aplicar con una bloqueada: no toca nada ───────────────────────
        const conBloqueada = await procesarLote(client, { classIds: [ocho, cancelada], accion: 'cancelar', vistaPrevia: false }, admin);
        assert.equal(conBloqueada.respuesta.aplicado, false, 'la ruta responde 409 con esta respuesta');
        assert.equal(conBloqueada.respuesta.resumen.bloqueadas, 1);
        assert.equal((await fila(ocho)).status, 'scheduled', 'la que estaba bien tampoco se toca');
        assert.deepEqual(conBloqueada.trasCommit.avisosCancelacion, []);
        console.log('  aplicar con una bloqueada: nada cambia · OK');

        // ── 7. Aplicar mover: corre la hora, marca resync y avisa ────────────
        const movida = await procesarLote(client, { classIds: [siete], accion: 'mover', minutos: -60, vistaPrevia: false }, admin);
        assert.equal(movida.respuesta.aplicado, true);
        assert.deepEqual({ inicio: (await fila(siete)).inicio, fin: (await fila(siete)).fin }, { inicio: '06:00', fin: '06:50' });
        assert.equal(await estadoMapping(client, siete), 'pending_resync');
        assert.equal(movida.trasCommit.resync, true);
        assert.deepEqual(movida.trasCommit.avisosAlumnas.map((a) => [a.userId, a.type]), [[alumna.userId, 'class_updated']]);
        assert.match(movida.trasCommit.avisosAlumnas[0].body, /ahora es a las 6:00 \(antes 7:00\)/);
        assert.deepEqual(movida.trasCommit.antes.map((a) => a.inicio), ['07:00'], 'guarda cómo estaba para la auditoría');
        // De regreso (lo que haría "Deshacer").
        const deVuelta = await procesarLote(client, { classIds: [siete], accion: 'mover', minutos: 60, vistaPrevia: false }, admin);
        assert.equal(deVuelta.respuesta.aplicado, true);
        assert.equal((await fila(siete)).inicio, '07:00');
        console.log('  aplicar mover: hora, pending_resync y aviso · OK');

        // ── 8. Aplicar coach ─────────────────────────────────────────────────
        const conCoach = await procesarLote(client, { classIds: [ocho], accion: 'coach', instructorId: base.coachB, vistaPrevia: false }, admin);
        assert.equal(conCoach.respuesta.aplicado, true);
        assert.equal((await fila(ocho)).instructor_id, base.coachB);
        assert.deepEqual(conCoach.trasCommit.correosCoach.map((c) => [c.instructorId, c.startTime]), [[base.coachB, '08:00']]);
        console.log('  aplicar coach: cambia y prepara el correo a la coach nueva · OK');

        // ── 9. Aplicar cupo_canal: respeta CAP_BELOW_BOOKED y 0 marca retiro ──
        const vacia = await crearClase(client, base, { fecha, hora: '13:00' });
        await publicada(client, vacia);
        await conTotalpass(client, base, vacia, 2, 0);
        const bajo = await procesarLote(client, { classIds: [siete, vacia], accion: 'cupo_canal', canal: 'totalpass', lugares: 0, vistaPrevia: false }, admin);
        assert.equal(bajo.respuesta.aplicado, false, 'la 7:00 tiene 1 socia: no baja a 0');
        assert.equal(await estadoMapping(client, vacia), 'published', 'y la otra tampoco se tocó');
        const apagada = await procesarLote(client, { classIds: [vacia], accion: 'cupo_canal', canal: 'totalpass', lugares: 0, vistaPrevia: false }, admin);
        assert.equal(apagada.trasCommit.retiro, true);
        assert.equal(await estadoMapping(client, vacia), 'pending_delete');
        await procesarLote(client, { classIds: [siete], accion: 'cupo_canal', canal: 'totalpass', lugares: 4, vistaPrevia: false }, admin);
        assert.equal((await client.query(`SELECT max_spots FROM channel_inventory WHERE class_id = $1 AND channel = 'totalpass'`, [siete])).rows[0].max_spots, 4);
        console.log('  aplicar cupo_canal: no baja de las socias; 0 retira · OK');

        // ── 10. Una falla a la mitad no deja nada ────────────────────────────
        // Un trigger de prueba truena al cancelar la SEGUNDA clase (la de las 8:00).
        await client.query(`CREATE FUNCTION pg_temp.falla_a_la_mitad() RETURNS trigger AS $$
            BEGIN IF NEW.id = '${ocho}'::uuid AND NEW.status = 'cancelled' THEN RAISE EXCEPTION 'falla de prueba'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
        await client.query(`CREATE TRIGGER falla_a_la_mitad BEFORE UPDATE ON classes FOR EACH ROW EXECUTE FUNCTION pg_temp.falla_a_la_mitad()`);
        await client.query('SAVEPOINT antes_del_lote'); // la ruta hace ROLLBACK de toda su transacción; aquí, hasta este punto
        await assert.rejects(procesarLote(client, { classIds: [siete, ocho], accion: 'cancelar', vistaPrevia: false }, admin), /falla de prueba/);
        await client.query('ROLLBACK TO SAVEPOINT antes_del_lote');
        assert.equal((await fila(siete)).status, 'scheduled', 'la primera NO quedó cancelada');
        assert.equal((await client.query(`SELECT status::text FROM bookings WHERE id = $1`, [reserva])).rows[0].status, 'confirmed');
        assert.equal((await client.query(`SELECT multi_remaining FROM memberships WHERE id = $1`, [alumna.membershipId])).rows[0].multi_remaining, 4);
        assert.equal(await estadoMapping(client, siete), 'pending_resync', 'el mapping sigue como estaba');
        await client.query(`DROP TRIGGER falla_a_la_mitad ON classes`);
        console.log('  falla a la mitad: no queda nada · OK');

        // ── 11. Aplicar cancelar: cancela, devuelve créditos, marca retiro ───
        const motivo = 'Puente del 2 de noviembre';
        const canceladas = await procesarLote(client, { classIds: [siete, ocho], accion: 'cancelar', motivo, vistaPrevia: false }, admin);
        assert.equal(canceladas.respuesta.aplicado, true);
        assert.deepEqual(canceladas.respuesta.resumen, { ok: 2, bloqueadas: 0, alumnasAvisadas: 1, sociasPierdenLugar: 0 });
        for (const id of [siete, ocho]) {
            const c = (await client.query(`SELECT status::text, cancellation_reason FROM classes WHERE id = $1`, [id])).rows[0];
            assert.deepEqual(c, { status: 'cancelled', cancellation_reason: motivo }, 'cancelada, nunca borrada');
        }
        assert.equal((await client.query(`SELECT status::text FROM bookings WHERE id = $1`, [reserva])).rows[0].status, 'cancelled');
        assert.equal((await client.query(`SELECT multi_remaining FROM memberships WHERE id = $1`, [alumna.membershipId])).rows[0].multi_remaining, 5, 'crédito devuelto');
        assert.equal(await estadoMapping(client, siete), 'pending_delete');
        assert.equal(canceladas.trasCommit.retiro, true);
        assert.ok(canceladas.trasCommit.avisosCancelacion.some((a) => a.userId === alumna.userId), 'el aviso se manda después del COMMIT');
        console.log('  aplicar cancelar: canceladas, créditos devueltos, pending_delete · OK');

        await client.query('ROLLBACK');
        console.log('test-classes-bulk: OK');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => { /* best-effort */ });
        throw e;
    } finally {
        client.release();
    }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e?.message || e); process.exit(1); });
