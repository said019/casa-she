// Editar una clase manda solo lo que cambió: cambiar el tipo SIN tocar el cupo
// también debe validar el cupo actual contra la categoría del tipo nuevo
// (p. ej. una clase multi de 10 lugares no puede volverse Reformer, que tiene 8 máquinas).
// Corre contra la base LOCAL dentro de una transacción que se revierte.
//
// Correr con: DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/test-class-type-capacity.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/config/database.js';
import { errorDeCupoAlEditar } from '../src/lib/class-capacity.js';
import { MAX_REFORMER_CAPACITY } from '../src/lib/schedule.js';

// ── Cableado: el PUT /:id usa la validación compartida ──────────────────────
const ruta = readFileSync(fileURLToPath(new URL('../src/routes/classes.ts', import.meta.url)), 'utf8');
assert.match(ruta, /errorDeCupoAlEditar\(/, 'PUT /api/classes/:id debe usar errorDeCupoAlEditar');
console.log('  cableado: OK');

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // todo vive en una transacción que se revierte

        const multi = (await client.query(`SELECT id FROM class_types WHERE category = 'multi' LIMIT 1`)).rows[0];
        const reformer = (await client.query(`SELECT id FROM class_types WHERE category = 'reformer' LIMIT 1`)).rows[0];
        const ins = (await client.query(`SELECT id FROM instructors LIMIT 1`)).rows[0];
        const fac = (await client.query(`SELECT id FROM facilities LIMIT 1`)).rows[0];
        assert.ok(multi && reformer && ins && fac, 'la base local necesita tipos multi y reformer, un coach y una sucursal');

        const crear = async (cupo: number, hora: string) => (await client.query(
            `INSERT INTO classes (class_type_id, instructor_id, facility_id, date, start_time, end_time, max_capacity, status)
             VALUES ($1, $2, $3, CURRENT_DATE + 30, $5::time, $5::time + interval '50 minutes', $4, 'scheduled') RETURNING id`,
            [multi.id, ins.id, fac.id, cupo, hora],
        )).rows[0].id as string;

        // 1. Multi de 10 → Reformer sin mandar cupo: se rechaza (10 > máquinas).
        const grande = await crear(10, '05:10');
        const err = await errorDeCupoAlEditar(client, grande, { classTypeId: reformer.id });
        assert.ok(err, 'cambiar a Reformer con 10 lugares debe rechazarse');
        assert.match(err!, new RegExp(`${MAX_REFORMER_CAPACITY}`), 'el mensaje es el mismo de capacityError');

        // 2. Multi de 6 → Reformer sin mandar cupo: pasa.
        const chica = await crear(6, '05:20');
        assert.equal(await errorDeCupoAlEditar(client, chica, { classTypeId: reformer.id }), null);

        // 3. Con cupo explícito manda el cupo nuevo (comportamiento de antes).
        assert.equal(await errorDeCupoAlEditar(client, grande, { classTypeId: reformer.id, maxCapacity: 8 }), null);
        assert.ok(await errorDeCupoAlEditar(client, grande, { maxCapacity: 9 }) === null, 'multi sigue sin tope');
        assert.ok(await errorDeCupoAlEditar(client, chica, { classTypeId: reformer.id, maxCapacity: 9 }));

        // 4. Sin tipo ni cupo: nada que validar. Clase inexistente: lo resuelve el 404.
        assert.equal(await errorDeCupoAlEditar(client, grande, {}), null);
        assert.equal(await errorDeCupoAlEditar(client, '00000000-0000-0000-0000-000000000000', { classTypeId: reformer.id }), null);
        console.log('  cambiar tipo valida el cupo actual contra la categoría nueva · OK');

        await client.query('ROLLBACK');
        console.log('test-class-type-capacity: OK');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => { /* best-effort */ });
        throw e;
    } finally {
        client.release();
    }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e?.message || e); process.exit(1); });
