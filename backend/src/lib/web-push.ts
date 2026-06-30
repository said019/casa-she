import webpush from 'web-push';
import { query } from '../config/database.js';

const PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:saidromero19@gmail.com';

let configured = false;
if (PUBLIC && PRIVATE) {
    webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
    configured = true;
} else {
    console.warn('[web-push] VAPID keys no configuradas; el push está deshabilitado.');
}

export interface WebPushPayload {
    title: string;
    body: string;
    url?: string;
    tag?: string;
}

interface SubRow {
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
}

/** 404/410 indican que la suscripción ya no existe → debe purgarse. */
export function shouldPrune(statusCode: number): boolean {
    return statusCode === 404 || statusCode === 410;
}

/**
 * Envía una notificación push a TODAS las suscripciones del usuario.
 * Fire-and-forget desde el caller: nunca lanza. Purga suscripciones muertas.
 */
export async function sendWebPushToUser(
    userId: string,
    payload: WebPushPayload,
): Promise<{ sent: number; pruned: number }> {
    if (!configured) return { sent: 0, pruned: 0 };
    let sent = 0;
    let pruned = 0;
    try {
        const subs = await query<SubRow>(
            `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
            [userId],
        );
        const body = JSON.stringify(payload);
        await Promise.all(
            subs.map(async (s) => {
                try {
                    await webpush.sendNotification(
                        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                        body,
                    );
                    sent++;
                } catch (err: any) {
                    const code = Number(err?.statusCode);
                    if (shouldPrune(code)) {
                        await query(`DELETE FROM push_subscriptions WHERE id = $1`, [s.id]).catch(() => {});
                        pruned++;
                    } else {
                        console.error('[web-push] envío falló:', code, err?.body || err?.message);
                    }
                }
            }),
        );
    } catch (err) {
        console.error('[web-push] sendWebPushToUser falló:', err);
    }
    return { sent, pruned };
}
