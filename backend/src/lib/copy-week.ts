/**
 * Copiar una semana de clases a otra.
 *
 * Distinto de la generación desde plantilla (`schedules`): aquélla reconstruye
 * el horario "de fábrica" y pierde los ajustes de la semana (coach suplente,
 * clase extra, horario movido). Ésta copia la semana REAL tal como quedó.
 *
 * Vive aparte de la ruta para poder probarse contra una base de verdad: la
 * promesa que importa —que apretar el botón dos veces no duplique nada— solo
 * se puede comprobar ejecutándola.
 */
import type { PoolClient } from 'pg';

export interface CopiarSemanaParams {
    fromWeekStart: string;   // YYYY-MM-DD
    toWeekStart: string;     // YYYY-MM-DD
    facilityId?: string | null;
    /** true = las clases canceladas también se crean y conservan ese estado. */
    includeCancelled?: boolean;
    /** true = solo calcula y no escribe nada (vista previa de la UI). */
    dryRun?: boolean;
}

export interface CopiarSemanaResultado {
    creadas: number;
    yaExistian: number;
    enDiaCerrado: number;
    enElPasado: number;
    canceladasConservadas: number;
    canceladasOmitidas: number;
    includeCancelled: boolean;
    dryRun: boolean;
    detalle: Array<{ fecha: string; hora: string; clase: string; resultado: string }>;
    mensaje?: string;
}

