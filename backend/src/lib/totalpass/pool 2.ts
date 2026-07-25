/**
 * pool — reconciliación de cupo (Fase 4) de TotalPass: por cada ocurrencia
 * individual futura y PUBLICADA de Casa Shé, empuja `slots = channelCapCeiling`
 * a la API oficial de TotalPass solo cuando el número cambió. Un solo
 * `listEvents()` por corrida; NO escribe cupo en la BD (channel_inventory lo
 * fija el admin) — solo empuja a TP y hace backfill del `external_occurrence_id`
 * cuando falta (gap conocido de la Task 13: el create no siempre devuelve la
 * ocurrencia).
 *
 * Adelgazado de Hundred `partner-pool.ts` (reconcileTotalpassPoolInner),
 * TP-only: sin el modelo de "cerrar huérfanas" ni el guard de
 * `totalpass_move`/`totalpass_edit_guard` — Casa Shé todavía no tiene edición
 * de horario con movimiento de ocurrencia, así que esas ramas no aplican aquí.
 * Si una clase deja de calificar (tope apagado, cancelada, etc.) simplemente
 * no se toca en este reconcile.
 *
 * Casa Shé no tiene `classes.published_at`: "publicada" = existe un mapping en
 * `partner_class_mappings` (channel='totalpass', sync_status='published').
 *
 * El cron que llama a `reconcileTotalpassPool` en un intervalo se cablea en la
 * Task 17 (cron-jobs.ts); este módulo no se registra a sí mismo.
 */
import { query } from '../../config/database.js';
import { localDateStr, addDaysToDateStr, localDateTimeUtc } from '../mx-time.js';
import { channelCapCeiling } from './caps.js';
import {
    totalPassOfficialFromDb,
    totalPassOccurrenceUuid,
    isTotalPassRateLimit,
    type TotalPassOfficialEvent,
} from './client.js';

// ── Parte pura (testeable sin DB ni red) ─────────────────────────────────────

/** true si hay que hacer PUT: el cupo deseado difiere del que TP tiene ahora mismo. */
export function decidePoolChange(currentSlots: number, desiredSlots: number): boolean {
    return Math.floor(currentSlots) !== Math.floor(desiredSlots);
}

/**
 * Cupo a EMPUJAR a TotalPass para una ocurrencia: el techo del canal
 * (channelCapCeiling con el total "real" = reservas de otros canales +
 * reservas TP en vivo), pero nunca por debajo de `tpLive` (lo que TP ya trae
 * reservado ahora mismo — más fresco que el conteo importado a la BD).
 */
export function computeDesiredSlots(capacity: number, nonTpBooked: number, tpLive: number, tpCap: number | null): number {
    const live = Math.max(0, Math.floor(tpLive));
    const totalReal = Math.max(0, Math.floor(nonTpBooked)) + live;
    const ceiling = channelCapCeiling(capacity, totalReal, live, tpCap);
    return Math.max(live, ceiling);
}

// ── Reconciliación batch del pool en TotalPass ───────────────────────────────

export interface TpPoolReconcileSummary {
    classesTp: number;  // ocurrencias TP futuras con clase Casa Shé publicada evaluadas
    changed: number;    // slots ajustados con éxito
    unchanged: number;  // ya coincidían
    failed: number;
    skipped?: string;
}

interface TpPoolClassRow {
    class_id: string;
    title: string;
    date: string;
    hhmm: string;
    capacity: number;
    tp_cap: number;
    total_booked: number;
    tp_booked: number;
    external_event_id: string | null;
    external_occurrence_id: string | null;
}

/** Backfill: guarda el uuid de ocurrencia resuelto cuando el mapping lo tenía en NULL. */
async function backfillOccurrenceId(classId: string, occurrenceUuid: string): Promise<void> {
    await query(
        `UPDATE partner_class_mappings SET external_occurrence_id = $2, updated_at = NOW()
           WHERE class_id = $1 AND channel = 'totalpass'`,
        [classId, occurrenceUuid],
    );
}

/**
 * Reconciliación batch del pool de TotalPass: para cada ocurrencia individual
 * futura de una clase Casa Shé publicada con cupo TP > 0, fija
 * `slots = computeDesiredSlots(...)` cuando cambió. Ventana `[hoy, hoy+horizonDays]`
 * en fecha local del gym (default 21 días). Guard anti-catástrofe: si no hay
 * NINGUNA clase Casa Shé activa con cupo TP en la ventana, aborta sin tocar
 * TP (`skipped:'no-classes'`) — evita que un glitch de consulta cierre todo
 * el calendario. Throttle de 120ms entre PUTs; un 429 corta la corrida.
 */
