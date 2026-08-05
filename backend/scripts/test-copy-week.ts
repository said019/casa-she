// Copiar una semana a la siguiente: la promesa es "sin duplicidad ni errores",
// así que esto se ejecuta contra una base real y se revierte al final.
//
// Correr con: DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/test-copy-week.ts
import assert from 'node:assert/strict';
import { pool } from '../src/config/database.js';
import { copiarSemana, sumarDias, diasEntre } from '../src/lib/copy-week.js';

// ── Helpers de fecha (puros) ────────────────────────────────────────────────
assert.equal(sumarDias('2026-08-03', 7), '2026-08-10');
assert.equal(sumarDias('2026-02-28', 1), '2026-03-01');   // año no bisiesto
assert.equal(sumarDias('2026-12-28', 7), '2027-01-04');   // cruce de año
assert.equal(diasEntre('2026-08-03', '2026-08-10'), 7);
assert.equal(diasEntre('2026-08-10', '2026-08-03'), -7);
// Cruce de horario de verano: debe seguir siendo 7 días exactos, no 6.96.
assert.equal(diasEntre('2026-10-25', '2026-11-01'), 7);
console.log('  fechas: OK');

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');   // todo el test vive dentro de una transacción que se revierte

        const ct = (await client.query(`SELECT id FROM class_types LIMIT 1`)).rows[0];
        const ct2 = (await client.query(`SELECT id FROM class_types OFFSET 1 LIMIT 1`)).rows[0] ?? ct;
        const ins = (await client.query(`SELECT id FROM instructors LIMIT 1`)).rows[0];
        const fac = (await client.query(`SELECT id FROM facilities LIMIT 1`)).rows[0];
        assert.ok(ct && ins && fac, 'la base local necesita al menos un tipo de clase, un coach y una sucursal');

        // Semana origen: arranca el lunes de la semana que viene, para que el
        // destino (+7) nunca caiga en el pasado y el test no dependa de qué día se corra.
        const hoy = (await client.query(`SELECT CURRENT_DATE::text AS d`)).rows[0].d as string;
        const origen = (await client.query(
            `SELECT (date_trunc('week', CURRENT_DATE) + interval '7 days')::date::text AS d`,
        )).rows[0].d as string;
        const destino = sumarDias(origen, 7);

        const crearClase = async (fecha: string, hora: string, tipo: string, estado = 'scheduled') =>
            (await client.query(
                `INSERT INTO classes (class_type_id, instructor_id, facility_id, date, start_time, end_time, max_capacity, status)
                 VALUES ($1,$2,$3,$4::date,$5::time,$6::time,7,$7::class_status) RETURNING id`,
                [tipo, ins.id, fac.id, fecha, hora, hora, estado],
            )).rows[0].id as string;

        const c1 = await crearClase(origen, '07:00', ct.id);
        await crearClase(origen, '08:00', ct2.id);
        await crearClase(sumarDias(origen, 2), '19:00', ct.id);
        // Una cancelada: NO debe arrastrarse a la semana nueva.
        await crearClase(sumarDias(origen, 3), '10:00', ct.id, 'cancelled');

        // Cupo de TotalPass ajustado a mano en una clase: debe viajar con la copia.
        await client.query(
            `INSERT INTO channel_inventory (class_id, channel, max_spots, booked_spots)
             VALUES ($1,'totalpass',3,0)
             ON CONFLICT (class_id, channel) DO UPDATE SET max_spots = 3`,
            [c1],
        );

        // ── 1. Vista previa: cuenta pero no escribe ──────────────────────────
        const antes = (await client.query(
            `SELECT count(*)::int AS n FROM classes WHERE date >= $1::date AND date < $1::date + 7`, [destino],
        )).rows[0].n;
        const previa = await copiarSemana(client, { fromWeekStart: origen, toWeekStart: destino, dryRun: true });
        const despuesDePrevia = (await client.query(
            `SELECT count(*)::int AS n FROM classes WHERE date >= $1::date AND date < $1::date + 7`, [destino],
        )).rows[0].n;
        assert.equal(previa.creadas, 3, 'la vista previa debe contar las 3 clases vivas');
        assert.equal(despuesDePrevia, antes, 'la vista previa NO debe escribir nada');
        console.log('  vista previa: cuenta 3 y no escribe · OK');

        // ── 2. Copia real ────────────────────────────────────────────────────
        const r1 = await copiarSemana(client, { fromWeekStart: origen, toWeekStart: destino });
        assert.equal(r1.creadas, 3, 'debe crear 3');
        const copiadas = await client.query(
            `SELECT date::text AS date, substr(start_time::text,1,5) AS hora, status::text
               FROM classes WHERE date >= $1::date AND date < $1::date + 7 ORDER BY date, start_time`,
            [destino],
        );
        assert.equal(copiadas.rows.length, antes + 3);
        assert.ok(copiadas.rows.every((c: any) => c.status === 'scheduled'), 'todas nacen programadas');

        // La cancelada NO se copió.
        const canceladaCopiada = await client.query(
            `SELECT 1 FROM classes WHERE date = $1::date AND start_time = '10:00'`, [sumarDias(destino, 3)],
        );
        assert.equal(canceladaCopiada.rows.length, 0, 'una clase cancelada no debe arrastrarse');
        console.log('  copia: 3 creadas, la cancelada no se arrastró · OK');

        // ── 3. El cupo de TotalPass viaja con la copia ───────────────────────
        const inv = await client.query(
            `SELECT ci.max_spots, ci.booked_spots FROM channel_inventory ci
               JOIN classes c ON c.id = ci.class_id
              WHERE c.date = $1::date AND c.start_time = '07:00' AND ci.channel = 'totalpass'`,
            [destino],
        );
        assert.equal(inv.rows[0]?.max_spots, 3, 'el cupo TotalPass ajustado a mano debe copiarse');
        assert.equal(inv.rows[0]?.booked_spots, 0, 'la copia nace sin reservas de TotalPass');
        console.log('  cupo TotalPass: se copió 3 y sin reservas · OK');

        // ── 4. LO QUE MÁS IMPORTA: apretar el botón otra vez no duplica ──────
        const r2 = await copiarSemana(client, { fromWeekStart: origen, toWeekStart: destino });
        assert.equal(r2.creadas, 0, 'la segunda corrida no debe crear nada');
        assert.equal(r2.yaExistian, 3, 'debe reportar las 3 como ya existentes');
        const total = (await client.query(
            `SELECT count(*)::int AS n FROM classes WHERE date >= $1::date AND date < $1::date + 7`, [destino],
        )).rows[0].n;
        assert.equal(total, antes + 3, 'el total no debe moverse tras la segunda corrida');
        console.log('  idempotencia: segunda corrida crea 0 · OK');

        // ── 5. Días de descanso del estudio se respetan ──────────────────────
        const destino3 = sumarDias(origen, 21);
        await client.query(
            `INSERT INTO studio_closed_days (date, reason) VALUES ($1::date, 'prueba')
             ON CONFLICT (date) DO NOTHING`,
            [sumarDias(destino3, 0)],
        );
        const r3 = await copiarSemana(client, { fromWeekStart: origen, toWeekStart: destino3 });
        assert.ok(r3.enDiaCerrado >= 1, 'las clases que caen en día cerrado no se crean');
        assert.ok(
            r3.detalle.some((d) => d.resultado === 'día cerrado'),
            'el detalle debe explicar por qué se omitieron',
        );
        console.log('  días cerrados: se respetan · OK');

        // ── 6. Nunca crear en el pasado ──────────────────────────────────────
        const semanaPasada = sumarDias(origen, -14);
        const r4 = await copiarSemana(client, { fromWeekStart: origen, toWeekStart: semanaPasada });
        assert.equal(r4.creadas, 0, 'no debe crear clases en el pasado');
        assert.ok(r4.enElPasado >= 3, 'debe reportarlas como pasadas');
        assert.ok(semanaPasada < hoy);
        console.log('  pasado: no se crea nada · OK');

        await client.query('ROLLBACK');   // la base queda como estaba
        console.log('test-copy-week: OK');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => { /* best-effort */ });
        throw e;
    } finally {
        client.release();
    }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e?.message || e); process.exit(1); });
