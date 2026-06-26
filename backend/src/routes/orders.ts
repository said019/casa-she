import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne, pool } from '../config/database.js';
import { authenticate, requireRole, optionalAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { applyDiscountToOrder, resolveDiscountForOrder } from './discount-codes.js';
import { sendMembershipActivatedEmail, sendOrderRejectedEmail } from '../services/email.js';
import { sendMembershipActivatedNotice, sendWhatsAppMessage } from '../lib/whatsapp.js';
import { awardPaymentLoyaltyPoints, awardReferralBonus, consumeSampleClassDiscount, canBuySamplePlan } from '../lib/loyalty.js';
import { toDbClient } from '../lib/membershipSelection.js';
import { notifyMembershipRenewed, notifyPointsEarnedExternal } from '../lib/notifications.js';
import { createOrGetStripeCustomer, createCheckoutSession, buildLineItem } from '../lib/stripe.js';

const router = Router();

// ============================================
// SCHEMAS
// ============================================

const CreateOrderSchema = z.object({
    plan_id: z.string().uuid(),
    payment_method: z.enum(['bank_transfer', 'card', 'transfer', 'cash']),
    notes: z.string().max(500).optional(),
    discount_code_id: z.string().uuid().optional(),
    discount_amount: z.number().min(0).optional(),
});

const UploadProofSchema = z.object({
    file_url: z.string().url().optional(),
    file_name: z.string().optional(),
    file_type: z.string().optional(),
    transfer_reference: z.string().max(100).optional(),
    transfer_date: z.string().optional(),
    notes: z.string().max(500).optional(),
});

const ApproveOrderSchema = z.object({
    admin_notes: z.string().max(500).optional(),
    adminNotes: z.string().max(500).optional(), // Legacy support
    startDate: z.string().optional(), // ISO date para inicio de membresía
});

const RejectOrderSchema = z.object({
    rejectionReason: z.string().max(500).optional(),
    admin_notes: z.string().max(500).optional(),
    adminNotes: z.string().max(500).optional(), // Legacy support
});

// ============================================
// GET /api/orders/bank-info - Public bank info
// ============================================
router.get('/bank-info', async (req: Request, res: Response) => {
    try {
        const setting = await queryOne(
            `SELECT value FROM system_settings WHERE key = 'bank_info'`
        );

        if (!setting) {
            return res.status(404).json({ error: 'Información bancaria no configurada' });
        }

        res.json(setting.value);
    } catch (error) {
        console.error('Get bank info error:', error);
        res.status(500).json({ error: 'Error al obtener información bancaria' });
    }
});

// ============================================
// GET /api/orders/stats - Admin dashboard stats
// ============================================
router.get('/stats', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const stats = await queryOne(`SELECT * FROM orders_dashboard_stats`);
        res.json(stats);
    } catch (error) {
        console.error('Get orders stats error:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

// ============================================
// GET /api/orders/pending - Admin pending orders
// ============================================
router.get('/pending', authenticate, requirePermission('caja'), async (req: Request, res: Response) => {
    try {
        const orders = await query(`
            SELECT 
                o.id,
                o.order_number,
                o.status,
                o.payment_method,
                o.subtotal,
                o.tax_amount as tax,
                o.total_amount as total,
                o.currency,
                NULL::text as notes,
                o.created_at,
                o.paid_at,
                o.approved_at,
                o.rejected_at,
                o.rejection_reason,
                o.expires_at,
                u.id as user_id,
                u.display_name as user_name,
                u.email as user_email,
                u.phone as user_phone,
                p.id as plan_id,
                p.name as plan_name,
                p.class_limit as plan_credits,
                p.duration_days as plan_duration_days
            FROM orders o
            JOIN users u ON o.user_id = u.id
            JOIN plans p ON o.plan_id = p.id
            WHERE o.status IN ('pending_payment', 'pending_verification')
            ORDER BY 
                CASE WHEN o.status = 'pending_verification' THEN 0 ELSE 1 END,
                o.created_at ASC
        `);

        // For each order, get its payment proofs
        const ordersWithProofs = await Promise.all(orders.map(async (order: any) => {
            const proofs = await query(`
                SELECT
                    id,
                    file_url,
                    file_name,
                    mime_type as file_type,
                    bank_reference as transfer_reference,
                    notes,
                    uploaded_at
                FROM payment_proofs
                WHERE order_id = $1
                ORDER BY uploaded_at DESC
            `, [order.id]);
            
            return { ...order, payment_proofs: proofs };
        }));

        res.json(ordersWithProofs);
    } catch (error) {
        console.error('Get pending orders error:', error);
        res.status(500).json({ error: 'Error al obtener órdenes pendientes' });
    }
});

// ============================================
// GET /api/orders/my-orders - Client's orders
// ============================================
router.get('/my-orders', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;

        const orders = await query(`
            SELECT 
                o.id,
                o.order_number,
                o.status,
                o.payment_method,
                o.subtotal,
                o.tax_amount as tax,
                o.total_amount as total,
                o.created_at,
                o.approved_at,
                o.rejected_at,
                o.rejection_reason,
                o.expires_at,
                p.name as plan_name,
                p.class_limit as plan_classes,
                p.duration_days as plan_duration,
                pp.file_url as proof_url,
                pp.status as proof_status,
                pp.uploaded_at as proof_uploaded_at
            FROM orders o
            JOIN plans p ON o.plan_id = p.id
            LEFT JOIN LATERAL (
                SELECT * FROM payment_proofs 
                WHERE order_id = o.id 
                ORDER BY uploaded_at DESC 
                LIMIT 1
            ) pp ON true
            WHERE o.user_id = $1
            ORDER BY o.created_at DESC
        `, [userId]);

        res.json(orders);
    } catch (error) {
        console.error('Get my orders error:', error);
        res.status(500).json({ error: 'Error al obtener tus órdenes' });
    }
});

// ============================================
// GET /api/orders/:id - Order detail
// ============================================
router.get('/:id', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;
        const role = req.user?.role;

        const order = await queryOne(`
            SELECT 
                o.id,
                o.order_number,
                o.status,
                o.payment_method,
                o.subtotal,
                o.tax_amount as tax,
                o.total_amount as total,
                o.currency,
                o.customer_notes as notes,
                o.admin_notes,
                o.created_at,
                o.paid_at,
                o.approved_at,
                o.rejected_at,
                o.rejection_reason,
                o.expires_at,
                u.id as user_id,
                u.display_name as user_name,
                u.email as user_email,
                u.phone as user_phone,
                p.id as plan_id,
                p.name as plan_name,
                p.class_limit as plan_credits,
                p.duration_days as plan_duration_days
            FROM orders o
            JOIN users u ON o.user_id = u.id
            JOIN plans p ON o.plan_id = p.id
            WHERE o.id = $1
        `, [id]);

        if (!order) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        // Verify ownership or admin
        if (role !== 'admin' && role !== 'super_admin' && order.user_id !== userId) {
            return res.status(403).json({ error: 'No autorizado' });
        }

        // Get all proofs for this order
        const proofs = await query(`
            SELECT
                id,
                file_url,
                file_name,
                mime_type as file_type,
                bank_reference as transfer_reference,
                notes,
                uploaded_at
            FROM payment_proofs
            WHERE order_id = $1
            ORDER BY uploaded_at DESC
        `, [id]);

        res.json({ ...order, payment_proofs: proofs });
    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({ error: 'Error al obtener orden' });
    }
});

