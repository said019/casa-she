/**
 * source — Fase 5 de TotalPass: importa las reservas de socios TotalPass (API
 * oficial) y las MATERIALIZA en Casa Shé (usuario invitado + membresía interna
 * 'Totalpass' + reserva de canal). Solo API oficial; nada de scraper.
 *
 * Adaptado de Hundred `totalpass-source.ts` (TP-only), pero usando la
 * materialización propia de Casa Shé:
 *   - `findOrCreateGuest` (usuario invitado por teléfono/email) en vez del
 *     `findOrCreatePartnerUser` de Hundred.
 *   - Membresía activa del plan INTERNO 'Totalpass' (is_internal) con sus
 *     créditos, en vez de la lógica de partners de Hundred.
 *   - Reserva directa en `bookings` (channel='totalpass') dentro de una
 *     transacción con `FOR UPDATE` sobre la clase, dejando que los triggers
 *     suban `classes.current_bookings` y `channel_inventory.booked_spots`.
 *
 * Reglas duras (heredadas del manejo de fechas de TotalPass):
 *   - Las fechas/horas de TP vienen como hora local marcada como UTC. NUNCA se
 *     convierten con `new Date()`/`Intl`: se rebanan con `.slice`.
 *   - Idempotencia por `(channel, external_ref)` — dedupe explícito + índice
 *     único parcial como red de seguridad.
 *   - Reconciliación de cancelaciones ULTRA-conservadora: solo cancela una
 *     reserva local cuando el feed cubrió esa clase con certeza y aun así el
 *     slot ya no aparece. Ante cualquier duda, NO cancela.
 *
 * El cron que llama a `syncTotalPassReservations` se cablea en la Task 17
 * (cron-jobs.ts); este módulo no se registra a sí mismo.
 */
import type { PoolClient } from 'pg';
import { pool, query, queryOne } from '../../config/database.js';
import { localDateStr, addDaysToDateStr } from '../mx-time.js';
import { findOrCreateGuest } from '../guestUser.js';
import { avisarReservaTotalPass } from './alerta-admin.js';
import {
    totalPassOfficialFromDb,
    isTotalPassRateLimit,
    type TotalPassOfficialSlot,
} from './client.js';

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface TotalPassImportRow {
    sourceRef: string;          // slot._id — llave de idempotencia
    classTitle: string;         // = class_types.name
    date: string;               // 'YYYY-MM-DD'
    startTime: string;          // 'HH:MM'
    displayName: string;
    email: string | null;
    phone: string | null;
    documentNumber: string | null; // CURP / documento TP
}

export interface TpReconcileDecision {
    toCancel: string[];  // ids de reservas locales confirmadas como canceladas en TP
    stillActive: number; // el slot sigue presente en el feed
    skipped: number;     // sin certeza (la clase no se leyó) → NUNCA se cancela
}

export interface TpImportSummary {
    fetched: number;        // filas confirmadas extraídas del feed
    imported: number;       // reservas nuevas materializadas
    alreadyExisted: number; // ya existían por (channel, external_ref)
    skippedNoClass: number; // no hay clase Casa Shé que empate título+fecha+hora
    overbooked: number;     // entraron por encima del cupo físico (TP ya las aceptó)
    failed: number;         // error por fila (ROLLBACK y se continúa)
}

// ── Funciones PURAS (testeables sin BD ni red) ───────────────────────────────

/**
 * Convierte los slots oficiales de TP a filas de import de Casa Shé. PURA.
 * Solo toma los `confirmed`; rebana fecha (`slotDate.slice(0,10)`) y hora
 * (`startTime.slice(0,5)`) sin convertir zona; usa `event.title.trim()`.
 */
