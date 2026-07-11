import { query, queryOne, pool } from '../config/database.js';
import { sendMembershipActivatedEmail } from '../services/email.js';
import { sendMembershipActivatedNotice } from '../lib/whatsapp.js';
import { awardPaymentLoyaltyPoints, awardReferralBonus, reversePaymentLoyaltyPoints, reverseReferralBonus } from '../lib/loyalty.js';
import { notifyMembershipRenewed, notifyPointsEarnedExternal } from '../lib/notifications.js';

export interface FinalizeOpts { provider: string; paymentRef: string | null; }

/** Activa una orden pagada: crea membresía, marca la orden aprobada, puntos/referidos, notifica.
 *  Idempotente: si la orden ya está 'approved', no hace nada. Provider-agnóstico. */
export async function finalizePaidOrder(orderId: string, opts: FinalizeOpts): Promise<void> {
    const order = await queryOne<any>(`
        SELECT o.*, p.duration_days, p.class_limit, p.reformer_credits, p.multi_credits, p.name as plan_name,
               u.display_name as user_name, u.email as user_email, u.phone as user_phone
        FROM orders o
        JOIN plans p ON o.plan_id = p.id
        JOIN users u ON o.user_id = u.id
        WHERE o.id = $1
    `, [orderId]);
    if (!order) { console.warn('finalizePaidOrder: order not found', orderId); return; }
    if (order.status === 'approved') return;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Idempotencia bajo lock: el guard `order.status === 'approved'` de arriba se lee FUERA
        // de la tx y NO protege contra dos ejecuciones concurrentes (webhook de MP + POST
        // /orders/:id/sync-mp manual, o reintentos de MP). Sin esto, ambas pasan el guard y crean
        // 2 membresías, 2 payments y otorgan puntos dos veces = doble cargo real. Se re-lee el
        // estado con FOR UPDATE dentro de la tx y se aborta si ya quedó aprobada.
        const lockRes = await client.query(`SELECT status FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
        if (!lockRes.rows[0]) {
            await client.query('ROLLBACK');
            console.warn('finalizePaidOrder: order desapareció bajo lock', orderId);
            return;
        }
        if (lockRes.rows[0].status === 'approved') {
            await client.query('ROLLBACK');
            return;
        }

        const start = new Date();
        const end = new Date(start);
        end.setDate(end.getDate() + order.duration_days);

        const membershipResult = await client.query(`
            INSERT INTO memberships (
                user_id, plan_id, status, classes_remaining, reformer_remaining, multi_remaining,
                start_date, end_date, activated_at, payment_method, order_id
            ) VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, NOW(), 'card', $8)
            RETURNING id
        `, [order.user_id, order.plan_id, order.class_limit ?? null, order.reformer_credits ?? null, order.multi_credits ?? null, start, end, orderId]);
        const membershipId = membershipResult.rows[0].id;

        await client.query(`
            UPDATE orders SET status = 'approved', membership_id = $1, approved_at = NOW(), paid_at = NOW(),
                stripe_payment_intent_id = $2, payment_provider = $3, updated_at = NOW()
            WHERE id = $4
        `, [membershipId, opts.paymentRef, opts.provider, orderId]);

        const payResult = await client.query(`
            INSERT INTO payments (user_id, membership_id, amount, currency, payment_method, status, provider, reference_id)
            VALUES ($1, $2, $3, $4, 'card', 'completed', $5, $6) RETURNING id
        `, [order.user_id, membershipId, order.total_amount, order.currency || 'MXN', opts.provider, opts.paymentRef]);

        let purchasePointsAwarded = 0;
        if (payResult.rows[0]?.id) {
            purchasePointsAwarded = await awardPaymentLoyaltyPoints({
                db: client, userId: order.user_id, paymentId: payResult.rows[0].id,
                amount: Number(order.total_amount), paymentMethod: 'card', classLimit: order.class_limit,
            }).catch((e: any) => { console.error('Loyalty points (purchase) error:', e); return 0; });
        }

        let referralPointsAwarded = 0;
        let referralOwnerIdAwarded: string | null = null;
        if (order.discount_code_id) {
            try {
                const refRow = await client.query(
                    `SELECT referral_owner_id FROM discount_codes WHERE id = $1 AND is_referral = true
                       AND referral_owner_id IS NOT NULL AND referral_owner_id <> $2`,
                    [order.discount_code_id, order.user_id]);
                const ownerId = refRow.rows[0]?.referral_owner_id;
                if (ownerId) {
                    referralOwnerIdAwarded = ownerId;
                    referralPointsAwarded = await awardReferralBonus(ownerId, order.id, order.order_number, client)
                        .catch((e: any) => { console.error('Referral bonus error:', e); return 0; });
                }
            } catch (e: any) { console.error('Referral lookup error (non-blocking):', e.message); }
        }

        await client.query('COMMIT');

        if (order.user_email) {
            sendMembershipActivatedEmail({
                to: order.user_email, clientName: order.user_name || 'Cliente', planName: order.plan_name,
                classesIncluded: order.class_limit || null,
                startDate: start.toISOString().split('T')[0], endDate: end.toISOString().split('T')[0],
            }).catch((e: any) => console.error('Email error:', e));
        }
        if (order.user_phone) {
            const fmtEnd = end.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
            sendMembershipActivatedNotice(order.user_phone, order.user_name || 'Cliente', order.plan_name, order.class_limit || null, fmtEnd)
                .catch((e: any) => console.error('WhatsApp error:', e));
        }
        notifyMembershipRenewed(membershipId).catch((e: any) => console.error('Wallet error:', e));
        if (purchasePointsAwarded > 0) void notifyPointsEarnedExternal(order.user_id, purchasePointsAwarded, 'package_purchase');
        if (referralPointsAwarded > 0 && referralOwnerIdAwarded) void notifyPointsEarnedExternal(referralOwnerIdAwarded, referralPointsAwarded, 'referral');

        console.log(`finalizePaidOrder(${opts.provider}) ${opts.paymentRef} → order ${orderId} → membership ${membershipId}`);
    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('finalizePaidOrder transaction error:', err.message);
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Reversa un pago ya completado (reembolso total o contracargo perdido confirmado por el
 * proveedor): marca el pago 'refunded', cancela la membresía activa asociada, y revierte los
 * puntos de lealtad y el bono de referido otorgados por ese pago/orden. Provider-agnóstico:
 * Stripe y MercadoPago guardan su referencia de pago en payments.reference_id (ver
 * finalizePaidOrder arriba — opts.paymentRef se inserta ahí para ambos). Contraparte
 * simétrica de finalizePaidOrder — misma transacción real (BEGIN/COMMIT/ROLLBACK) para que
 * un fallo a mitad de camino no deje el pago marcado 'refunded' sin revertir membresía/puntos.
 * Devuelve false si no hay un pago 'completed' con esa referencia (ya revertido, o no existe)
 * — llamar es un no-op seguro/idempotente.
 */
export async function reversePaymentByReference(reference: string, reasonLabel: string): Promise<boolean> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Localiza el membership_id SIN lock, solo para saber qué fila de memberships bloquear
        // PRIMERO. orders.ts (/:id/reject) y memberships.ts (/:id/cancel) bloquean memberships
        // ANTES que payments; bloquear en el orden inverso aquí (como en un intento anterior de
        // este fix) causaba un deadlock AB-BA real si un reembolso de webhook llegaba justo
        // cuando un admin rechazaba la orden o cancelaba la membresía manualmente en el panel.
        const peek = await client.query<{ membership_id: string | null }>(
            `SELECT membership_id FROM payments WHERE reference_id = $1 AND status = 'completed'`,
            [reference]
        );
        const peekedMembershipId = peek.rows[0]?.membership_id ?? null;
        if (peekedMembershipId) {
            await client.query(`SELECT id FROM memberships WHERE id = $1 FOR UPDATE`, [peekedMembershipId]);
        }

        const paymentRes = await client.query<{ id: string; user_id: string; membership_id: string | null }>(
            `SELECT id, user_id, membership_id FROM payments WHERE reference_id = $1 AND status = 'completed' FOR UPDATE`,
            [reference]
        );
        const payment = paymentRes.rows[0];
        if (!payment) {
            await client.query('ROLLBACK');
            return false;
        }

        // Invariante de la que depende el orden de locks de arriba: payments.membership_id se
        // fija UNA sola vez en el INSERT de finalizePaidOrder y ninguna ruta lo actualiza después
        // (solo su status transiciona completed→refunded). Por eso peekedMembershipId (leído sin
        // lock) siempre coincide con payment.membership_id (leído con FOR UPDATE) — bloquear
        // memberships antes que payments arriba es seguro. Si en el futuro algún flujo llegara a
        // reasignar membership_id en un payment ya existente, este assert lo haría explícito en
        // vez de fallar en silencio con un orden de locks incorrecto.
        if (payment.membership_id !== peekedMembershipId) {
            throw new Error(
                `reversePaymentByReference: membership_id cambió entre peek y lock (${peekedMembershipId} → ${payment.membership_id}) — invariante rota, revisar orden de locks`
            );
        }

        await client.query(`UPDATE payments SET status = 'refunded' WHERE id = $1`, [payment.id]);

        // El bono de referido se busca vía memberships.order_id con una lectura simple, SIN
        // depender de que el UPDATE de cancelación de abajo afecte una fila: si la membresía ya
        // expiró o fue cancelada por otra vía antes de que llegue este reembolso/contracargo
        // (plausible — una disputa bancaria puede tardar semanas en resolverse), el bono del
        // referidor de todos modos debe revertirse.
        let orderRow: { id: string; discount_code_id: string | null; user_id: string } | null = null;
        if (payment.membership_id) {
            const memRow = await client.query<{ order_id: string | null }>(
                `SELECT order_id FROM memberships WHERE id = $1`,
                [payment.membership_id]
            );
            const orderId = memRow.rows[0]?.order_id;
            if (orderId) {
                const oRes = await client.query<{ id: string; discount_code_id: string | null; user_id: string }>(
                    `SELECT id, discount_code_id, user_id FROM orders WHERE id = $1`,
                    [orderId]
                );
                orderRow = oRes.rows[0] ?? null;
            }
            await client.query(
                `UPDATE memberships SET status = 'cancelled', cancelled_at = NOW(),
                    cancellation_reason = $2, updated_at = NOW()
                 WHERE id = $1 AND status = 'active'`,
                [payment.membership_id, reasonLabel]
            );
        }

        await reversePaymentLoyaltyPoints({ db: client, userId: payment.user_id, paymentId: payment.id });

        if (orderRow?.discount_code_id) {
            const refRow = await client.query<{ referral_owner_id: string }>(
                `SELECT referral_owner_id FROM discount_codes WHERE id = $1 AND is_referral = true
                   AND referral_owner_id IS NOT NULL AND referral_owner_id <> $2`,
                [orderRow.discount_code_id, orderRow.user_id]
            );
            const ownerId = refRow.rows[0]?.referral_owner_id;
            if (ownerId) {
                await reverseReferralBonus({ db: client, referrerUserId: ownerId, orderId: orderRow.id });
            }
        }

        await client.query('COMMIT');
        return true;
    } catch (err: any) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(`reversePaymentByReference(${reference}) transaction error:`, err.message);
        throw err;
    } finally {
        client.release();
    }
}
