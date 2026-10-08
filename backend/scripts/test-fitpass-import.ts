/**
 * Import FitPass, ciclo de sync y asistencia — BD LOCAL, todo en BEGIN/ROLLBACK, sin red.
 *   DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/test-fitpass-import.ts
 */
import assert from 'node:assert/strict';

process.env.APP_ENCRYPTION_KEY = 'test-key-'.padEnd(40, 'x');

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ── Cableado (rutas, cron, check-ins) ───────────────────────────────────────
{
    const routes = read('../src/routes/partners-fitpass.ts');
    for (const re of [/router\.get\('\/attendees'/, /router\.post\('\/attendees'/, /router\.delete\('\/attendees\/:bookingId'/,
        /router\.post\('\/bulk-import'/, /router\.post\('\/import-reservations'/, /router\.post\('\/sync-now'/, /router\.get\('\/sync-status'/,
        /FITPASS_SYNC_LOCKED/, /accountRole/]) assert.match(routes, re);
    const cron = read('../src/services/cron-jobs.ts');
    assert.match(cron, /listaBlanca\.includes\('FITPASS_SYNC'\)/, 'FITPASS_SYNC solo si está EXPLÍCITO en CRON_JOBS');
    assert.match(cron, /\*\/2 \* \* \* \*/);
    for (const f of ['bookings', 'checkin', 'instructors']) assert.match(read(`../src/routes/${f}.ts`), /reflectFitpassAttendance/, f);
    console.log('  ok cableado');
}

const D0 = '2031-03-10';
async function main() {
    const { pool } = await import('../src/config/database.js');
    const { FITPASS_MIGRATIONS } = await import('../src/lib/fitpass/migrations.js');
    for (const m of FITPASS_MIGRATIONS) for (const s of m.statements) await pool.query(s);

    const src = await import('../src/lib/fitpass/source.js');
    const { runFitpassSyncCycle } = await import('../src/lib/fitpass/sync-cycle.js');
    const att = await import('../src/lib/fitpass/attendance.js');
    const { withFitpassLock } = await import('../src/lib/fitpass/locks.js');

    // ── funciones puras ─────────────────────────────────────────────────────
    assert.equal(src.normalizeImportClassName('Dharma Yoga'), 'yoga dharma', 'alias de Casa Shé');
    assert.equal(src.normalizeImportClassName('  PILATES MAT '), 'pilates mat');
    const cand = (id: string, n: string, l: number | null, coach = 'Ana') => ({ id, ct_name: n, fitpass_lesson_id: l, coach_name: coach });
    const lk = { date: '2026-10-08', startTime: '09:00' };
    assert.equal(src.pickCandidate([cand('a', 'Barre', 1)], lk), 'a');
    assert.equal(src.pickCandidate([cand('a', 'Barre', 1), cand('b', 'Flex', 2)], { ...lk, fitpassLessonId: 2 }), 'b', 'lesson_id manda');
    assert.equal(src.pickCandidate([cand('a', 'Barre', null), cand('b', 'Flex', null)], { ...lk, className: 'FLEX' }), 'b', 'nombre');
    assert.equal(src.pickCandidate([cand('a', 'Barre', null, 'Ana'), cand('b', 'Barre', null, 'Luz')], { ...lk, className: 'Barre', coachName: 'luz' }), 'b', 'coach');
    // lesson_id ya NO es autoritativo: una variante sin mapear cae a familia/nombre
    assert.equal(src.pickCandidate([cand('a', 'Barre', 1), cand('b', 'Flex', 2)], { ...lk, fitpassLessonId: 9, className: 'BARRE GAP' }), 'a', 'variante -> familia');
    assert.throws(() => src.pickCandidate([cand('a', 'Barre', 1), cand('b', 'Flex', 2)], { ...lk, fitpassLessonId: 9 }), /no se pudo identificar/, 'sin pistas falla visible');
    const fam = [cand('p', 'Pilates Mat', 47206), cand('m', 'Mat Power Abs', 47182), cand('s', 'Sculpt (Abs & Butt)', 47184), cand('f', 'Sculpt Full Body', 46821), cand('b', 'Barre', 46820)];
    for (const [nm, les, want] of [
        ['PILATES MAT - GAP', 47203, 'p'], ['PILATES MAT ABS & BUTT', 46819, 'p'], ['MAT - POWER ABS', 47182, 'm'],
        ['SCULPT - POWER ABS', 47183, 's'], ['SCULPT ABS & BUTT', 47184, 's'], ['SCULPT FULL BODY', 46821, 'f'],
        ['BARRE - ABS & BUTT', 46827, 'b'], ['BARRE BUTT', 47181, 'b'],
    ] as const) assert.equal(src.pickCandidate(fam, { ...lk, className: nm, fitpassLessonId: les }), want, nm);
    assert.equal(src.pickCandidate([cand('x', 'Sculpt (Abs & Butt)', 1), cand('y', 'Sculpt Full Body', 2)], { ...lk, className: 'SCULPT', fitpassLessonId: 2 }), 'y', 'misma familia: desempata lesson_id');
    assert.equal(src.pickCandidate([cand('x', 'Barre', null, 'Ana'), cand('y', 'Barre', null, 'Luz')], { ...lk, className: 'BARRE GAP', coachName: 'Luz' }), 'y', 'misma familia: desempata coach');
    assert.equal(src.pickCandidate([cand('only', 'Yoga Dharma', null)], { ...lk, className: 'COSA RARA' }), 'only', 'única en el slot (c)');
    assert.throws(() => src.pickCandidate([cand('a', 'Barre', null), cand('b', 'Flex', null)], lk), /no se pudo identificar/, 'ambiguo falla visible');
    assert.throws(() => src.pickCandidate([cand('a', 'Barre', null, 'Ana'), cand('b', 'Barre', null, 'Ana')], { ...lk, className: 'Barre' }), /Varias clases/);
    assert.throws(() => src.pickCandidate([], lk), /Sin clase/);
    const sc = await import('../src/lib/fitpass/sync-cycle.js');
    const att2 = sc.attachLessonIds([
        { displayName: 'a', status: 'reserved', classLookup: { date: D0, startTime: '09:00', className: 'Barre - Abs & Butt' } },
        { displayName: 'b', status: 'reserved', classLookup: { date: D0, startTime: '09:00', className: 'Dup' } },
        { displayName: 'c', status: 'reserved', classLookup: { date: D0, startTime: '09:00', className: 'Nada' } },
    ], [{ id: 7, name: 'BARRE - ABS & BUTT' }, { id: 8, name: 'Dup' }, { id: 9, name: 'dup' }]);
    assert.equal(att2[0].classLookup.fitpassLessonId, 7); assert.equal(att2[1].classLookup.fitpassLessonId, undefined, 'nombre repetido no se adivina'); assert.equal(att2[2].classLookup.fitpassLessonId, undefined);
    console.log('  ok funciones puras');

    // ── fixtures (todo se revierte) ─────────────────────────────────────────
    const db = await pool.connect();
    try {
        await db.query('BEGIN');
        const one = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows[0];
        const rows = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows;

        const iu = await one(`INSERT INTO users (email, phone, display_name, role) VALUES ('fp-coach-t@test.local','+000111','Coach Test','instructor') RETURNING id`);
        const inst = await one(`INSERT INTO instructors (user_id, display_name) VALUES ($1,'Coach Test') RETURNING id`, [iu.id]);
        const inst2u = await one(`INSERT INTO users (email, phone, display_name, role) VALUES ('fp-coach-t2@test.local','+000112','Otra Coach','instructor') RETURNING id`);
        const inst2 = await one(`INSERT INTO instructors (user_id, display_name) VALUES ($1,'Otra Coach') RETURNING id`, [inst2u.id]);
        const ctA = await one(`INSERT INTO class_types (name, fitpass_lesson_id, fitpass_quota, max_capacity) VALUES ('ZZ Fp Alpha', 990001, 3, 8) RETURNING id`);
        const ctB = await one(`INSERT INTO class_types (name, fitpass_lesson_id, fitpass_quota, max_capacity) VALUES ('ZZ Fp Beta', 990002, 3, 8) RETURNING id`);
        const D = '2031-03-10';
        const mk = async (ct: string, time: string, cap: number, instId = inst.id) =>
            (await one(`INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity)
                        VALUES ($1,$2,$3,$4,($4::time + interval '50 min'),$5) RETURNING id`, [ct, instId, D, time, cap])).id as string;
        const cA = await mk(ctA.id, '09:00', 8);          // única en 09:00
        const cB1 = await mk(ctA.id, '10:00', 8);         // 10:00: dos tipos
        const cB2 = await mk(ctB.id, '10:00', 8, inst2.id);
        const cAmb1 = await mk(ctA.id, '11:00', 8);       // 11:00: mismo tipo, mismos datos => ambigua
        const cAmb2 = await mk(ctA.id, '11:00', 8, inst2.id);
        const cSmall = await mk(ctA.id, '12:00', 1);      // cupo físico 1 (overbooked)
        const inv = await one(`SELECT max_spots FROM channel_inventory WHERE class_id=$1 AND channel='fitpass'`, [cA]);
        assert.equal(Number(inv.max_spots), 3, 'el trigger creó el cupo FitPass por defecto');

        const imp = (r: any[]) => src.importFitpassReservations(r, null, { db, skipLock: true });
        const row = (o: any) => ({ displayName: 'Ana Fit', status: 'reserved', classLookup: { date: D, startTime: '09:00' }, ...o });

        // crea
        let r = await imp([row({ sourceRef: '5001' })]);
        assert.deepEqual(r.summary, { total: 1, created: 1, updated: 0, cancelled: 0, skipped: 0, failed: 0 }, JSON.stringify(r));
        const b1 = await one(`SELECT b.*, u.source, u.email FROM bookings b JOIN users u ON u.id=b.user_id WHERE b.channel='fitpass' AND b.external_ref='5001'`);
        assert.equal(b1.class_id, cA);
        assert.equal(b1.status, 'confirmed');
        assert.equal(b1.source, 'fitpass');
        assert.match(b1.email, /@fitpass\.casashe\.local$/);
        const mem = await one(`SELECT 1 AS x FROM memberships m JOIN plans p ON p.id=m.plan_id WHERE m.user_id=$1 AND m.status='active' AND p.is_internal AND lower(p.name)='fitpass'`, [b1.user_id]);
        assert.ok(mem, 'membresía interna Fitpass => platformMember');
        const ci = await one(`SELECT booked_spots FROM channel_inventory WHERE class_id=$1 AND channel='fitpass'`, [cA]);
        assert.equal(Number(ci.booked_spots), 1);

        // idempotente
        r = await imp([row({ sourceRef: '5001' })]);
        assert.equal(r.summary.created, 0); assert.equal(r.summary.updated, 1);
        assert.equal(Number((await one(`SELECT count(*)::int AS n FROM bookings WHERE channel='fitpass' AND class_id=$1`, [cA])).n), 1);
        assert.equal(Number((await one(`SELECT count(*)::int AS n FROM users WHERE source='fitpass' AND lower(display_name)='ana fit'`)).n), 1, 'misma fantasma');

        // ASISTIÓ => check-in automatizado, fp_attended_at (no se vuelve a empujar a FitPass)
        r = await imp([row({ sourceRef: '5001', status: 'attended' })]);
        assert.equal(r.summary.failed, 0, JSON.stringify(r));
        const b2 = await one(`SELECT status, checked_in_at, partner_metadata FROM bookings WHERE channel='fitpass' AND external_ref='5001'`);
        assert.equal(b2.status, 'checked_in');
        assert.ok(b2.partner_metadata.fp_attended_at);
        const ck = await rows(`SELECT status, validation_method, platform_event_id FROM checkins WHERE booking_id=$1`, [b1.id]);
        assert.equal(ck.length, 1); assert.equal(ck[0].validation_method, 'automated'); assert.equal(ck[0].platform_event_id, 'fitpass:checkin:5001');
        await imp([row({ sourceRef: '5001', status: 'attended' })]);
        assert.equal((await rows(`SELECT 1 FROM checkins WHERE booking_id=$1`, [b1.id])).length, 1, 'check-in idempotente');

        // CANCELADO con la misma ref cancela
        r = await imp([row({ sourceRef: '5002', displayName: 'Bea Fit' })]);
        r = await imp([row({ sourceRef: '5002', displayName: 'Bea Fit', status: 'cancelled' })]);
        assert.equal(r.summary.cancelled, 1);
        assert.equal((await one(`SELECT status FROM bookings WHERE external_ref='5002'`)).status, 'cancelled');
        r = await imp([row({ sourceRef: '5002', displayName: 'Bea Fit', status: 'cancelled' })]);
        assert.equal(r.summary.cancelled, 0); assert.equal(r.summary.skipped, 1, 'cancelar de nuevo es no-op');

        // Regla "Letty": CANCELADO de una reserva vieja (otra ref) NO cancela la activa del mismo slot
        await imp([row({ sourceRef: '6002', displayName: 'Letty Fit', status: 'attended' })]);
        r = await imp([row({ sourceRef: '6001', displayName: 'Letty Fit', status: 'cancelled' })]);
        assert.equal(r.summary.cancelled, 0, 'no cancela la reserva activa con otra ref');
        assert.equal((await one(`SELECT status FROM bookings WHERE external_ref='6002'`)).status, 'checked_in');
        // …pero una legacy sin ref sí se cancela
        const lu = await one(`SELECT id FROM users WHERE source='fitpass' AND display_name='Letty Fit'`);
        await db.query(`UPDATE bookings SET external_ref=NULL WHERE external_ref='6002'`);
        r = await imp([row({ sourceRef: '6001', displayName: 'Letty Fit', status: 'cancelled' })]);
        assert.equal(r.summary.cancelled, 1, 'legacy sin ref se cancela');
        void lu;

        // Respeta el enlace existente: la fila llega con hora vieja (clase movida) y no se re-resuelve
        await imp([row({ sourceRef: '7001', displayName: 'Cami Fit' })]);
        r = await imp([row({ sourceRef: '7001', displayName: 'Cami Fit (otro nombre)', classLookup: { date: D, startTime: '23:45' } })]);
        assert.equal(r.summary.failed, 0, JSON.stringify(r.rows));
        assert.equal(r.summary.updated, 1);
        assert.equal(Number((await one(`SELECT count(*)::int AS n FROM users WHERE source='fitpass' AND display_name ILIKE 'Cami Fit%'`)).n), 1, 'sin cuentas duplicadas');

        // desambiguación: lesson_id, nombre, coach; ambigua falla VISIBLE
        r = await imp([row({ sourceRef: '8001', displayName: 'Dani Fit', classLookup: { date: D, startTime: '10:00', fitpassLessonId: 990002 } })]);
        assert.equal(r.summary.created, 1, JSON.stringify(r.rows));
        assert.equal((await one(`SELECT class_id FROM bookings WHERE external_ref='8001'`)).class_id, cB2, 'por lesson_id');
        r = await imp([row({ sourceRef: '8002', displayName: 'Eli Fit', classLookup: { date: D, startTime: '10:00', className: 'zz fp alpha' } })]);
        assert.equal((await one(`SELECT class_id FROM bookings WHERE external_ref='8002'`)).class_id, cB1, 'por nombre');
        r = await imp([row({ sourceRef: '8003', displayName: 'Fer Fit', classLookup: { date: D, startTime: '11:00', fitpassLessonId: 990001, className: 'ZZ Fp Alpha' } })]);
        assert.equal(r.summary.failed, 1); assert.equal(r.rows[0].error, 'CLASS_NOT_FOUND');
        assert.equal((await rows(`SELECT 1 FROM bookings WHERE external_ref='8003'`)).length, 0, 'ambigua: no se crea nada');
        r = await imp([row({ sourceRef: '8004', displayName: 'Gus Fit', classLookup: { date: D, startTime: '11:00', fitpassLessonId: 990001, coachName: 'Otra Coach' } })]);
        assert.equal(r.summary.created, 1, JSON.stringify(r.rows));
        assert.equal((await one(`SELECT class_id FROM bookings WHERE external_ref='8004'`)).class_id, cAmb2, 'por coach');
        r = await imp([row({ sourceRef: '8005', classLookup: { date: D, startTime: '19:30' } })]);
        assert.equal(r.summary.failed, 1, 'sin clase falla visible');
        // variantes de FitPass contra una familia: en el slot 10:00 (Alpha/Beta) 'ZZ FP ALPHA GAP' cae a Alpha por familia no aplica (sin keywords) -> ambigua visible
        r = await imp([row({ sourceRef: '8006', displayName: 'Kai Fit', classLookup: { date: D, startTime: '10:00', className: 'ZZ FP ALPHA - GAP' } })]);
        assert.equal(r.summary.failed, 1, 'variante sin pista de familia ni lesson: falla visible');
        void cAmb1;

        // sobrecupo: nunca se rechaza, se marca overbooked
        await imp([row({ sourceRef: '9001', displayName: 'Hana Fit', classLookup: { date: D, startTime: '12:00' } })]);
        r = await imp([row({ sourceRef: '9002', displayName: 'Ivo Fit', classLookup: { date: D, startTime: '12:00' } })]);
        if (r.summary.failed) console.log('  AVISO: sobrecupo falló:', JSON.stringify(r.rows));
        assert.equal(r.summary.created, 1, 'el import no rechaza por cupo: ' + JSON.stringify(r.rows));
        assert.equal(r.overbooked, 1); assert.deepEqual(r.overbookedRefs, ['9002'], 'el resumen expone los overbooked');
        assert.equal((await one(`SELECT partner_metadata->>'overbooked' AS o FROM bookings WHERE external_ref='9002'`)).o, 'true');
        assert.equal(Number((await one(`SELECT max_capacity FROM classes WHERE id=$1`, [cSmall])).max_capacity), 2, 'aforo subido para no violar el CHECK');
        r = await imp([row({ sourceRef: '9002', displayName: 'Ivo Fit', status: 'cancelled', classLookup: { date: D, startTime: '12:00' } })]);
        assert.equal(Number((await one(`SELECT max_capacity FROM classes WHERE id=$1`, [cSmall])).max_capacity), 1, 'al cancelar se restaura el aforo');

        // cancelación del estudio no se reactiva con la misma ref; con ref nueva sí
        await imp([row({ sourceRef: '9101', displayName: 'Jo Fit' })]);
        const bj = await one(`SELECT id FROM bookings WHERE external_ref='9101'`);
        assert.equal(await src.cancelFitpassAttendee(bj.id, 'sobrecupo', iu.id, db), true);
        r = await imp([row({ sourceRef: '9101', displayName: 'Jo Fit' })]);
        assert.equal(r.summary.skipped, 1); assert.equal(r.rows[0].reason, 'cancelada-manualmente-por-el-estudio');
        assert.equal((await one(`SELECT status FROM bookings WHERE id=$1`, [bj.id])).status, 'cancelled');

        // recepción: valida cupo del canal (3) y es idempotente
        const reg = (name: string) => src.registerFitpassAttendee({ classId: cA, displayName: name, actorUserId: iu.id }, db);
        const w1 = await reg('Walk Uno');
        assert.ok(w1.checkinId);
        assert.equal((await one(`SELECT status FROM bookings WHERE id=$1`, [w1.bookingId])).status, 'checked_in');
        assert.equal((await reg('Walk Uno')).bookingId, w1.bookingId, 'idempotente');
        // en cA ya hay Ana(5001), Cami(7001) y Walk Uno = 3/3
        await assert.rejects(reg('Walk Tres'), (e: any) => e.code === 'FITPASS_QUOTA_EXHAUSTED');
        await assert.rejects(src.registerFitpassAttendee({ classId: cB1, displayName: 'X Y', actorUserId: iu.id }, db).then(async () => {
            await db.query(`UPDATE channel_inventory SET max_spots=0 WHERE class_id=$1 AND channel='fitpass'`, [cB1]);
            return src.registerFitpassAttendee({ classId: cB1, displayName: 'Z W', actorUserId: iu.id }, db);
        }), (e: any) => e.code === 'FITPASS_NOT_CONFIGURED');
        const list = await src.listFitpassAttendeesForDate(D).catch(() => null); // usa pool: no ve la tx, solo comprueba que corre
        assert.ok(Array.isArray(list));
        console.log('  ok import (crear/idempotente/cancelar/Letty/ambigua/overbooked/asistió/recepción)');

        // ── asistencia: selección del reconciliador ─────────────────────────
        // (usa pool, que no ve la tx: se prueba la SQL sobre el mismo cliente reimplementando vía función con db)
        const pastD = '2020-01-01';
        const cPast = (await one(`INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity)
                                  VALUES ($1,$2,$3,'09:00','09:50',8) RETURNING id`, [ctA.id, inst.id, pastD])).id;
        const mkB = async (ref: string, status: string, ageH: number, extra = '{}', cls = cPast) => {
            const u = await one(`INSERT INTO users (email, phone, display_name, role, source) VALUES ($1,$2,$3,'client','fitpass') RETURNING id`, [`att-${ref}@x.local`, `+00${ref}`, `Att ${ref}`]);
            return (await one(`INSERT INTO bookings (class_id, user_id, status, channel, external_ref, checked_in_at, partner_metadata)
                               VALUES ($1,$2,$3,'fitpass',$4, now() - ($5 || ' hours')::interval, $6::jsonb) RETURNING id`, [cls, u.id, status, ref, String(ageH), extra])).id as string;
        };
        const pend = await mkB('3001', 'checked_in', 2);
        const old = await mkB('3002', 'checked_in', 40);                               // fuera de 36h
        const done = await mkB('3003', 'checked_in', 2, '{"fp_attended_at":"2026-01-01"}'); // ya reflejada
        const future = await mkB('3004', 'checked_in', 1, '{}', cA);                  // clase aún no empieza (2031)
        const conf = await mkB('3005', 'confirmed', 2);                                // no hizo check-in
        // la función usa pool; para ver la tx, ejecutamos su misma consulta en el cliente
        const sel = await rows(
            `SELECT b.id FROM bookings b JOIN classes c ON c.id=b.class_id
              WHERE b.channel='fitpass' AND b.external_ref IS NOT NULL AND b.status='checked_in'
                AND b.checked_in_at >= now() - interval '36 hours'
                AND (c.date + c.start_time) <= (now() AT TIME ZONE 'America/Mexico_City')
                AND b.partner_metadata->>'fp_attended_at' IS NULL`);
        const ids = new Set(sel.map((x: any) => x.id));
        assert.ok(ids.has(pend)); assert.ok(!ids.has(old)); assert.ok(!ids.has(done)); assert.ok(!ids.has(future)); assert.ok(!ids.has(conf));
        console.log('  ok selección de asistencia pendiente');
    } finally {
        await db.query('ROLLBACK').catch(() => {});
        db.release();
    }

    // ── reconciliador con scraper falso (BD real: commit y limpieza explícita) ──
    await pool.query(`DELETE FROM users WHERE email LIKE 'rc-%@x.local'`);
    await pool.query(`DELETE FROM class_types WHERE name='ZZ RC'`).catch(() => {});
    const u = (await pool.query(`INSERT INTO users (email, phone, display_name, role, source) VALUES ('rc-t@x.local','+00998877','RC Test','client','fitpass') RETURNING id`)).rows[0];
    const iu = (await pool.query(`INSERT INTO users (email, phone, display_name, role) VALUES ('rc-i@x.local','+00998866','RC Inst','instructor') RETURNING id`)).rows[0];
    const ins = (await pool.query(`INSERT INTO instructors (user_id, display_name) VALUES ($1,'RC Inst') RETURNING id`, [iu.id])).rows[0];
    const ct = (await pool.query(`INSERT INTO class_types (name, max_capacity) VALUES ('ZZ RC', 8) RETURNING id`)).rows[0];
    let cleanupUsers: string[] = [];
    const cl = (await pool.query(`INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity) VALUES ($1,$2,'2020-01-02','09:00','09:50',8) RETURNING id`, [ct.id, ins.id])).rows[0];
    try {
        const extraUsers: string[] = [];
        const mkb = async (ref: string) => {
            const uu = ref === '4001' ? u : (await pool.query(`INSERT INTO users (email, phone, display_name, role, source) VALUES ($1,$2,$3,'client','fitpass') RETURNING id`, [`rc-${ref}@x.local`, `+00${ref}`, `RC ${ref}`])).rows[0];
            if (uu !== u) extraUsers.push(uu.id);
            return (await pool.query(`INSERT INTO bookings (class_id, user_id, status, channel, external_ref, checked_in_at) VALUES ($1,$2,'checked_in','fitpass',$3, now()) RETURNING id`, [cl.id, uu.id, ref])).rows[0].id as string;
        };
        cleanupUsers = extraUsers;
        const ok = await mkb('4001');
        await pool.query(`UPDATE bookings SET status='cancelled' WHERE id=$1`, [ok]);
        await pool.query(`UPDATE bookings SET status='checked_in' WHERE id=$1`, [ok]);
        const calls: string[] = [];
        const fake = { markAttendance: async (id: string | number) => { calls.push(String(id)); return { status: 200, raw: '{"status":"attended"}' }; } };
        const rec = await att.reconcileFitpassAttendance(fake as any);
        assert.ok(calls.includes('4001'));
        assert.ok(rec.ok >= 1);
        const m = (await pool.query(`SELECT partner_metadata FROM bookings WHERE id=$1`, [ok])).rows[0].partner_metadata;
        assert.ok(m.fp_attended_at, 'marca fp_attended_at');
        const again: string[] = [];
        await att.reconcileFitpassAttendance({ markAttendance: async (id: any) => { again.push(String(id)); return { status: 200, raw: 'attended' }; } } as any);
        assert.ok(!again.includes('4001'), 'ya reflejada no se reintenta');
        // fallo => fp_attendance_error y se reintenta
        const bad = await mkb('4002');
        await att.reconcileFitpassAttendance({ markAttendance: async () => ({ status: 404, raw: 'nope' }) } as any);
        const mb = (await pool.query(`SELECT partner_metadata FROM bookings WHERE id=$1`, [bad])).rows[0].partner_metadata;
        assert.ok(mb.fp_attendance_error && !mb.fp_attended_at);
        const retry: string[] = [];
        await att.reconcileFitpassAttendance({ markAttendance: async (id: any) => { retry.push(String(id)); return { status: 200, raw: 'asistió' }; } } as any);
        assert.ok(retry.includes('4002'));
        console.log('  ok reconcileFitpassAttendance (scraper falso)');
    } finally {
        await pool.query(`DELETE FROM bookings WHERE class_id=$1`, [cl.id]);
        await pool.query(`DELETE FROM classes WHERE id=$1`, [cl.id]);
        await pool.query(`DELETE FROM class_types WHERE id=$1`, [ct.id]);
        await pool.query(`DELETE FROM instructors WHERE id=$1`, [ins.id]);
        await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[u.id, iu.id, ...cleanupUsers]]);
    }

    // ── ciclo de sync: orden, hook, lock ocupado ────────────────────────────
    const order: string[] = [];
    let res = await runFitpassSyncCycle({
        log: false, fetchRows: async () => { order.push('fetch'); return []; },
        afterImport: async () => { order.push('after'); }, reconcileAttendance: async () => { order.push('att'); return { pending: 0, ok: 0, failed: 0 }; },
    });
    assert.equal(res.status, 'ok'); assert.deepEqual(order, ['fetch', 'after', 'att']);
    res = await runFitpassSyncCycle({ log: false, fetchRows: async () => { throw new Error('panel caído'); }, afterImport: async () => { order.push('NO'); } });
    assert.equal(res.status, 'fetch-failed'); assert.ok(res.retryable); assert.ok(!order.includes('NO'), 'sin snapshot no se llama el hook');
    res = await runFitpassSyncCycle({ log: false, fetchRows: async () => [], afterImport: async () => { throw new Error('boom'); } });
    assert.equal(res.status, 'after-import-failed');
    // lock ocupado => skip retryable y NO fetch
    let fetched = false;
    const held = await withFitpassLock('FP_SYNC_CYCLE', async () =>
        runFitpassSyncCycle({ log: false, fetchRows: async () => { fetched = true; return []; } }));
    assert.equal(held!.status, 'cycle-skipped'); assert.equal(held!.retryable, true); assert.equal(fetched, false);
    // bitácora
    const before = Number((await pool.query(`SELECT count(*)::int AS n FROM cron_job_logs WHERE job_name='FITPASS_SYNC'`)).rows[0].n);
    await runFitpassSyncCycle({ fetchRows: async () => [] });
    await withFitpassLock('FP_SYNC_CYCLE', () => runFitpassSyncCycle({ fetchRows: async () => [] }));
    const after = await pool.query(`SELECT success, details FROM cron_job_logs WHERE job_name='FITPASS_SYNC' ORDER BY executed_at DESC LIMIT 2`);
    assert.equal(after.rows.length, 2);
    const kinds = after.rows.map((r) => JSON.parse(r.details).status).sort();
    assert.deepEqual(kinds, ['cycle-skipped', 'ok']);
    await pool.query(`DELETE FROM cron_job_logs WHERE job_name='FITPASS_SYNC' AND executed_at >= now() - interval '1 minute'`);
    void before;
    console.log('  ok ciclo de sync (orden, hook, lock ocupado, bitácora)');

    await pool.end();
    console.log('✅ test-fitpass-import OK');
}

main().catch((e) => { console.error(e); process.exit(1); });