/**
 * Estados de slot que significan "la reserva EXISTIÓ y sigue siendo válida", aunque
 * ya no sea reservable. Según los estados reales de TotalPass (ver TOTALPASS-OFICIAL
 * §4): `confirmed` (viva), `expired` (la clase pasó sin que la usara) y `created`
 * (recién hecha, pendiente de validar). Solo `canceled` y `denied` significan que la
 * reserva se cayó.
 *
 * Esto importa para NO cancelar de más: antes la reconciliación armaba su lista de
 * "slots presentes" únicamente con los `confirmed`, así que en cuanto TotalPass
 * marcaba una reserva como `expired` (al pasar la clase) la reserva local se
 * cancelaba sola. Se borraba el historial de asistencia de las socias de plataforma.
 */
export function esSlotVivo(status: unknown): boolean {
    const s = String(status || '').toLowerCase();
    return s !== 'canceled' && s !== 'cancelled' && s !== 'denied';
}

export function extractOfficialReservationRows(slots: TotalPassOfficialSlot[]): TotalPassImportRow[] {
    return (slots || [])
        .filter((slot) => String(slot.status || '').toLowerCase() === 'confirmed')
        .filter((slot) => Boolean(slot._id))
        .map((slot) => ({
            sourceRef: String(slot._id),
            classTitle: String(slot.event?.title || '').trim(),
            date: String(slot.slotDate || '').slice(0, 10),
            startTime: String(slot.startTime || '').slice(0, 5),
            displayName: String(slot.user?.name || '').trim() || 'Cliente TotalPass',
            email: slot.user?.email ? String(slot.user.email) : null,
            phone: slot.user?.phone ? String(slot.user.phone) : null,
            documentNumber: slot.user?.document_number ? String(slot.user.document_number) : null,
        }))
        .filter((row) => row.classTitle && row.date && row.startTime);
}

/** Llave canónica de una clase (título normalizado | fecha | HH:MM). PURA. */
export function tpClassKey(title: string, date: string, startTime: string): string {
    return `${String(title).trim()}|${String(date).slice(0, 10)}|${String(startTime).slice(0, 5)}`;
}

/**
 * Decide qué reservas locales de TotalPass cancelar, de forma CONSERVADORA. PURA.
 *
 * Solo marca `toCancel` una reserva cuyo `sourceRef` NO está en `presentSlotIds`
 * (ya no viene confirmada en el feed) Y cuya clase (`key`) SÍ fue leída con
 * certeza (`readClassKeys`, las clases que el feed devolvió). Si la clase no se
 * leyó, no hay certeza de que el slot desapareció de verdad → se cuenta como
 * `skipped` y JAMÁS se cancela.
 *
 * @param localTpBookings  reservas TP vivas en la BD, con su llave de clase
 * @param presentSlotIds   slot._id presentes (confirmados) en el feed de ahora
 * @param readClassKeys    llaves de clase que el feed cubrió (cualquier estado)
 */
export function decideTotalPassCancellations(
    localTpBookings: { id: string; sourceRef: string; key: string }[],
    presentSlotIds: Set<string>,
    readClassKeys: Set<string>,
): TpReconcileDecision {
    const decision: TpReconcileDecision = { toCancel: [], stillActive: 0, skipped: 0 };
    for (const booking of localTpBookings) {
        if (presentSlotIds.has(booking.sourceRef)) {
            decision.stillActive++;
            continue;
        }
        if (readClassKeys.has(booking.key)) {
            decision.toCancel.push(booking.id);
            continue;
        }
        // La clase no se leyó con certeza: no arriesgamos una cancelación.
        decision.skipped++;
    }
    return decision;
}

// ── Import (materialización en BD) ───────────────────────────────────────────

interface InternalPlan {
    id: string;
    reformer_credits: number | null;
    multi_credits: number | null;
    class_limit: number | null;
}

/** Suma vacía del import (para returns tempranos). */
function emptySummary(rows = 0): TpImportSummary {
    return { fetched: rows, imported: 0, alreadyExisted: 0, skippedNoClass: 0, overbooked: 0, failed: 0 };
}

/** Lee el plan INTERNO 'Totalpass' (ya sembrado por la migración de planes). */
async function readInternalTotalpassPlan(): Promise<InternalPlan | null> {
    return queryOne<InternalPlan>(
        `SELECT id, reformer_credits, multi_credits, class_limit
           FROM plans
          WHERE is_internal = true AND lower(name) = 'totalpass'
          LIMIT 1`,
    );
}

