/**
 * Genera clases desde la plantilla (`schedules`) para un rango de fechas y las
 * publica en TotalPass.
 *
 * Es lo mismo que el botón "Generar" del calendario, pero para varias semanas
 * de una sentada y con la publicación a TotalPass incluida.
 *
 *   npx tsx scripts/generar-semanas.ts --hasta 2026-08-30              # simula
 *   npx tsx scripts/generar-semanas.ts --hasta 2026-08-30 --aplicar    # escribe
 *
 * Reglas:
 *  - Arranca el día siguiente a la última clase que ya exista, para no pisar
 *    nada de lo ya cargado.
 *  - Idempotente: el índice único parcial `classes_slot_unique` impide duplicar,
 *    y se repite su predicado en el ON CONFLICT para que Postgres lo infiera.
 *  - Respeta los días de descanso del estudio (`studio_closed_days`).
 *  - La fecha "de hoy" sale de la hora del ESTUDIO, no del reloj UTC del servidor.
 */
import { query, queryOne, pool } from '../src/config/database.js';
import { publishTotalPassIndividualClasses } from '../src/lib/totalpass/publish.js';
import { localDateStr, addDaysToDateStr } from '../src/lib/mx-time.js';

const APLICAR = process.argv.includes('--aplicar');
const iHasta = process.argv.indexOf('--hasta');
const HASTA = iHasta >= 0 ? process.argv[iHasta + 1] : null;

const log = (s = '') => console.log(s);

async function main() {
    if (!HASTA || !/^\d{4}-\d{2}-\d{2}$/.test(HASTA)) {
        throw new Error('Falta --hasta YYYY-MM-DD');
    }

    log(`\n${'='.repeat(66)}`);
    log(APLICAR ? '  GENERANDO SEMANAS (escribe en producción)' : '  SIMULACIÓN — no se escribe nada (usa --aplicar para ejecutar)');
    log('='.repeat(66));

    const hoy = localDateStr();
    const plantilla = await query<any>(
        `SELECT s.id, s.class_type_id, s.instructor_id, s.facility_id, s.day_of_week,
                s.start_time::text AS start_time, s.end_time::text AS end_time, s.max_capacity,
                ct.name AS clase, i.display_name AS coach
           FROM schedules s
           JOIN class_types ct ON ct.id = s.class_type_id
           JOIN instructors i ON i.id = s.instructor_id
          WHERE s.is_active AND s.is_recurring`,
    );
    if (plantilla.length === 0) throw new Error('La plantilla está vacía: no hay nada que generar.');

    // Se arranca justo después de la última clase ya cargada, para no pisarla.
    const ultima = (await queryOne<{ d: string | null }>(
        `SELECT max(date)::text AS d FROM classes WHERE date >= $1::date AND status='scheduled'`, [hoy],
    ))!.d;
    const desde = ultima ? addDaysToDateStr(ultima, 1) : addDaysToDateStr(hoy, 1);

    log(`\nHoy en el estudio: ${hoy}`);
    log(`Plantilla: ${plantilla.length} horarios semanales`);
    log(`Rango a generar: ${desde} → ${HASTA}`);

    if (desde > HASTA) {
        log('\n  Ya hay clases cargadas hasta esa fecha. Nada que hacer.');
        log(`${'='.repeat(66)}\n`);
        return;
    }

    const cerrados = new Set(
        (await query<{ d: string }>(
            `SELECT date::text AS d FROM studio_closed_days WHERE date >= $1::date AND date <= $2::date`,
            [desde, HASTA],
        )).map((r) => r.d),
    );
    if (cerrados.size) log(`Días de descanso en el rango: ${[...cerrados].join(', ')}`);

    let planeadas = 0;
    let creadas = 0;
    let omitidasCerrado = 0;
    const porDia = new Map<string, number>();

    for (let d = new Date(`${desde}T00:00:00Z`); d <= new Date(`${HASTA}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
        const fecha = d.toISOString().slice(0, 10);
        const delDia = plantilla.filter((s: any) => s.day_of_week === d.getUTCDay());
        if (cerrados.has(fecha)) { omitidasCerrado += delDia.length; continue; }

        for (const s of delDia) {
            planeadas++;
            porDia.set(fecha, (porDia.get(fecha) ?? 0) + 1);
            if (!APLICAR) continue;
            const r = await query(
                `INSERT INTO classes (schedule_id, class_type_id, instructor_id, facility_id,
                                      date, start_time, end_time, max_capacity)
                 VALUES ($1,$2,$3,$4,$5::date,$6::time,$7::time,$8)
                 ON CONFLICT (date, start_time, instructor_id, class_type_id, facility_id)
                     WHERE status='scheduled' DO NOTHING
                 RETURNING id`,
                [s.id, s.class_type_id, s.instructor_id, s.facility_id, fecha, s.start_time, s.end_time, s.max_capacity],
            );
            if (r.length) creadas++;
        }
    }

    log(`\n  ${planeadas} clases en el rango${omitidasCerrado ? ` · ${omitidasCerrado} omitidas por día de descanso` : ''}`);
    const semanas = [...porDia.entries()].reduce((acc, [f, n]) => {
        const lunes = new Date(`${f}T00:00:00Z`);
        lunes.setUTCDate(lunes.getUTCDate() - ((lunes.getUTCDay() + 6) % 7));
        const k = lunes.toISOString().slice(0, 10);
        acc.set(k, (acc.get(k) ?? 0) + n);
        return acc;
    }, new Map<string, number>());
    [...semanas.entries()].sort().forEach(([k, n]) => log(`     semana del ${k}: ${n} clases`));

    if (!APLICAR) {
        log('\n  (simulación: no se escribió nada)');
        log(`${'='.repeat(66)}\n`);
        return;
    }

    log(`\n  ✅ ${creadas} clases creadas (${planeadas - creadas} ya existían)`);

    log('\n  PUBLICANDO EN TOTALPASS…');
    const pub = await publishTotalPassIndividualClasses(desde, HASTA);
    log(`     ${pub.created} publicadas · ${pub.alreadyInTp} ya estaban · ${pub.skippedTooSoon} muy próximas · ${pub.failed} fallaron`);
    log(`${'='.repeat(66)}\n`);
}

main()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((e) => { console.error('\nERROR:', e?.message || e); process.exit(1); });
