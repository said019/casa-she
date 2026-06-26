import { query, queryOne, pool } from '../config/database.js';
import { sendMembershipActivatedEmail } from '../services/email.js';
import { sendMembershipActivatedNotice } from '../lib/whatsapp.js';
import { awardPaymentLoyaltyPoints, awardReferralBonus } from '../lib/loyalty.js';
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
