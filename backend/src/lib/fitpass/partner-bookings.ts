/**
 * Reservas de canal FitPass (bookings.channel='fitpass') — operaciones de BD sobre un cliente
 * de transacción. Port de upsertPartnerBooking/cancelPartnerBooking/createPartnerCheckin de Hundred
 * adaptado al esquema de Casa Shé (sin reformers; usuarios fantasma + membresía del plan interno
 * 'Fitpass', igual que TotalPass).
 *
 * Reglas:
 *  - Idempotencia por (channel, external_ref).
 *  - El import NUNCA rechaza por cupo: la reserva ya ocurrió en FitPass; se marca partner_metadata.overbooked.
 *  - Una reserva cancelada por el estudio (marca fitpass_studio_cancellation) no se reactiva con la misma ref.
 */
import type { PoolClient } from 'pg';

export type Db = Pick<PoolClient, 'query'>;

export const FITPASS_STUDIO_CANCELLATION_KEY = 'fitpass_studio_cancellation';

export function fitpassStudioCancellationMetadata(p: {
    externalRef: string | null; reason: string; actorUserId?: string | null; cancelledAt?: string;
}): Record<string, unknown> {
    return {
        [FITPASS_STUDIO_CANCELLATION_KEY]: {
            external_ref: p.externalRef,
            reason: p.reason,
            actor_user_id: p.actorUserId ?? null,
            cancelled_at: p.cancelledAt ?? new Date().toISOString(),
        },
    };
}

/** ¿La marca de cancelación por el estudio impide reactivar la reserva con esta ref? */
export function blocksFitpassReactivation(metadata: unknown, externalRef: string | null | undefined): boolean {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
    const marker = (metadata as Record<string, unknown>)[FITPASS_STUDIO_CANCELLATION_KEY];
    if (!marker || typeof marker !== 'object' || Array.isArray(marker)) return false;
    const blocked = String((marker as Record<string, unknown>).external_ref ?? '').trim();
    const incoming = String(externalRef ?? '').trim();
    return blocked === '' || incoming === '' || blocked === incoming;
}

export interface FitpassBookingRow {
    id: string;
    class_id: string;
    user_id: string;
    status: string;
    external_ref: string | null;
    partner_metadata: Record<string, any>;
}

export class FitpassBookingError extends Error {
    constructor(public code: 'CLASS_NOT_FOUND' | 'CLASS_FULL' | 'FITPASS_QUOTA_EXHAUSTED', message: string) {
        super(message);
        this.name = 'FitpassBookingError';
    }
}

const COLS = 'id, class_id, user_id, status, external_ref, partner_metadata';

export async function findFitpassBookingByRef(db: Db, ref: string): Promise<FitpassBookingRow | null> {
    const r = await db.query(`SELECT ${COLS} FROM bookings WHERE channel='fitpass' AND external_ref=$1 LIMIT 1`, [ref]);
    return r.rows[0] ?? null;
}

export async function findActiveFitpassBookingForPair(db: Db, classId: string, userId: string): Promise<FitpassBookingRow | null> {
    const r = await db.query(
        `SELECT ${COLS} FROM bookings WHERE channel='fitpass' AND class_id=$1 AND user_id=$2 AND status<>'cancelled' LIMIT 1`,
        [classId, userId],
    );
    return r.rows[0] ?? null;
}

export interface UpsertFitpassBookingInput {
    classId: string;
    userId: string;
    membershipId: string | null;
    externalRef: string | null;
    partnerMetadata: Record<string, unknown>;
    /** true = registro prospectivo de recepción: respeta tope físico y de canal. */
    enforceCapacity?: boolean;
    bookedBy?: string | null;
}

export interface UpsertFitpassBookingResult {
    booking: FitpassBookingRow;
    created: boolean;
    /** reserva cancelada por el estudio que el import no reactiva */
    blocked?: boolean;
}

