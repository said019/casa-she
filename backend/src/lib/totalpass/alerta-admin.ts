/**
 * Aviso al estudio cuando entra una reserva de TotalPass.
 *
 * Las reservas de plataforma no las hace nadie del estudio: aparecen solas cuando
 * el cron importa lo que la socia reservó en su app. Sin este aviso, recepción se
 * entera hasta que abre el calendario (o hasta que la socia llega).
 *
 * Canales: WhatsApp al número del estudio y, si está configurado, correo. Los dos
 * son best-effort: si uno falla NO se rompe el import (la reserva ya quedó guardada).
 *
 * Configuración (Railway):
 *   ADMIN_ALERT_WHATSAPP  — teléfono destino, ej. +525538861972
 *   ADMIN_ALERT_EMAIL     — opcional, copia por correo
 * Sin ninguna de las dos, la función no hace nada (no truena).
 */
import { sendWhatsAppMessage } from '../whatsapp.js';
import { sendPlainEmail } from '../../services/email.js';

export interface AvisoReservaTotalPass {
    socia: string;
    clase: string;
    fecha: string;      // YYYY-MM-DD
    hora: string;       // HH:MM
    coach?: string | null;
    /** true si entró por encima del cupo físico de la clase. */
    sobrecupo?: boolean;
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "lunes 27 jul" — se arma por partes: las fechas ya vienen en hora local del estudio. */
function fechaBonita(fecha: string): string {
    const [a, m, d] = fecha.split('-').map(Number);
    if (!a || !m || !d) return fecha;
    const dia = DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()] ?? '';
    return `${dia} ${d} ${MESES[m - 1] ?? ''}`.trim();
}

export function construirMensaje(r: AvisoReservaTotalPass): string {
    const lineas = [
        '🎟️ *Nueva reserva de TotalPass*',
        '',
        `*${r.socia}*`,
        `${r.clase} · ${fechaBonita(r.fecha)}, ${r.hora}`,
    ];
    if (r.coach) lineas.push(`Coach: ${r.coach}`);
    if (r.sobrecupo) lineas.push('', '⚠️ Entró por encima del cupo de la clase.');
    lineas.push('', 'Ya aparece en el calendario de Casa Shé.');
    return lineas.join('\n');
}

export async function avisarReservaTotalPass(r: AvisoReservaTotalPass): Promise<void> {
    const tel = process.env.ADMIN_ALERT_WHATSAPP?.trim();
    const correo = process.env.ADMIN_ALERT_EMAIL?.trim();
    if (!tel && !correo) return;

    const mensaje = construirMensaje(r);

    if (tel) {
        try {
            await sendWhatsAppMessage(tel, mensaje);
        } catch (e) {
            console.error('[tp-aviso] WhatsApp falló (no bloquea):', (e as Error).message);
        }
    }
    if (correo) {
        try {
            await sendPlainEmail(
                correo,
                `Nueva reserva TotalPass — ${r.clase} (${fechaBonita(r.fecha)})`,
                mensaje.replace(/\*/g, ''),
            );
        } catch (e) {
            console.error('[tp-aviso] correo falló (no bloquea):', (e as Error).message);
        }
    }
}