// ============================================
// POST /api/orders - Create new order
// ============================================
router.post('/', authenticate, async (req: Request, res: Response) => {
    try {
        const validation = CreateOrderSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: 'Datos inválidos',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const { plan_id, payment_method, notes, discount_code_id } = validation.data;
        const userId = req.user?.userId;

        // Get plan
        const plan = await queryOne(
            `SELECT * FROM plans WHERE id = $1 AND is_active = true`,
            [plan_id]
        );

        if (!plan) {
            return res.status(404).json({ error: 'Plan no encontrado o no disponible' });
        }

        // Clase Muestra is for new clients only: block if the user already
        // holds an active package membership (class_limit > 1). Read-only
        // input gate (no lock): the only racy abuse — double-submitting two
        // sample orders — is already stopped by the pending-order 409 below,
        // and the package-discount path is guarded inside its own transaction.
        if (plan.package_type === 'sample') {
            const allowed = await canBuySamplePlan({
                db: toDbClient(query),
                userId: userId as string,
            });
            if (!allowed) {
                return res.status(409).json({
                    error: 'La Clase Muestra es solo para nuevas clientas. Ya cuentas con un paquete activo.'
                });
            }
        }

        const facilityId: string | null = req.body.facility_id || null;
        if (plan.requires_studio_selection) {
            if (!facilityId) {
                return res.status(422).json({ error: 'Este paquete individual requiere elegir un estudio.' });
            }
            const fac = await queryOne(`SELECT id FROM facilities WHERE id = $1 AND is_active = true`, [facilityId]);
            if (!fac) {
                return res.status(422).json({ error: 'El estudio seleccionado no es válido.' });
            }
        }

        // Calculate base totals
        const subtotal = parseFloat(plan.price);
        const taxAmount = 0;
        // Descuento SERVER-AUTHORITATIVE: se recalcula desde el código (se IGNORA
        // cualquier monto que mande el cliente). Antes se confiaba en discount_amount
        // del body → un cliente podía mandar discount_amount = subtotal y llevarse el
        // paquete gratis. Si el código es inválido o no aplica, se rechaza la orden.
        let appliedDiscount = 0;
        if (discount_code_id) {
            const dres = await resolveDiscountForOrder({
                codeId: discount_code_id,
                planId: plan_id,
                subtotal,
                userId: userId as string,
            });
            if (!dres.ok) {
                return res.status(400).json({ error: dres.error });
            }
            appliedDiscount = dres.discountAmount;
        }

        // Check for existing pending order for same plan
        const existingOrder = await queryOne(`
            SELECT id, order_number FROM orders
            WHERE user_id = $1 AND plan_id = $2
            AND status IN ('pending_payment', 'pending_verification')
        `, [userId, plan_id]);

        if (existingOrder) {
            return res.status(409).json({
                error: 'Ya tienes una orden pendiente para este plan',
                existingOrderId: existingOrder.id,
                existingOrderNumber: existingOrder.order_number
            });
        }

        // === FOUNDER 10% discount on FIRST package — atomic flag claim ===
        const dbClient = await pool.connect();
        let founderDiscount = 0;
        let order: any;
        try {
            await dbClient.query('BEGIN');
            const founderRow = await dbClient.query(
                `SELECT is_founder, founder_first_package_used FROM users WHERE id = $1 FOR UPDATE`,
                [userId]
            );
            const fr = founderRow.rows[0];
            if (fr?.is_founder && !fr.founder_first_package_used) {
                founderDiscount = Math.round((subtotal - appliedDiscount) * 0.10 * 100) / 100;
                await dbClient.query(
                    `UPDATE users SET founder_first_package_used = true, founder_first_used_at = NOW() WHERE id = $1`,
                    [userId]
                );
                await dbClient.query(
                    `INSERT INTO founder_audit (user_id, action, metadata)
                     VALUES ($1, 'discount_used', $2::jsonb)`,
                    [userId, JSON.stringify({ subtotal, applied_discount_code: appliedDiscount, founder_discount: founderDiscount, plan_id })]
                );
            }

            // === SAMPLE-CLASS ($99 "Clase Muestra") credit ===
            // If the user has an approved sample order within 30 days and the
            // plan being bought is a real package, deduct a flat $99 (once).
            const subtotalAfterDiscounts = Math.max(subtotal - appliedDiscount - founderDiscount, 0);
            const sampleCredit = await consumeSampleClassDiscount({
                db: dbClient,
                userId: userId as string,
                planClassLimit: plan.class_limit ?? null,
                subtotalAfterOtherDiscounts: subtotalAfterDiscounts,
            });
            const sampleDiscount = sampleCredit.discountAmount;

            const baseAmount = Math.max(subtotal - appliedDiscount - founderDiscount - sampleDiscount, 0);
            // SIN recargo por tarjeta: el cliente paga exactamente el precio del paquete
            // (menos descuentos). Todos los métodos de pago cobran lo mismo. Se conserva
            // card_fee_amount=0 por compatibilidad de esquema/reportes.
            const cardFee = 0;
            const totalAmount = baseAmount;
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 48);
            const dbPaymentMethod = payment_method === 'bank_transfer' ? 'transfer' : payment_method;

            // Total discount stored: code discount + founder + sample credit
            const totalDiscountAmount = (appliedDiscount + founderDiscount + sampleDiscount) || null;

            const orderResult = await dbClient.query(`
                INSERT INTO orders (
                    user_id, plan_id, subtotal, tax_rate, tax_amount,
                    total_amount, currency, payment_method, customer_notes, expires_at,
                    discount_code_id, discount_amount, card_fee_amount, facility_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                RETURNING *
            `, [
                userId, plan_id, subtotal, 0, taxAmount, totalAmount,
                plan.currency || 'MXN', dbPaymentMethod, notes || null,
                (dbPaymentMethod === 'transfer') ? expiresAt : null,
                discount_code_id || null, totalDiscountAmount, cardFee,
                plan.requires_studio_selection ? facilityId : null,
            ]);
            order = orderResult.rows[0];

            await dbClient.query('COMMIT');
        } catch (txErr) {
            await dbClient.query('ROLLBACK');
            throw txErr;
        } finally {
            dbClient.release();
        }

        // Apply discount code (increment usage counter)
        if (discount_code_id && appliedDiscount > 0) {
            try {
                await applyDiscountToOrder(discount_code_id, order.id, appliedDiscount);
            } catch (discountError) {
                console.error('Error applying discount to order:', discountError);
                // Order still created, discount just not tracked
            }
        }

        // Stripe Hosted Checkout para pago con tarjeta
        let checkout_url: string | null = null;
        if (payment_method === 'card') {
            if (!process.env.STRIPE_SECRET_KEY) {
                await query(`DELETE FROM orders WHERE id = $1`, [order.id]);
                return res.status(503).json({ error: 'Pago con tarjeta no disponible' });
            }
            const user = await queryOne<{ display_name: string; email: string }>(
                `SELECT display_name, email FROM users WHERE id = $1`, [userId]);
            try {
                const customerId = await createOrGetStripeCustomer({ userId: userId!, email: user?.email || '', name: user?.display_name });
                const co = await createCheckoutSession({
                    orderId: order.id, orderType: 'membership', customerId,
                    lineItems: [buildLineItem({ name: plan.name, amountMxn: Number(order.total_amount) })],
                    metadata: { orderNumber: order.order_number },
                    successUrl: `${process.env.FRONTEND_URL}/app/orders/${order.id}`,
                    cancelUrl: `${process.env.FRONTEND_URL}/app/orders/${order.id}`,
                });
                checkout_url = co.url;
                await query(
                    `UPDATE orders SET payment_provider='stripe', stripe_session_id=$1,
                            stripe_checkout_url=$2, stripe_payment_intent_id=$3, updated_at=NOW()
                     WHERE id=$4`,
                    [co.sessionId, co.url, co.paymentIntentId, order.id]);
            } catch (stripeErr: any) {
                console.error('Stripe checkout error:', stripeErr.message);
                await query(`DELETE FROM orders WHERE id = $1`, [order.id]);
                return res.status(502).json({ error: 'CARD_PAYMENT_FAILED' });
            }
        }

        // Return with plan info
        res.status(201).json({
            ...order,
            plan_name: plan.name,
            plan_classes: plan.class_limit,
            plan_duration: plan.duration_days,
            checkout_url,
        });
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ error: 'Error al crear orden' });
    }
});

