import { getEvolutionClient } from './whatsapp-evolution.js';
import { instanceForFacility, sucursalLabel } from './whatsapp-instances.js';
import { isPlatformMemberByPhone } from './platformMember.js';

/**
 * Facade principal para envío de WhatsApp
 * Soporta múltiples proveedores: evolution (gratuito) o twilio (pago)
 */

const WHATSAPP_PROVIDER = process.env.WHATSAPP_PROVIDER || 'evolution';

export interface WhatsAppMessage {
    to: string;
    message: string;
}

export interface WhatsAppPollMessage {
    to: string;
    question: string;
    options: string[];
    selectableCount?: number;
}

export interface WhatsAppMediaMessage {
    to: string;
    mediaUrl: string;
    caption?: string;
    mediaType?: 'image' | 'video' | 'document';
}

/**
 * Enviar mensaje de texto por WhatsApp.
 * `instance` opcional = nombre de instancia (sucursal). Sin él → principal (San Miguel).
 */
export async function sendWhatsAppMessage(to: string, message: string, instance?: string): Promise<boolean> {
    if (process.env.DISABLE_WHATSAPP === 'true') {
        console.log(`[WhatsApp] DISABLED — would have sent to ${to}: ${message.slice(0, 60)}…`);
        return true;
    }
    try {
        if (WHATSAPP_PROVIDER === 'evolution') {
            const client = getEvolutionClient(instance);
            await client.sendText(to, message);
            console.log(`[WhatsApp] Mensaje enviado a ${to}${instance ? ` (instancia ${instance})` : ''}`);
            return true;
        }

        // Twilio u otro proveedor futuro
        console.warn('[WhatsApp] Proveedor no configurado:', WHATSAPP_PROVIDER);
        return false;
    } catch (error: any) {
        console.error('[WhatsApp] Error enviando mensaje:', error.message);
        return false;
    }
}

/**
 * Enviar Poll/Encuesta por WhatsApp (funciona en iOS y Android)
 * Mejor opción para confirmaciones y opciones
 */
export async function sendWhatsAppPoll(
    to: string,
    question: string,
    options: string[],
    selectableCount: number = 1
): Promise<boolean> {
    try {
        if (WHATSAPP_PROVIDER === 'evolution') {
            const client = getEvolutionClient();
            await client.sendPoll(to, question, options, selectableCount);
            console.log(`[WhatsApp] Poll enviado a ${to}`);
            return true;
        }

        console.warn('[WhatsApp] Proveedor no soporta polls');
        return false;
    } catch (error: any) {
        console.error('[WhatsApp] Error enviando poll:', error.message);
        return false;
    }
}

/**
 * Enviar imagen/media por WhatsApp
 */
export async function sendWhatsAppMedia(
    to: string,
    mediaUrl: string,
    caption?: string,
    mediaType: 'image' | 'video' | 'document' = 'image'
): Promise<boolean> {
    try {
        if (WHATSAPP_PROVIDER === 'evolution') {
            const client = getEvolutionClient();
            await client.sendMedia(to, mediaUrl, caption, mediaType);
            console.log(`[WhatsApp] Media enviado a ${to}`);
            return true;
        }

        console.warn('[WhatsApp] Proveedor no configurado');
        return false;
    } catch (error: any) {
        console.error('[WhatsApp] Error enviando media:', error.message);
        return false;
    }
}

/**
 * Obtener estado de conexión de WhatsApp
 */
export async function getWhatsAppStatus(instance?: string): Promise<{
    provider: string;
    connected: boolean;
    state: string;
    number?: string;
}> {
    try {
        if (WHATSAPP_PROVIDER === 'evolution') {
            const client = getEvolutionClient(instance);
            const status = await client.getStatus();
            return {
                provider: 'evolution',
                ...status,
            };
        }

        return {
            provider: WHATSAPP_PROVIDER,
            connected: false,
            state: 'not_configured',
        };
    } catch (error: any) {
        console.error('[WhatsApp] Error obteniendo estado:', error.message);
        return {
            provider: WHATSAPP_PROVIDER,
            connected: false,
            state: 'error',
        };
    }
}