/** Suma días a 'YYYY-MM-DD' en UTC puro, sin pasar por la zona del servidor. */
export function sumarDias(fecha: string, dias: number): string {
    const d = new Date(`${fecha}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
}

/** Días enteros entre dos fechas 'YYYY-MM-DD' (UTC, sin horario de verano de por medio). */
export function diasEntre(desde: string, hasta: string): number {
    const a = Date.parse(`${desde}T00:00:00Z`);
    const b = Date.parse(`${hasta}T00:00:00Z`);
    return Math.round((b - a) / 86400000);
}

/**
 * Reglas para no duplicar ni ensuciar:
 *  - Siempre copia las clases `scheduled`. Las canceladas solo se arrastran si
 *    el usuario lo confirma y, en ese caso, conservan el estado `cancelled`.
 *  - Nunca crea en el pasado.
 *  - Respeta los días de descanso del estudio (`studio_closed_days`) del destino.
 *  - El dedupe se apoya en el índice único PARCIAL `classes_slot_unique`
 *    (date, start_time, instructor_id, class_type_id, facility_id) WHERE
 *    status='scheduled'. Como `facility_id` es NULLable y en un índice único los
 *    NULL no chocan entre sí, además se comprueba explícitamente con
 *    `IS NOT DISTINCT FROM` — si no, dos clases sin sucursal se duplicarían.
 *  - NO copia reservas, ni `is_free`, ni `booking_closed`: son estados de esa
 *    semana, no del horario. Una clase gratis no debe repetirse sola.
 *  - Sí copia el cupo de TotalPass de cada clase, porque el estudio lo ajusta a
 *    mano y perderlo significaría republicar con lugares equivocados.
 *
 * El caller decide la transacción (la ruta hace BEGIN/COMMIT alrededor).
 */
export async function copiarSemana(
    client: PoolClient,
    {
        fromWeekStart,
        toWeekStart,
        facilityId = null,
        includeCancelled = false,
        dryRun = false,
    }: CopiarSemanaParams,
): Promise<CopiarSemanaResultado> {
    const desfase = diasEntre(fromWeekStart, toWeekStart);

    const origen = await client.query(
        `SELECT c.id, c.schedule_id, c.class_type_id, c.instructor_id, c.facility_id,
                c.date::text AS date, c.start_time::text AS start_time,
                c.end_time::text AS end_time, c.max_capacity, c.status::text AS status,
                ct.name AS class_type_name,
                ci.max_spots AS totalpass_spots
           FROM classes c
           JOIN class_types ct ON ct.id = c.class_type_id
           LEFT JOIN channel_inventory ci ON ci.class_id = c.id AND ci.channel = 'totalpass'
          WHERE c.date >= $1::date AND c.date < $1::date + 7
            AND c.status IN ('scheduled', 'cancelled')
            AND ($2::uuid IS NULL OR c.facility_id = $2::uuid)
          ORDER BY c.date, c.start_time`,
        [fromWeekStart, facilityId],
    );

    const vacio: CopiarSemanaResultado = {
        creadas: 0,
        yaExistian: 0,
        enDiaCerrado: 0,
        enElPasado: 0,
        canceladasConservadas: 0,
        canceladasOmitidas: 0,
        includeCancelled,
        dryRun,
        detalle: [],
    };
    if (origen.rows.length === 0) {
        return { ...vacio, mensaje: 'La semana de origen no tiene clases que copiar.' };
    }

    const cerrados = await client.query(
        `SELECT date::text AS date FROM studio_closed_days
          WHERE date >= $1::date AND date < $1::date + 7`,
        [toWeekStart],
    );
    const diasCerrados = new Set<string>(cerrados.rows.map((r: any) => r.date));

    const hoy = (await client.query(`SELECT studio_today()::text AS hoy`)).rows[0].hoy as string;

    const r: CopiarSemanaResultado = { ...vacio, detalle: [] };

    for (const c of origen.rows) {
        const destino = sumarDias(c.date, desfase);
        const hora = String(c.start_time).slice(0, 5);
        const esCancelada = c.status === 'cancelled';
        const estadoDestino = esCancelada ? 'cancelled' : 'scheduled';
        const anota = (resultado: string) =>
            r.detalle.push({ fecha: destino, hora, clase: c.class_type_name, resultado });

        if (esCancelada && !includeCancelled) {
            r.canceladasOmitidas++;
            anota('cancelada omitida');
            continue;
        }

        if (destino < hoy) { r.enElPasado++; anota('en el pasado'); continue; }
        if (diasCerrados.has(destino)) { r.enDiaCerrado++; anota('día cerrado'); continue; }

        // Comprobación explícita: cubre el hueco de los NULL en el índice único y
        // permite contar bien en dryRun, donde no hay INSERT que avise del conflicto.
        const yaHay = await client.query(
            `SELECT 1 FROM classes
              WHERE date = $1::date AND start_time = $2::time
                AND instructor_id = $3 AND class_type_id = $4
                AND facility_id IS NOT DISTINCT FROM $5
                AND status = $6::class_status
              LIMIT 1`,
            [destino, c.start_time, c.instructor_id, c.class_type_id, c.facility_id, estadoDestino],
        );
        if (yaHay.rows.length > 0) { r.yaExistian++; anota('ya existía'); continue; }

        if (dryRun) {
            r.creadas++;
            if (esCancelada) r.canceladasConservadas++;
            anota(esCancelada ? 'se conservará cancelada' : 'se creará');
            continue;
        }

        // ON CONFLICT sobre el índice PARCIAL: hay que repetir su predicado para que
        // Postgres lo infiera. Protege de una carrera entre el SELECT y el INSERT
        // (dos personas apretando el botón a la vez).
        const insertada = await client.query(
            `INSERT INTO classes (schedule_id, class_type_id, instructor_id, facility_id,
                                  date, start_time, end_time, max_capacity, status)
             VALUES ($1, $2, $3, $4, $5::date, $6::time, $7::time, $8, $9::class_status)
             ON CONFLICT (date, start_time, instructor_id, class_type_id, facility_id)
                 WHERE status = 'scheduled' DO NOTHING
             RETURNING id`,
            [c.schedule_id, c.class_type_id, c.instructor_id, c.facility_id,
                destino, c.start_time, c.end_time, c.max_capacity, estadoDestino],
        );

        if (insertada.rows.length === 0) { r.yaExistian++; anota('ya existía'); continue; }

        // Ajustar el inventario al cupo real que traía la clase de origen.
        // UPSERT, no UPDATE: el trigger siembra la fila desde
        // `class_types.totalpass_default_spots`, pero si ese default es 0 o NULL
        // no hay fila que actualizar y el cupo ajustado a mano se perdía en
        // silencio — la clase se republicaría a TotalPass con lugares de más.
        if (c.totalpass_spots != null) {
            await client.query(
                `INSERT INTO channel_inventory (class_id, channel, max_spots, booked_spots)
                 VALUES ($1, 'totalpass', $2, 0)
                 ON CONFLICT (class_id, channel)
                 DO UPDATE SET max_spots = EXCLUDED.max_spots, updated_at = NOW()`,
                [insertada.rows[0].id, c.totalpass_spots],
            );
        }

        r.creadas++;
        if (esCancelada) r.canceladasConservadas++;
        anota(esCancelada ? 'conservada cancelada' : 'creada');
    }

    return r;
}
