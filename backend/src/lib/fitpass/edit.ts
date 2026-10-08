/**
 * edit — propagar a FitPass la edición/movimiento de una clase DUEÑA.
 *
 * Se actualiza LA MISMA schedule (updateSchedule: conserva las reservas de FitPass). Outbox en
 * partner_class_mappings (sync_status='pending_resync'); la ejecución lee el estado ACTUAL de la
 * clase, así que converge sola aunque se edite varias veces.
 *
 * Anti-robo: nunca se adopta una schedule que ya esté en el destino. Si en el slot nuevo ya hay
 * OTRA schedule activa, no se mueve nada y queda `destination-occupied` visible en sync_error.
 *
 * EJECUCIÓN detrás de FITPASS_PUBLISH_ENABLED=true (default apagado, igual que crear). Con el
 * flag apagado el outbox queda anotado y el pool de cupo NO empuja a una schedule cuyo slot ya
 * no coincide (`slot-mismatch`), así que no hay efectos hasta activar.
 */
import { filas, type ClienteTx } from '../db-tx.js';
import { GYM_DEFAULT_COACH } from '../gym-config.js';
import { localDateStr } from '../mx-time.js';
import { computeFitpassScheduleCapacity } from './availability.js';
import { cdmxDateTime, getFitpassMapping, isRealCoach, scheduleSlot, slotKey } from './ownership.js';
import { familyCompatible } from './family.js';
import { fitpassPublishEnabled, listWindow, minutesBetween, type PanelCtx } from './panel.js';

export async function marcarEdicionFitpass(classIds: string[], db?: ClienteTx): Promise<number> {
    if (!classIds.length) return 0;
    const marcar = filas<{ class_id: string }>(db,
        `UPDATE partner_class_mappings
            SET sync_status = 'pending_resync', updated_at = NOW(),
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('fitpass_edit', jsonb_build_object('queued_at', NOW()))
          WHERE channel = 'fitpass' AND class_id = ANY($1::uuid[]) AND external_slot_id IS NOT NULL
            AND sync_enabled = true AND sync_status IN ('synced', 'pending_resync')
          RETURNING class_id`, [classIds]);
    if (db) return (await marcar).length;
    return marcar.then((r) => r.length, (e: any) => { console.error('[fp-edit] no se pudo marcar:', e?.message); return 0; });
}

/** Valida ANTES del UPDATE local que el destino no esté ocupado por otra schedule. */
export async function preflightFitpassClassEdit(
    classId: string, dest: { date: string; hhmm: string; typeName: string }, o: { ctx?: PanelCtx; db?: ClienteTx; enabled?: boolean } = {},
): Promise<{ ok: true } | { ok: false; code: 'FITPASS_DESTINATION_OCCUPIED'; message: string }> {
    if (!(o.enabled ?? fitpassPublishEnabled()) || !o.ctx) return { ok: true };
    const m = await getFitpassMapping(classId, o.db);
    if (!m?.external_slot_id || !m.sync_enabled) return { ok: true };
    const list = await listWindow(o.ctx, dest.date, dest.date);
    const key = slotKey(dest.date, dest.hhmm);
    const otra = list.find((s) => s.disabled !== true && String(s.id) !== String(m.external_slot_id)
        && scheduleSlot(s).key === key && familyCompatible(dest.typeName, s.lesson?.name));
    return otra
        ? { ok: false, code: 'FITPASS_DESTINATION_OCCUPIED', message: `FitPass ya tiene otra clase en ese horario (schedule ${otra.id}); no se puede mover encima.` }
        : { ok: true };
}

export interface FpEditSummary { pendientes: number; sincronizadas: number; sinCambio: number; conflictos: number; fallidas: number; aCancelar: number; skipped?: string }

interface EditRow {
    class_id: string; external_slot_id: string; date: string; hhmm: string; end_hhmm: string; status: string;
    lesson_id: number | null; type_name: string; coach: string | null; capacity: number; fp_cap: number | null; total_booked: number; fp_booked: number;
}