export async function reconcileTotalpassPool(opts: { horizonDays?: number } = {}): Promise<TpPoolReconcileSummary> {
    const base: TpPoolReconcileSummary = { classesTp: 0, changed: 0, unchanged: 0, failed: 0 };

    const client = await totalPassOfficialFromDb();
    if (!client) return { ...base, skipped: 'no-client' };

    const from = localDateStr();
    const to = addDaysToDateStr(from, opts.horizonDays ?? 21);

    // Clases Casa Shé publicadas (mapping sync_status='published') con cupo TP > 0
    // en la ventana: capacidad, tope del canal, reservas totales (confirmed/checked_in)
    // y cuántas son de TP (igual criterio que publish.ts).
    const classes = await query<TpPoolClassRow>(
        `SELECT c.id AS class_id, ct.name AS title, c.date::text AS date,
                substr(c.start_time::text, 1, 5) AS hhmm,
                c.max_capacity AS capacity, ci.max_spots AS tp_cap,
                pcm.external_event_id, pcm.external_occurrence_id,
                count(b.id) FILTER (WHERE b.status IN ('confirmed','checked_in'))::int AS total_booked,
                count(b.id) FILTER (WHERE b.status IN ('confirmed','checked_in') AND b.channel = 'totalpass')::int AS tp_booked
           FROM classes c
           JOIN class_types ct ON ct.id = c.class_type_id
           JOIN channel_inventory ci ON ci.class_id = c.id AND ci.channel = 'totalpass' AND ci.max_spots > 0
           JOIN partner_class_mappings pcm ON pcm.class_id = c.id AND pcm.channel = 'totalpass' AND pcm.sync_status = 'published'
           LEFT JOIN bookings b ON b.class_id = c.id
          WHERE c.status = 'scheduled'
            AND c.date BETWEEN $1::date AND $2::date
          GROUP BY c.id, ct.name, c.date, c.start_time, c.max_capacity, ci.max_spots,
                   pcm.external_event_id, pcm.external_occurrence_id`,
        [from, to],
    );
    // Guard anti-catástrofe: sin clases TP activas (glitch de consulta o nada
    // publicado todavía) no tocamos nada en TP — abortamos.
    if (!classes.length) return { ...base, skipped: 'no-classes' };

    const byId = new Map(classes.map((c) => [c.class_id, c]));
    const bySlot = new Map(classes.map((c) => [`${c.title.trim()}|${c.date.slice(0, 10)}|${c.hhmm}`, c]));

    const events = await client.listEvents();

    const summary: TpPoolReconcileSummary = { ...base };
    let rateLimited = false;
    for (const ev of events as TotalPassOfficialEvent[]) {
        if (rateLimited) break;
        if (ev.recurrenceType === 'WEEKLY') continue; // solo eventos individuales
        const title = String(ev.title || '').trim();
        for (const o of (ev.EventOccurrences || [])) {
            if (rateLimited) break;
            const date = String(o.eventDate).slice(0, 10);
            if (date < from || date > to) continue;
            const hhmm = String(o.startTime).slice(0, 5);

            // Match por externalReference (llave dueña) o title|date|HH:MM, igual que publish.ts.
            const reference = String(o.externalReference || ev.externalReference || '').trim();
            const cls = (reference ? byId.get(reference) : undefined) || bySlot.get(`${title}|${date}|${hhmm}`);
            if (!cls) continue; // no es una clase Casa Shé publicada en este reconcile

            // BACKFILL: mapping sin external_occurrence_id pero ya localizado en TP
            // (gap de Task 13 cuando el create no devolvió la ocurrencia).
            const uuid = totalPassOccurrenceUuid(o);
            if (!cls.external_occurrence_id && uuid) {
                await backfillOccurrenceId(cls.class_id, uuid);
                cls.external_occurrence_id = uuid;
            }

            // Saltar ocurrencias ya iniciadas: TP rechaza editarlas (422 "Event already
            // happened") y no hay nada que ajustar.
            if (localDateTimeUtc(date, hhmm).getTime() <= Date.now()) continue;

            summary.classesTp++;

            const tpLive = Number(o.slotsInUse ?? 0);
            const nonTp = Math.max(0, Number(cls.total_booked) - Number(cls.tp_booked));
            const desired = computeDesiredSlots(Number(cls.capacity), nonTp, tpLive, Number(cls.tp_cap));
            const current = Number(o.slots);

            if (!decidePoolChange(current, desired)) { summary.unchanged++; continue; }
            if (!uuid) { summary.failed++; continue; } // no hay uuid para hacer el PUT

            try {
                await client.setOccurrenceSlots(uuid, desired);
                summary.changed++;
            } catch (e) {
                if (isTotalPassRateLimit(e)) {
                    rateLimited = true;
                    console.warn('[tp-pool] 429 rate-limit → aborto la corrida');
                    break;
                }
                summary.failed++;
                console.error(`[tp-pool] ${title} ${date} ${hhmm} -> ${desired}:`, (e as Error).message);
            }
            await new Promise((r) => setTimeout(r, 120)); // throttle entre PUTs
        }
    }
    if (rateLimited) summary.skipped = 'rate-limited';
    if (summary.changed || summary.failed) {
        console.log(`[tp-pool] ${from}..${to}: ajustadas=${summary.changed} iguales=${summary.unchanged} fallas=${summary.failed}${rateLimited ? ' (cortado por 429)' : ''}`);
    }
    return summary;
}
