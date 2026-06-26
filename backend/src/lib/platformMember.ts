/**
 * Alumnos de plataforma (Totalpass / Wellhub / Fitpass): tienen una membresía ACTIVA
 * de un plan interno (plans.is_internal = true). Por pedido del dueño NO deben recibir
 * ninguna notificación automática salvo la confirmación de su reserva hecha.
 *
 * Estos helpers detectan a esos usuarios por distintas claves (userId, email, phone,
 * membershipId) para poder gatear cada canal de notificación.
 */
import { queryOne } from '../config/database.js';

/** ¿El usuario tiene una membresía activa de un plan interno de plataforma? */
export async function isPlatformMember(userId: string | null | undefined): Promise<boolean> {
    if (!userId) return false;
    const row = await queryOne<{ x: number }>(
        `SELECT 1 AS x FROM memberships m
            JOIN plans p ON p.id = m.plan_id
          WHERE m.user_id = $1 AND m.status = 'active' AND p.is_internal = true
          LIMIT 1`,
        [userId]
    );
    return !!row;
}

/** Igual que isPlatformMember pero resolviendo por email (para senders que solo tienen el correo). */
export async function isPlatformMemberByEmail(email: string | null | undefined): Promise<boolean> {
    if (!email) return false;
    const row = await queryOne<{ x: number }>(
        `SELECT 1 AS x FROM users u
            JOIN memberships m ON m.user_id = u.id
            JOIN plans p ON p.id = m.plan_id
          WHERE lower(u.email) = lower($1) AND m.status = 'active' AND p.is_internal = true
          LIMIT 1`,
        [email]
    );
    return !!row;
}

/** Igual pero por teléfono (para los senders de WhatsApp, que solo tienen el número). */
export async function isPlatformMemberByPhone(phone: string | null | undefined): Promise<boolean> {
    if (!phone) return false;
    // Comparar por los últimos 10 dígitos para tolerar prefijos/formatos (+52, 521, espacios…).
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) return false;
    const last10 = digits.slice(-10);
    const row = await queryOne<{ x: number }>(
        `SELECT 1 AS x FROM users u
            JOIN memberships m ON m.user_id = u.id
            JOIN plans p ON p.id = m.plan_id
          WHERE right(regexp_replace(u.phone, '\\D', '', 'g'), 10) = $1
            AND m.status = 'active' AND p.is_internal = true
          LIMIT 1`,
        [last10]
    );
    return !!row;
}

/** ¿La membresía (por id) es de un plan interno de plataforma? */
export async function isPlatformMembershipId(membershipId: string | null | undefined): Promise<boolean> {
    if (!membershipId) return false;
    const row = await queryOne<{ x: number }>(
        `SELECT 1 AS x FROM memberships m
            JOIN plans p ON p.id = m.plan_id
          WHERE m.id = $1 AND p.is_internal = true
          LIMIT 1`,
        [membershipId]
    );
    return !!row;
}