/**
 * Asegura una membresía ACTIVA del plan interno 'Totalpass' para el usuario.
 * Devuelve el id de la membresía (existente o recién creada). Corre dentro de la
 * transacción del caller (`client`).
 */
async function ensureInternalMembership(client: PoolClient, userId: string, plan: InternalPlan): Promise<string> {
    const existing = await client.query<{ id: string }>(
        `SELECT id FROM memberships
          WHERE user_id = $1 AND plan_id = $2 AND status = 'active'
          LIMIT 1`,
        [userId, plan.id],
    );
    if (existing.rows[0]) return existing.rows[0].id;

    const created = await client.query<{ id: string }>(
        `INSERT INTO memberships
             (user_id, plan_id, start_date, end_date, status,
              reformer_remaining, multi_remaining, classes_remaining, payment_method, activated_at)
         VALUES ($1, $2, CURRENT_DATE, CURRENT_DATE + INTERVAL '365 days', 'active',
                 $3, $4, $5, 'plataforma', NOW())
         RETURNING id`,
        [userId, plan.id, plan.reformer_credits, plan.multi_credits, plan.class_limit],
    );
    return created.rows[0].id;
}

/**
 * Materializa cada fila importada de TotalPass como una reserva de Casa Shé.
 * Por fila:
 *   1. Empata la clase por `class_types.name` + fecha + `HH:MM` (no cancelada).
 *      Sin clase → `skippedNoClass`.
 *   2. Dedupe por `(channel, external_ref)`. Ya existe → `alreadyExisted`.
 *   3. Transacción: `FOR UPDATE` sobre la clase, materializa socio invitado,
 *      asegura membresía interna e inserta la reserva (`ON CONFLICT DO NOTHING`
 *      sobre el índice único parcial). Si la clase ya estaba llena cuenta
 *      `overbooked` pero igual inserta (reflejamos lo que TP ya aceptó). Los
 *      triggers suben `current_bookings` y `channel_inventory.booked_spots`.
 * Un error por fila hace ROLLBACK, cuenta `failed` y continúa con la siguiente.
 */
