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
    /** De dónde vino la reserva. 'totalpass' por defecto (de ahí nació este aviso). */
    origen?: 'totalpass' | 'app' | 'recepcion';
    /** La membresía usada para reservar se pagó en efectivo en el estudio. */
    pagoEnEstudio?: boolean;
}

/**
 * Destinatarios del aviso. `ADMIN_ALERT_WHATSAPP` acepta VARIOS números
 * separados por coma: el estudio tiene dos administradoras y con un solo
 * destinatario la otra nunca se enteraba.
 *   ADMIN_ALERT_WHATSAPP="+525538861972,+525541822309"
 */
export function destinatariosWhatsApp(valor = process.env.ADMIN_ALERT_WHATSAPP): string[] {
    return String(valor || '')
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean);
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

const TITULO: Record<string, string> = {
    totalpass: '🎟️ *Nueva reserva de TotalPass*',
    app: '🌿 *Nueva reserva desde la app*',
    recepcion: '🌿 *Nueva reserva desde recepción*',
};

export function construirMensaje(r: AvisoReservaTotalPass): string {
    const lineas = [
        TITULO[r.origen ?? 'totalpass'] ?? TITULO.totalpass,
        '',
        `*${r.socia}*`,
        `${r.clase} · ${fechaBonita(r.fecha)}, ${r.hora}`,
    ];
    if (r.coach) lineas.push(`Coach: ${r.coach}`);
    if (r.pagoEnEstudio) lineas.push('💵 *Pago en estudio*');
    if (r.sobrecupo) lineas.push('', '⚠️ Entró por encima del cupo de la clase.');
    lineas.push('', 'Ya aparece en el calendario de Casa Shé.');
    return lineas.join('\n');
}

export async function avisarReservaTotalPass(r: AvisoReservaTotalPass): Promise<void> {
    const telefonos = destinatariosWhatsApp();
    const correo = process.env.ADMIN_ALERT_EMAIL?.trim();
    if (telefonos.length === 0 && !correo) return;

    const mensaje = construirMensaje(r);

    // Uno por uno y cada quien con su try: si el número de una administradora
    // está mal escrito, la otra igual recibe el aviso.
    for (const tel of telefonos) {
        try {
            await sendWhatsAppMessage(tel, mensaje);
        } catch (e) {
            console.error(`[aviso-reserva] WhatsApp a ${tel} falló (no bloquea):`, (e as Error).message);
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

// ── Reserva huérfana: la socia reservó algo que en Casa Shé ya no existe ─────

export interface AvisoReservaHuerfana {
    socia: string;
    clase: string;
    fecha: string;  // YYYY-MM-DD
    hora: string;   // HH:MM
    telefono?: string | null;
}

/**
 * Mensaje para el caso más incómodo del canal: TotalPass le confirmó a la socia
 * una reserva de una clase que Casa Shé ya no tiene (la cancelaron, o el título
 * dejó de empatar). El import la descarta con razón —no se puede reservar una
 * clase cancelada— pero antes eso solo se escribía en un log del servidor: nadie
 * en el estudio se enteraba hasta que la socia llegaba a la puerta. PURA.
 */
export function construirMensajeHuerfana(r: AvisoReservaHuerfana): string {
    return [
        '⚠️ *Reserva de TotalPass sin clase*',
        '',
        `*${r.socia}*${r.telefono ? ` · ${r.telefono}` : ''}`,
        `Reservó: ${r.clase} · ${fechaBonita(r.fecha)}, ${r.hora}`,
        '',
        'Esa clase ya NO existe en Casa Shé (cancelada o cambiada), pero TotalPass',
        'sí le confirmó la reserva a la socia. Va a llegar al estudio.',
        '',
        'Háblale para reubicarla.',
    ].join('\n');
}

/**
 * Avisa al estudio de una reserva huérfana. Mismo best-effort que
 * `avisarReservaTotalPass`: si un canal falla, el otro sigue y el import nunca
 * se rompe por un aviso.
 */
export async function avisarReservaHuerfanaTotalPass(r: AvisoReservaHuerfana): Promise<void> {
    const telefonos = destinatariosWhatsApp();
    const correo = process.env.ADMIN_ALERT_EMAIL?.trim();
    if (telefonos.length === 0 && !correo) return;

    const mensaje = construirMensajeHuerfana(r);
    for (const tel of telefonos) {
        try {
            await sendWhatsAppMessage(tel, mensaje);
        } catch (e) {
            console.error(`[tp-huerfana] WhatsApp a ${tel} falló (no bloquea):`, (e as Error).message);
        }
    }
    if (correo) {
        try {
            await sendPlainEmail(
                correo,
                `⚠️ Reserva TotalPass sin clase — ${r.clase} (${fechaBonita(r.fecha)})`,
                mensaje.replace(/\*/g, ''),
            );
        } catch (e) {
            console.error('[tp-huerfana] correo falló (no bloquea):', (e as Error).message);
        }
    }
}
