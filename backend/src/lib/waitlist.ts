/**
 * Lista de espera de clases: política, posiciones y promoción.
 * La fila vive en bookings (status='waitlist' + waitlist_position).
 * El crédito se cobra SOLO al promover, nunca al entrar.
 */
import { query, queryOne, pool } from '../config/database.js';
import { selectMembershipForBooking, toDbClient, ClassCategory } from './membershipSelection.js';
import { writeInAppNotification } from './in-app-notifications.js';
import { sendWhatsAppMessage } from './whatsapp.js';
import { notifyAllUserDevices } from './apple-wallet.js';
import { upsertGoogleLoyaltyObject } from './google-wallet.js';

export interface WaitlistPolicy {
    allow: boolean;
    autoPromote: boolean;
    cutoffHours: number;
    maxSize: number;
}

export async function getWaitlistPolicy(): Promise<WaitlistPolicy> {
    const row = await queryOne<{ value: any }>(`SELECT value FROM system_settings WHERE key = 'booking_policies'`);
    const v = row?.value ?? {};
    return {
        allow: v.allow_waitlist !== false,
        autoPromote: v.auto_promote_waitlist !== false,
        cutoffHours: Number(v.waitlist_cutoff_hours ?? 2),
        maxSize: Number(v.waitlist_max_size ?? 5),
    };
}

/** Horas que faltan para una clase (zona México, igual que cancel_booking). */
export async function hoursUntilClass(classId: string): Promise<number | null> {
    const row = await queryOne<{ hours: string }>(
        `SELECT EXTRACT(EPOCH FROM (((date::text || ' ' || start_time::text)::timestamp
                AT TIME ZONE 'America/Mexico_City') - NOW())) / 3600.0 AS hours
         FROM classes WHERE id = $1`, [classId]);
    return row ? Number(row.hours) : null;
}

export async function waitlistSize(classId: string): Promise<number> {
    const row = await queryOne<{ n: string }>(
        `SELECT COUNT(*) AS n FROM bookings WHERE class_id = $1 AND status = 'waitlist'`, [classId]);
    return Number(row?.n ?? 0);
}

/** Renumera posiciones 1..n (por posición actual, luego antigüedad). */
export async function compactWaitlist(classId: string): Promise<void> {
    await query(
        `UPDATE bookings b SET waitlist_position = ranked.pos, updated_at = NOW()
         FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY waitlist_position ASC NULLS LAST, created_at ASC) AS pos
                 FROM bookings WHERE class_id = $1 AND status = 'waitlist') ranked
         WHERE b.id = ranked.id AND b.waitlist_position IS DISTINCT FROM ranked.pos`,
        [classId]);
}

export type JoinResult =
    | { ok: true; booking: any }
    | { ok: false; status: number; error: string; code?: string };

/**
 * Mete al usuario a la fila de una clase llena. Valida política, corte,
 * tamaño de fila, duplicados y crédito de la categoría (sin cobrarlo).
 * Transacción con lock de la clase para evitar carreras.
 */
