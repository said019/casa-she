/**
 * publish — publicación de clases de Casa Shé como eventos INDIVIDUALES en
 * TotalPass (modelo oficial-only, adelgazado de Hundred totalpass-publish.ts).
 *
 * TotalPass solo aplica el tope de cancelación en clases de "recurrencia
 * individual" (un día) y SOLO al crearlas. Por eso cada clase de Casa Shé se
 * publica como un evento individual con maxTimeToCancel = inicio − TP_CANCEL_HOURS.
 *
 * Reglas globales que respeta este módulo:
 *  - Solo la API oficial (totalPassOfficialFromDb → cliente crudo).
 *  - Las fechas de TP se manejan por string/slice, nunca con new Date() sobre
 *    los campos de la API (son "hora local marcada como UTC").
 *  - Idempotencia por externalReference (llave dueña) o title|date|HH:MM, con
 *    trim simétrico al guardado de TP.
 *  - slots = channelCapCeiling (techo del canal), NUNCA la cuota cruda del tipo.
 *  - Throttle de 140ms entre llamadas; un 429 aborta la corrida.
 *  - Salvaguarda spec §6: el place autenticado debe ser Casa Shé
 *    (placeNameMatchesCasaShe, match tolerante) o se aborta el publish de esa
 *    clase — defensa en profundidad si las llaves apuntaran a otro estudio.
 */
import { query, queryOne } from '../../config/database.js';
import { GYM_DEFAULT_COACH } from '../gym-config.js';
import { localDateTimeUtc } from '../mx-time.js';
import { channelCapCeiling } from './caps.js';
import { TP_CANCEL_HOURS, formatTpCancelDeadlinePanel } from './cancel-format.js';
import {
    totalPassOfficialFromDb,
    totalPassPlanId,
    totalPassTime12,
    totalPassOccurrenceUuid,
    isTotalPassRateLimit,
    type TotalPassIndividualInput,
    type TotalPassOfficialEvent,
    type TotalPassOfficialOccurrence,
} from './client.js';

// ── Parte pura (testeable) ───────────────────────────────────────────────────

/** Fila mínima de la clase para armar el input de TP. */
export interface TpClassRow {
    id: string;
    date: string;       // "YYYY-MM-DD"
    start_time: string; // "HH:MM" o "HH:MM:SS"
}

/** Fila mínima del tipo de clase para armar el input de TP. */
export interface TpClassTypeRow {
    name: string;
    duration_minutes: number | null;
}

/**
 * Normaliza un nombre para comparación tolerante: minúsculas y sin acentos/diacríticos.
 * Función PURA, base de `placeNameMatchesCasaShe`.
 */