export async function procesarEdicionesFitpass(o: { ctx: PanelCtx; db?: ClienteTx; now?: Date; enabled?: boolean }): Promise<FpEditSummary> {
    const s: FpEditSummary = { pendientes: 0, sincronizadas: 0, sinCambio: 0, conflictos: 0, fallidas: 0, aCancelar: 0 };
    if (!(o.enabled ?? fitpassPublishEnabled())) return { ...s, skipped: 'publish-disabled' };
    const rows = await filas<EditRow>(o.db,
        `SELECT pcm.class_id, pcm.external_slot_id, c.date::text AS date, substr(c.start_time::text,1,5) AS hhmm,
                substr(c.end_time::text,1,5) AS end_hhmm, c.status::text AS status, ct.fitpass_lesson_id AS lesson_id, ct.name AS type_name,
                i.display_name AS coach, c.max_capacity AS capacity, ci.max_spots AS fp_cap,
                (SELECT count(*) FROM bookings b WHERE b.class_id = c.id AND b.status IN ('confirmed','checked_in'))::int AS total_booked,
                (SELECT count(*) FROM bookings b WHERE b.class_id = c.id AND b.status IN ('confirmed','checked_in') AND b.channel = 'fitpass')::int AS fp_booked
           FROM partner_class_mappings pcm
           JOIN classes c ON c.id = pcm.class_id JOIN class_types ct ON ct.id = c.class_type_id
           LEFT JOIN instructors i ON i.id = c.instructor_id
           LEFT JOIN channel_inventory ci ON ci.class_id = c.id AND ci.channel = 'fitpass'
          WHERE pcm.channel = 'fitpass' AND pcm.sync_status = 'pending_resync' AND pcm.external_slot_id IS NOT NULL
          ORDER BY c.date, c.start_time LIMIT 100`);
    s.pendientes = rows.length;
    if (!rows.length) return s;
    const setErr = (id: string, err: string) => filas(o.db,
        `UPDATE partner_class_mappings SET sync_error = $2, updated_at = NOW() WHERE class_id = $1 AND channel = 'fitpass'`, [id, err]);
    const setSynced = (id: string) => filas(o.db,
        `UPDATE partner_class_mappings SET sync_status = 'synced', sync_error = NULL, last_synced_at = NOW(), updated_at = NOW(),
                metadata = COALESCE(metadata,'{}'::jsonb) - 'fitpass_edit' WHERE class_id = $1 AND channel = 'fitpass'`, [id]);

    const live = rows.filter((r) => r.status === 'scheduled');
    for (const r of rows.filter((x) => x.status !== 'scheduled')) {
        await filas(o.db, `UPDATE partner_class_mappings SET sync_status = 'pending_delete', updated_at = NOW() WHERE class_id = $1 AND channel = 'fitpass'`, [r.class_id]);
        s.aCancelar++;
    }
    if (!live.length) return s;
    const from = [localDateStr(o.now), ...live.map((r) => r.date.slice(0, 10))].sort()[0];
    const to = live.map((r) => r.date.slice(0, 10)).sort().slice(-1)[0];
    const schedules = await listWindow(o.ctx, from, to);
    const byId = new Map(schedules.map((x) => [Number(x.id), x]));

    for (const r of live) {
        try {
            const sched = byId.get(Number(r.external_slot_id));
            if (!sched) { s.fallidas++; await setErr(r.class_id, 'edit-failed: schedule-not-found-in-window'); continue; }
            if (sched.disabled === true) {
                await filas(o.db, `UPDATE partner_class_mappings SET sync_status='skipped', sync_enabled=false, sync_error='disabled-in-panel', updated_at=NOW() WHERE class_id=$1 AND channel='fitpass'`, [r.class_id]);
                s.fallidas++; continue;
            }
            // Misma schedule: conserva su lesson (variante) si sigue siendo de la familia del tipo; si el tipo
            // cambió de familia usa el default del tipo nuevo.
            const keepLesson = familyCompatible(r.type_name, sched.lesson?.name);
            const lessonId = keepLesson ? Number(sched.lesson!.id) : r.lesson_id;
            if (lessonId == null) { s.fallidas++; await setErr(r.class_id, 'edit-failed: tipo-sin-lesson-fitpass'); continue; }
            const key = slotKey(r.date, r.hhmm);
            const otra = schedules.find((x) => x.disabled !== true && Number(x.id) !== Number(sched.id)
                && scheduleSlot(x).key === key && familyCompatible(r.type_name, x.lesson?.name));
            if (otra) { s.conflictos++; await setErr(r.class_id, `destination-occupied: schedule ${otra.id}`); continue; }
            const coach = isRealCoach(r.coach, GYM_DEFAULT_COACH) ? r.coach!.trim() : GYM_DEFAULT_COACH;
            const length = minutesBetween(r.hhmm, r.end_hhmm);
            const availability = computeFitpassScheduleCapacity(r.fp_cap, r.capacity, r.total_booked, r.fp_booked);
            const igual = scheduleSlot(sched).key === key && Number(sched.lesson?.id) === lessonId && (sched.instructor?.name || '').trim() === coach
                && Number(sched.length) === length && Number(sched.lesson_availability) === availability;
            if (igual) { await setSynced(r.class_id); s.sinCambio++; continue; }
            await o.ctx.panel.updateSchedule(Number(sched.id), {
                gymId: o.ctx.gymId, lessonId, instructorName: coach, startDate: r.date.slice(0, 10),
                lessonTime: r.hhmm, length, lessonAvailability: availability, multiple: false,
            });
            const after = await listWindow(o.ctx, r.date.slice(0, 10), r.date.slice(0, 10));
            const ok = after.find((x) => Number(x.id) === Number(sched.id) && x.disabled !== true && scheduleSlot(x).key === key);
            if (!ok) { s.fallidas++; await setErr(r.class_id, 'edit-failed: verify-failed'); continue; }
            await setSynced(r.class_id);
            s.sincronizadas++;
        } catch (e) {
            s.fallidas++;
            await setErr(r.class_id, `edit-failed: ${(e as Error).message.slice(0, 200)}`).catch(() => { /* noop */ });
        }
    }
    return s;
}

export { cdmxDateTime };