export async function joinWaitlist(params: { userId: string; classId: string }): Promise<JoinResult> {
    const { userId, classId } = params;
    const policy = await getWaitlistPolicy();
    if (!policy.allow) return { ok: false, status: 400, error: 'La lista de espera está desactivada' };

    const hours = await hoursUntilClass(classId);
    if (hours === null) return { ok: false, status: 404, error: 'Clase no encontrada' };
    if (hours < policy.cutoffHours) {
        return { ok: false, status: 400, error: `La lista de espera cierra ${policy.cutoffHours}h antes de la clase` };
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const clsRes = await client.query(
            `SELECT c.*, ct.category AS class_category FROM classes c
             JOIN class_types ct ON ct.id = c.class_type_id
             WHERE c.id = $1 FOR UPDATE OF c`, [classId]);
        const cls = clsRes.rows[0];
        if (!cls || cls.status !== 'scheduled') {
            await client.query('ROLLBACK');
            return { ok: false, status: 400, error: 'Esta clase no esta disponible' };
        }
        if (cls.booking_closed) {
            await client.query('ROLLBACK');
            return { ok: false, status: 400, error: 'Esta clase está cerrada para nuevas reservas' };
        }
        if (cls.current_bookings < cls.max_capacity) {
            // Se liberó un lugar entre el intento y este lock: que reserve normal.
            await client.query('ROLLBACK');
            return { ok: false, status: 409, error: 'Se liberó un lugar — reserva normal', code: 'SPOT_AVAILABLE' };
        }
        // Incluye no_show: el índice único unique_booking_active cubre todo status <> 'cancelled',
        // así que sin este check el INSERT tronaría con 500 en vez de un 400 explicable.
        const dupRes = await client.query(
            `SELECT 1 FROM bookings WHERE class_id = $1 AND user_id = $2 AND status <> 'cancelled'`,
            [classId, userId]);
        if (dupRes.rows.length) {
            await client.query('ROLLBACK');
            return { ok: false, status: 400, error: 'Ya tienes una reserva o lugar en la lista para esta clase' };
        }
        const sizeRes = await client.query(
            `SELECT COUNT(*) AS n FROM bookings WHERE class_id = $1 AND status = 'waitlist'`, [classId]);
        if (Number(sizeRes.rows[0].n) >= policy.maxSize) {
            await client.query('ROLLBACK');
            return { ok: false, status: 400, error: 'La lista de espera está llena' };
        }
        // Crédito de la categoría: debe existir, NO se cobra. La vigencia se evalúa
        // contra la fecha de la clase (igual que la reserva normal).
        const joinClassDate = cls.date instanceof Date
            ? cls.date.toISOString().split('T')[0]
            : String(cls.date).split('T')[0];
        const picked = await selectMembershipForBooking({
            db: toDbClient(client),
            userId,
            category: cls.class_category as ClassCategory,
            classFacilityId: cls.facility_id ?? null,
            requiredCredits: 1,
            classDate: joinClassDate,
        });
        if (!picked) {
            await client.query('ROLLBACK');
            return { ok: false, status: 400, error: 'Necesitas una membresía con créditos de esta categoría para anotarte' };
        }
        const ins = await client.query(
            `INSERT INTO bookings (class_id, user_id, membership_id, status, waitlist_position, booked_by)
             VALUES ($1, $2, $3, 'waitlist',
                     (SELECT COALESCE(MAX(waitlist_position), 0) + 1 FROM bookings WHERE class_id = $1 AND status = 'waitlist'),
                     $2)
             RETURNING *`,
            [classId, userId, picked.id]);
        await client.query('COMMIT');
        return { ok: true, booking: ins.rows[0] };
    } catch (e) {
        await client.query('ROLLBACK').catch(() => { /* ya */ });
        throw e;
    } finally {
        client.release();
    }
}

export interface PromotionResult {
    promoted: { bookingId: string; userId: string; displayName: string | null } | null;
    skipped: number;
}

/**
 * Promueve a la primera elegible de la fila de una clase (o a una específica, manual).
 * - Automática: respeta allow + auto_promote + corte de horas.
 * - Manual (specificBookingId): ignora el corte, exige cupo.
 * - Cobra 1 crédito de la categoría al promover; si la membresía guardada ya no
 *   tiene, re-resuelve otra activa; sin crédito → se salta a la siguiente.
 */