// ============================================
// Mensajes predefinidos para Casa Shé
//
// POLÍTICA WHATSAPP (decisión de la dueña, 2026-06-23): para evitar bloqueo del
// número, WhatsApp queda limitado a SOLO 3 mensajes automáticos:
//   1) Bienvenida con credenciales a cliente nuevo  → sendClientWelcome (ACTIVO)
//   2) Reset/reenvío de credenciales                → sendClientWelcome + olvidé-contraseña (ACTIVO)
//   3) Recordatorio de membresía por vencer         → sendExpiringMembershipNotice (ACTIVO, por sucursal)
// El resto de notificaciones automáticas por WhatsApp quedan DESACTIVADAS aquí
// (early-return). Reversible: borrar el `return false` para reactivar. El email y
// las notificaciones in-app/wallet de cada flujo NO se tocan.
// ============================================

/**
 * Enviar confirmación de reserva. DESACTIVADO (ver política arriba).
 */
export async function sendBookingConfirmation(
    phone: string,
    clientName: string,
    className: string,
    date: string,
    time: string,
    spotNumber?: number,
    facilityName?: string
): Promise<boolean> {
    return false; // WhatsApp desactivado: solo 3 mensajes permitidos (ver política arriba)
    const spotText = spotNumber ? `\n🎯 Lugar: #${spotNumber}` : '';
    const sucursal = sucursalLabel(facilityName);
    const sucursalText = sucursal ? `\n🏠 Casa Shé ${sucursal}` : '';

    const message = `✅ *Reserva Confirmada*\n\n` +
        `Hola ${clientName}!\n\n` +
        `Tu reserva está confirmada:\n\n` +
        `📍 *${className}*\n` +
        `📅 ${date}\n` +
        `⏰ ${time}${spotText}${sucursalText}\n\n` +
        `¡Te esperamos! 🧘✨`;

    return sendWhatsAppMessage(phone, message, instanceForFacility(facilityName));
}

/**
 * Enviar notificación de cancelación. DESACTIVADO (ver política arriba).
 */
export async function sendCancellationNotice(
    phone: string,
    clientName: string,
    className: string,
    date: string,
    reason?: string,
    refunded?: boolean,
    facilityName?: string
): Promise<boolean> {
    return false; // WhatsApp desactivado: solo 3 mensajes permitidos (ver política arriba)
    // Alumnos de plataforma (Totalpass/Wellhub/Fitpass): sin WhatsApp salvo su reserva.
    if (await isPlatformMemberByPhone(phone)) return false;
    const reasonText = reason ? `\n\n📝 Motivo: ${reason}` : '';
    const refundText = refunded === false
        ? `❌ Tu crédito *no fue devuelto*. ${reason || ''}`
        : `✅ Tu crédito ha sido devuelto automáticamente.`;

    const message = `⚠️ *Reserva Cancelada*\n\n` +
        `Hola ${clientName},\n\n` +
        `Tu reserva ha sido cancelada:\n\n` +
        `📍 *${className}*\n` +
        `📅 ${date}${reasonText}\n\n` +
        `${refundText}`;

    return sendWhatsAppMessage(phone, message, instanceForFacility(facilityName));
}

/**
 * Enviar bienvenida a cliente nuevo (creado por admin)
 */
export async function sendClientWelcome(
    phone: string,
    clientName: string,
    email: string,
    tempPassword: string,
    facilityName?: string,
    // Instancia explícita (sucursal) para mandar; si se da, gana sobre facilityName.
    // Lo usa el reenvío de credenciales cuando admin/master elige con qué WhatsApp enviar.
    instanceOverride?: string,
): Promise<boolean> {
    // Alumnos de plataforma: sin WhatsApp salvo su reserva.
    if (await isPlatformMemberByPhone(phone)) return false;
    const message = `🎉 *¡Bienvenida a Casa Shé!*\n\n` +
        `Hola ${clientName}!\n\n` +
        `Tu cuenta ha sido creada. Aquí están tus datos de acceso:\n\n` +
        `📧 *Email:* ${email}\n` +
        `🔑 *Contraseña:* ${tempPassword}\n\n` +
        `Ingresa a la app y cambia tu contraseña en tu primer acceso.\n\n` +
        `¡Te esperamos en el studio! 🧘✨`;

    return sendWhatsAppMessage(phone, message, instanceOverride ?? instanceForFacility(facilityName));
}