export async function importTotalPassReservations(rows: TotalPassImportRow[]): Promise<TpImportSummary> {
    const summary = emptySummary(rows.length);
    if (!rows.length) return summary;

    const plan = await readInternalTotalpassPlan();
    if (!plan) {
        // Sin el plan interno no se puede materializar ninguna membresía.
        console.error('[tp-import] no existe el plan interno "Totalpass"; no se importa nada');
        summary.failed = rows.length;
        return summary;
    }

    for (const row of rows) {
        try {
            // (1) Empatar la clase Casa Shé por título + fecha + hora.
            const cls = await queryOne<{
                id: string;
                max_capacity: number;
                current_bookings: number;
                instructor_name: string | null;
            }>(
                // El nombre del coach solo se usa para el aviso al estudio (LEFT JOIN:
                // si faltara el instructor, el import no se cae).
                `SELECT c.id, c.max_capacity, c.current_bookings, i.display_name AS instructor_name
                   FROM classes c
                   JOIN class_types ct ON ct.id = c.class_type_id
                   LEFT JOIN instructors i ON i.id = c.instructor_id
                  WHERE ct.name = $1
                    AND c.date = $2::date
                    AND c.start_time::text LIKE $3
                    AND c.status <> 'cancelled'
                  ORDER BY c.created_at ASC
                  LIMIT 1`,
                [row.classTitle, row.date, `${row.startTime}%`],
            );
            if (!cls) {
                summary.skippedNoClass++;
                console.warn(`[tp-import] sin clase para ${row.classTitle} ${row.date} ${row.startTime}`);
                continue;
            }

            // (2) Dedupe por (channel, external_ref) antes de abrir la transacción.
            const dup = await queryOne<{ x: number }>(
                `SELECT 1 AS x FROM bookings WHERE channel = 'totalpass' AND external_ref = $1 LIMIT 1`,
                [row.sourceRef],
            );
            if (dup) {
                summary.alreadyExisted++;
                continue;
            }

            // (3) Transacción con FOR UPDATE para no sobrevender.
            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                const locked = await client.query<{ max_capacity: number; current_bookings: number; status: string }>(
                    `SELECT max_capacity, current_bookings, status FROM classes WHERE id = $1 FOR UPDATE`,
                    [cls.id],
                );
                const capRow = locked.rows[0];
                if (!capRow) {
                    // La clase desapareció entre el match y el lock (raro): se salta.
                    await client.query('ROLLBACK');
                    summary.skippedNoClass++;
                    continue;
                }
                if (capRow.status === 'cancelled') {
                    // TOCTOU: la clase se canceló entre el match y el lock. No se
                    // inserta una reserva sobre una clase ya cancelada.
                    await client.query('ROLLBACK');
                    summary.skippedNoClass++;
                    continue;
                }

                // Socio invitado. Sin teléfono ni email, un email sintético
                // estable (documento o slot) evita colisionar todos los
                // invitados sin datos en el mismo registro.
                const phone = row.phone || '';
                const email = row.email
                    ? row.email
                    : (phone ? undefined : `tp-${row.documentNumber || row.sourceRef}@totalpass.local`);
                const { userId } = await findOrCreateGuest(client, {
                    name: row.displayName,
                    phone,
                    email,
                });

                const membershipId = await ensureInternalMembership(client, userId, plan);

                // Identidad TP en partner_metadata: la Fase 6 (check-in) la usará
                // para matchear al socio que se presenta físicamente.
                const partnerMetadata = JSON.stringify({
                    tp_document: row.documentNumber || null,
                    tp_email: row.email || null,
                    tp_name: row.displayName || null,
                });
                const inserted = await client.query<{ id: string }>(
                    `INSERT INTO bookings
                         (class_id, user_id, membership_id, status, channel, external_ref, booked_by, partner_metadata)
                     VALUES ($1, $2, $3, 'confirmed', 'totalpass', $4, NULL, $5::jsonb)
                     ON CONFLICT (channel, external_ref) WHERE external_ref IS NOT NULL DO NOTHING
                     RETURNING id`,
                    [cls.id, userId, membershipId, row.sourceRef, partnerMetadata],
                );

                await client.query('COMMIT');

                if (inserted.rowCount === 0) {
                    // Carrera: otro proceso insertó el mismo slot entre el dedupe y aquí.
                    summary.alreadyExisted++;
                } else {
                    summary.imported++;
                    const sobrecupo = Number(capRow.current_bookings) >= Number(capRow.max_capacity);
                    if (sobrecupo) {
                        summary.overbooked++;
                    }
                    // Aviso al estudio. Va DESPUÉS del COMMIT y sin await: la reserva ya
                    // está guardada y un fallo de WhatsApp/correo no debe afectar el import.
                    void avisarReservaTotalPass({
                        socia: row.displayName,
                        clase: row.classTitle,
                        fecha: row.date,
                        hora: row.startTime,
                        coach: cls.instructor_name ?? null,
                        sobrecupo,
                    });
                }
            } catch (txErr) {
                await client.query('ROLLBACK').catch(() => { /* noop */ });
                throw txErr;
            } finally {
                client.release();
            }
        } catch (err) {
            summary.failed++;
            console.error(`[tp-import] fila ${row.sourceRef}:`, (err as Error).message);
        }
    }

    return summary;
}

// ── Sync (feed oficial + import + reconciliación de cancelaciones) ────────────

export type TpSyncResult = TpImportSummary & { skipped?: string; cancelled?: number };

