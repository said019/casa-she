import { query, queryOne } from '../config/database.js';
import { sendWebPushToUser } from './web-push.js';

/**
 * Cancel a class and all its active bookings, refunding membership credits.
 * Reusable across: manual cancel, event overlap cancel, closed-day cancel.
 */
export async function cancelClassWithRefunds(
    classId: string,
    cancelledBy: string,
    reason: string
): Promise<{ class: any; cancelledBookings: number; refundedCredits: number }> {
    // Cancel the class
    const result = await queryOne(
        `UPDATE classes
         SET status = 'cancelled',
             cancelled_at = NOW(),
             cancelled_by = $1,
             cancellation_reason = $2
         WHERE id = $3 RETURNING *`,
        [cancelledBy, reason, classId]
    );

    if (!result) {
        return { class: null, cancelledBookings: 0, refundedCredits: 0 };
    }

    // Get all active bookings for this class
    const bookingsToCancel = await query(
        `SELECT b.*, m.id as membership_id
         FROM bookings b
         LEFT JOIN memberships m ON b.membership_id = m.id
         WHERE b.class_id = $1 AND b.status IN ('confirmed', 'waitlist')`,
        [classId]
    );

    let cancelledBookings = 0;
    let refundedCredits = 0;

    for (const booking of bookingsToCancel) {
        await query(
            `UPDATE bookings
             SET status = 'cancelled',
                 cancelled_at = NOW(),
                 cancellation_reason = $1
             WHERE id = $2`,
            [reason, booking.id]
        );
        cancelledBookings++;

        // Cascada barra: cancela bebidas pre-ordenadas de esta reserva.
        await query(
          `UPDATE bar_orders SET status='cancelled', cancelled_by='system_class_cancelled', cancelled_at=NOW(), updated_at=NOW()
           WHERE booking_id = $1 AND status = 'pending'`,
          [booking.id]).catch((e: any) => console.error('bar cascade (cancel class):', e?.message));

        // Aviso push al usuario afectado (fire-and-forget; nunca rompe el flujo)
        if (booking.user_id) {
            void sendWebPushToUser(booking.user_id, { title: 'Clase cancelada', body: 'El estudio canceló una de tus clases. Revisa tus reservas.', url: '/app/classes', tag: 'class_cancelled' });
        }

        // Refund credit to the bucket the booking consumed
        if (booking.status === 'confirmed' && booking.membership_id && booking.consumed_category) {
            const col = booking.consumed_category === 'reformer' ? 'reformer_remaining' : 'multi_remaining';
            await query(
                `UPDATE memberships SET ${col} = ${col} + 1 WHERE id = $1 AND ${col} IS NOT NULL`,
                [booking.membership_id]
            );
            refundedCredits++;
        }

        // Reactiva el beneficio de lealtad (clase gratis pagada con puntos) si esta reserva
        // lo consumió. Sin esto, cancelar la CLASE completa (admin, solape de evento, día
        // inhábil) hacía perder el beneficio para siempre — no había camino de vuelta a
        // 'active'. No reactiva si ya venció (se perdió por vigencia, no por esta cancelación).
        if (booking.is_free_booking) {
            await query(
                `UPDATE user_benefits
                    SET status = 'active', used_at = NULL, used_by = NULL, used_on_booking_id = NULL
                  WHERE used_on_booking_id = $1 AND status = 'used' AND expires_at > NOW()`,
                [booking.id]
            ).catch((e: any) => console.error('reactivar free_class benefit (cancel class):', e?.message));
        }
    }

    return { class: result, cancelledBookings, refundedCredits };
}
