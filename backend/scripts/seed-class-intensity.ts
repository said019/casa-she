import pg from 'pg';
import { classIntensityDDL } from '../src/lib/classIntensity.js';
import { planIntensitySeed, referenceIntensity, type IntensitySeedRow } from '../src/lib/classIntensityReference.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
const apply = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
  if (apply) {
    await client.query(`SELECT pg_advisory_xact_lock(9102026, 1)`);
    await client.query(classIntensityDDL);
    await client.query(`CREATE TABLE IF NOT EXISTS migration_flags (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())`);
    const done = await client.query(`SELECT 1 FROM migration_flags WHERE name = 'class_intensity_images_20260910'`);
    if (done.rows.length) throw new Error('Image seed already applied; use the class editor for subsequent changes');
  }
  const classes = await client.query<IntensitySeedRow>(`
    SELECT c.id, EXTRACT(DOW FROM c.date)::int AS day, c.date::text,
           c.start_time::text AS time, ct.name AS discipline, i.display_name AS instructor,
           (to_jsonb(c)->>'intensity')::int AS intensity, c.facility_id
      FROM classes c JOIN class_types ct ON ct.id=c.class_type_id
      JOIN instructors i ON i.id=c.instructor_id
     WHERE c.date >= (NOW() AT TIME ZONE 'America/Mexico_City')::date AND c.status='scheduled'
     ${apply ? 'FOR UPDATE OF c' : ''}`);
  const schedules = await client.query<IntensitySeedRow>(`
    SELECT s.id, s.day_of_week AS day, s.start_time::text AS time,
           ct.name AS discipline, i.display_name AS instructor,
           (to_jsonb(s)->>'intensity')::int AS intensity, s.facility_id
      FROM schedules s JOIN class_types ct ON ct.id=s.class_type_id
      JOIN instructors i ON i.id=s.instructor_id
     WHERE s.is_active=true ${apply ? 'FOR UPDATE OF s' : ''}`);
  for (const [table, rows] of [['classes', classes.rows], ['schedules', schedules.rows]] as const) {
    const plan = planIntensitySeed(rows);
    const unmatched = [...new Set(rows.filter(r => referenceIntensity(r.day, r.time, r.discipline, r.instructor) === null)
      .map(r => `${r.day} ${r.time.slice(0, 5)} ${r.discipline} / ${r.instructor}`))];
    console.log(JSON.stringify({ table, mode: apply ? 'apply' : 'preview', candidates: rows.length,
      updates: plan.updates.length, ambiguous: plan.ambiguous, unmatched }, null, 2));
    if (apply) {
      for (const update of plan.updates) {
        await client.query(`UPDATE ${table} SET intensity=$1 WHERE id=$2 AND intensity IS NULL`, [update.intensity, update.id]);
      }
    }
  }
  if (apply) await client.query(`INSERT INTO migration_flags (name) VALUES ('class_intensity_images_20260910')`);
  await client.query(apply ? 'COMMIT' : 'ROLLBACK');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release(); await pool.end();
}