/**
 * Ejecuta un ciclo completo de sincronización de reservas TP:
 *   1. Cliente oficial desde la BD (sin llaves → `skipped:'no-client'`).
 *   2. Feed `listSlots` en la ventana `[hoy-1, hoy+14]` (fecha local del gym).
 *   3. Import/materialización de las filas confirmadas.
 *   4. Reconciliación ULTRA-conservadora de cancelaciones: cancela localmente
 *      las reservas TP vivas cuyo slot ya no viene y cuya clase el feed sí
 *      cubrió. El trigger de la BD baja los conteos al pasar a 'cancelled'.
 * Un 429 (rate-limit) en cualquier punto aborta con `skipped:'rate-limited'`.
 */
export async function syncTotalPassReservations(): Promise<TpSyncResult> {
    const client = await totalPassOfficialFromDb();
    if (!client) return { ...emptySummary(), skipped: 'no-client' };

    const today = localDateStr();
    const fromDate = addDaysToDateStr(today, -1);
    const toDate = addDaysToDateStr(today, 14);

    // Feed oficial de la ventana.
    let slots: TotalPassOfficialSlot[];
    try {
        slots = await client.listSlots({ slotDateFrom: fromDate, slotDateTo: toDate });
    } catch (err) {
        if (isTotalPassRateLimit(err)) return { ...emptySummary(), skipped: 'rate-limited' };
        throw err;
    }

    const rows = extractOfficialReservationRows(slots);
    const summary = await importTotalPassReservations(rows);

    // ── Reconciliación de cancelaciones ──────────────────────────────────────
    // presentSlotIds: slots que TotalPass sigue reconociendo como reserva válida.
    // Ojo: NO son solo los `confirmed`. Un slot `expired` (la clase pasó y la socia
    // no la usó) sigue siendo una reserva que existió, y cancelarlo borraría el
    // historial. Solo `canceled`/`denied` cuentan como caídas.
    const presentSlotIds = new Set(
        (slots || [])
            .filter((s) => esSlotVivo(s.status))
            .map((s) => String(s._id))
            .filter(Boolean),
    );
    // readClassKeys: clases que el feed CUBRIÓ con certeza (cualquier estado de
    // slot). Si el feed devolvió algún slot de una clase, sabemos que la leyó;
    // así un slot que pasó a 'cancelled' en TP (no viene en presentSlotIds pero
    // su clase sí se leyó) puede cancelarse con seguridad.
    const readClassKeys = new Set<string>();
    for (const slot of slots || []) {
        const title = String(slot.event?.title || '').trim();
        const date = String(slot.slotDate || '').slice(0, 10);
        const hhmm = String(slot.startTime || '').slice(0, 5);
        if (title && date && hhmm) readClassKeys.add(tpClassKey(title, date, hhmm));
    }

    // Reservas TP vivas en la BD dentro de la ventana del feed.
    const localTp = await query<{ id: string; source_ref: string; title: string; date: string; hhmm: string }>(
        `SELECT b.id, b.external_ref AS source_ref, ct.name AS title,
                c.date::text AS date, substr(c.start_time::text, 1, 5) AS hhmm
           FROM bookings b
           JOIN classes c ON c.id = b.class_id
           JOIN class_types ct ON ct.id = c.class_type_id
          WHERE b.channel = 'totalpass'
            AND b.status <> 'cancelled'
            AND b.external_ref IS NOT NULL
            AND c.date BETWEEN $1::date AND $2::date`,
        [fromDate, toDate],
    );
    const localBookings = localTp.map((b) => ({
        id: b.id,
        sourceRef: String(b.source_ref),
        key: tpClassKey(b.title, b.date, b.hhmm),
    }));

    const decision = decideTotalPassCancellations(localBookings, presentSlotIds, readClassKeys);
    for (const id of decision.toCancel) {
        // UPDATE directo: el trigger baja current_bookings y booked_spots al salir de 'confirmed'.
        await query(
            `UPDATE bookings
                SET status = 'cancelled', cancelled_at = NOW(),
                    cancellation_reason = 'cancelada en TotalPass'
              WHERE id = $1 AND status <> 'cancelled'`,
            [id],
        );
    }

    return { ...summary, cancelled: decision.toCancel.length };
}
