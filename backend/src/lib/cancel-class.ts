import { query, queryOne } from '../config/database.js';
import { writeInAppNotification } from './in-app-notifications.js';
import { sendClassCancelledEmail } from '../services/email.js';

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

    // Nombre del tipo de clase + fecha/hora, para el mensaje a las afectadas.
    const classType = await queryOne<{ name: string }>(
        `SELECT name FROM class_types WHERE id = $1`,
        [(result as any).class_type_id]
    );
    const className = classType?.name || 'tu clase';
    const classDateStr = (result as any).date instanceof Date
        ? (result as any).date.toISOString().slice(0, 10)
        : String((result as any).date).slice(0, 10);
    const startTime = String((result as any).start_time || '').slice(0, 5);
    const endTime = String((result as any).end_time || '').slice(0, 5);

    // Get all active bookings for this class (con datos del cliente para notificar)
    const bookingsToCancel = await query(
        `SELECT b.*, m.id as membership_id, u.email as user_email, u.display_name as user_name
         FROM bookings b
         LEFT JOIN memberships m ON b.membership_id = m.id
         LEFT JOIN users u ON b.user_id = u.id
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

        // Refund credit to the bucket the booking consumed
        const willRefund = booking.status === 'confirmed' && booking.membership_id && booking.consumed_category;
        if (willRefund) {
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

        // Aviso in-app (campanita) + push web al usuario afectado — writeInAppNotification
        // ya dispara ambos. WhatsApp NO se usa aquí a propósito: política de la dueña
        // (2026-06-23, ver lib/whatsapp.ts) limita el número a solo 3 mensajes automáticos
        // para evitar que WhatsApp lo bloquee por spam; el respaldo es el correo de abajo.
        if (booking.user_id) {
            void writeInAppNotification({
                userId: booking.user_id,
                type: 'class_cancelled',
                title: 'Clase cancelada',
                body: `El estudio canceló tu clase de ${className} del ${classDateStr}${startTime ? ` (${startTime})` : ''}.`,
                data: { class_id: classId, reason },
            });
        }

        // Correo de respaldo: antes solo se avisaba por push (depende de tener la app
        // agregada a la pantalla de inicio, poco común en iPhone) — una clienta podía
        // presentarse al estudio a una clase que ya estaba cancelada sin enterarse antes.
        if (booking.user_email) {
            void sendClassCancelledEmail({
                to: booking.user_email,
                clientName: booking.user_name || 'Cliente',
                className,
                classDate: classDateStr,
                startTime,
                endTime,
                reason,
                refunded: Boolean(willRefund),
            }).catch((e: any) => console.error('email cancel class:', e?.message));
        }
    }

    return { class: result, cancelledBookings, refundedCredits };
}
