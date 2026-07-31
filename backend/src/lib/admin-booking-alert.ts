import { sendWhatsAppMessage } from './whatsapp.js';

export interface AdminBookingAlert {
    clientName: string;
    className: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:MM
    instructorName?: string | null;
    facilityName?: string | null;
}

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatDate(date: string): string {
    const [year, month, day] = date.split('-').map(Number);
    if (!year || !month || !day) return date;

    const weekday = DAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? '';
    return `${weekday} ${day} ${MONTHS[month - 1] ?? ''}`.trim();
}

/**
 * ADMIN_ALERT_WHATSAPP accepts one or more comma-, semicolon-, or newline-separated
 * numbers. Normalizing and de-duplicating here prevents duplicate internal alerts.
 */
export function getAdminBookingAlertRecipients(raw = process.env.ADMIN_ALERT_WHATSAPP): string[] {
    if (!raw) return [];

    const recipients = raw
        .split(/[,;\n]/)
        .map((value) => value.trim().replace(/[^\d+]/g, ''))
        .filter((value) => /^\+?\d{10,15}$/.test(value));

    return [...new Set(recipients)];
}

export function buildAdminBookingAlertMessage(alert: AdminBookingAlert): string {
    const lines = [
        '📅 *Nueva reserva en Casa Shé*',
        '',
        `*${alert.clientName}*`,
        `${alert.className} · ${formatDate(alert.date)}, ${alert.time}`,
    ];

    if (alert.instructorName) lines.push(`Coach: ${alert.instructorName}`);
    if (alert.facilityName) lines.push(`Sede: ${alert.facilityName}`);
    lines.push('', 'Ya aparece en el calendario de Casa Shé.');

    return lines.join('\n');
}

/**
 * Best-effort internal alert. A WhatsApp failure must never undo or delay a booking.
 */
export async function sendAdminBookingAlert(alert: AdminBookingAlert): Promise<void> {
    const recipients = getAdminBookingAlertRecipients();
    if (recipients.length === 0) return;

    const message = buildAdminBookingAlertMessage(alert);
    await Promise.all(recipients.map(async (recipient) => {
        try {
            await sendWhatsAppMessage(recipient, message);
        } catch (error) {
            console.error('[admin-booking-alert] WhatsApp failed (non-blocking):', (error as Error).message);
        }
    }));
}
