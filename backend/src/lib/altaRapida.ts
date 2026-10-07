/**
 * Alta rápida: recepción registra a una alumna nueva, le vende (o no) un paquete, la inscribe
 * a la clase y le deja un link de acceso — TODO en una sola transacción. Si cualquier paso
 * falla (duplicado, plan inválido, clase llena, sin créditos…) no queda nada: ni la clienta,
 * ni la membresía, ni el pago, ni el bono, ni el link.
 */
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import type { Pool } from 'pg';
import { crearLinkAcceso } from './accessLinks.js';
import { asignarMembresiaEnTx } from './asignarMembresia.js';
import { normalizeMxPhone } from './guestUser.js';
import {
    evaluarInscripcion, inscribirEnClase, ClaseNoEncontradaError, SinCreditosAlInscribirError,
} from './inscripcion.js';
import { awardWelcomeBonus } from './loyalty.js';
import { MembershipDailyLimitError } from './membershipDailyLimit.js';
import { toDbClient } from './membershipSelection.js';
import { resolveManualPriceAdjustment } from './manual-price-adjustment.js';
import { cdmxToday } from './schedule.js';

export const AltaRapidaSchema = z.object({
    nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(80, 'El nombre es muy largo'),
    email: z.string().trim().toLowerCase().email('Correo inválido').max(255),
    telefono: z.string().trim().refine(
        (t) => normalizeMxPhone(t).length === 10,
        'El WhatsApp debe tener 10 dígitos (o con lada)',
    ),
    classId: z.string().uuid(),
    planId: z.string().uuid().optional(),
    cortesia: z.boolean().optional(),
    metodoPago: z.enum(['cash', 'transfer', 'card']).optional(),
}).superRefine((d, ctx) => {
    if (d.planId && d.cortesia) {
        ctx.addIssue({ code: 'custom', path: ['cortesia'], message: 'Elige un paquete o cortesía, no ambos' });
    }
    if (d.planId && !d.metodoPago) {
        ctx.addIssue({ code: 'custom', path: ['metodoPago'], message: 'La forma de pago es obligatoria con un paquete' });
    }
});
export type AltaRapidaInput = z.infer<typeof AltaRapidaSchema>;

/** Error de negocio con el status y cuerpo que debe recibir quien llamó. */
export class AltaRapidaError extends Error {
    constructor(public status: number, public body: Record<string, unknown>) {
        super(String(body.error ?? body.code ?? 'alta rápida'));
    }
}

export interface AltaRapidaResultado {
    user: any;
    membership: any | null;
    booking: any;
    acceso: { url: string; venceEl: string };
    puntosBienvenida: number;
    puntosCompra: number;
}

const COLUMNAS_USUARIO = `id, email, phone, display_name, photo_url, role, accepts_communications,
    date_of_birth, receive_reminders, receive_promotions, receive_weekly_summary, created_at, updated_at`;