/**
 * Enviar bienvenida a cliente migrado. DESACTIVADO (ver política arriba):
 * la migración Fitune NO manda WhatsApp (lotes grandes = riesgo de bloqueo).
 */
export async function sendMigrationWelcome(
    phone: string,
    clientName: string,
    tempPassword: string,
    facilityName?: string
): Promise<boolean> {
    return false; // WhatsApp desactivado: solo 3 mensajes permitidos (ver política arriba)
    // Alumnos de plataforma: sin WhatsApp salvo su reserva.
    if (await isPlatformMemberByPhone(phone)) return false;
    const message = `🎉 *Bienvenida a Casa Shé*\n\n` +
        `Hola ${clientName}!\n\n` +
        `Tu cuenta ha sido creada en nuestra nueva plataforma.\n\n` +
        `📱 *Datos de acceso:*\n` +
        `🔑 Contraseña temporal: ${tempPassword}\n\n` +
        `Ingresa a la app y cambia tu contraseña en tu primer acceso.\n\n` +
        `¡Nos vemos en clase! 🧘✨`;

    return sendWhatsAppMessage(phone, message, instanceForFacility(facilityName));
}

/**
 * Enviar confirmación de membresía activada. DESACTIVADO (ver política arriba).
 */
export async function sendMembershipActivatedNotice(
    phone: string,
    clientName: string,
    planName: string,
    classesIncluded: number | null,
    endDate: string,
    facilityName?: string
): Promise<boolean> {
    return false; // WhatsApp desactivado: solo 3 mensajes permitidos (ver política arriba)
    // Alumnos de plataforma: sin WhatsApp salvo su reserva.
    if (await isPlatformMemberByPhone(phone)) return false;
    const classesText = classesIncluded ? `🎟️ Clases: ${classesIncluded}` : '🎟️ Clases: Ilimitadas';

    const message = `🎉 *¡Membresía Activada!*\n\n` +
        `Hola ${clientName}!\n\n` +
        `Tu membresía ha sido activada exitosamente:\n\n` +
        `📋 *${planName}*\n` +
        `${classesText}\n` +
        `📅 Vence: ${endDate}\n\n` +
        `Ya puedes reservar tus clases desde la app.\n\n` +
        `¡Te esperamos en el studio! 🧘✨`;

    return sendWhatsAppMessage(phone, message, instanceForFacility(facilityName));
}

/**
 * Notificar que ganaste puntos de lealtad. DESACTIVADO (ver política arriba).
 */
export async function sendPointsEarnedNotice(
    phone: string,
    clientName: string,
    pointsEarned: number,
    totalPoints: number,
    reasonLabel: string,
    facilityName?: string
): Promise<boolean> {
    return false; // WhatsApp desactivado: solo 3 mensajes permitidos (ver política arriba)
    // Alumnos de plataforma: sin WhatsApp salvo su reserva.
    if (await isPlatformMemberByPhone(phone)) return false;
    const message = `⭐ *+${pointsEarned} puntos de lealtad*\n\n` +
        `Hola ${clientName}!\n\n` +
        `Acabas de ganar *${pointsEarned} puntos* por ${reasonLabel}.\n\n` +
        `🏅 Tu balance: *${totalPoints} pts*\n\n` +
        `Canjea tus puntos por recompensas en la app. 🧘✨`;

    return sendWhatsAppMessage(phone, message, instanceForFacility(facilityName));
}

/**
 * Enviar notificación de membresía por vencer
 */
export async function sendExpiringMembershipNotice(
    phone: string,
    clientName: string,
    planName: string,
    daysRemaining: number,
    expirationDate: string,
    facilityName?: string
): Promise<boolean> {
    // Alumnos de plataforma: sin WhatsApp salvo su reserva.
    if (await isPlatformMemberByPhone(phone)) return false;
    const message = `⏰ *Membresía por vencer*\n\n` +
        `Hola ${clientName}!\n\n` +
        `Tu membresía está por vencer:\n\n` +
        `📋 *${planName}*\n` +
        `📅 Vence: ${expirationDate}\n` +
        `⏳ Días restantes: ${daysRemaining}\n\n` +
        `Renueva para seguir disfrutando de tus clases.\n\n` +
        `¿Necesitas ayuda? Escríbenos 💬`;

    return sendWhatsAppMessage(phone, message, instanceForFacility(facilityName));
}