// ============================================
// POST /api/orders/:id/pay-with-card - Generate MP Checkout for existing order
// ============================================
router.post('/:id/pay-with-card', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;

        const order = await queryOne<any>(`
            SELECT o.*, p.name as plan_name, u.email as user_email, u.display_name as user_name
            FROM orders o
            JOIN plans p ON o.plan_id = p.id
            JOIN users u ON o.user_id = u.id
            WHERE o.id = $1 AND o.user_id = $2
        `, [id, userId]);

        if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
        if (order.status !== 'pending_payment') {
            return res.status(400).json({ error: 'Esta orden ya no acepta pagos' });
        }

        if (!process.env.STRIPE_SECRET_KEY) {
            return res.status(503).json({ error: 'Pago con tarjeta no disponible' });
        }
        if (order.stripe_checkout_url) {
            return res.json({ checkout_url: order.stripe_checkout_url });
        }
        const customerId = await createOrGetStripeCustomer({ userId: userId!, email: order.user_email, name: order.user_name });
        const co = await createCheckoutSession({
            orderId: order.id, orderType: 'membership', customerId,
            lineItems: [buildLineItem({ name: order.plan_name, amountMxn: Number(order.total_amount) })],
            metadata: { orderNumber: order.order_number },
            successUrl: `${process.env.FRONTEND_URL}/app/orders/${order.id}`,
            cancelUrl: `${process.env.FRONTEND_URL}/app/orders/${order.id}`,
        });
        await query(
            `UPDATE orders SET payment_method='card', payment_provider='stripe', stripe_session_id=$1,
                    stripe_checkout_url=$2, stripe_payment_intent_id=$3, updated_at=NOW()
             WHERE id=$4`,
            [co.sessionId, co.url, co.paymentIntentId, order.id]);
        res.json({ checkout_url: co.url });
    } catch (err: any) {
        console.error('Pay with card error:', err.message);
        res.status(500).json({ error: 'No se pudo generar el checkout' });
    }
});

