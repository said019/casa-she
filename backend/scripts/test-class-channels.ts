// GET /api/classes trae `channels`: un elemento por fila de channel_inventory
// ({ channel, max, booked }), ordenado por canal, y [] si la clase no tiene filas.
// Corre contra la base LOCAL dentro de una transacción que se revierte.
//
// Correr con: DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/test-class-channels.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/config/database.js';
import { CANALES_DE_CLASE_SQL } from '../src/lib/class-channels.js';

// ── Cableado: la ruta usa el fragmento y conserva los campos de antes ───────
const ruta = readFileSync(fileURLToPath(new URL('../src/routes/classes.ts', import.meta.url)), 'utf8');
assert.match(ruta, /\$\{CANALES_DE_CLASE_SQL\} AS channels/, 'GET /api/classes debe devolver channels');
assert.match(ruta, /AS totalpass_spots/, 'totalpass_spots se conserva por compatibilidad');
assert.match(ruta, /AS totalpass_booked/, 'totalpass_booked se conserva por compatibilidad');
console.log('  cableado: OK');

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // todo vive en una transacción que se revierte

        const ct = (await client.query(`SELECT id FROM class_types LIMIT 1`)).rows[0];
        const ins = (await client.query(`SELECT id FROM instructors LIMIT 1`)).rows[0];
        const fac = (await client.query(`SELECT id FROM facilities LIMIT 1`)).rows[0];
        assert.ok(ct && ins && fac, 'la base local necesita al menos un tipo de clase, un coach y una sucursal');

        const crear = async (hora: string) => (await client.query(
            `INSERT INTO classes (class_type_id, instructor_id, facility_id, date, start_time, end_time, max_capacity, status)
             VALUES ($1, $2, $3, CURRENT_DATE + 30, $4::time, $4::time + interval '50 minutes', 7, 'scheduled') RETURNING id`,
            [ct.id, ins.id, fac.id, hora],
        )).rows[0].id as string;
        const conCanales = await crear('05:10');
        const sinCanales = await crear('05:20');
        // El trigger puede sembrar TotalPass con el default del tipo: se parte de cero.
        await client.query(`DELETE FROM channel_inventory WHERE class_id = ANY($1::uuid[])`, [[conCanales, sinCanales]]);
        await client.query(
            `INSERT INTO channel_inventory (class_id, channel, max_spots, booked_spots)
             VALUES ($1, 'totalpass', 3, 1), ($1, 'fitpass', 2, 0)`,
            [conCanales],
        );

        // Igual que la ruta: con el LEFT JOIN de TotalPass (alias ci) al lado.
        const leer = async (id: string) => (await client.query(
            `SELECT ci.max_spots AS totalpass_spots, ${CANALES_DE_CLASE_SQL} AS channels
               FROM classes c
               LEFT JOIN channel_inventory ci ON ci.class_id = c.id AND ci.channel = 'totalpass'
              WHERE c.id = $1`,
            [id],
        )).rows[0];

        const a = await leer(conCanales);
        assert.deepEqual(a.channels, [
            { channel: 'fitpass', max: 2, booked: 0 },
            { channel: 'totalpass', max: 3, booked: 1 },
        ], 'un elemento por fila, ordenados por canal, con números');
        assert.equal(a.totalpass_spots, 3, 'el campo viejo sigue igual');
        const b = await leer(sinCanales);
        assert.deepEqual(b.channels, [], 'sin filas → arreglo vacío, nunca null');
        console.log('  channels: un elemento por fila y [] sin filas · OK');

        await client.query('ROLLBACK');
        console.log('test-class-channels: OK');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => { /* best-effort */ });
        throw e;
    } finally {
        client.release();
    }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e?.message || e); process.exit(1); });
