/**
 * Unified Notifications for BMB Studio
 *
 * Orchestrates push notifications for Apple Wallet, Google Wallet,
 * WhatsApp and email.
 */

import { query, queryOne } from '../config/database.js';
import {
    notifyAllDevices,
    sendAPNsAlertNotification,
    recordPassUpdate,
    getDevicesForMembership
} from './apple-wallet.js';
import {
    upsertGoogleLoyaltyObject,
    sendGoogleWalletMessage
} from './google-wallet.js';
import { sendPointsEarnedNotice } from './whatsapp.js';
import { sendPointsEarnedEmail } from '../services/email.js';
import { isPlatformMember, isPlatformMembershipId } from './platformMember.js';

// ============================================
// Types
// ============================================

interface MembershipInfo {
    id: string;
    user_id: string;
    user_name: string;
    plan_name: string;
    classes_remaining: number;
    classes_used: number;
    loyalty_points: number;
    end_date: Date;
}

type NotificationChannel = 'apple' | 'google';
type NotificationStatus = 'pending' | 'sent' | 'failed';

// ============================================
// Notification Logging
// ============================================

async function logNotification(params: {
    membershipId: string;
    title: string | null;
    message: string;
    channel: NotificationChannel;
    status: NotificationStatus;
    error?: string;
}): Promise<void> {
    await query(`
        INSERT INTO notification_logs (membership_id, title, message, channel, status, error)
        VALUES ($1, $2, $3, $4, $5, $6)
    `, [
        params.membershipId,
        params.title,
        params.message,
        params.channel,
        params.status,
        params.error || null,
    ]);
}

// ============================================
// Membership Update Notifications
// ============================================

/**
 * Notify when a class is attended (membership updated)
 */
export async function notifyClassAttended(
    membershipId: string,
    oldClasses: number,
    newClasses: number
): Promise<void> {
    // Alumnos de plataforma (Totalpass/Wellhub/Fitpass): sin notificaciones salvo su reserva.
    if (await isPlatformMembershipId(membershipId)) return;
    console.log(`📤 Notifying class attended: ${membershipId}`);
    console.log(`   Classes: ${oldClasses} → ${newClasses}`);

    const membership = await getMembershipInfo(membershipId);
    if (!membership) {
        console.error('Membership not found for notification:', membershipId);
        return;
    }

    const title = '¡Clase completada! 🧘‍♀️';
    const body = newClasses === -1
        ? `Disfrutaste tu clase. ¡Tienes ${membership.loyalty_points} puntos!`
        : `Te quedan ${newClasses} clases. ¡${membership.loyalty_points} puntos acumulados!`;

    // Notify Apple Wallet
    await notifyApple(membershipId, oldClasses, newClasses, title, body);

    // Notify Google Wallet
    await notifyGoogle(membership, title, body);
}

/**
 * Notify when loyalty points are earned
 */
export async function notifyPointsEarned(
    membershipId: string,
    pointsEarned: number,
    totalPoints: number
): Promise<void> {
    // Alumnos de plataforma: sin notificaciones salvo su reserva.
    if (await isPlatformMembershipId(membershipId)) return;
    console.log(`📤 Notifying points earned: ${membershipId} (+${pointsEarned})`);

    const membership = await getMembershipInfo(membershipId);
    if (!membership) return;

    const title = '¡Puntos ganados! ⭐';
    const body = `Ganaste ${pointsEarned} puntos. Total: ${totalPoints} pts`;

    await notifyApple(membershipId, null, null, title, body);
    await notifyGoogle(membership, title, body);
}

/**
 * Notify when membership is about to expire
 */
export async function notifyMembershipExpiring(
    membershipId: string,
    daysRemaining: number
): Promise<void> {
    // Alumnos de plataforma: sin notificaciones salvo su reserva.
    if (await isPlatformMembershipId(membershipId)) return;
    console.log(`📤 Notifying membership expiring: ${membershipId} (${daysRemaining} days)`);

    const membership = await getMembershipInfo(membershipId);
    if (!membership) return;

    const title = '⏰ Tu membresía está por vencer';
    const body = daysRemaining === 1
        ? 'Tu membresía vence mañana. ¡Renuévala para seguir disfrutando!'
        : `Tu membresía vence en ${daysRemaining} días. ¡Renuévala pronto!`;

    await notifyApple(membershipId, null, null, title, body);
    await notifyGoogle(membership, title, body);
}

/**
 * Notify when membership is renewed
 */
