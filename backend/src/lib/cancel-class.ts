import { sendWebPushToUser, type WebPushPayload } from './web-push.js';
import { marcarRetiroTotalpass } from './totalpass/retire.js';
import { marcarCancelacionFitpass } from './fitpass/cancel.js';
import { filas, type ClienteTx } from './db-tx.js';

/** Aviso push a una alumna que todavía no se manda (cancelación dentro de un lote). */
export interface AvisoCancelacion {
    userId: string;
    payload: WebPushPayload;
}

export interface OpcionesCancelacion {
    /** Correr dentro de esta transacción (cambios en bloque). Sin `db` usa el pool, como siempre. */
    db?: ClienteTx;
    /** No mandar los avisos: devolverlos en `avisos` para mandarlos después del COMMIT. */
    diferirAvisos?: boolean;
}

/** El aviso que recibe cada alumna cuando el estudio cancela su clase. */
export function avisoDeClaseCancelada(userId: string): AvisoCancelacion {
    return {
        userId,
        payload: { title: 'Clase cancelada', body: 'El estudio canceló una de tus clases. Revisa tus reservas.', url: '/app/classes', tag: 'class_cancelled' },
    };
}

/**
 * Cancel a class and all its active bookings, refunding membership credits.
 * Reusable across: manual cancel, event overlap cancel, closed-day cancel, bulk cancel.
 *
 * Sin `opts` se comporta como siempre: pool, avisos al momento y errores secundarios
 * (barra, beneficio) solo se registran. Con `opts.db` todo corre en esa transacción y
 * cualquier error se propaga para que quien la abrió revierta TODO.
 */
export async function cancelClassWithRefunds(
    classId: string,
    cancelledBy: string,
    reason: string,
    opts: OpcionesCancelacion = {},
): Promise<{ class: any; cancelledBookings: number; refundedCredits: number; avisos: AvisoCancelacion[] }> {
    const { db, diferirAvisos = false } = opts;
    const avisos: AvisoCancelacion[] = [];

    // Cancel the class
    const [result] = await filas(
        db,
        `UPDATE classes
         SET status = 'cancelled',
             cancelled_at = NOW(),
             cancelled_by = $1,
             cancellation_reason = $2
         WHERE id = $3 RETURNING *`,
        [cancelledBy, reason, classId]
    );

    if (!result) {
        return { class: null, cancelledBookings: 0, refundedCredits: 0, avisos };
    }

    // Marcar el retiro de TotalPass. Solo BD (sin red): esta función se llama en
    // bucle al cerrar un día completo o cancelar una serie, y una llamada a la API
    // de TP por clase colgaría la petición del admin. El barrido
    // (`retirarClasesPendientesDeTotalpass`) hace el trabajo con red enseguida y por
    // cron. Sin esta línea la clase seguía viva y reservable en la app de TotalPass:
    // la socia reservaba una clase cancelada y llegaba al estudio sin que nadie supiera.
    await marcarRetiroTotalpass(classId, db);
    // Igual para FitPass: outbox solo BD de la schedule DUEÑA (se cancela tras el commit).
    await marcarCancelacionFitpass(classId, db);

    // Get all active bookings for this class
    const bookingsToCancel = await filas(
        db,
        `SELECT b.*, m.id as membership_id
         FROM bookings b
         LEFT JOIN memberships m ON b.membership_id = m.id
         WHERE b.class_id = $1 AND b.status IN ('confirmed', 'waitlist')`,
        [classId]
    );

    let cancelledBookings = 0;
    let refundedCredits = 0;

    for (const booking of bookingsToCancel) {
        await filas(
            db,
            `UPDATE bookings
             SET status = 'cancelled',
                 cancelled_at = NOW(),
                 cancellation_reason = $1
             WHERE id = $2`,
            [reason, booking.id]
        );
        cancelledBookings++;

        // Cascada barra: cancela bebidas pre-ordenadas de esta reserva.
        const barra = filas(
            db,
            `UPDATE bar_orders SET status='cancelled', cancelled_by='system_class_cancelled', cancelled_at=NOW(), updated_at=NOW()
             WHERE booking_id = $1 AND status = 'pending'`,
            [booking.id]);
        if (db) await barra;
        else await barra.catch((e: any) => console.error('bar cascade (cancel class):', e?.message));

        // Aviso push al usuario afectado (fire-and-forget; nunca rompe el flujo).
        // En un lote se devuelve y se manda después del COMMIT.
        if (booking.user_id) {
            const aviso = avisoDeClaseCancelada(booking.user_id);
            if (diferirAvisos) avisos.push(aviso);
            else void sendWebPushToUser(aviso.userId, aviso.payload);
        }

        // Refund credit to the bucket the booking consumed
        if (booking.status === 'confirmed' && booking.membership_id && booking.consumed_category) {
            const col = booking.consumed_category === 'reformer' ? 'reformer_remaining' : 'multi_remaining';
            await filas(
                db,
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
            const beneficio = filas(
                db,
                `UPDATE user_benefits
                    SET status = 'active', used_at = NULL, used_by = NULL, used_on_booking_id = NULL
                  WHERE used_on_booking_id = $1 AND status = 'used' AND expires_at > NOW()`,
                [booking.id]
            );
            if (db) await beneficio;
            else await beneficio.catch((e: any) => console.error('reactivar free_class benefit (cancel class):', e?.message));
        }
    }

    return { class: result, cancelledBookings, refundedCredits, avisos };
}