export async function altaRapida(
    pool: Pool,
    input: AltaRapidaInput,
    actor: { userId: string },
): Promise<AltaRapidaResultado> {
    const email = input.email.toLowerCase();
    const telefono = normalizeMxPhone(input.telefono);
    const cortesia = input.cortesia === true;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Serializa altas simultáneas del mismo correo/teléfono (doble clic, dos recepciones).
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`alta-rapida:${email}`]);
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`alta-rapida:${telefono}`]);

        // 1. Duplicados: correo exacto (minúsculas) o últimos 10 dígitos del teléfono.
        const dup = (await client.query(
            `SELECT id, display_name, lower(email) = $1 AS por_email
               FROM users
              WHERE lower(email) = $1
                 OR right(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 10) = $2
              ORDER BY (lower(email) = $1) DESC
              LIMIT 1`,
            [email, telefono],
        )).rows[0];
        if (dup) {
            throw new AltaRapidaError(409, {
                error: 'Esta alumna ya está registrada',
                code: 'YA_EXISTE',
                userId: dup.id,
                nombre: dup.display_name,
                coincidencia: dup.por_email ? 'email' : 'telefono',
            });
        }

        // La clase y el plan se validan antes de escribir nada.
        const clase = (await client.query(`SELECT id FROM classes WHERE id = $1`, [input.classId])).rows[0];
        if (!clase) throw new AltaRapidaError(404, { error: 'Clase no encontrada' });
        let plan: any = null;
        if (input.planId) {
            plan = (await client.query(`SELECT * FROM plans WHERE id = $1`, [input.planId])).rows[0];
            if (!plan) throw new AltaRapidaError(404, { error: 'Plan no encontrado' });
            if (plan.is_active === false) throw new AltaRapidaError(400, { error: 'Ese paquete ya no está disponible' });
        }

        // 2. Clienta: contraseña aleatoria que nadie conoce (entra con el link de acceso).
        const passwordHash = await bcrypt.hash(randomBytes(32).toString('base64url'), 12);
        const user = (await client.query(
            `INSERT INTO users (email, password_hash, display_name, phone, role, temp_password)
             VALUES ($1, $2, $3, $4, 'client', false)
             RETURNING ${COLUMNAS_USUARIO}`,
            [email, passwordHash, input.nombre.trim(), telefono],
        )).rows[0];

        const puntosBienvenida = await awardWelcomeBonus(user.id, toDbClient(client));

        // 3. Paquete (misma lógica que POST /memberships/assign).
        let membership: any = null;
        let puntosCompra = 0;
        if (plan) {
            const ajuste = resolveManualPriceAdjustment({ listPrice: Number(plan.price) });
            if (!ajuste.ok) throw new AltaRapidaError(400, { error: ajuste.error });
            const asignada = await asignarMembresiaEnTx(client, {
                userId: user.id, plan, startDate: cdmxToday(), status: 'active',
                paymentMethod: input.metodoPago!, isGratis: false, gratisReason: '',
                manualAdjustment: ajuste, actorUserId: actor.userId,
            });
            membership = asignada.membership;
            puntosCompra = asignada.purchasePointsAwarded;
        }

        // 4. Inscripción: la misma regla que muestra el buscador y cobra admin-book.
        const evaluacion = await evaluarInscripcion(toDbClient(client), {
            userId: user.id, classId: input.classId, cortesia, bloquear: true,
        });
        if (evaluacion.estado !== 'puede') {
            throw new AltaRapidaError(evaluacion.estado === 'limite_diario' ? 409 : 400, {
                error: evaluacion.mensaje, code: evaluacion.code ?? evaluacion.estado.toUpperCase(),
            });
        }
        const booking = await inscribirEnClase(toDbClient(client), {
            userId: user.id, classId: input.classId, membresiaId: evaluacion.membresia?.id ?? null,
            cortesia, reservadaPor: actor.userId,
        });

        // 5. Link de acceso.
        const acceso = await crearLinkAcceso(client, user.id, actor.userId);

        await client.query('COMMIT');
        return { user, membership, booking, acceso, puntosBienvenida, puntosCompra };
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch { /* ya cerrada */ }
        if (e instanceof ClaseNoEncontradaError) throw new AltaRapidaError(404, { error: e.message });
        if (e instanceof SinCreditosAlInscribirError) throw new AltaRapidaError(400, { error: e.message });
        if (e instanceof MembershipDailyLimitError) throw new AltaRapidaError(e.status, { error: e.message, code: e.code });
        // Carrera residual: el correo se registró entre el chequeo y el INSERT (UNIQUE).
        if ((e as any)?.code === '23505' && String((e as any).constraint || '').includes('email')) {
            throw new AltaRapidaError(409, { error: 'Esta alumna ya está registrada', code: 'YA_EXISTE', coincidencia: 'email' });
        }
        throw e;
    } finally {
        client.release();
    }
}