export async function notifyMembershipRenewed(membershipId: string): Promise<void> {
    // Alumnos de plataforma: sin notificaciones salvo su reserva.
    if (await isPlatformMembershipId(membershipId)) return;
    console.log(`📤 Notifying membership renewed: ${membershipId}`);

    const membership = await getMembershipInfo(membershipId);
    if (!membership) return;

    const title = '¡Membresía renovada! 🎉';
    const body = `Tu plan ${membership.plan_name} está activo hasta ${formatDate(membership.end_date)}`;

    await notifyApple(membershipId, null, null, title, body);
    await notifyGoogle(membership, title, body);
}

/**
 * Send custom notification to a specific membership
 */
export async function sendCustomNotification(params: {
    membershipId: string;
    title: string;
    message: string;
    sendApple?: boolean;
    sendGoogle?: boolean;
}): Promise<{ apple: boolean; google: boolean }> {
    const { membershipId, title, message, sendApple = true, sendGoogle = true } = params;

    // Alumnos de plataforma: sin notificaciones salvo su reserva.
    if (await isPlatformMembershipId(membershipId)) {
        return { apple: false, google: false };
    }

    console.log(`📤 Sending custom notification to: ${membershipId}`);

    const membership = await getMembershipInfo(membershipId);
    if (!membership) {
        return { apple: false, google: false };
    }

    let appleResult = false;
    let googleResult = false;

    if (sendApple) {
        appleResult = await notifyApple(membershipId, null, null, title, message);
    }

    if (sendGoogle) {
        googleResult = await notifyGoogle(membership, title, message);
    }

    return { apple: appleResult, google: googleResult };
}

// ============================================
// Platform-Specific Notifications
// ============================================

async function notifyApple(
    membershipId: string,
    oldClasses: number | null,
    newClasses: number | null,
    title: string,
    body: string
): Promise<boolean> {
    try {
        // Record update if classes changed
        if (oldClasses !== null && newClasses !== null) {
            await recordPassUpdate(membershipId, oldClasses, newClasses);
        }

        // Get all devices for this membership
        const devices = await getDevicesForMembership(membershipId);

        if (devices.length === 0) {
            console.log('   No Apple devices registered');
            await logNotification({
                membershipId,
                title,
                message: body,
                channel: 'apple',
                status: 'failed',
                error: 'No devices registered',
            });
            return false;
        }

        // Send alert notification to all devices
        let successCount = 0;
        for (const device of devices) {
            const success = await sendAPNsAlertNotification(device.push_token, title, body);
            if (success) successCount++;
        }

        console.log(`   Apple: Sent to ${successCount}/${devices.length} devices`);

        await logNotification({
            membershipId,
            title,
            message: body,
            channel: 'apple',
            status: successCount > 0 ? 'sent' : 'failed',
            error: successCount === 0 ? 'All sends failed' : undefined,
        });

        // Also trigger pass refresh (silent push)
        await notifyAllDevices(membershipId);

        return successCount > 0;

    } catch (error) {
        console.error('Error sending Apple notification:', error);
        await logNotification({
            membershipId,
            title,
            message: body,
            channel: 'apple',
            status: 'failed',
            error: String(error),
        });
        return false;
    }
}

async function notifyGoogle(
    membership: MembershipInfo,
    title: string,
    body: string
): Promise<boolean> {
    try {
        // First, update the loyalty object with new data
        await upsertGoogleLoyaltyObject(membership.id);

        // Then send message
        const success = await sendGoogleWalletMessage({
            membershipId: membership.id,
            title,
            body,
        });

        console.log(`   Google: ${success ? '✅ Sent' : '❌ Failed'}`);

        await logNotification({
            membershipId: membership.id,
            title,
            message: body,
            channel: 'google',
            status: success ? 'sent' : 'failed',
        });

        return success;

    } catch (error) {
        console.error('Error sending Google notification:', error);
        await logNotification({
            membershipId: membership.id,
            title,
            message: body,
            channel: 'google',
            status: 'failed',
            error: String(error),
        });
        return false;
    }
}

// ============================================
// Helpers
// ============================================

async function getMembershipInfo(membershipId: string): Promise<MembershipInfo | null> {
    return await queryOne<MembershipInfo>(`
        SELECT 
            m.id,
            m.user_id,
            u.display_name as user_name,
            p.name as plan_name,
            m.classes_remaining,
            COALESCE(COALESCE(p.class_limit, 0) - COALESCE(m.classes_remaining, 0), 0) as classes_used,
            COALESCE((
                SELECT SUM(points) FROM loyalty_points lp WHERE lp.user_id = m.user_id
            ), 0)::int as loyalty_points,
            m.end_date
        FROM memberships m
        JOIN users u ON m.user_id = u.id
        JOIN plans p ON m.plan_id = p.id
        WHERE m.id = $1
    `, [membershipId]);
}

function formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('es-MX', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

// ============================================
// Notification History
// ============================================

/**
 * Get recent notifications for a membership
 */
export async function getNotificationHistory(
    membershipId?: string,
    limit: number = 50
): Promise<Array<{
    id: string;
    membership_id: string;
    title: string | null;
    message: string;
    channel: NotificationChannel;
    status: NotificationStatus;
    error: string | null;
    created_at: Date;
}>> {
    const result = membershipId
        ? await query<{
            id: string;
            membership_id: string;
            title: string | null;
            message: string;
            channel: NotificationChannel;
            status: NotificationStatus;
            error: string | null;
            created_at: Date;
        }>(`
            SELECT * FROM notification_logs
            WHERE membership_id = $1
            ORDER BY created_at DESC
            LIMIT $2
        `, [membershipId, limit])
        : await query<{
            id: string;
            membership_id: string;
            title: string | null;
            message: string;
            channel: NotificationChannel;
            status: NotificationStatus;
            error: string | null;
            created_at: Date;
        }>(`
            SELECT * FROM notification_logs
            ORDER BY created_at DESC
            LIMIT $1
        `, [limit]);

    return result;
}

/**
 * Clear notification history
 */
export async function clearNotificationHistory(membershipId?: string): Promise<void> {
    if (membershipId) {
        await query('DELETE FROM notification_logs WHERE membership_id = $1', [membershipId]);
    } else {
        await query('DELETE FROM notification_logs');
    }
}

// ============================================
// External Notifications (WhatsApp + Email) for Loyalty Points
// ============================================

export type PointsReason =
    | 'package_purchase'
    | 'welcome'
    | 'referral'
    | 'class'
    | 'streak'
    | 'birthday'
    | 'anniversary';

const REASON_LABELS: Record<PointsReason, string> = {
    package_purchase: 'tu compra de paquete',
    welcome: 'tu bienvenida a BMB Studio',
    referral: 'una compra con tu código de referido',
    class: 'asistir a tu clase',
    streak: 'tu racha de constancia',
    birthday: 'tu cumpleaños',
    anniversary: 'tu aniversario en el studio',
};

// Email channel only fires for substantial events (avoid email fatigue from per-class +2 pts)
const EMAIL_REASONS: Set<PointsReason> = new Set([
    'package_purchase',
    'welcome',
    'referral',
    'birthday',
    'anniversary',
]);

/**
 * Notify a user (via WhatsApp + email when applicable) that they earned loyalty points.
 * Fully fire-and-forget: never throws, swallows all errors.
 */
export async function notifyPointsEarnedExternal(
    userId: string,
    pointsEarned: number,
    reason: PointsReason,
): Promise<void> {
    if (!userId || pointsEarned <= 0) return;
    // Alumnos de plataforma: sin notificaciones salvo su reserva.
    if (await isPlatformMember(userId)) return;
    // Referidos está apagado (#317): nunca notificar puntos por referido — no debe
    // aparecer en ningún correo ni WhatsApp ("una compra con tu código de referido").
    if (reason === 'referral') return;
    try {
        const user = await queryOne<{
            display_name: string | null;
            email: string | null;
            phone: string | null;
        }>(
            `SELECT display_name, email, phone FROM users WHERE id = $1`,
            [userId]
        );
        if (!user) return;

        const totalRow = await queryOne<{ total: number | string }>(
            `SELECT COALESCE(SUM(points), 0)::int as total
             FROM loyalty_points
             WHERE user_id = $1`,
            [userId]
        );
        const totalPoints = Number(totalRow?.total || 0);
        const reasonLabel = REASON_LABELS[reason] || 'tu actividad';
        const clientName = (user.display_name || '').split(' ')[0] || 'amiga';

        if (user.phone) {
            void sendPointsEarnedNotice(user.phone, clientName, pointsEarned, totalPoints, reasonLabel)
                .catch((err) => console.error('[notifyPointsEarnedExternal:wa]', err));
        }

        if (user.email && EMAIL_REASONS.has(reason)) {
            void sendPointsEarnedEmail({
                to: user.email,
                clientName,
                pointsEarned,
                totalPoints,
                reasonLabel,
            }).catch((err) => console.error('[notifyPointsEarnedExternal:email]', err));
        }
    } catch (err) {
        console.error('[notifyPointsEarnedExternal]', err);
    }
}

export default {
    notifyClassAttended,
    notifyPointsEarned,
    notifyPointsEarnedExternal,
    notifyMembershipExpiring,
    notifyMembershipRenewed,
    sendCustomNotification,
    getNotificationHistory,
    clearNotificationHistory,
};
