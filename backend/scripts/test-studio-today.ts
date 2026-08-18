// Integration test (Postgres real): "hoy" del negocio se ancla a la hora del ESTUDIO.
//
// El servidor corre en UTC; el estudio opera en America/Mexico_City. Desde las 18:00 CDMX,
// CURRENT_DATE ya es el día siguiente. Eso vencía membresías un día antes, escondía las
// clases de la misma tarde y dejaba los tableros de "hoy" en cero.
//
// studio_today() es la fuente de verdad en SQL; cdmxToday() es su contraparte en JS.
// Este test verifica que la función EXISTE (la app la llama en decenas de consultas) y que
// ambas coinciden siempre.
import assert from 'node:assert/strict';
import { pool } from '../src/config/database.js';
import { cdmxToday } from '../src/lib/schedule.js';

async function main() {
  const c = await pool.connect();
  try {
    // 1. La función existe. Sin ella, decenas de consultas de la app truenan.
    const { rows: fn } = await c.query(
      `SELECT p.proname, p.provolatile FROM pg_proc p WHERE p.proname = 'studio_today'`);
    assert.equal(fn.length, 1, 'studio_today() debe existir en la BD');
    assert.equal(fn[0].provolatile, 's', 'debe ser STABLE para que el planeador use índices');

    // 2. SQL y JS coinciden — si divergieran, backend y consultas darían días distintos.
    const { rows } = await c.query(`SELECT studio_today()::text AS sql_hoy`);
    assert.equal(rows[0].sql_hoy, cdmxToday(), 'studio_today() y cdmxToday() deben coincidir');

    // 3. Es la fecha de CDMX, no la del servidor.
    const { rows: tz } = await c.query(
      `SELECT (NOW() AT TIME ZONE 'America/Mexico_City')::text AS cdmx, studio_today()::text AS f`);
    assert.equal(tz[0].f, tz[0].cdmx.slice(0, 10), 'studio_today() = fecha de pared en CDMX');

    // 4. Los DEFAULT de dinero ya no anclan en UTC: un egreso capturado a las 7 PM debe
    //    caer en el corte de HOY, no en el de mañana.
    const { rows: defs } = await c.query(
      `SELECT table_name, column_default FROM information_schema.columns
        WHERE (table_name, column_name) IN (('egresos','date'), ('manual_incomes','income_date'))`);
    for (const d of defs) {
      assert.ok(!/CURRENT_DATE/.test(d.column_default || ''),
        `${d.table_name} todavía usa CURRENT_DATE como default`);
    }

    console.log('✅ test-studio-today: "hoy" del negocio está anclado a la hora del estudio');
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => { console.error('❌ test-studio-today:', e.message || e); process.exit(1); });
