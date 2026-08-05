/**
 * Carga la plantilla (`schedules`) desde la fuente canónica
 * `data/casa-she-official-schedule.ts`.
 *
 * Hace exactamente lo mismo que el bloque de arranque protegido por versión —
 * usa el MISMO builder — para que ambos caminos no puedan divergir. Sirve para
 * aplicar el horario sin esperar a que Railway despliegue.
 *
 *   npx tsx scripts/cargar-plantilla-oficial.ts              # simula
 *   npx tsx scripts/cargar-plantilla-oficial.ts --aplicar    # escribe
 */
import { query, queryOne, pool } from '../src/config/database.js';
import {
    CASA_SHE_OFFICIAL_FACILITY,
    CASA_SHE_OFFICIAL_SCHEDULE_VERSION,
    buildCasaSheOfficialScheduleRows,
} from '../src/data/casa-she-official-schedule.js';

const APLICAR = process.argv.includes('--aplicar');
const log = (s = '') => console.log(s);

async function main() {
    const filas = buildCasaSheOfficialScheduleRows();
    log(`\nHorario canónico ${CASA_SHE_OFFICIAL_SCHEDULE_VERSION}: ${filas.length} plantillas semanales`);

    const sede = await queryOne<{ id: string }>(`SELECT id FROM facilities WHERE name = $1 LIMIT 1`, [CASA_SHE_OFFICIAL_FACILITY]);
    if (!sede) throw new Error(`No existe la sede ${CASA_SHE_OFFICIAL_FACILITY}`);

    // Resolver tipos y coaches; reportar los que falten en vez de insertar a medias.
    const faltantes: string[] = [];
    const resueltas: Array<{ f: typeof filas[number]; tipo: string; coach: string }> = [];
    for (const f of filas) {
        const tipo = await queryOne<{ id: string }>(
            `SELECT id FROM class_types WHERE name = $1 ORDER BY is_active DESC, created_at NULLS FIRST LIMIT 1`, [f.classType]);
        const coach = await queryOne<{ id: string }>(
            `SELECT id FROM instructors WHERE display_name = $1 ORDER BY created_at NULLS FIRST LIMIT 1`, [f.instructor]);
        if (!tipo) faltantes.push(`tipo de clase: ${f.classType}`);
        else if (!coach) faltantes.push(`coach: ${f.instructor}`);
        else resueltas.push({ f, tipo: tipo.id, coach: coach.id });
    }
    if (faltantes.length) {
        log('\n  Faltan en el catálogo:');
        [...new Set(faltantes)].forEach((x) => log(`     - ${x}`));
        throw new Error('El catálogo está incompleto; no se carga la plantilla a medias.');
    }

    const actuales = await queryOne<{ n: string }>(`SELECT count(*)::text AS n FROM schedules WHERE facility_id = $1`, [sede.id]);
    log(`Plantilla actual en la sede: ${actuales!.n} · quedará en ${resueltas.length}`);

    if (!APLICAR) { log('\n  (simulación: no se escribió nada)\n'); return; }

    // La fuente canónica es la verdad completa de la plantilla de esta sede,
    // igual que en el bloque de arranque. `classes.schedule_id` es ON DELETE SET
    // NULL, así que las clases ya generadas no se pierden.
    await query(`DELETE FROM schedules WHERE facility_id = $1`, [sede.id]);
    for (const { f, tipo, coach } of resueltas) {
        await query(
            `INSERT INTO schedules (class_type_id, instructor_id, facility_id, day_of_week,
                                    start_time, end_time, max_capacity, is_active, is_recurring)
             VALUES ($1,$2,$3,$4,$5::time,$6::time,$7,true,true)`,
            [tipo, coach, sede.id, f.dayOfWeek, f.startTime, f.endTime, f.maxCapacity],
        );
    }
    await query(
        `INSERT INTO system_settings (key, value) VALUES ($1, 'true'::jsonb) ON CONFLICT (key) DO NOTHING`,
        [`casa_she_official_schedule_${CASA_SHE_OFFICIAL_SCHEDULE_VERSION}`],
    );
    log(`\n  ✅ ${resueltas.length} plantillas cargadas y marcador de versión puesto\n`);
}

main().then(() => pool.end()).then(() => process.exit(0))
    .catch((e) => { console.error('\nERROR:', e?.message || e); process.exit(1); });