function normalizeForMatch(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

/**
 * Salvaguarda spec §6 (revisión final, Fix 2): true si el nombre del place que
 * devuelve TotalPass corresponde a Casa Shé. Comparación tolerante — normaliza a
 * minúsculas sin acentos y acepta que el nombre CONTENGA "casa she" (p.ej.
 * "Casa She Studio", "CASA SHE"), no solo que coincida exacto. Defensa en
 * profundidad para no publicar clases en el place equivocado si las llaves de
 * `platform_credentials` llegaran a apuntar a otro estudio.
 */
export function placeNameMatchesCasaShe(name: string): boolean {
    return normalizeForMatch(name).includes('casa she');
}

/**
 * Arma el TotalPassIndividualInput del CREATE oficial. Función PURA (sin red ni
 * DB) para poder testearla con snapshot:
 *  - title con trim (simétrico al guardado de TP, o el slot nunca matchea).
 *  - responsible = coach del día o GYM_DEFAULT_COACH.
 *  - startTime en 12h "hh:mm AM/PM" (lo que espera el endpoint individual).
 *  - maxTimeToCancel en formato panel "YYYY-MM-DD hh:mm AM/PM" (local, DST-aware).
 *  - externalReference = id de la clase (llave dueña de idempotencia).
 */
export function buildIndividualInput(
    cls: TpClassRow,
    ct: TpClassTypeRow,
    instructorName: string | null,
    slots: number,
    planId: number,
): TotalPassIndividualInput {
    const date = cls.date.slice(0, 10);
    const hhmm = cls.start_time.slice(0, 5);
    return {
        title: String(ct.name).trim(),
        responsible: (instructorName || '').trim() || GYM_DEFAULT_COACH,
        duration: Number(ct.duration_minutes) || 50,
        slots,
        planId,
        timezone: 'es-MX',
        eventDate: date,
        startTime: totalPassTime12(hhmm),
        status: 'ACTIVE',
        maxTimeToCancel: formatTpCancelDeadlinePanel(date, hhmm, TP_CANCEL_HOURS),
        externalReference: cls.id,
    };
}

/**
 * Busca la ocurrencia TP de una clase dentro del snapshot de listEvents.
 * Prioriza externalReference (sobrevive a cambios de título); si no, cae a la
 * llave title|date|HH:MM con trim simétrico. Devuelve el eventId y el uuid de
 * ocurrencia (para setSlots/delete/backfill del mapping).
 */
function findTpOccurrence(
    events: TotalPassOfficialEvent[],
    title: string,
    date: string,
    hhmm: string,
    externalReference: string,
): { eventId: string; occurrenceUuid: string | null } | null {
    // 1) por externalReference (llave dueña)
    for (const ev of events || []) {
        for (const o of (ev.EventOccurrences || [])) {
            const ref = String(o.externalReference || ev.externalReference || '').trim();
            if (ref && ref === externalReference) {
                return { eventId: String(ev.id), occurrenceUuid: totalPassOccurrenceUuid(o) };
            }
        }
    }
    // 2) por title|date|HH:MM
    const want = `${title.trim()}|${date}|${hhmm}`;
    for (const ev of events || []) {
        const evTitle = String(ev.title ?? '').trim();
        for (const o of (ev.EventOccurrences || [])) {
            const key = `${evTitle}|${String(o.eventDate).slice(0, 10)}|${String(o.startTime).slice(0, 5)}`;
            if (key === want) {
                return { eventId: String(ev.id), occurrenceUuid: totalPassOccurrenceUuid(o) };
            }
        }
    }
    return null;
}

/** Upsert del mapping clase↔evento TP con ids externos + sync_status='published'. */
async function persistTpMapping(classId: string, eventId: string, occurrenceId: string | null): Promise<void> {
    await query(
        `INSERT INTO partner_class_mappings (class_id, channel, external_event_id, external_occurrence_id, sync_status, sync_error, last_synced_at)
         VALUES ($1, 'totalpass', $2, $3, 'published', NULL, NOW())
         ON CONFLICT (class_id, channel) DO UPDATE
         SET external_event_id = EXCLUDED.external_event_id,
             external_occurrence_id = COALESCE(EXCLUDED.external_occurrence_id, partner_class_mappings.external_occurrence_id),
             sync_status = 'published',
             sync_error = NULL,
             last_synced_at = NOW(),
             updated_at = NOW()`,
        [classId, eventId, occurrenceId],
    );
}

// ── Publicación por clase ────────────────────────────────────────────────────

export interface TpClassPublishOutcome {
    ok: boolean;
    action: 'created' | 'exists' | 'too-soon' | 'no-cap' | 'no-class' | 'no-client' | 'error';
    detail?: string;
    externalEventId?: string;
    externalOccurrenceId?: string;
}

/**
 * Publica UNA clase como evento individual en TotalPass. Idempotente: primero la
 * existencia (mapping publicado o evento en TP por externalReference/llave), y
 * solo si NO existe se evalúa el guard "too-soon" y se crea. slots = techo del
 * canal (channelCapCeiling con el tope por clase de channel_inventory), NO la
 * cuota cruda del tipo. Persiste los ids externos en partner_class_mappings.
 */
export async function publishTotalPassClass(classId: string): Promise<TpClassPublishOutcome> {
    // 1) Clase + tipo + coach + tope TP + conteos de reservas (confirmed/checked_in)
    const cls = await queryOne<{
        title: string;
        duration_minutes: number | null;
        date: string;
        hhmm: string;
        max_capacity: number;
        coach: string | null;
        tp_cap: number | null;
        total_booked: number;
        tp_booked: number;
    }>(
        `SELECT ct.name AS title, ct.duration_minutes,
                c.date::text AS date, substr(c.start_time::text, 1, 5) AS hhmm,
                c.max_capacity, i.display_name AS coach,
                ci.max_spots AS tp_cap,
                count(b.id) FILTER (WHERE b.status IN ('confirmed','checked_in'))::int AS total_booked,
                count(b.id) FILTER (WHERE b.status IN ('confirmed','checked_in') AND b.channel = 'totalpass')::int AS tp_booked
           FROM classes c
           JOIN class_types ct ON ct.id = c.class_type_id
           LEFT JOIN instructors i ON i.id = c.instructor_id
           LEFT JOIN channel_inventory ci ON ci.class_id = c.id AND ci.channel = 'totalpass'
           LEFT JOIN bookings b ON b.class_id = c.id
          WHERE c.id = $1 AND c.status = 'scheduled'
          GROUP BY ct.name, ct.duration_minutes, c.date, c.start_time, c.max_capacity, i.display_name, ci.max_spots`,
        [classId],
    );
    if (!cls) return { ok: false, action: 'no-class', detail: 'Clase no encontrada o no está agendada' };

    // 2) Tope del canal por clase (null o 0 = canal apagado)
    const tpCap = cls.tp_cap == null ? null : Number(cls.tp_cap);
    if (!tpCap || tpCap <= 0) return { ok: false, action: 'no-cap', detail: 'La clase no tiene cupo TotalPass (tope 0)' };

    const title = String(cls.title).trim();
    const date = cls.date.slice(0, 10);
    const hhmm = cls.hhmm;

    // 3) Idempotencia barata: mapping ya publicado (sin tocar la API)
    const mapping = await queryOne<{
        external_event_id: string | null;
        external_occurrence_id: string | null;
        sync_status: string;
    }>(
        `SELECT external_event_id, external_occurrence_id, sync_status
           FROM partner_class_mappings WHERE class_id = $1 AND channel = 'totalpass'`,
        [classId],
    );
    if (mapping && mapping.sync_status === 'published' && mapping.external_event_id) {
        return {
            ok: true,
            action: 'exists',
            externalEventId: mapping.external_event_id,
            externalOccurrenceId: mapping.external_occurrence_id ?? undefined,
        };
    }

    // 4) Cliente oficial (llaves WalletClub; renueva su propio JWT)
    const client = await totalPassOfficialFromDb();
    if (!client) return { ok: false, action: 'no-client', detail: 'Faltan llaves partner/place de TotalPass' };

    try {
        // 5) planId del place autenticado (sin hardcodear)
        const place = await client.getPlace();

        // 5b) Salvaguarda spec §6 (Fix 2, revisión final): si las llaves apuntan a otro
        // estudio, el place devuelto NO es Casa Shé — abortamos antes de crear nada en TP.
        const placeName = String(place?.name ?? '').trim();
        if (!placeNameMatchesCasaShe(placeName)) {
            return { ok: false, action: 'error', detail: `place inesperado: ${placeName}` };
        }

        const planId = totalPassPlanId(place);
        if (!planId) return { ok: false, action: 'error', detail: 'TotalPass no devolvió un planId para el place' };

        // 6) Idempotencia contra TP: ¿el evento ya existe (externalReference o title|date|HH:MM)?
        const events = await client.listEvents();
        const existing = findTpOccurrence(events, title, date, hhmm, classId);
        if (existing) {
            // Backfill del mapping aunque el evento ya existiera.
            await persistTpMapping(classId, existing.eventId, existing.occurrenceUuid);
            return {
                ok: true,
                action: 'exists',
                externalEventId: existing.eventId,
                externalOccurrenceId: existing.occurrenceUuid ?? undefined,
            };
        }

        // 7) Guard "too-soon": el deadline (inicio − (horas+0.5)) tiene que ser futuro,
        //    o TP rechaza el create. Solo aplica a las que SÍ hay que crear.
        const minStartMs = Date.now() + (TP_CANCEL_HOURS + 0.5) * 3600 * 1000;
        if (localDateTimeUtc(date, hhmm).getTime() <= minStartMs) {
            return { ok: false, action: 'too-soon', detail: 'La clase empieza demasiado pronto para el tope de cancelación de TotalPass' };
        }

        // 8) slots = techo del canal (fórmula única del sistema)
        const slots = channelCapCeiling(Number(cls.max_capacity), Number(cls.total_booked), Number(cls.tp_booked), tpCap);

        // 9) Crear el evento individual
        const input = buildIndividualInput(
            { id: classId, date, start_time: hhmm },
            { name: title, duration_minutes: cls.duration_minutes },
            cls.coach,
            slots,
            planId,
        );
        const created = await client.createIndividualEvent(input);
        const eventId = String(created.id);
        // La respuesta del create no siempre trae la ocurrencia; si viene, guardamos su uuid.
        const occ = created.EventOccurrences?.[0];
        const occurrenceId = occ ? totalPassOccurrenceUuid(occ) : null;
        await persistTpMapping(classId, eventId, occurrenceId);
        return { ok: true, action: 'created', externalEventId: eventId, externalOccurrenceId: occurrenceId ?? undefined };
    } catch (e) {
        const msg = (e as Error).message;
        console.error(`[TP publish-class] ${classId} ${title} ${date} ${hhmm}:`, msg);
        return { ok: false, action: 'error', detail: msg };
    }
}

// ── Publicación masiva de una ventana ────────────────────────────────────────

export interface TpIndividualPublishResult {
    planned: number;        // clases candidatas en el rango
    created: number;        // eventos individuales creados
    alreadyInTp: number;    // ya existían en TP (mapping o evento)
    skippedTooSoon: number; // su deadline ya pasó / está encima
    failed: number;
    skipped?: string;       // razón global (dry-run / no-client / rate-limited)
}

/**
 * Recorre las clases agendadas de [fromDate, toDate] con cupo TP (> 0) y SIN
 * mapping publicado, y publica cada una con publishTotalPassClass. Throttle de
 * 140ms entre llamadas; un 429 aborta la corrida (skipped='rate-limited').
 */
export async function publishTotalPassIndividualClasses(
    fromDate: string,
    toDate: string,
    opts: { dryRun?: boolean } = {},
): Promise<TpIndividualPublishResult> {
    const result: TpIndividualPublishResult = { planned: 0, created: 0, alreadyInTp: 0, skippedTooSoon: 0, failed: 0 };

    // Candidatas: agendadas, con cupo TP > 0 y sin mapping publicado, en la ventana.
    const candidates = await query<{ id: string }>(
        `SELECT c.id
           FROM classes c
           JOIN channel_inventory ci ON ci.class_id = c.id AND ci.channel = 'totalpass' AND ci.max_spots > 0
           LEFT JOIN partner_class_mappings pcm
                  ON pcm.class_id = c.id AND pcm.channel = 'totalpass' AND pcm.sync_status = 'published'
          WHERE c.date BETWEEN $1::date AND $2::date
            AND c.status = 'scheduled'
            AND pcm.class_id IS NULL
          ORDER BY c.date, c.start_time`,
        [fromDate, toDate],
    );
    result.planned = candidates.length;
    if (!candidates.length) return result;
    if (opts.dryRun) return { ...result, skipped: 'dry-run' };

    for (const c of candidates) {
        const outcome = await publishTotalPassClass(c.id);
        switch (outcome.action) {
            case 'created':
                result.created++;
                break;
            case 'exists':
                result.alreadyInTp++;
                break;
            case 'too-soon':
                result.skippedTooSoon++;
                break;
            case 'no-client':
                // Sin llaves no tiene sentido seguir intentando toda la ventana.
                result.skipped = 'no-client';
                return result;
            case 'error':
                result.failed++;
                if (isTotalPassRateLimit(outcome.detail)) {
                    result.skipped = 'rate-limited';
                    return result; // 429 aborta
                }
                break;
            default:
                // no-cap / no-class: dejó de calificar entre el SELECT y el publish; se ignora.
                break;
        }
        // Throttle entre llamadas para no gatillar el rate limit de TP.
        await new Promise((r) => setTimeout(r, 140));
    }

    if (result.created || result.failed) {
        console.log(`[TP publish-ind] ${fromDate}..${toDate}: creadas=${result.created} ya=${result.alreadyInTp} tarde=${result.skippedTooSoon} fallas=${result.failed}`);
    }
    return result;
}

// ── Retiro de una clase de TotalPass ─────────────────────────────────────────

/**
 * Borra la ocurrencia TP de una clase (p.ej. al cancelarla o apagar su canal).
 * Usa el external_occurrence_id persistido. NUNCA borra si la ocurrencia tiene
 * reservas vivas (slotsInUse > 0). Si la ocurrencia ya no está en TP, solo
 * limpia el mapping. Best-effort: devuelve {ok:false, detail} en vez de lanzar.
 */
export async function cancelClassOnTotalpass(classId: string): Promise<{ ok: boolean; detail?: string }> {
    const mapping = await queryOne<{ external_event_id: string | null; external_occurrence_id: string | null }>(
        `SELECT external_event_id, external_occurrence_id
           FROM partner_class_mappings WHERE class_id = $1 AND channel = 'totalpass'`,
        [classId],
    );
    const occurrenceUuid = mapping?.external_occurrence_id || null;
    if (!occurrenceUuid) return { ok: false, detail: 'missing-owned-occurrence' };

    const client = await totalPassOfficialFromDb();
    if (!client) return { ok: false, detail: 'no-client' };

    try {
        // No borrar si la ocurrencia tiene reservas vivas: buscamos la ocurrencia
        // en el snapshot por su uuid y revisamos slotsInUse.
        const events = await client.listEvents();
        let occ: TotalPassOfficialOccurrence | null = null;
        for (const ev of events || []) {
            for (const o of (ev.EventOccurrences || [])) {
                if (totalPassOccurrenceUuid(o) === occurrenceUuid) { occ = o; break; }
            }
            if (occ) break;
        }
        if (occ && Number(occ.slotsInUse ?? 0) > 0) {
            return { ok: false, detail: 'has-live-bookings' };
        }
        // Si sigue existiendo la borramos; si ya no está en TP, solo limpiamos el mapping.
        if (occ) await client.deleteOccurrence(occurrenceUuid);
        await query(
            `DELETE FROM partner_class_mappings WHERE class_id = $1 AND channel = 'totalpass'`,
            [classId],
        );
        return { ok: true };
    } catch (e) {
        const msg = (e as Error).message;
        console.error(`[TP cancel-class] ${classId}:`, msg);
        return { ok: false, detail: msg };
    }
}
