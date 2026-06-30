/**
 * In-app notifications: escribir filas a la tabla `notifications` para que el caller
 * las vea en su centro de notificaciones (campanita).
 *
 * Patrón uniforme: el caller ya tiene un email enviándose, esto agrega el espejo in-app
 * en try/catch independiente — un fallo aquí no debe tumbar el flujo principal.
 */

import { query } from '../config/database.js';
import { isPlatformMember } from './platformMember.js';
import { sendWebPushToUser } from './web-push.js';

export type InAppNotificationType =
    | 'booking_reminder'
    | 'class_cancelled'
    | 'membership_expiring'
    | 'points_earned'
    | 'promotion'
    | 'coach_assigned'
    | 'coach_removed'
    | 'coach_substituted'
    | 'class_updated'
    | 'review_received'
    | 'substitution_requested'
    | 'substitution_offered'
    | 'substitution_rejected'
    | 'waitlist_promoted';

export interface InAppNotificationInput {
    userId: string;
    title: string;
    body: string;
    type: InAppNotificationType;
    data?: Record<string, unknown>;
}

const PUSH_URL_BY_TYPE: Partial<Record<InAppNotificationType, string>> = {
    booking_reminder: '/app/classes',
    class_cancelled: '/app/classes',
    class_updated: '/app/classes',
    waitlist_promoted: '/app/classes',
    coach_assigned: '/app/classes',
    coach_substituted: '/app/classes',
    membership_expiring: '/app/checkout',
    points_earned: '/app/wallet',
    review_received: '/app',
};

export function pushUrlForType(type: InAppNotificationType): string {
    return PUSH_URL_BY_TYPE[type] ?? '/app';
}

/**
 * Inserta una notificación in-app para un usuario. Idempotente solo en el sentido de
 * que la app la marca como nueva cada vez; el caller debe decidir si llamar o no.
 * Si falla, loggea y retorna null — nunca lanza.
 */
export async function writeInAppNotification(input: InAppNotificationInput): Promise<string | null> {
    try {
        // Alumnos de plataforma (Totalpass/Wellhub/Fitpass): no reciben notificaciones in-app.
        // Ningún tipo in-app es la "reserva hecha" (esa va por email/WhatsApp), así que se omiten todas.
        if (await isPlatformMember(input.userId)) return null;
        const rows = await query<{ id: string }>(
            `INSERT INTO notifications (user_id, title, body, type, data, sent_at)
             VALUES ($1, $2, $3, $4::notification_type, $5::jsonb, NOW())
             RETURNING id`,
            [input.userId, input.title, input.body, input.type, JSON.stringify(input.data ?? {})]
        );
        // Canal push (no bloquea ni rompe el flujo). Mismo aviso que la campana.
        void sendWebPushToUser(input.userId, {
            title: input.title,
            body: input.body,
            url: pushUrlForType(input.type),
            tag: input.type,
        });
        return rows[0]?.id ?? null;
    } catch (err) {
        console.error('[in-app-notification] write failed:', err);
        return null;
    }
}

/**
 * Helper para escribir una notificación con `user_id` resuelto desde un instructor.
 * Si el instructor no tiene user_id válido, simplemente no escribe (no falla).
 */
export async function writeInAppNotificationForInstructor(
    instructorId: string,
    payload: Omit<InAppNotificationInput, 'userId'>,
): Promise<string | null> {
    try {
        const rows = await query<{ user_id: string | null }>(
            `SELECT user_id FROM instructors WHERE id = $1`,
            [instructorId]
        );
        const userId = rows[0]?.user_id;
        if (!userId) return null;
        return writeInAppNotification({ userId, ...payload });
    } catch (err) {
        console.error('[in-app-notification] resolve instructor user_id failed:', err);
        return null;
    }
}