/** Inserta o actualiza la reserva FitPass. Bloquea la fila de la clase (FOR UPDATE). */
export async function upsertFitpassBooking(db: Db, input: UpsertFitpassBookingInput): Promise<UpsertFitpassBookingResult> {
    const cls = await db.query(
        `SELECT c.status, c.max_capacity, c.current_bookings,
                ci.max_spots AS fp_cap, COALESCE(ci.booked_spots,0) AS fp_booked
           FROM classes c LEFT JOIN channel_inventory ci ON ci.class_id=c.id AND ci.channel='fitpass'
          WHERE c.id=$1 FOR UPDATE OF c`,
        [input.classId],
    );
    const k = cls.rows[0];
    if (!k || k.status === 'cancelled') throw new FitpassBookingError('CLASS_NOT_FOUND', k ? 'Clase cancelada' : 'Clase no encontrada');

    let existing = input.externalRef ? await findFitpassBookingByRef(db, input.externalRef) : null;
    if (!existing) existing = await findActiveFitpassBookingForPair(db, input.classId, input.userId);

    if (existing) {
        if (existing.status === 'cancelled') {
            if (blocksFitpassReactivation(existing.partner_metadata, input.externalRef)) {
                return { booking: existing, created: false, blocked: true };
            }
            // Reactivación: la reserva volvió a estar viva en FitPass.
            const r = await db.query(
                `UPDATE bookings SET status='confirmed', cancelled_at=NULL, cancellation_reason=NULL,
                        external_ref=COALESCE($2, external_ref),
                        partner_metadata = partner_metadata - $4 || $3::jsonb, updated_at=NOW()
                  WHERE id=$1 RETURNING ${COLS}`,
                [existing.id, input.externalRef, JSON.stringify(input.partnerMetadata), FITPASS_STUDIO_CANCELLATION_KEY],
            );
            return { booking: r.rows[0], created: false };
        }
        // Existente vivo: enlaza/re-apunta la ref (el socio canceló y volvió a reservar) y mezcla metadata.
        const r = await db.query(
            `UPDATE bookings SET external_ref=COALESCE($2, external_ref),
                    partner_metadata = partner_metadata || $3::jsonb, updated_at=NOW()
              WHERE id=$1 RETURNING ${COLS}`,
            [existing.id, input.externalRef, JSON.stringify(input.partnerMetadata)],
        );
        return { booking: r.rows[0], created: false };
    }

    const metadata: Record<string, unknown> = { ...input.partnerMetadata };
    if (input.enforceCapacity) {
        if (Number(k.current_bookings) >= Number(k.max_capacity)) throw new FitpassBookingError('CLASS_FULL', 'La clase está llena');
        if (Number(k.fp_booked) >= Number(k.fp_cap ?? 0)) {
            throw new FitpassBookingError('FITPASS_QUOTA_EXHAUSTED', `FitPass ya tiene ${k.fp_booked}/${k.fp_cap ?? 0} asistentes en esta clase`);
        }
    } else if (Number(k.current_bookings) >= Number(k.max_capacity)) {
        metadata.overbooked = true;
    }
    const ins = await db.query(
        `INSERT INTO bookings (class_id, user_id, membership_id, status, channel, external_ref, booked_by, partner_metadata)
         VALUES ($1,$2,$3,'confirmed','fitpass',$4,$5,$6::jsonb)
         RETURNING ${COLS}`,
        [input.classId, input.userId, input.membershipId, input.externalRef, input.bookedBy ?? null, JSON.stringify(metadata)],
    );
    return { booking: ins.rows[0], created: true };
}

export async function cancelFitpassBooking(
    db: Db, bookingId: string, reason: string, metadataPatch?: Record<string, unknown>,
): Promise<void> {
    await db.query(
        `UPDATE bookings SET status='cancelled', cancelled_at=NOW(), cancellation_reason=$2,
                partner_metadata = partner_metadata || $3::jsonb, updated_at=NOW()
          WHERE id=$1 AND status<>'cancelled'`,
        [bookingId, reason, JSON.stringify(metadataPatch ?? {})],
    );
    await db.query(`UPDATE checkins SET status='cancelled', updated_at=NOW() WHERE booking_id=$1 AND status<>'cancelled'`, [bookingId]);
}

/** Check-in automatizado/recepción confirmado (idempotente por platform_event_id) y booking → checked_in. */
export async function confirmFitpassCheckin(db: Db, p: {
    bookingId: string; userId: string; classId: string; externalRef: string | null;
    validationMethod: 'automated' | 'manual_reception'; payload?: Record<string, unknown>; markFpAttended?: boolean;
}): Promise<{ checkinId: string | null }> {
    const eventId = p.externalRef && p.validationMethod === 'automated' ? `fitpass:checkin:${p.externalRef}` : null;
    const ins = await db.query(
        `INSERT INTO checkins (booking_id, user_id, class_id, channel, external_ref, platform_event_id, status, validation_method, validated_at, payload)
         VALUES ($1,$2,$3,'fitpass',$4,$5,'confirmed',$6,NOW(),$7::jsonb)
         ON CONFLICT (platform_event_id) WHERE platform_event_id IS NOT NULL DO NOTHING
         RETURNING id`,
        [p.bookingId, p.userId, p.classId, p.externalRef, eventId, p.validationMethod, JSON.stringify(p.payload ?? {})],
    );
    await db.query(
        `UPDATE bookings SET status='checked_in', checked_in_at=COALESCE(checked_in_at, NOW()),
                checked_in_method=$2,
                partner_metadata = CASE WHEN $3::boolean
                    THEN partner_metadata || jsonb_build_object('fp_attended_at', now()::text, 'fp_attendance_state', 'attended')
                    ELSE partner_metadata END,
                updated_at=NOW()
          WHERE id=$1 AND status<>'cancelled'`,
        [p.bookingId, p.validationMethod === 'automated' ? 'auto' : 'manual', !!p.markFpAttended],
    );
    return { checkinId: ins.rows[0]?.id ?? null };
}
