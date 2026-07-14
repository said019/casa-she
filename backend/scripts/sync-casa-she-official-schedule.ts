import { pool } from '../src/config/database.js';
import { CASA_SHE_OFFICIAL_FACILITY } from '../src/data/casa-she-official-schedule.js';

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function assertDate(value: string | undefined, name: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} es obligatorio y debe tener formato YYYY-MM-DD`);
  }
  return value;
}

async function main() {
  const from = assertDate(argValue('--from'), '--from');
  const to = assertDate(argValue('--to'), '--to');
  const apply = process.argv.includes('--apply');
  if (from > to) throw new Error('--from no puede ser posterior a --to');

  const client = await pool.connect();
  try {
    const facilityResult = await client.query<{ id: string }>(
      `SELECT id FROM facilities WHERE name = $1 AND is_active = true LIMIT 1`,
      [CASA_SHE_OFFICIAL_FACILITY]
    );
    const facilityId = facilityResult.rows[0]?.id;
    if (!facilityId) throw new Error(`No existe la sede activa ${CASA_SHE_OFFICIAL_FACILITY}`);

    const templateResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM schedules
       WHERE facility_id = $1 AND is_active = true AND is_recurring = true`,
      [facilityId]
    );
    const templateCount = Number(templateResult.rows[0]?.count ?? 0);
    if (templateCount !== 54) {
      throw new Error(`Se esperaban 54 plantillas oficiales y hay ${templateCount}; no se modificó producción`);
    }

    const protectedResult = await client.query<{ count: string }>(
      `SELECT COUNT(DISTINCT c.id)::text AS count
       FROM classes c
       WHERE c.facility_id = $1
         AND c.date BETWEEN $2::date AND $3::date
         AND c.status = 'scheduled'
         AND (
           COALESCE(c.current_bookings, 0) > 0
           OR EXISTS (SELECT 1 FROM bookings b WHERE b.class_id = c.id)
           OR EXISTS (SELECT 1 FROM guest_bookings g WHERE g.class_id = c.id)
         )`,
      [facilityId, from, to]
    );
    const protectedCount = Number(protectedResult.rows[0]?.count ?? 0);
    if (protectedCount > 0) {
      throw new Error(`Hay ${protectedCount} clase(s) con reservas activas en el rango; no se modificó producción`);
    }

    const currentResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM classes
       WHERE facility_id = $1 AND date BETWEEN $2::date AND $3::date AND status = 'scheduled'`,
      [facilityId, from, to]
    );
    const currentCount = Number(currentResult.rows[0]?.count ?? 0);

    const expectedResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM generate_series($2::date, $3::date, INTERVAL '1 day') AS d(day)
       JOIN schedules s ON s.day_of_week = EXTRACT(DOW FROM d.day)::int
       WHERE s.facility_id = $1 AND s.is_active = true AND s.is_recurring = true`,
      [facilityId, from, to]
    );
    const expectedCount = Number(expectedResult.rows[0]?.count ?? 0);

    if (!apply) {
      console.log(JSON.stringify({ mode: 'dry-run', from, to, templates: templateCount, current: currentCount, expected: expectedCount, protected: protectedCount }));
      return;
    }

    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('casa_she_official_schedule_sync'))`);

    // Revalida dentro de la transacción para cerrar la ventana entre dry-run y escritura.
    const lockedProtected = await client.query<{ id: string }>(
      `SELECT c.id
       FROM classes c
       WHERE c.facility_id = $1
         AND c.date BETWEEN $2::date AND $3::date
         AND c.status = 'scheduled'
         AND (
           COALESCE(c.current_bookings, 0) > 0
           OR EXISTS (SELECT 1 FROM bookings b WHERE b.class_id = c.id)
           OR EXISTS (SELECT 1 FROM guest_bookings g WHERE g.class_id = c.id)
         )
       FOR UPDATE OF c`,
      [facilityId, from, to]
    );
    if (lockedProtected.rowCount && lockedProtected.rowCount > 0) {
      throw new Error('Aparecieron reservas activas durante la sincronización; transacción cancelada');
    }

    const deleted = await client.query(
      `DELETE FROM classes
       WHERE facility_id = $1 AND date BETWEEN $2::date AND $3::date AND status = 'scheduled'`,
      [facilityId, from, to]
    );
    const inserted = await client.query(
      `INSERT INTO classes
         (schedule_id, class_type_id, instructor_id, facility_id, date,
          start_time, end_time, max_capacity, status)
       SELECT s.id, s.class_type_id, s.instructor_id, s.facility_id, d.day::date,
              s.start_time, s.end_time, s.max_capacity, 'scheduled'::class_status
       FROM generate_series($2::date, $3::date, INTERVAL '1 day') AS d(day)
       JOIN schedules s ON s.day_of_week = EXTRACT(DOW FROM d.day)::int
       WHERE s.facility_id = $1 AND s.is_active = true AND s.is_recurring = true
       ON CONFLICT DO NOTHING`,
      [facilityId, from, to]
    );
    await client.query('COMMIT');

    console.log(JSON.stringify({ mode: 'applied', from, to, templates: templateCount, deleted: deleted.rowCount, inserted: inserted.rowCount, expected: expectedCount }));
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* no transaction */ }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