export async function promoteNextFromWaitlist(params: {
    classId: string;
    specificBookingId?: string;
}): Promise<PromotionResult> {
    const { classId, specificBookingId } = params;
    const policy = await getWaitlistPolicy();
    const manual = Boolean(specificBookingId);
    if (!manual) {
        if (!policy.allow || !policy.autoPromote) return { promoted: null, skipped: 0 };
        const hours = await hoursUntilClass(classId);
        if (hours === null || hours < policy.cutoffHours) return { promoted: null, skipped: 0 };
    }

    const client = await pool.connect();
    let skipped = 0;
    try {
        await client.query('BEGIN');
        const clsRes = await client.query(
            `SELECT c.*, ct.category AS class_category, ct.name AS class_type_name
             FROM classes c JOIN class_types ct ON ct.id = c.class_type_id
             WHERE c.id = $1 FOR UPDATE OF c`, [classId]);
        const cls = clsRes.rows[0];
        if (!cls || cls.status !== 'scheduled' || cls.booking_closed || cls.current_bookings >= cls.max_capacity) {
            await client.query('ROLLBACK');
            return { promoted: null, skipped: 0 };
        }
        const queueRes = await client.query(
            specificBookingId
                ? `SELECT id, user_id, membership_id FROM bookings WHERE id = $2 AND class_id = $1 AND status = 'waitlist' FOR UPDATE`
                : `SELECT id, user_id, membership_id FROM bookings WHERE class_id = $1 AND status = 'waitlist'
                   ORDER BY waitlist_position ASC, created_at ASC FOR UPDATE`,
            specificBookingId ? [classId, specificBookingId] : [classId]);

        const cat: 'reformer' | 'multi' = cls.class_category;
        const col = cat === 'reformer' ? 'reformer_remaining' : 'multi_remaining';
        // Fecha de la clase para evaluar vigencia de membresía contra el día de la clase.
        const promoteClassDate = cls.date instanceof Date
            ? cls.date.toISOString().split('T')[0]
            : String(cls.date).split('T')[0];

        for (const cand of queueRes.rows) {
            // Re-resolver la mejor membresía con el MISMO motor que usa la reserva normal
            // (respeta atadura a sucursal y orden de preferencia). La guardada al entrar
            // a la fila puede haberse agotado/expirado.
            const picked = await selectMembershipForBooking({
                db: toDbClient(client),
                userId: cand.user_id,
                category: cat as ClassCategory,
                classFacilityId: cls.facility_id ?? null,
                requiredCredits: 1,
                classDate: promoteClassDate,
            });
            if (!picked) { skipped++; continue; } // sin crédito elegible: se salta, conserva posición
            const membershipId = picked.id as string;
            // Descuento auto-guardado; bucket NULL = ilimitado (no descuenta, no marca consumo).
            const dec = await client.query(
                `UPDATE memberships SET ${col} = CASE WHEN ${col} IS NULL THEN NULL ELSE ${col} - 1 END,
                        updated_at = NOW()
                 WHERE id = $1 AND (${col} IS NULL OR ${col} > 0)
                 RETURNING ${col} AS bal_after`, [membershipId]);
            if (!dec.rows.length) { skipped++; continue; }
            const consumed: 'reformer' | 'multi' | null = dec.rows[0].bal_after === null ? null : cat;

            await client.query(
                `UPDATE bookings SET status = 'confirmed', waitlist_position = NULL,
                        membership_id = $2, consumed_category = $3, updated_at = NOW()
                 WHERE id = $1`, [cand.id, membershipId, consumed]);
            await client.query('COMMIT');

            // Post-commit (no crítico): compactar + notificar. Cualquier fallo aquí NO debe
            // reportarse como promoción fallida — la promoción ya está comiteada.
            let displayName: string | null = null;
            try {
                await compactWaitlist(classId).catch(e => console.error('[WAITLIST] compact:', e));
                const user = await queryOne<{ display_name: string; phone: string }>(
                    `SELECT display_name, phone FROM users WHERE id = $1`, [cand.user_id]);
                displayName = user?.display_name ?? null;
                const fecha = cls.date instanceof Date ? cls.date.toISOString().slice(0, 10) : String(cls.date).slice(0, 10);
                const horario = String(cls.start_time).slice(0, 5);
                await writeInAppNotification({
                    userId: cand.user_id,
                    title: '🎉 ¡Lugar confirmado!',
                    body: `Se liberó un lugar en ${cls.class_type_name} (${fecha} ${horario}) y tu reserva quedó confirmada.`,
                    type: 'waitlist_promoted',
                    data: { class_id: classId, booking_id: cand.id },
                });
                // WhatsApp de promoción de lista de espera DESACTIVADO (política 2026-06-23:
                // solo 3 mensajes por WhatsApp). La notificación in-app y push se mantienen.
                notifyAllUserDevices(cand.user_id, '🎉 ¡Lugar confirmado!', 'Tu reserva en lista de espera fue confirmada.')
                    .catch(e => console.error('Waitlist Apple notify error:', e));
                upsertGoogleLoyaltyObject(membershipId)
                    .catch(e => console.error('Waitlist Google notify error:', e));
            } catch (notifyErr) {
                console.error('[WAITLIST] post-commit notify error (promoción ya aplicada):', notifyErr);
            }
            console.log(`[WAITLIST] Promovido: ${displayName} para clase ${classId}`);
            return { promoted: { bookingId: cand.id, userId: cand.user_id, displayName }, skipped };
        }
        await client.query('ROLLBACK');
        return { promoted: null, skipped };
    } catch (e) {
        await client.query('ROLLBACK').catch(() => { /* ya */ });
        console.error('[WAITLIST] Error promoting:', e);
        return { promoted: null, skipped };
    } finally {
        client.release();
    }
}

/** Para el 400 enriquecido: ¿se puede ofrecer la lista en esta clase? */
export async function waitlistOffer(classId: string): Promise<{ waitlistAvailable: boolean; waitlistSize: number }> {
    const policy = await getWaitlistPolicy();
    const size = await waitlistSize(classId);
    if (!policy.allow) return { waitlistAvailable: false, waitlistSize: size };
    const hours = await hoursUntilClass(classId);
    const open = hours !== null && hours >= policy.cutoffHours && size < policy.maxSize;
    return { waitlistAvailable: open, waitlistSize: size };
}
