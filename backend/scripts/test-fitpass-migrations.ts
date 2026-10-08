/**
 * Migraciones FitPass 122–127: idempotencia + trigger de inventario, en la BD LOCAL dentro de
 * BEGIN/ROLLBACK (no deja rastro). Correr:
 *   DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/test-fitpass-migrations.ts
 */
import assert from 'node:assert/strict';
import { pool } from '../src/config/database.js';
import { FITPASS_MIGRATIONS } from '../src/lib/fitpass/migrations.js';

assert.deepEqual(FITPASS_MIGRATIONS.map((m) => m.n), [122, 123, 124, 125, 126, 127, 128]);

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const run = async () => { for (const m of FITPASS_MIGRATIONS) for (const s of m.statements) await client.query(s); };
        await run();
        await run(); // idempotente: segunda pasada sin error
        console.log('  ok aplicadas dos veces sin error');

        const col = async (t: string, c: string) => (await client.query(
            `SELECT data_type FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`, [t, c])).rows[0]?.data_type;
        assert.equal(await col('platform_credentials', 'scraper_config'), 'bytea');
        assert.equal(await col('class_types', 'fitpass_lesson_id'), 'integer');
        assert.equal(await col('class_types', 'fitpass_quota'), 'integer');
        assert.ok(await col('users', 'source'));
        assert.equal((await client.query(`SELECT is_enabled FROM platform_credentials WHERE channel='fitpass'`)).rows[0].is_enabled, false);
        assert.equal((await client.query(`SELECT 1 FROM pg_indexes WHERE indexname='uq_partner_fitpass_slot_owner'`)).rowCount, 1);
        assert.equal((await client.query(`SELECT 1 FROM pg_extension WHERE extname='pgcrypto'`)).rowCount, 1);
        assert.ok(await col('cron_job_logs', 'details'));
        console.log('  ok columnas/índice/extensión/fila seed');

        // Cifrado de ida y vuelta con la llave por parámetro
        const key = 'k'.repeat(40);
        await client.query(`UPDATE platform_credentials SET scraper_config = pgp_sym_encrypt($1, $2) WHERE channel='fitpass'`, [JSON.stringify({ email: 'x@y.z' }), key]);
        const back = await client.query(`SELECT pgp_sym_decrypt(scraper_config, $1)::jsonb AS c FROM platform_credentials WHERE channel='fitpass'`, [key]);
        assert.equal(back.rows[0].c.email, 'x@y.z');
        console.log('  ok pgp_sym_encrypt/decrypt');

        // Trigger: fitpass_quota>0 siembra fitpass; totalpass_default_spots>0 sigue sembrando totalpass
        const ins = (await client.query(`SELECT id FROM instructors LIMIT 1`)).rows[0];
        const fac = (await client.query(`SELECT id FROM facilities LIMIT 1`)).rows[0];
        assert.ok(ins && fac, 'la base local necesita un coach y una sucursal');
        const mkType = async (name: string, tp: number, fp: number) => (await client.query(
            `INSERT INTO class_types (name, totalpass_default_spots, fitpass_quota) VALUES ($1,$2,$3) RETURNING id`,
            [name, tp, fp])).rows[0].id as string;
        const mkClass = async (ct: string, hora: string) => (await client.query(
            `INSERT INTO classes (class_type_id, instructor_id, facility_id, date, start_time, end_time, max_capacity, status)
             VALUES ($1,$2,$3, CURRENT_DATE + 40, $4::time, $4::time + interval '50 minutes', 7, 'scheduled') RETURNING id`,
            [ct, ins.id, fac.id, hora])).rows[0].id as string;
        const inv = async (cls: string) => Object.fromEntries((await client.query(
            `SELECT channel, max_spots FROM channel_inventory WHERE class_id=$1`, [cls])).rows.map((r) => [r.channel, r.max_spots]));

        const soloFp = await mkClass(await mkType('zz-fp-test-a', 0, 3), '04:10');
        const ambos = await mkClass(await mkType('zz-fp-test-b', 2, 4), '04:20');
        const soloTp = await mkClass(await mkType('zz-fp-test-c', 5, 0), '04:30');
        const ninguno = await mkClass(await mkType('zz-fp-test-d', 0, 0), '04:40');
        assert.deepEqual(await inv(soloFp), { fitpass: 3 });
        assert.deepEqual(await inv(ambos), { totalpass: 2, fitpass: 4 });
        assert.deepEqual(await inv(soloTp), { totalpass: 5 });
        assert.deepEqual(await inv(ninguno), {});
        console.log('  ok trigger de inventario (fitpass + totalpass preservado)');

        // Ownership: una schedule FP activa = una clase
        const ct = (await client.query(`SELECT id FROM class_types LIMIT 1`)).rows[0].id;
        const c2 = await mkClass(ct, '04:50');
        await client.query(`INSERT INTO partner_class_mappings (class_id, channel, external_slot_id) VALUES ($1,'fitpass','S-1')`, [soloFp]);
        await client.query('SAVEPOINT sp');
        await assert.rejects(() => client.query(`INSERT INTO partner_class_mappings (class_id, channel, external_slot_id) VALUES ($1,'fitpass','S-1')`, [c2]), /uq_partner_fitpass_slot_owner/);
        await client.query('ROLLBACK TO SAVEPOINT sp');
        await client.query(`INSERT INTO partner_class_mappings (class_id, channel, external_slot_id, sync_enabled) VALUES ($1,'fitpass','S-1', false)`, [c2]);
        console.log('  ok índice de ownership (mappings deshabilitados no bloquean)');

        // 128: lesson por defecto por nombre exacto; nunca pisa un mapeo existente
        const seed = async (name: string, lesson: number | null) => (await client.query(`INSERT INTO class_types (name, fitpass_lesson_id) VALUES ($1,$2) RETURNING id`, [name, lesson])).rows[0].id as string;
        const nav = await seed(' navakarana ', null); const flexKeep = await seed('Flex', 1); const salsa = await seed('Salsa', null);
        const barreNull = await seed('Barre', null);
        await run();
        const lessonOf = async (id: string) => (await client.query(`SELECT fitpass_lesson_id AS l FROM class_types WHERE id=$1`, [id])).rows[0].l;
        assert.equal(await lessonOf(nav), 46833); assert.equal(await lessonOf(flexKeep), 1, 'no pisa un mapeo existente');
        assert.equal(await lessonOf(salsa), null, 'Salsa no se ofrece en FitPass'); assert.equal(await lessonOf(barreNull), 46820);
        console.log('  ok migración 128 (lessons por defecto)');

        await client.query('ROLLBACK');
        console.log('test-fitpass-migrations: OK (revertido)');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally {
        client.release();
        await pool.end();
    }
}
main().catch((e) => { console.error(e); process.exit(1); });
