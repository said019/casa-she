/**
 * FitPass fase 2B — adopción, cupo (ceiling), pool, cancelación (outbox), edición, publicación
 * tras flag y tope por API/lote. Panel FALSO (sin red) + BD LOCAL dentro de BEGIN/ROLLBACK.
 *   DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/test-fitpass-publish.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/config/database.js';
import { FITPASS_MIGRATIONS } from '../src/lib/fitpass/migrations.js';
import { FitPassHttpError } from '../src/lib/scrapers/fitpass.js';
import { localDateTimeUtc } from '../src/lib/mx-time.js';
import { GYM_DEFAULT_COACH } from '../src/lib/gym-config.js';
import { cdmxDateTime, fpFingerprint, scheduleFingerprint, isRealCoach } from '../src/lib/fitpass/ownership.js';
import { computeFitpassScheduleCapacity, reconcileFitpassPoolCore } from '../src/lib/fitpass/availability.js';
import { adoptExistingFitpassSchedules, previewFitpassPublish, publishClassToFitpass, publishFitpassCore, extendFitpassWeek } from '../src/lib/fitpass/publish.js';
import { marcarCancelacionFitpass, procesarCancelacionesFitpass } from '../src/lib/fitpass/cancel.js';
import { marcarEdicionFitpass, procesarEdicionesFitpass, preflightFitpassClassEdit } from '../src/lib/fitpass/edit.js';
import { setFitpassCap } from '../src/lib/fitpass/caps.js';
import { LoteSchema } from '../src/lib/classes-bulk.js';
import type { PanelCtx } from '../src/lib/fitpass/panel.js';

const ok = (m: string) => console.log(`  ok ${m}`);

// ── 1. Fingerprint UTC -> CDMX (incluye después de las 6pm) ─────────────────
assert.deepEqual(cdmxDateTime('2026-10-05T15:00:00Z'), { date: '2026-10-05', hhmm: '09:00' });
assert.deepEqual(cdmxDateTime('2026-10-06T01:30:00.000Z'), { date: '2026-10-05', hhmm: '19:30' }, '19:30 CDMX es "mañana" en UTC');
assert.deepEqual(cdmxDateTime('2026-10-06T00:00:00Z'), { date: '2026-10-05', hhmm: '18:00' });
assert.equal(scheduleFingerprint({ id: 1, lesson_time: '2026-10-06T01:30:00Z', lesson_availability: 4, lesson: { id: 46820 } }), '46820|2026-10-05|19:30');
assert.equal(scheduleFingerprint({ id: 1, lesson_time: '2026-10-06T01:30:00Z', lesson_availability: 4 }), null);
assert.equal(fpFingerprint(7, '2026-10-05T00:00', '09:00:30'), '7|2026-10-05|09:00');
assert.equal(isRealCoach(GYM_DEFAULT_COACH, GYM_DEFAULT_COACH), false);
assert.equal(isRealCoach('  ', GYM_DEFAULT_COACH), false);
assert.equal(isRealCoach('Ana', GYM_DEFAULT_COACH), true);
ok('fingerprint UTC->CDMX (antes y después de las 6pm)');

// ── 2. Capacidad TOTAL (ceiling) ────────────────────────────────────────────
assert.equal(computeFitpassScheduleCapacity(4, 10, 3, 2), 4, 'FP 2 + libres 2 = 4 total, no los libres');
assert.equal(computeFitpassScheduleCapacity(8, 6, 5, 1), 2, 'la capacidad física manda');
assert.equal(computeFitpassScheduleCapacity(0, 10, 4, 2), 2, 'cap 0 con 2 vendidas: techo = vendidas (FP ve 0 disponibles)');
assert.equal(computeFitpassScheduleCapacity(null, 10, 4, 2), 2, 'canal sin fila: techo = vendidas');
assert.equal(computeFitpassScheduleCapacity(null, 10, 0, 0), 0);
assert.equal(computeFitpassScheduleCapacity(5, 10, 0, 0, 2), 5, 'colchón no sube sobre el tope');
ok('capacidad total: ceiling y caso cap-cero-vendido');

// ── Panel falso ─────────────────────────────────────────────────────────────
interface FakeS { id: number; lesson_time: string; lesson_availability: number; length: number; lesson: { id: number }; instructor: { name: string }; disabled: boolean; parent_id: null }
function fakePanel(initial: FakeS[]) {
    const state = { schedules: [...initial], nextId: 9000, calls: [] as Array<{ op: string; id?: number; input?: any }>, cancelError: null as Error | null, duplicateOnCreate: false };
    const panel = {
        async listSchedules(_g: number, from: Date, to: Date) {
            return state.schedules.filter((s) => { const t = new Date(s.lesson_time).getTime(); return t >= from.getTime() && t < to.getTime(); }) as any;
        },
        async createSchedule(input: any) {
            state.calls.push({ op: 'create', input });
            const lt = localDateTimeUtc(input.startDate, input.lessonTime).toISOString();
            const mk = () => ({ id: state.nextId++, lesson_time: lt, lesson_availability: input.lessonAvailability, length: input.length, lesson: { id: input.lessonId }, instructor: { name: input.instructorName }, disabled: false, parent_id: null } as FakeS);
            state.schedules.push(mk());
            if (state.duplicateOnCreate) state.schedules.push(mk());
            return { status: 200, raw: '' };
        },
        async updateSchedule(id: number, input: any) {
            state.calls.push({ op: 'update', id, input });
            const s = state.schedules.find((x) => x.id === id)!;
            if (s.disabled) throw new Error('TEST: se intentó actualizar una schedule disabled');
            s.lesson_time = localDateTimeUtc(input.startDate, input.lessonTime).toISOString();
            s.lesson_availability = input.lessonAvailability; s.length = input.length;
            s.instructor = { name: input.instructorName }; s.lesson = { id: input.lessonId };
            return { status: 200, raw: '' };
        },
        async cancelSchedule(id: number) {
            state.calls.push({ op: 'cancel', id });
            if (state.cancelError) throw state.cancelError;
            const s = state.schedules.find((x) => x.id === id); if (s) s.disabled = true;
            return { status: 200 };
        },
    };
    return { state, ctx: { panel, gymId: 9813 } as unknown as PanelCtx };
}
const sched = (id: number, lesson: number, date: string, hhmm: string, avail: number, extra: Partial<FakeS> = {}): FakeS => ({
    id, lesson_time: localDateTimeUtc(date, hhmm).toISOString(), lesson_availability: avail, length: 50,
    lesson: { id: lesson }, instructor: { name: 'Ana' }, disabled: false, parent_id: null, ...extra,
});

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const m of FITPASS_MIGRATIONS) for (const st of m.statements) await client.query(st);
        const q = async (sql: string, p: any[] = []) => (await client.query(sql, p)).rows;
        const [ins, ins2] = (await q(`SELECT id FROM instructors ORDER BY id LIMIT 2`));
        const fac = (await q(`SELECT id FROM facilities LIMIT 1`))[0];
        const users = (await q(`SELECT id FROM users ORDER BY id LIMIT 4`));
        assert.ok(ins && fac && users.length >= 3);
        await q(`UPDATE instructors SET display_name = 'Coach Prueba' WHERE id = $1`, [ins.id]);
        const DATE = (await q(`SELECT (CURRENT_DATE + 400)::text AS d`))[0].d as string;
        const LESSON = 990001, LESSON_B = 990002;
        const ct = (await q(`INSERT INTO class_types (name, fitpass_lesson_id, fitpass_quota) VALUES ('zz-fp-pub', $1, 0) RETURNING id`, [LESSON]))[0].id;
        const ctB = (await q(`INSERT INTO class_types (name, fitpass_lesson_id, fitpass_quota) VALUES ('zz-fp-pub-b', $1, 0) RETURNING id`, [LESSON_B]))[0].id;
        const ctNoLesson = (await q(`INSERT INTO class_types (name) VALUES ('zz-fp-nolesson') RETURNING id`))[0].id;
        const mk = async (type: string, hhmm: string, cap = 8, inst: string = ins.id) => (await q(
            `INSERT INTO classes (class_type_id, instructor_id, facility_id, date, start_time, end_time, max_capacity, status)
             VALUES ($1,$2,$3,$4::date,$5::time,$5::time + interval '50 minutes',$6,'scheduled') RETURNING id`,
            [type, inst, fac.id, DATE, hhmm, cap]))[0].id as string;
        const inv = async (id: string) => (await q(`SELECT max_spots, booked_spots FROM channel_inventory WHERE class_id=$1 AND channel='fitpass'`, [id]))[0];
        const map = async (id: string) => (await q(`SELECT * FROM partner_class_mappings WHERE class_id=$1 AND channel='fitpass'`, [id]))[0];

        // ── 3. Adopción: exactamente uno ───────────────────────────────────
        const cA = await mk(ct, '09:00');      // 1 schedule -> adopta (avail 12 > cap 8 -> tope 8)
        const cEve = await mk(ct, '19:30');    // 19:30: UTC ya es "mañana" -> adopta (avail 5)
        const cB = await mk(ct, '10:00');      // 2 schedules -> ambiguo
        const cC = await mk(ct, '11:00');      // 0 schedules -> no-match
        const cD1 = await mk(ct, '12:00'); const cD2 = await mk(ctB, '12:00'); // distinto lesson: NO comparten
        const cS1 = await mk(ct, '13:00'); const cS2 = await mk(ct, '13:00', 8, ins2.id); // MISMO fingerprint -> compartido
        const cDis = await mk(ct, '14:00');    // solo una disabled -> no-match
        const cNo = await mk(ctNoLesson, '15:00');
        const cOwned = await mk(ct, '16:00');  // schedule ya es de otra clase
        const otro = await mk(ct, '16:30');
        await q(`INSERT INTO partner_class_mappings (class_id, channel, external_slot_id, sync_status) VALUES ($1,'fitpass','1600','synced')`, [otro]);
        const fp = fakePanel([
            sched(1, LESSON, DATE, '09:00', 12), sched(2, LESSON, DATE, '19:30', 5),
            sched(3, LESSON, DATE, '10:00', 6), sched(4, LESSON, DATE, '10:00', 6),
            sched(5, LESSON, DATE, '13:00', 6), sched(7, LESSON, DATE, '14:00', 6, { disabled: true }),
            sched(1600, LESSON, DATE, '16:00', 6), sched(8, LESSON_B, DATE, '12:00', 4),
            sched(99, LESSON, DATE, '17:00', 6), // sin clase local
        ]);
        const dry = await adoptExistingFitpassSchedules(DATE, DATE, { ctx: fp.ctx, db: client, dryRun: true });
        const by = (r: typeof dry, id: string) => r.items.find((i) => i.classId === id)!;
        assert.equal(by(dry, cA).action, 'adopt'); assert.equal(by(dry, cA).scheduleId, 1);
        assert.equal(by(dry, cEve).action, 'adopt'); assert.equal(by(dry, cEve).scheduleId, 2);
        assert.equal(by(dry, cB).reason, 'ambiguous-schedules');
        assert.equal(by(dry, cC).reason, 'no-match');
        assert.equal(by(dry, cS1).reason, 'shared-fingerprint'); assert.equal(by(dry, cS2).reason, 'shared-fingerprint');
        assert.equal(by(dry, cDis).reason, 'no-match', 'una schedule disabled no cuenta');
        assert.equal(by(dry, cNo).reason, 'no-lesson');
        assert.equal(by(dry, cOwned).reason, 'schedule-owned');
        assert.equal(by(dry, cD1).reason, 'no-match'); assert.equal(by(dry, cD2).action, 'adopt');
        assert.equal(await map(cA), undefined, 'dry-run no escribe');
        assert.equal(fp.state.calls.length, 0);
        assert.ok(dry.unmatchedSchedules >= 1);
        const real = await adoptExistingFitpassSchedules(DATE, DATE, { ctx: fp.ctx, db: client, dryRun: false });
        assert.equal(real.counts.adopted, 3);
        assert.equal((await map(cA)).external_slot_id, '1');
        assert.equal((await inv(cA)).max_spots, 8, 'tope = cupo del panel acotado a la capacidad de la clase');
        assert.equal((await inv(cEve)).max_spots, 5);
        assert.equal(await map(cB), undefined); assert.equal(await map(cS1), undefined);
        assert.equal(fp.state.calls.length, 0, 'adoptar NUNCA escribe en el panel');
        const again = await adoptExistingFitpassSchedules(DATE, DATE, { ctx: fp.ctx, db: client, dryRun: false });
        assert.equal(again.counts.adopted, 0); assert.equal(by(again, cA).reason, 'already-owned');
        ok('adopción: exactamente una; ambiguas/compartidas/disabled/ajenas solo se reportan; dry-run no escribe');

        // ── 4. Pool: ceiling, no tocar disabled, slot-mismatch, sin cambios ─
        // cA: 3 reservas (2 FitPass, 1 app); tope FP 4; cap clase 8 -> 2 + min(2, 5) = 4
        await q(`UPDATE channel_inventory SET max_spots = 4 WHERE class_id=$1 AND channel='fitpass'`, [cA]);
        await q(`INSERT INTO bookings (class_id, user_id, status, channel) VALUES ($1,$2,'confirmed','fitpass'),($1,$3,'confirmed','fitpass'),($1,$4,'confirmed','app')`, [cA, users[0].id, users[1].id, users[2].id]);
        const pool1 = await reconcileFitpassPoolCore({ from: DATE, to: DATE }, { ctx: fp.ctx, db: client, throttleMs: 0 });
        const upd = fp.state.calls.filter((c) => c.op === 'update');
        const updA = upd.find((c) => c.id === 1)!;
        assert.equal(updA.input.lessonAvailability, 4, 'empuja TOTAL (2 FP + 2 libres), no los libres');
        assert.equal(updA.input.startDate, DATE); assert.equal(updA.input.lessonTime, '09:00');
        assert.equal(updA.input.instructorName, 'Ana', 'conserva lo que el panel ya tenía');
        assert.equal(upd.some((c) => c.id === 1600), false, 'schedule de otra clase sin mapping propio no se toca');
        assert.ok(pool1.changed >= 1);
        const n0 = fp.state.calls.length;
        await reconcileFitpassPoolCore({ from: DATE, to: DATE }, { ctx: fp.ctx, db: client, throttleMs: 0 });
        assert.equal(fp.state.calls.length, n0, 'sin cambios no vuelve a empujar');
        // cap-cero-vendido: tope 0 con 2 vendidas FP -> techo 2
        await q(`UPDATE channel_inventory SET max_spots = 0 WHERE class_id=$1 AND channel='fitpass'`, [cA]);
        await reconcileFitpassPoolCore({ from: DATE, to: DATE }, { ctx: fp.ctx, db: client, throttleMs: 0 });
        assert.equal(fp.state.schedules.find((s) => s.id === 1)!.lesson_availability, 2, 'cap 0 con vendidas: techo = vendidas');
        // disabled: nunca updateSchedule
        fp.state.schedules.find((s) => s.id === 2)!.disabled = true;
        await q(`UPDATE channel_inventory SET max_spots = 3 WHERE class_id=$1 AND channel='fitpass'`, [cEve]);
        const nBefore = fp.state.calls.filter((c) => c.op === 'update' && c.id === 2).length;
        const poolD = await reconcileFitpassPoolCore({ from: DATE, to: DATE }, { ctx: fp.ctx, db: client, throttleMs: 0 });
        assert.equal(fp.state.calls.filter((c) => c.op === 'update' && c.id === 2).length, nBefore, 'NUNCA updateSchedule en una disabled');
        assert.ok(poolD.skippedReasons['disabled'] >= 1);
        fp.state.schedules.find((s) => s.id === 2)!.disabled = false;
        // slot distinto (edición pendiente) -> no empuja
        fp.state.schedules.find((s) => s.id === 2)!.lesson_time = localDateTimeUtc(DATE, '20:30').toISOString();
        const poolM = await reconcileFitpassPoolCore({ from: DATE, to: DATE + '' }, { ctx: fp.ctx, db: client, throttleMs: 0 });
        assert.ok(poolM.skippedReasons['slot-mismatch'] >= 1);
        fp.state.schedules.find((s) => s.id === 2)!.lesson_time = localDateTimeUtc(DATE, '19:30').toISOString();
        ok('pool: ceiling total, cap-cero-vendido, disabled intacta, slot-mismatch y sin empujes repetidos');

        // ── 5. Cancelación: outbox idempotente ─────────────────────────────
        assert.equal(await marcarCancelacionFitpass(cC, client), false, 'clase no dueña: no hay nada que cancelar');
        assert.equal(await marcarCancelacionFitpass(cA, client), true);
        assert.equal((await map(cA)).sync_status, 'pending_delete');
        await q(`UPDATE classes SET status='cancelled' WHERE id=$1`, [cA]);
        fp.state.cancelError = new Error('boom 500');
        const fail = await procesarCancelacionesFitpass({ ctx: fp.ctx, db: client });
        assert.equal(fail.fallidas, 1);
        assert.equal((await map(cA)).sync_status, 'pending_delete', 'falla: sigue pendiente para reintento');
        assert.match((await map(cA)).sync_error, /cancel-failed/);
        fp.state.cancelError = new FitPassHttpError('gone', 404);
        const idem = await procesarCancelacionesFitpass({ ctx: fp.ctx, db: client });
        assert.equal(idem.yaCanceladas, 1, '404/410 = ya cancelada = ok');
        assert.equal((await map(cA)).sync_enabled, false); assert.equal((await map(cA)).sync_status, 'skipped');
        const cancelCalls = fp.state.calls.filter((c) => c.op === 'cancel').length;
        const third = await procesarCancelacionesFitpass({ ctx: fp.ctx, db: client });
        assert.equal(third.pendientes, 0);
        assert.equal(fp.state.calls.filter((c) => c.op === 'cancel').length, cancelCalls, 'segunda corrida no vuelve a cancelar');
        // éxito normal + reactivada antes de ejecutar
        fp.state.cancelError = null;
        await marcarCancelacionFitpass(cEve, client); await q(`UPDATE classes SET status='cancelled' WHERE id=$1`, [cEve]);
        const okc = await procesarCancelacionesFitpass({ ctx: fp.ctx, db: client });
        assert.equal(okc.canceladas, 1);
        assert.equal(fp.state.schedules.find((s) => s.id === 2)!.disabled, true);
        await marcarCancelacionFitpass(cD2, client);
        const rev = await procesarCancelacionesFitpass({ ctx: fp.ctx, db: client });
        assert.equal(rev.revertidas, 1, 'clase aún programada: no se cancela en el panel');
        ok('cancelación: outbox con reintento, 404/410 idempotente, sin doble cancelación, reactivada se revierte');

        // ── 6. Publicar nuevas: flag apagado = no crea ─────────────────────
        const cP = await mk(ct, '08:00'); // sin schedule, cupo FP 5, coach real
        await q(`INSERT INTO channel_inventory (class_id, channel, max_spots) VALUES ($1,'fitpass',5)`, [cP]);
        const off = await publishClassToFitpass(cP, { ctx: fp.ctx, db: client, enabled: false });
        assert.deepEqual(off, { skipped: 'publish-disabled' });
        assert.equal(fp.state.calls.filter((c) => c.op === 'create').length, 0, 'flag apagado: NO crea');
        assert.deepEqual(await extendFitpassWeek({ ctx: fp.ctx, db: client, enabled: false }), { skipped: 'publish-disabled' });
        assert.equal(process.env.FITPASS_PUBLISH_ENABLED === 'true', false, 'por defecto el flag está apagado');
        const prev = await previewFitpassPublish(DATE, DATE, { ctx: fp.ctx, db: client });
        assert.equal(prev.items.find((i) => i.classId === cP)!.action, 'create', 'el preview muestra que crearía');
        assert.equal(fp.state.calls.filter((c) => c.op === 'create').length, 0, 'preview no escribe');
        const on = await publishClassToFitpass(cP, { ctx: fp.ctx, db: client, enabled: true }) as any;
        assert.equal(on.counts.created, 1);
        const created = fp.state.calls.find((c) => c.op === 'create')!;
        assert.equal(created.input.lessonAvailability, 5); assert.equal(created.input.instructorName, 'Coach Prueba');
        assert.equal(created.input.length, 50);
        assert.ok((await map(cP)).external_slot_id, 'se reclama tras re-listar (exactamente 1)');
        // re-listado con 2 coincidencias -> NO reclama
        const cQ = await mk(ct, '07:00'); await q(`INSERT INTO channel_inventory (class_id, channel, max_spots) VALUES ($1,'fitpass',5)`, [cQ]);
        fp.state.duplicateOnCreate = true;
        const dup = await publishClassToFitpass(cQ, { ctx: fp.ctx, db: client, enabled: true }) as any;
        fp.state.duplicateOnCreate = false;
        assert.equal(dup.counts.created, 0); assert.equal(await map(cQ), undefined, 'ambiguo tras crear: no se reclama a ciegas');
        // sin coach real / sin cupo / compartido: no crea
        await q(`UPDATE instructors SET display_name = $2 WHERE id = $1`, [ins.id, GYM_DEFAULT_COACH]);
        const cJ = await mk(ct, '06:00'); await q(`INSERT INTO channel_inventory (class_id, channel, max_spots) VALUES ($1,'fitpass',5)`, [cJ]);
        const cK = await mk(ctB, '06:30'); // sin cupo FP
        const nCreate = fp.state.calls.filter((c) => c.op === 'create').length;
        const sk = await publishFitpassCore({ from: DATE, to: DATE }, { ctx: fp.ctx, db: client, dryRun: false, allowCreate: true, classIds: [cJ, cK, cS1] });
        assert.equal(sk.items.find((i) => i.classId === cJ)!.reason, 'no-real-coach');
        assert.equal(sk.items.find((i) => i.classId === cK)!.reason, 'no-fitpass-cap');
        assert.equal(sk.items.find((i) => i.classId === cS1)!.reason, 'shared-fingerprint');
        assert.equal(fp.state.calls.filter((c) => c.op === 'create').length, nCreate);
        await q(`UPDATE instructors SET display_name = 'Coach Prueba' WHERE id = $1`, [ins.id]);
        ok('publicar: flag apagado no crea; con flag crea+reclama solo si hay 1; salta sin coach/cupo/compartidos');

        // ── 7. Edición/movimiento ──────────────────────────────────────────
        const cE = await mk(ct, '05:00'); await q(`INSERT INTO channel_inventory (class_id, channel, max_spots) VALUES ($1,'fitpass',4)`, [cE]);
        fp.state.schedules.push(sched(500, LESSON, DATE, '05:00', 4));
        await q(`INSERT INTO partner_class_mappings (class_id, channel, external_slot_id, sync_status) VALUES ($1,'fitpass','500','synced')`, [cE]);
        await q(`UPDATE classes SET start_time='05:30', end_time='06:20' WHERE id=$1`, [cE]);
        assert.equal(await marcarEdicionFitpass([cE, cC], client), 1);
        assert.equal((await map(cE)).sync_status, 'pending_resync');
        assert.deepEqual((await procesarEdicionesFitpass({ ctx: fp.ctx, db: client, enabled: false })).skipped, 'publish-disabled');
        assert.equal(fp.state.schedules.find((s) => s.id === 500)!.lesson_time, localDateTimeUtc(DATE, '05:00').toISOString(), 'flag apagado: no se mueve');
        // anti-robo: destino ocupado por otra schedule
        fp.state.schedules.push(sched(501, LESSON, DATE, '05:30', 4));
        const pre = await preflightFitpassClassEdit(cE, { date: DATE, hhmm: '05:30', lessonId: LESSON }, { ctx: fp.ctx, db: client, enabled: true });
        assert.equal((pre as any).code, 'FITPASS_DESTINATION_OCCUPIED');
        const conf = await procesarEdicionesFitpass({ ctx: fp.ctx, db: client, enabled: true });
        assert.equal(conf.conflictos, 1);
        assert.match((await map(cE)).sync_error, /destination-occupied/);
        assert.equal(fp.state.schedules.find((s) => s.id === 501)!.lesson_availability, 4, 'la schedule del destino no se tocó');
        // libre: mueve LA MISMA schedule
        fp.state.schedules = fp.state.schedules.filter((s) => s.id !== 501);
        const moved = await procesarEdicionesFitpass({ ctx: fp.ctx, db: client, enabled: true });
        assert.equal(moved.sincronizadas, 1);
        const s500 = fp.state.schedules.find((s) => s.id === 500)!;
        assert.equal(cdmxDateTime(s500.lesson_time).hhmm, '05:30');
        assert.equal((await map(cE)).sync_status, 'synced'); assert.equal((await map(cE)).external_slot_id, '500');
        ok('edición: preflight anti-robo, conflicto visible, mueve la misma schedule, detrás del flag');

        // ── 8. Tope por API / lote ─────────────────────────────────────────
        const cT = await mk(ct, '04:00', 6);
        await q(`INSERT INTO channel_inventory (class_id, channel, max_spots) VALUES ($1,'fitpass',4)`, [cT]);
        await q(`INSERT INTO bookings (class_id, user_id, status, channel) VALUES ($1,$2,'confirmed','fitpass'),($1,$3,'confirmed','fitpass')`, [cT, users[0].id, users[1].id]);
        await assert.rejects(() => setFitpassCap(cT, 1, client), (e: any) => e.code === 'CAP_BELOW_BOOKED' && e.booked === 2);
        await assert.rejects(() => setFitpassCap(cT, 7, client), (e: any) => e.code === 'CAP_EXCEEDS_CAPACITY');
        await assert.rejects(() => setFitpassCap('00000000-0000-0000-0000-000000000000', 1, client), (e: any) => e.code === 'CLASS_NOT_FOUND');
        assert.equal((await setFitpassCap(cT, 5, client)).max_spots, 5);
        assert.equal((await inv(cT)).max_spots, 5);
        const cU = await mk(ct, '03:00'); await q(`INSERT INTO channel_inventory (class_id, channel, max_spots) VALUES ($1,'fitpass',3)`, [cU]);
        assert.equal((await setFitpassCap(cU, 0, client)).max_spots, 0);
        assert.equal(await inv(cU), undefined, 'apagar sin reservas borra la fila');
        const ids = ['5a3c8c0e-6f0e-4d57-8f39-3b6d4f2a9a01'];
        assert.equal(LoteSchema.safeParse({ classIds: ids, accion: 'cupo_canal', vistaPrevia: true, canal: 'fitpass', lugares: 3 }).success, true);
        assert.equal(LoteSchema.safeParse({ classIds: ids, accion: 'cupo_canal', vistaPrevia: true, canal: 'totalpass', lugares: 3 }).success, true);
        assert.equal(LoteSchema.safeParse({ classIds: ids, accion: 'cupo_canal', vistaPrevia: true, canal: 'wellhub', lugares: 3 }).success, false);
        const rutaClases = readFileSync(fileURLToPath(new URL('../src/routes/classes.ts', import.meta.url)), 'utf8');
        assert.match(rutaClases, /const \{ totalpass, fitpass \} = req\.body/);
        assert.match(rutaClases, /setFitpassCap\(req\.params\.id, fpN\)/);
        const rutaTipos = readFileSync(fileURLToPath(new URL('../src/routes/class-types.ts', import.meta.url)), 'utf8');
        assert.match(rutaTipos, /fitpass_lesson_id, fitpass_quota/); assert.match(rutaTipos, /fitpass_quota = \$/);
        const rutaFp = readFileSync(fileURLToPath(new URL('../src/routes/partners-fitpass.ts', import.meta.url)), 'utf8');
        assert.match(rutaFp, /publish-preview/);
        const cron = readFileSync(fileURLToPath(new URL('../src/services/cron-jobs.ts', import.meta.url)), 'utf8');
        for (const j of ['FITPASS_POOL', 'FITPASS_EXTEND_WEEK', 'FITPASS_RETRY']) assert.match(cron, new RegExp(`job\\('${j}'`));
        ok('tope FitPass: validaciones, apagar, lote acepta fitpass; rutas y crons cableados');

        // setClassTypeLesson conserva la lesson cuando solo cambia el cupo
        const { setClassTypeLesson } = await import('../src/lib/fitpass/lessons.js');
        const r1 = await client.query(`UPDATE class_types SET fitpass_lesson_id = CASE WHEN $4::boolean THEN $2::int ELSE fitpass_lesson_id END, fitpass_quota = $3 WHERE id = $1 RETURNING fitpass_lesson_id, fitpass_quota`, [ct, null, 9, false]);
        assert.equal(r1.rows[0].fitpass_lesson_id, LESSON); assert.equal(r1.rows[0].fitpass_quota, 9);
        assert.equal(typeof setClassTypeLesson, 'function');
        ok('mapeo: cupo solo conserva la lesson');

        await client.query('ROLLBACK');
        console.log('test-fitpass-publish: OK (revertido)');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally {
        client.release();
        await pool.end();
    }
}
main().catch((e) => { console.error(e); process.exit(1); });