// ============================================
// POST /api/orders/:id/upload-proof - Upload payment proof
// ============================================
router.post('/:id/upload-proof', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;

        // Get form data - can be JSON or FormData
        const transfer_reference = req.body.transfer_reference || '';
        const transfer_date = req.body.transfer_date || null;
        const notes = req.body.notes || '';
        const file_data = req.body.file_data || null; // Base64 encoded file
        const file_name = req.body.file_name || 'comprobante';
        const file_type = req.body.file_type || 'image/jpeg';

        // Verify order ownership
        const order = await queryOne(
            `SELECT * FROM orders WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );

        if (!order) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        if (order.status !== 'pending_payment' && order.status !== 'pending_verification') {
            return res.status(400).json({ error: 'Esta orden ya no acepta comprobantes' });
        }

        // Store the file as base64 data URL or generate a proper file URL
        // For now, store the base64 directly (in production you'd upload to S3/cloud storage)
        let fileUrl = 'pending://upload';
        if (file_data) {
            // Store base64 data directly in DB (not ideal for production, but works)
            fileUrl = file_data;
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Create proof record
            const proof = await client.query(`
                INSERT INTO payment_proofs (
                    order_id, file_url, file_name, mime_type,
                    bank_reference, notes, status
                ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
                RETURNING id, file_name, mime_type as file_type, bank_reference as transfer_reference, notes, uploaded_at
            `, [
                id,
                fileUrl,
                file_name,
                file_type,
                transfer_reference,
                notes
            ]);

            // Update order status
            await client.query(`
                UPDATE orders SET status = 'pending_verification', updated_at = NOW()
                WHERE id = $1
            `, [id]);

            await client.query('COMMIT');

            res.status(201).json({
                message: 'Comprobante registrado exitosamente',
                proof: proof.rows[0],
                newStatus: 'pending_verification'
            });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Upload proof error:', error);
        res.status(500).json({ error: 'Error al subir comprobante' });
    }
});

// ============================================
// POST /api/orders/:id/approve - Admin approves order
// ============================================
router.post('/:id/approve', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const adminUserId = req.user?.userId;
        
        console.log('Approve order request:', { id, adminUserId, body: req.body });

        const validation = ApproveOrderSchema.safeParse(req.body);
        if (!validation.success) {
            console.log('Validation failed:', validation.error.flatten());
            return res.status(400).json({
                error: 'Datos inválidos',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const { adminNotes, admin_notes, startDate } = validation.data;
        const finalAdminNotes = admin_notes || adminNotes || null;

        // Get order with plan info
        const order = await queryOne(`
            SELECT o.*, p.duration_days, p.class_limit, p.reformer_credits, p.multi_credits, p.name as plan_name
            FROM orders o
            JOIN plans p ON o.plan_id = p.id
            WHERE o.id = $1
        `, [id]);
        
        console.log('Order found:', order ? { id: order.id, status: order.status, payment_method: order.payment_method } : null);

        if (!order) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        if (order.status !== 'pending_verification' && order.status !== 'pending_payment') {
            return res.status(400).json({ error: `No se puede aprobar una orden con estado: ${order.status}` });
        }

        // Card orders are settled exclusively by the Stripe webhook (checkout hospedado).
        // Approving them by hand would grant a membership without a confirmed
        // payment, so manual approval is forbidden for this method.
        if (order.payment_method === 'card') {
            return res.status(409).json({
                error: 'Las órdenes con tarjeta se aprueban automáticamente al confirmarse el pago en Stripe. No requieren aprobación manual.',
            });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Calculate membership dates
            const start = startDate ? new Date(startDate) : new Date();
            const end = new Date(start);
            end.setDate(end.getDate() + order.duration_days);

            // Map payment method to valid enum value
            // Create membership (bank_transfer now supported in enum)
            const policyRowOrder = await client.query(`SELECT value FROM system_settings WHERE key = 'cancellation_policy'`);
            const orderCancellationLimit = Number(policyRowOrder.rows[0]?.value?.cancellations_per_membership ?? 2);

            const membershipResult = await client.query(`
                INSERT INTO memberships (
                    user_id, plan_id, status, classes_remaining,
                    reformer_remaining, multi_remaining,
                    start_date, end_date, activated_by, activated_at,
                    payment_method, order_id, cancellation_limit
                ) VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11)
                RETURNING id
            `, [
                order.user_id,
                order.plan_id,
                order.class_limit ?? null,
                order.reformer_credits ?? null,
                order.multi_credits ?? null,
                start,
                end,
                adminUserId,
                order.payment_method,
                order.id,
                orderCancellationLimit,
            ]);

            const membershipId = membershipResult.rows[0].id;

            // Update order
            await client.query(`
                UPDATE orders SET 
                    status = 'approved',
                    membership_id = $1,
                    reviewed_by = $2,
                    reviewed_at = NOW(),
                    approved_at = NOW(),
                    paid_at = NOW(),
                    admin_notes = $3,
                    updated_at = NOW()
                WHERE id = $4
            `, [membershipId, adminUserId, finalAdminNotes, id]);

            // Update proof status
            await client.query(`
                UPDATE payment_proofs SET 
                    status = 'approved',
                    reviewed_by = $1,
                    reviewed_at = NOW()
                WHERE order_id = $2 AND status = 'pending'
            `, [adminUserId, id]);

            // Create payment record
            const payResult = await client.query(`
                INSERT INTO payments (
                    user_id, membership_id, amount, currency,
                    payment_method, status, processed_by
                ) VALUES ($1, $2, $3, $4, $5, 'completed', $6)
                RETURNING id
            `, [
                order.user_id,
                membershipId,
                order.total_amount,
                order.currency,
                order.payment_method,
                adminUserId
            ]);

            // Award loyalty points for payment (uses fixed-per-package table)
            let purchasePointsAwarded = 0;
            if (payResult.rows[0]?.id) {
                purchasePointsAwarded = await awardPaymentLoyaltyPoints({
                    db: client,
                    userId: order.user_id,
                    paymentId: payResult.rows[0].id,
                    amount: Number(order.total_amount),
                    paymentMethod: order.payment_method,
                    classLimit: order.class_limit,
                }).catch((e: any) => { console.error('Loyalty points (purchase) error:', e); return 0; });
            }

            // Referral bonus: if the order used a referral discount code, award the owner
            let referralPointsAwarded = 0;
            let referralOwnerIdAwarded: string | null = null;
            if (order.discount_code_id) {
                try {
                    const refRow = await client.query(
                        `SELECT referral_owner_id FROM discount_codes
                         WHERE id = $1 AND is_referral = true AND referral_owner_id IS NOT NULL
                           AND referral_owner_id <> $2`,
                        [order.discount_code_id, order.user_id]
                    );
                    const ownerId = refRow.rows[0]?.referral_owner_id;
                    if (ownerId) {
                        referralOwnerIdAwarded = ownerId;
                        referralPointsAwarded = await awardReferralBonus(ownerId, order.id, order.order_number, client)
                            .catch((e: any) => { console.error('Referral bonus error:', e); return 0; });
                    }
                } catch (e: any) {
                    console.error('Referral lookup error (non-blocking):', e.message);
                }
            }

            // Log admin action
            await client.query(`
                INSERT INTO admin_actions (
                    admin_user_id, action_type, entity_type, entity_id,
                    description, new_data
                ) VALUES ($1, 'approve_order', 'order', $2, $3, $4)
            `, [
                adminUserId,
                id,
                `Orden ${order.order_number} aprobada - ${order.plan_name}`,
                JSON.stringify({ membership_id: membershipId, start_date: start, end_date: end })
            ]);

            await client.query('COMMIT');

            // Get updated order
            const updatedOrder = await queryOne<any>(`
                SELECT o.*, p.name as plan_name, p.class_limit, p.duration_days,
                       u.display_name as user_name, u.email as user_email, u.phone as user_phone
                FROM orders o
                JOIN plans p ON o.plan_id = p.id
                JOIN users u ON o.user_id = u.id
                WHERE o.id = $1
            `, [id]);

            // Send notifications
            if (updatedOrder) {
                const startStr = start.toISOString().split('T')[0];
                const endStr = end.toISOString().split('T')[0];
                if (updatedOrder.user_email) {
                    sendMembershipActivatedEmail({
                        to: updatedOrder.user_email,
                        clientName: updatedOrder.user_name || 'Cliente',
                        planName: updatedOrder.plan_name,
                        classesIncluded: updatedOrder.class_limit || null,
                        startDate: startStr,
                        endDate: endStr,
                    }).catch(e => console.error('Email notification error:', e));
                }
                if (updatedOrder.user_phone) {
                    const fmtEnd = end.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
                    sendMembershipActivatedNotice(
                        updatedOrder.user_phone, updatedOrder.user_name || 'Cliente',
                        updatedOrder.plan_name, updatedOrder.class_limit || null, fmtEnd
                    ).catch(e => console.error('WhatsApp notification error:', e));
                }
                // Update Apple + Google Wallet passes
                notifyMembershipRenewed(membershipId).catch(e => console.error('Wallet notification error:', e));

                // Loyalty points notifications (after commit)
                if (purchasePointsAwarded > 0) {
                    void notifyPointsEarnedExternal(order.user_id, purchasePointsAwarded, 'package_purchase');
                }
                if (referralPointsAwarded > 0 && referralOwnerIdAwarded) {
                    void notifyPointsEarnedExternal(referralOwnerIdAwarded, referralPointsAwarded, 'referral');
                }
            }

            res.json({
                message: 'Orden aprobada exitosamente',
                order: updatedOrder,
                membershipId
            });
        } catch (err: any) {
            await client.query('ROLLBACK');
            console.error('Transaction error in approve:', err.message, err.detail || '');
            throw err;
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error('Approve order error:', error.message, error.detail || '', error.stack);
        res.status(500).json({ error: 'Error al aprobar orden', detail: error.message });
    }
});

// ============================================
// POST /api/orders/:id/reject - Admin rejects order
// ============================================
router.post('/:id/reject', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const adminUserId = req.user?.userId;

        const validation = RejectOrderSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: 'Datos inválidos',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const { rejectionReason, adminNotes, admin_notes } = validation.data;
        const notes = admin_notes || adminNotes || rejectionReason || '';

        // Get order
        const order = await queryOne(`SELECT * FROM orders WHERE id = $1`, [id]);

        if (!order) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        // Allow rejecting orders awaiting pago/comprobante (pending_payment),
        // las que ya subieron comprobante (pending_verification) o las ya
        // aprobadas (re-reject para revertir acceso). Solo se bloquean las que
        // ya están en estado terminal (rejected/cancelled/completed).
        const rejectableStatuses = ['pending_payment', 'pending_verification', 'approved'];
        if (!rejectableStatuses.includes(order.status)) {
            return res.status(400).json({
                error: `No se puede rechazar una orden con estado "${order.status}"`,
            });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Update order
            await client.query(`
                UPDATE orders SET 
                    status = 'rejected',
                    reviewed_by = $1,
                    reviewed_at = NOW(),
                    rejected_at = NOW(),
                    rejection_reason = $2,
                    admin_notes = $2,
                    updated_at = NOW()
                WHERE id = $3
            `, [adminUserId, notes, id]);

            // Update proof status
            await client.query(`
                UPDATE payment_proofs SET
                    status = 'rejected',
                    reviewed_by = $1,
                    rejection_reason = $2,
                    reviewed_at = NOW()
                WHERE order_id = $3 AND status = 'pending'
            `, [adminUserId, notes, id]);

            // Log admin action
            await client.query(`
                INSERT INTO admin_actions (
                    admin_user_id, action_type, entity_type, entity_id,
                    description, new_data
                ) VALUES ($1, 'reject_order', 'order', $2, $3, $4)
            `, [
                adminUserId,
                id,
                `Orden ${order.order_number} rechazada`,
                JSON.stringify({ rejection_reason: notes })
            ]);

            // If the order was already approved, revoke the granted membership
            // and reverse its payment so rejecting actually removes access.
            if (order.status === 'approved') {
                await client.query(`
                    UPDATE memberships SET
                        status = 'cancelled',
                        cancelled_at = NOW(),
                        cancellation_reason = $2,
                        updated_at = NOW()
                    WHERE order_id = $1 AND status = 'active'
                `, [id, `Orden rechazada: ${notes || 'sin motivo'}`]);

                await client.query(`
                    UPDATE payments SET
                        status = 'refunded'
                    WHERE membership_id IN (
                        SELECT id FROM memberships WHERE order_id = $1
                    ) AND status = 'completed'
                `, [id]);
            }

            // Founder discount rollback on reject (same as cancel)
            try {
                const founderApplied = await client.query(
                    `SELECT id FROM founder_audit
                     WHERE user_id = $1 AND action = 'discount_used'
                       AND (metadata->>'plan_id') = $2
                     ORDER BY created_at DESC LIMIT 1`,
                    [order.user_id, order.plan_id]
                );
                if ((founderApplied.rowCount ?? 0) > 0) {
                    await client.query(
                        `UPDATE users SET founder_first_package_used = false, founder_first_used_at = NULL
                         WHERE id = $1 AND is_founder = true`,
                        [order.user_id]
                    );
                    await client.query(
                        `INSERT INTO founder_audit (user_id, action, metadata)
                         VALUES ($1, 'discount_rolled_back', $2::jsonb)`,
                        [order.user_id, JSON.stringify({ order_id: id, reason: 'order_rejected' })]
                    );
                }
            } catch (e: any) {
                console.warn('Founder rollback on reject (non-blocking):', e.message);
            }

            // Sample-class ($99) credit rollback on reject: if this order
            // consumed the credit, restore the flag so it can be used again.
            try {
                if (Number(order.discount_amount) > 0) {
                    const used = await client.query(
                        `SELECT sample_class_discount_used FROM users WHERE id = $1 FOR UPDATE`,
                        [order.user_id]
                    );
                    if (used.rows[0]?.sample_class_discount_used) {
                        await client.query(
                            `UPDATE users SET sample_class_discount_used = false, sample_class_discount_used_at = NULL
                             WHERE id = $1`,
                            [order.user_id]
                        );
                        await client.query(
                            `INSERT INTO founder_audit (user_id, action, metadata)
                             VALUES ($1, 'sample_class_discount_rolled_back', $2::jsonb)`,
                            [order.user_id, JSON.stringify({ order_id: id, reason: 'order_rejected' })]
                        );
                    }
                }
            } catch (e: any) {
                console.warn('Sample-class rollback on reject (non-blocking):', e.message);
            }

            await client.query('COMMIT');

            // Get updated order + user info for notifications
            const updatedOrder = await queryOne(`SELECT * FROM orders_with_details WHERE id = $1`, [id]);
            const orderUser = await queryOne<{ display_name: string; email: string; phone: string }>(
                `SELECT display_name, email, phone FROM users WHERE id = $1`,
                [order.user_id]
            );
            const plan = await queryOne<{ name: string }>(
                `SELECT name FROM plans WHERE id = $1`,
                [order.plan_id]
            );

            // Send rejection notifications (fire and forget)
            if (orderUser) {
                const planName = plan?.name || 'tu plan';

                // Email
                sendOrderRejectedEmail({
                    to: orderUser.email,
                    clientName: orderUser.display_name,
                    orderNumber: order.order_number,
                    planName,
                    rejectionReason: notes || undefined,
                }).catch(err => console.error('Error sending rejection email:', err));

                // WhatsApp de orden rechazada DESACTIVADO (política 2026-06-23:
                // solo 3 mensajes por WhatsApp). El email se mantiene.
            }

            res.json({
                message: 'Orden rechazada',
                order: updatedOrder
            });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Reject order error:', error);
        res.status(500).json({ error: 'Error al rechazar orden' });
    }
});

// ============================================
// POST /api/orders/:id/cancel - Cancel order
// ============================================
router.post('/:id/cancel', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;
        const role = req.user?.role;

        const order = await queryOne(`SELECT * FROM orders WHERE id = $1`, [id]);

        if (!order) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        // Check ownership or admin
        if (role !== 'admin' && role !== 'super_admin' && order.user_id !== userId) {
            return res.status(403).json({ error: 'No autorizado' });
        }

        // Only allow cancellation of pending_payment orders (not pending_verification)
        // Admins can cancel any pending order
        if (role !== 'admin' && role !== 'super_admin') {
            // Clients can cancel orders that are still pending payment or
            // already submitted for verification (but not yet approved/rejected).
            if (order.status !== 'pending_payment' && order.status !== 'pending_verification') {
                return res.status(400).json({ error: 'Esta orden ya no puede ser cancelada' });
            }
        } else {
            // Admins can cancel pending_payment or pending_verification
            if (order.status !== 'pending_payment' && order.status !== 'pending_verification') {
                return res.status(400).json({ error: 'Esta orden no puede ser cancelada' });
            }
        }

        await query(`
            UPDATE orders SET
                status = 'cancelled',
                cancelled_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
        `, [id]);

        // If the order had a pending payment proof, mark it cancelled so it
        // no longer shows up in the admin verification queue.
        await query(`
            UPDATE payment_proofs SET
                status = 'rejected',
                rejection_reason = 'Orden cancelada por el cliente',
                reviewed_at = NOW()
            WHERE order_id = $1 AND status = 'pending'
        `, [id]);

        // Founder discount rollback: if this order had a founder discount applied,
        // restore the user's flag so they can try again on a new order.
        try {
            const founderApplied = await queryOne<{ id: string }>(
                `SELECT id FROM founder_audit
                 WHERE user_id = $1 AND action = 'discount_used'
                   AND (metadata->>'plan_id') = $2
                 ORDER BY created_at DESC LIMIT 1`,
                [order.user_id, order.plan_id]
            );
            if (founderApplied) {
                await query(
                    `UPDATE users SET founder_first_package_used = false, founder_first_used_at = NULL
                     WHERE id = $1 AND is_founder = true`,
                    [order.user_id]
                );
                await query(
                    `INSERT INTO founder_audit (user_id, action, metadata)
                     VALUES ($1, 'discount_rolled_back', $2::jsonb)`,
                    [order.user_id, JSON.stringify({ order_id: id, reason: 'order_cancelled' })]
                );
            }
        } catch (e: any) {
            console.warn('Founder rollback (non-blocking):', e.message);
        }

        // Sample-class ($99) credit rollback on cancel.
        try {
            if (Number(order.discount_amount) > 0) {
                const used = await queryOne<{ sample_class_discount_used: boolean }>(
                    `SELECT sample_class_discount_used FROM users WHERE id = $1`,
                    [order.user_id]
                );
                if (used?.sample_class_discount_used) {
                    await query(
                        `UPDATE users SET sample_class_discount_used = false, sample_class_discount_used_at = NULL
                         WHERE id = $1`,
                        [order.user_id]
                    );
                    await query(
                        `INSERT INTO founder_audit (user_id, action, metadata)
                         VALUES ($1, 'sample_class_discount_rolled_back', $2::jsonb)`,
                        [order.user_id, JSON.stringify({ order_id: id, reason: 'order_cancelled' })]
                    );
                }
            }
        } catch (e: any) {
            console.warn('Sample-class rollback (non-blocking):', e.message);
        }

        res.json({ message: 'Orden cancelada exitosamente' });
    } catch (error) {
        console.error('Cancel order error:', error);
        res.status(500).json({ error: 'Error al cancelar orden' });
    }
});

// ============================================
// GET /api/orders - List all orders (Admin)
// ============================================
router.get('/', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { status, paymentMethod, startDate, endDate, search, limit = 50, offset = 0 } = req.query;

        let queryStr = `SELECT * FROM orders_with_details WHERE 1=1`;
        const params: any[] = [];
        let paramCount = 1;

        if (status) {
            queryStr += ` AND status = $${paramCount++}`;
            params.push(status);
        }

        if (paymentMethod) {
            queryStr += ` AND payment_method = $${paramCount++}`;
            params.push(paymentMethod);
        }

        if (startDate) {
            queryStr += ` AND created_at >= $${paramCount++}`;
            params.push(startDate);
        }

        if (endDate) {
            queryStr += ` AND created_at <= $${paramCount++}`;
            params.push(endDate);
        }

        if (search) {
            queryStr += ` AND (
                user_name ILIKE $${paramCount} OR
                user_email ILIKE $${paramCount} OR
                order_number ILIKE $${paramCount}
            )`;
            params.push(`%${search}%`);
            paramCount++;
        }

        queryStr += ` ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
        params.push(limit, offset);

        const orders = await query(queryStr, params);

        res.json(orders);
    } catch (error) {
        console.error('List orders error:', error);
        res.status(500).json({ error: 'Error al listar órdenes' });
    }
});

export default router;
