// Cancelar una clase, fijar el cupo de TotalPass y marcar retiro/resincronización
// pueden correr DENTRO de una transacción ajena (cambios en bloque): todo lo que
// escriben se ve en esa transacción y se revierte con ella. Sin `db` se comportan
// igual que siempre.
//
// Correr con: DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/test-clases-en-transaccion.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/config/database.js';
import { cancelClassWithRefunds } from '../src/lib/cancel-class.js';
import { setTotalpassCap } from '../src/lib/totalpass/caps.js';
import { marcarResyncTotalpass } from '../src/lib/totalpass/resync.js';
import { conTotalpass, crearAlumna, crearClase, estadoMapping, fechaEnDias, inscribir, prepararBase, publicada } from './fixtures/clases-tx.js';

// ── Cableado: los que llaman sin opciones no cambian ────────────────────────
const leer = (rel: string) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), 'utf8');
for (const via of ['routes/closed-days.ts', 'routes/events.ts']) {
    assert.doesNotMatch(leer(via), /cancelClassWithRefunds\([^)]*\{\s*db/, `${via} sigue llamando sin opciones`);
}
console.log('  cableado: OK');

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // todo vive en una transacción que se revierte
        const base = await prepararBase(client);
        const fecha = await fechaEnDias(client, 30);

        // ── 1. Cancelar dentro de la transacción, con avisos diferidos ──────────
        const clase = await crearClase(client, base, { fecha, hora: '05:10' });
        await publicada(client, clase);
        const alumna = await crearAlumna(client, base);
        const reserva = await inscribir(client, clase, alumna);
        const r = await cancelClassWithRefunds(clase, base.admin, 'Puente', { db: client, diferirAvisos: true });
        assert.equal(r.cancelledBookings, 1);
        assert.equal(r.refundedCredits, 1);
        assert.deepEqual(r.avisos.map((a) => a.userId), [alumna.userId], 'devuelve el aviso en vez de mandarlo');
        assert.equal(r.avisos[0].payload.tag, 'class_cancelled');
        const c = (await client.query(`SELECT status::text, cancellation_reason FROM classes WHERE id = $1`, [clase])).rows[0];
        assert.deepEqual(c, { status: 'cancelled', cancellation_reason: 'Puente' });
        const b = (await client.query(`SELECT status::text FROM bookings WHERE id = $1`, [reserva])).rows[0];
        assert.equal(b.status, 'cancelled');
        const m = (await client.query(`SELECT multi_remaining FROM memberships WHERE id = $1`, [alumna.membershipId])).rows[0];
        assert.equal(m.multi_remaining, 5, 'el crédito regresa');
        assert.equal(await estadoMapping(client, clase), 'pending_delete', 'el retiro se marca en la MISMA transacción');
        console.log('  cancelar en transacción: reserva, crédito, retiro y aviso diferido · OK');

        // Sin diferir: avisos vacíos (se mandan al momento, como siempre).
        const otra = await crearClase(client, base, { fecha, hora: '05:20' });
        const r2 = await cancelClassWithRefunds(otra, base.admin, 'x', { db: client });
        assert.deepEqual(r2.avisos, []);

        // ── 2. Cupo de TotalPass dentro de la transacción ──────────────────────
        const conCupo = await crearClase(client, base, { fecha, hora: '05:30' });
        await publicada(client, conCupo);
        await conTotalpass(client, base, conCupo, 3, 1);
        await assert.rejects(setTotalpassCap(conCupo, 0, client), (e: any) => e.code === 'CAP_BELOW_BOOKED');
        await assert.rejects(setTotalpassCap(conCupo, 8, client), (e: any) => e.code === 'CAP_EXCEEDS_CAPACITY');
        const guardado = await setTotalpassCap(conCupo, 2, client);
        assert.deepEqual({ ...guardado }, { max_spots: 2, booked_spots: 1 });

        const sinSocias = await crearClase(client, base, { fecha, hora: '05:40' });
        await publicada(client, sinSocias);
        await conTotalpass(client, base, sinSocias, 2, 0);
        await setTotalpassCap(sinSocias, 0, client);
        assert.equal(await estadoMapping(client, sinSocias), 'pending_delete', 'cupo 0 marca retiro');
        await setTotalpassCap(sinSocias, 2, client);
        assert.equal(await estadoMapping(client, sinSocias), 'published', 'volver a dar cupo desmarca el retiro');
        console.log('  cupo TotalPass en transacción: valida, retira y desmarca · OK');

        // ── 3. Resincronización dentro de la transacción ───────────────────────
        assert.equal(await marcarResyncTotalpass([sinSocias, otra], client), 1, 'solo las publicadas');
        assert.equal(await estadoMapping(client, sinSocias), 'pending_resync');
        console.log('  resync en transacción · OK');

        // ── 4. Cancelar una clase que esperaba resincronizarse: el retiro gana ──
        await cancelClassWithRefunds(sinSocias, base.admin, 'x', { db: client });
        assert.equal(await estadoMapping(client, sinSocias), 'pending_delete', "'pending_resync' + cancelada → se retira");
        console.log('  cancelar con resync pendiente marca retiro · OK');

        await client.query('ROLLBACK');
        console.log('test-clases-en-transaccion: OK');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => { /* best-effort */ });
        throw e;
    } finally {
        client.release();
    }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e?.message || e); process.exit(1); });
