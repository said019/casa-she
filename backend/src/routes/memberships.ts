import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { query, queryOne, pool } from '../config/database.js';
import { logAction } from '../lib/audit.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { requireElevated } from '../middleware/elevation.js';
import { z } from 'zod';
import { sendMembershipActivatedEmail } from '../services/email.js';
import { sendMembershipActivatedNotice } from '../lib/whatsapp.js';
import { awardPaymentLoyaltyPoints, reversePaymentLoyaltyPoints, consumeFounderFirstPackageDiscount } from '../lib/loyalty.js';
import { notifyMembershipRenewed, notifyPointsEarnedExternal } from '../lib/notifications.js';
import { hasPermission } from '../lib/permissions.js';
import { isElevated } from '../lib/elevation.js';
import { openShiftForUser } from '../lib/openShift.js';

const router = Router();

/** Fecha 'YYYY-MM-DD' (validada). Se usa para vigencia (start_date/end_date). */
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido');

/**
 * Calcula el end_date de una membresía.
 * - Si llega un endDate explícito ('YYYY-MM-DD'), se usa ESE (override del dueño).
 * - Si no, end = start + plan.duration_days.
 * Devuelve { end, error }: si endDate < start, error con mensaje.
 */
function computeEndDate(start: Date, durationDays: number, endDate?: string): { end: Date; error?: string } {
    if (endDate) {
        // Se ancla a mediodía local para que no recorra un día al serializar a UTC.
        const explicit = new Date(`${endDate}T12:00:00`);
        if (Number.isNaN(explicit.getTime())) return { end: start, error: 'Fecha de vencimiento inválida' };
        if (explicit < start) return { end: explicit, error: 'El vencimiento no puede ser anterior al inicio' };
        return { end: explicit };
    }
    const end = new Date(start);
    end.setDate(end.getDate() + durationDays);
    return { end };
}

/** Compute legacy classes_remaining from category buckets.
 * Returns null if ANY bucket is unlimited (NULL), otherwise the sum. */
const legacyRemaining = (r: number | null, m: number | null): number | null =>
    (r === null || m === null) ? null : r + m;

const PurchaseMembershipSchema = z.object({
    planId: z.string().uuid(),
    paymentMethod: z.enum(['cash', 'transfer']),
    // Comprobante de transferencia (data URL base64). Obligatorio cuando paymentMethod === 'transfer'.
    receiptUrl: z.string().min(1).optional(),
}).refine(
    (d) => d.paymentMethod !== 'transfer' || (typeof d.receiptUrl === 'string' && d.receiptUrl.trim().length > 0),
    { message: 'El comprobante de transferencia es obligatorio', path: ['receiptUrl'] },
);

// ============================================
// GET /api/memberships/me - Current user's membership
// ============================================
router.get('/me', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'No autorizado' });
        }

        const membership = await queryOne(
            `SELECT
        m.id, m.status, m.start_date, m.end_date, m.classes_remaining,
        m.reformer_remaining, m.multi_remaining,
        m.payment_method, m.payment_reference,
        p.name as plan_name, p.price as plan_price, p.currency as plan_currency,
        p.duration_days as plan_duration_days, p.class_limit,
        p.reformer_credits, p.multi_credits
      FROM memberships m
      JOIN plans p ON m.plan_id = p.id
      WHERE m.user_id = $1
      ORDER BY
        CASE m.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'pending_activation' THEN 2 WHEN 'pending_payment' THEN 3 ELSE 4 END,
        m.created_at DESC
      LIMIT 1`,
            [userId]
        );

        if (!membership) {
            return res.status(404).json({ error: 'No tienes membresía activa' });
        }

        res.json({
            ...membership,
            // Bolsa COMPARTIDA (plataforma): reformer/multi en NULL pero classes_remaining real → NO
            // pisar con legacyRemaining (que daría NULL/∞). Para planes normales sí se usa el legacy.
            classes_remaining: (membership.reformer_remaining === null && membership.multi_remaining === null && typeof membership.classes_remaining === 'number')
                ? membership.classes_remaining
                : legacyRemaining(membership.reformer_remaining, membership.multi_remaining),
        });
    } catch (error) {
        console.error('Get membership error:', error);
        res.status(500).json({ error: 'Error al obtener membresía' });
    }
});

// ============================================
// GET /api/memberships/my - List all user's active memberships
// ============================================
router.get('/my', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'No autorizado' });
        }

        const memberships = await query(
            `SELECT
        m.id, m.status, m.start_date, m.end_date, m.classes_remaining,
        m.reformer_remaining, m.multi_remaining,
        p.name as plan_name, p.price as plan_price, p.currency as plan_currency,
        p.class_limit, p.reformer_credits, p.multi_credits
      FROM memberships m
      JOIN plans p ON m.plan_id = p.id
      WHERE m.user_id = $1 AND m.status IN ('active', 'pending_payment')
      ORDER BY m.created_at DESC`,
            [userId]
        );

        res.json(memberships.map((m: any) => ({
            ...m,
            // Bolsa compartida: conservar classes_remaining real (no pisarlo con NULL).
            classes_remaining: (m.reformer_remaining === null && m.multi_remaining === null && typeof m.classes_remaining === 'number')
                ? m.classes_remaining
                : legacyRemaining(m.reformer_remaining, m.multi_remaining),
        })));
    } catch (error) {
        console.error('List my memberships error:', error);
        res.status(500).json({ error: 'Error al obtener mis membresías' });
    }
});

// ============================================
// POST /api/memberships - Purchase membership (Client)
// ============================================
router.post('/', authenticate, requireRole('client'), async (req: Request, res: Response) => {
    try {
        const validation = PurchaseMembershipSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: 'Datos inválidos',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'No autorizado' });
        }

        const { planId, paymentMethod, receiptUrl } = validation.data;

        const plan = await queryOne(
            `SELECT id, class_limit, reformer_credits, multi_credits FROM plans WHERE id = $1 AND is_active = true`,
            [planId]
        );

        if (!plan) {
            return res.status(404).json({ error: 'Plan no encontrado' });
        }

        const existing = await queryOne(
            `SELECT id FROM memberships
       WHERE user_id = $1 AND plan_id = $2
       AND status IN ('pending_payment', 'pending_activation')`,
            [userId, planId]
        );

        if (existing) {
            return res.status(409).json({ error: 'Ya tienes una solicitud pendiente para este plan' });
        }

        const classesRemaining = plan.class_limit ?? null;

        const policyRow = await queryOne<{ value: any }>(`SELECT value FROM system_settings WHERE key = 'cancellation_policy'`);
        const cancellationLimit = Number(policyRow?.value?.cancellations_per_membership ?? 2);

        const membership = await queryOne(
            `INSERT INTO memberships (
        user_id, plan_id, status, classes_remaining, reformer_remaining, multi_remaining, payment_method, cancellation_limit, receipt_url
      ) VALUES ($1, $2, 'pending_payment', $3, $4, $5, $6, $7, $8)
      RETURNING id, status`,
            [userId, planId, classesRemaining, plan.reformer_credits ?? null, plan.multi_credits ?? null, paymentMethod, cancellationLimit, receiptUrl ?? null]
        );

        res.status(201).json({
            membershipId: membership.id,
            status: membership.status,
        });
    } catch (error) {
        console.error('Purchase membership error:', error);
        res.status(500).json({ error: 'Error al crear membresía' });
    }
});

// ============================================
// GET /api/memberships - List memberships (Admin)
// ============================================
router.get('/', authenticate, requireRole('admin', 'super_admin', 'reception'), async (req: Request, res: Response) => {
    try {
        const { status, userId } = req.query;

        let queryStr = `
      SELECT m.*,
             u.display_name as user_name, u.email as user_email, u.phone as user_phone,
             p.name as plan_name, p.price as plan_price, p.currency as plan_currency, p.duration_days as plan_duration_days,
             p.class_limit as credits_total,
             CASE WHEN m.reformer_remaining IS NULL OR m.multi_remaining IS NULL THEN NULL
                  ELSE m.reformer_remaining + m.multi_remaining END as credits_remaining,
             ab.display_name as activated_by_name,
             pay.processed_by_name,
             pay.provider as pay_provider
      FROM memberships m
      JOIN users u ON m.user_id = u.id
      JOIN plans p ON m.plan_id = p.id
      LEFT JOIN users ab ON ab.id = m.activated_by
      LEFT JOIN LATERAL (
          SELECT pu.display_name AS processed_by_name, pm.provider
          FROM payments pm
          LEFT JOIN users pu ON pu.id = pm.processed_by
          WHERE pm.membership_id = m.id
          ORDER BY pm.created_at DESC
          LIMIT 1
      ) pay ON true
      WHERE 1=1
    `;
        const params: any[] = [];
        let paramCount = 1;

        if (status) {
            queryStr += ` AND m.status = $${paramCount++}`;
            params.push(status);
        }

        if (userId) {
            queryStr += ` AND m.user_id = $${paramCount++}`;
            params.push(userId);
        }

        queryStr += ` ORDER BY m.created_at DESC`;

        const rows = await query<any>(queryStr, params);
        // Trazabilidad de adquisición (cómo se obtuvo la membresía). No hay una columna
        // de "canal", así que se infiere de señales fiables ya presentes:
        //   - order_id != null  -> pasó por el checkout de la app (Stripe / transferencia subida).
        //   - provider/processed_by del pago + activated_by -> staff de mostrador.
        //   - is_migration -> alta histórica de Fitune.
        const result = rows.map((m: any) => {
            const sellerName = m.processed_by_name || m.activated_by_name || null;
            const online = m.order_id != null;
            let channel: 'online_card' | 'online_transfer' | 'staff' | 'migration' | 'request' | 'unknown';
            if (m.is_migration) channel = 'migration';
            else if (online && (m.payment_method === 'card' || m.payment_method === 'online')) channel = 'online_card';
            else if (online && m.payment_method === 'transfer') channel = 'online_transfer';
            else if (sellerName) channel = 'staff';
            else if (m.status === 'pending_payment' || m.status === 'pending_activation') channel = 'request';
            else channel = 'unknown';
            return {
                ...m,
                acquisition: {
                    channel,
                    method: m.payment_method ?? null,
                    seller_name: sellerName,
                    provider: m.pay_provider ?? null,
                },
            };
        });
        res.json(result);
    } catch (error) {
        console.error('List memberships error:', error);
        res.status(500).json({ error: 'Error al listar membresías' });
    }
});

// ============================================
// GET /api/memberships/pending - List pending activations (Admin)
// ============================================
router.get('/pending', authenticate, requireElevated, async (req: Request, res: Response) => {
    try {
        const memberships = await query(`
      SELECT m.*,
             u.display_name as user_name, u.email as user_email, u.phone as user_phone,
             p.name as plan_name, p.price as plan_price, p.currency as plan_currency, p.duration_days as plan_duration_days,
             p.class_limit as credits_total,
             CASE WHEN m.reformer_remaining IS NULL OR m.multi_remaining IS NULL THEN NULL
                  ELSE m.reformer_remaining + m.multi_remaining END as credits_remaining
      FROM memberships m
      JOIN users u ON m.user_id = u.id
      JOIN plans p ON m.plan_id = p.id
      WHERE m.status IN ('pending_payment', 'pending_activation')
      ORDER BY m.created_at DESC
    `);
        res.json(memberships);
    } catch (error) {
        console.error('List pending memberships error:', error);
        res.status(500).json({ error: 'Error al obtener membresías pendientes' });
    }
});

// ============================================
// POST /api/memberships/assign - Assign membership manually (Admin)
// ============================================
const AssignMembershipSchema = z.object({
    userId: z.string().uuid(),
    planId: z.string().uuid(),
    startDate: z.string().optional(), // ISO date string
    // Vencimiento explícito opcional: si no viene, se calcula start + plan.duration_days.
    endDate: dateString.optional(),
    status: z.enum(['active', 'pending_payment', 'pending_activation']).default('active'),
    paymentMethod: z.enum(['cash', 'transfer', 'card', 'online', 'bank_transfer', 'gratis']).optional(),
    // Motivo obligatorio cuando paymentMethod === 'gratis' (cortesía $0).
    reason: z.string().optional(),
    notes: z.string().optional(),
});

const ActivateMembershipSchema = z.object({
    // Obligatorio: sin método de pago la activación no registraría el ingreso en payments.
    paymentMethod: z.enum(['cash', 'transfer', 'card', 'online', 'gratis']),
    paymentReference: z.string().max(255).optional(),
    // Motivo obligatorio cuando paymentMethod === 'gratis' (cortesía $0).
    reason: z.string().optional(),
    startDate: z.string().optional(),
    // Vencimiento explícito opcional: si no viene, se calcula start + plan.duration_days.
    endDate: dateString.optional(),
    notes: z.string().max(500).optional(),
    notifyMember: z.boolean().optional(),
    generateWalletPass: z.boolean().optional(),
});

router.post('/assign', authenticate, requireRole('admin', 'super_admin', 'reception'), async (req: Request, res: Response) => {
    try {
        const validation = AssignMembershipSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: 'Datos inválidos',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const { userId, planId, startDate, endDate, status, paymentMethod, reason, notes } = validation.data;

        // Cortesía $0 ('gratis'): solo elevados (admin/super_admin o recepción master) y motivo obligatorio.
        const isGratis = paymentMethod === 'gratis';
        const gratisReason = typeof reason === 'string' ? reason.trim() : '';
        if (isGratis) {
            if (!isElevated(req.user)) {
                return res.status(403).json({ error: 'Solo admin o recepción master pueden registrar membresías gratis.' });
            }
            if (gratisReason.length < 5) {
                return res.status(400).json({ error: 'El motivo es obligatorio para una membresía gratis (mínimo 5 caracteres).' });
            }
        }

        // Get plan details
        const plan = await queryOne('SELECT * FROM plans WHERE id = $1', [planId]);
        if (!plan) {
            return res.status(404).json({ error: 'Plan no encontrado' });
        }

        // Calculate dates (endDate explícito sobreescribe start + duration_days)
        const start = startDate ? new Date(startDate) : new Date();
        const { end, error: endErr } = computeEndDate(start, plan.duration_days, endDate);
        if (endErr) {
            return res.status(400).json({ error: endErr });
        }

        // Create membership within transaction
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            let purchasePointsAwarded = 0;

            // 1. Create membership
            const normalizedPaymentMethod = paymentMethod === 'bank_transfer' ? 'transfer' : (paymentMethod || null);

            const policyRowAdmin = await client.query(`SELECT value FROM system_settings WHERE key = 'cancellation_policy'`);
            const cancellationLimit = Number(policyRowAdmin.rows[0]?.value?.cancellations_per_membership ?? 2);

            const membershipResult = await client.query(
                `INSERT INTO memberships (
          user_id, plan_id, start_date, end_date, status, classes_remaining, reformer_remaining, multi_remaining, payment_method, payment_reference, cancellation_limit, activated_by, activated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        RETURNING *`,
                [
                    userId,
                    planId,
                    status === 'active' ? start : null,
                    status === 'active' ? end : null,
                    status,
                    plan.class_limit ?? null,
                    plan.reformer_credits ?? null,
                    plan.multi_credits ?? null,
                    normalizedPaymentMethod,
                    notes || null,
                    cancellationLimit,
                    req.user?.userId ?? null,
                ]
            );
            const membership = membershipResult.rows[0];

            // 2. Record payment if method provided
            if (normalizedPaymentMethod) {
                // Cortesía $0: amount=0 (no da puntos ni suma a caja), sin descuento founder.
                const discount = isGratis
                    ? { amount: 0, applied: false, discountAmount: 0 }
                    : await consumeFounderFirstPackageDiscount({
                        db: client,
                        userId,
                        listPrice: Number(plan.price),
                    });
                const paymentAmount = discount.amount;
                const paymentNotes = isGratis
                    ? [notes, `Cortesía gratis. Motivo: ${gratisReason}`].filter(Boolean).join(' | ')
                    : discount.applied
                        ? [notes, `Descuento founder 10% aplicado (-$${discount.discountAmount})`].filter(Boolean).join(' | ')
                        : (notes || null);

                const shiftA = await openShiftForUser(req.user?.userId || '');
                const payResult = await client.query(
                    `INSERT INTO payments (
            user_id, membership_id, amount, currency,
            payment_method, reference, notes, status, processed_by, shift_id, facility_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', $8, $9, $10)
          RETURNING id`,
                    [
                        userId,
                        membership.id,
                        paymentAmount,
                        plan.currency,
                        normalizedPaymentMethod,
                        null,
                        paymentNotes,
                        req.user?.userId || null,
                        shiftA?.id || null,
                        shiftA?.facility_id || null,
                    ]
                );

                // Award loyalty points for payment — puntos por precio
                // (computePaymentPoints; efectivo 2×). classLimit ya no se usa.
                if (payResult.rows[0]?.id) {
                    purchasePointsAwarded = await awardPaymentLoyaltyPoints({
                        db: client,
                        userId,
                        paymentId: payResult.rows[0].id,
                        amount: paymentAmount,
                        paymentMethod: normalizedPaymentMethod,
                        classLimit: plan.class_limit ?? null,
                    }).catch(e => { console.error('Loyalty points error:', e); return 0; });
                }
            }

            await client.query('COMMIT');

            // Loyalty points notification (after commit)
            if (purchasePointsAwarded > 0) {
                void notifyPointsEarnedExternal(userId, purchasePointsAwarded, 'package_purchase');
            }

            // Send notifications if membership is active
            if (status === 'active') {
                const user = await queryOne<any>('SELECT display_name, email, phone FROM users WHERE id = $1', [userId]);
                if (user) {
                    const endStr = end.toISOString().split('T')[0];
                    const startStr = start.toISOString().split('T')[0];
                    // Email
                    if (user.email) {
                        sendMembershipActivatedEmail({
                            to: user.email,
                            clientName: user.display_name || 'Cliente',
                            planName: plan.name,
                            classesIncluded: plan.class_limit || null,
                            startDate: startStr,
                            endDate: endStr,
                        }).catch(e => console.error('Email notification error:', e));
                    }
                    // WhatsApp
                    if (user.phone) {
                        const fmtEnd = end.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
                        sendMembershipActivatedNotice(
                            user.phone, user.display_name || 'Cliente',
                            plan.name, plan.class_limit || null, fmtEnd
                        ).catch(e => console.error('WhatsApp notification error:', e));
                    }
                }
                // Update Apple + Google Wallet passes
                notifyMembershipRenewed(membership.id).catch(e => console.error('Wallet notification error:', e));
            }

            await logAction(query, {
                adminUserId: req.user!.userId,
                actionType: 'membership_activated',
                entityType: 'membership',
                entityId: membership.id,
                description: isGratis
                    ? `Membresía GRATIS asignada (admin). Motivo: ${gratisReason}`
                    : 'Membresía asignada (admin)',
                newData: {
                    plan_id: membership.plan_id,
                    user_id: membership.user_id,
                    status: membership.status,
                    payment_method: membership.payment_method,
                    ...(isGratis ? { gratis: true, reason: gratisReason } : {}),
                },
                req,
            });
            res.status(201).json(membership);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Assign membership error:', error);
        res.status(500).json({ error: 'Error al asignar membresía' });
    }
});

// ============================================
// POST /api/memberships/assign-cash - Assign membership with cash/manual payment (Admin)
// Like /assign but records the exact amount the admin collected (amountPaid)
// instead of the plan list price, allowing manual discounts/adjustments.
// ============================================
const AssignCashSchema = z.object({
    userId: z.string().uuid(),
    planId: z.string().uuid(),
    startDate: z.string().optional(), // ISO date string (yyyy-MM-dd)
    // Vencimiento explícito opcional: si no viene, se calcula start + plan.duration_days.
    endDate: dateString.optional(),
    paymentMethod: z.enum(['cash', 'transfer', 'card']).default('cash'),
    amountPaid: z.coerce.number().positive(),
    notes: z.string().optional(),
});

router.post('/assign-cash', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const validation = AssignCashSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: 'Datos inválidos',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const { userId, planId, startDate, endDate, paymentMethod, amountPaid, notes } = validation.data;

        const plan = await queryOne('SELECT * FROM plans WHERE id = $1', [planId]);
        if (!plan) {
            return res.status(404).json({ error: 'Plan no encontrado' });
        }

        const start = startDate ? new Date(startDate) : new Date();
        const { end, error: endErr } = computeEndDate(start, plan.duration_days, endDate);
        if (endErr) {
            return res.status(400).json({ error: endErr });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            let purchasePointsAwarded = 0;

            const policyRow = await client.query(`SELECT value FROM system_settings WHERE key = 'cancellation_policy'`);
            const cancellationLimit = Number(policyRow.rows[0]?.value?.cancellations_per_membership ?? 2);

            // Membership is always created active for a cash assignment
            const membershipResult = await client.query(
                `INSERT INTO memberships (
          user_id, plan_id, start_date, end_date, status, classes_remaining, reformer_remaining, multi_remaining, payment_method, payment_reference, cancellation_limit
        ) VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9, $10)
        RETURNING *`,
                [
                    userId,
                    planId,
                    start,
                    end,
                    plan.class_limit ?? null,
                    plan.reformer_credits ?? null,
                    plan.multi_credits ?? null,
                    paymentMethod,
                    notes || null,
                    cancellationLimit,
                ]
            );
            const membership = membershipResult.rows[0];

            // Record the payment for the EXACT amount the admin collected.
            const shiftC = await openShiftForUser(req.user?.userId || '');
            const payResult = await client.query(
                `INSERT INTO payments (
          user_id, membership_id, amount, currency,
          payment_method, reference, notes, status, processed_by, shift_id, facility_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', $8, $9, $10)
        RETURNING id`,
                [
                    userId,
                    membership.id,
                    amountPaid,
                    plan.currency,
                    paymentMethod,
                    null,
                    notes || null,
                    req.user?.userId || null,
                    shiftC?.id || null,
                    shiftC?.facility_id || null,
                ]
            );

            if (payResult.rows[0]?.id) {
                purchasePointsAwarded = await awardPaymentLoyaltyPoints({
                    db: client,
                    userId,
                    paymentId: payResult.rows[0].id,
                    amount: amountPaid,
                    paymentMethod,
                    classLimit: plan.class_limit ?? null,
                }).catch(e => { console.error('Loyalty points error:', e); return 0; });
            }

            await client.query('COMMIT');

            if (purchasePointsAwarded > 0) {
                void notifyPointsEarnedExternal(userId, purchasePointsAwarded, 'package_purchase');
            }

            const user = await queryOne<any>('SELECT display_name, email, phone FROM users WHERE id = $1', [userId]);
            if (user) {
                const endStr = end.toISOString().split('T')[0];
                const startStr = start.toISOString().split('T')[0];
                if (user.email) {
                    sendMembershipActivatedEmail({
                        to: user.email,
                        clientName: user.display_name || 'Cliente',
                        planName: plan.name,
                        classesIncluded: plan.class_limit || null,
                        startDate: startStr,
                        endDate: endStr,
                    }).catch(e => console.error('Email notification error:', e));
                }
                if (user.phone) {
                    const fmtEnd = end.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
                    sendMembershipActivatedNotice(
                        user.phone, user.display_name || 'Cliente',
                        plan.name, plan.class_limit || null, fmtEnd
                    ).catch(e => console.error('WhatsApp notification error:', e));
                }
            }
            notifyMembershipRenewed(membership.id).catch(e => console.error('Wallet notification error:', e));

            await logAction(query, {
                adminUserId: req.user!.userId,
                actionType: 'membership_activated',
                entityType: 'membership',
                entityId: membership.id,
                description: 'Membresía asignada con pago en caja (admin)',
                newData: {
                    plan_id: membership.plan_id,
                    user_id: membership.user_id,
                    status: membership.status,
                    payment_method: membership.payment_method,
                },
                req,
            });
            res.status(201).json(membership);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Assign cash membership error:', error);
        res.status(500).json({ error: 'Error al asignar membresía' });
    }
});

// ============================================
// POST /api/memberships/:id/activate - Activate membership (Admin)
// ============================================
router.post('/:id/activate', authenticate, requireElevated, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const validation = ActivateMembershipSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: 'Datos inválidos',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const {
            paymentMethod,
            paymentReference,
            reason,
            startDate,
            endDate,
            notes,
            generateWalletPass,
        } = validation.data;

        // Cortesía $0 ('gratis'): solo elevados (admin/super_admin o recepción master) y motivo obligatorio.
        const isGratis = paymentMethod === 'gratis';
        const gratisReason = typeof reason === 'string' ? reason.trim() : '';
        if (isGratis) {
            if (!isElevated(req.user)) {
                return res.status(403).json({ error: 'Solo admin o recepción master pueden registrar membresías gratis.' });
            }
            if (gratisReason.length < 5) {
                return res.status(400).json({ error: 'El motivo es obligatorio para una membresía gratis (mínimo 5 caracteres).' });
            }
        }

        // Get membership + plan to calculate end date and payment data
        const membership = await queryOne<{
            id: string;
            user_id: string;
            plan_id: string;
            status: string;
            duration_days: number;
            plan_price: number;
            plan_currency: string;
            plan_class_limit: number | null;
        }>(`
        SELECT m.*, p.duration_days, p.price as plan_price, p.currency as plan_currency, p.class_limit as plan_class_limit
        FROM memberships m
        JOIN plans p ON m.plan_id = p.id
        WHERE m.id = $1
    `, [id]);

        if (!membership) {
            return res.status(404).json({ error: 'Membresía no encontrada' });
        }

        if (membership.status === 'active') {
            return res.status(400).json({ error: 'La membresía ya está activa' });
        }

        const start = startDate ? new Date(startDate) : new Date();
        if (Number.isNaN(start.getTime())) {
            return res.status(400).json({ error: 'Fecha de inicio inválida' });
        }
        // endDate explícito sobreescribe start + plan.duration_days.
        const { end, error: endErr } = computeEndDate(start, membership.duration_days, endDate);
        if (endErr) {
            return res.status(400).json({ error: endErr });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const updatedResult = await client.query(
                `UPDATE memberships
         SET status = 'active',
             start_date = $1,
             end_date = $2,
             activated_at = NOW(),
             activated_by = $3,
             payment_method = COALESCE($4, payment_method),
             payment_reference = COALESCE($5, payment_reference),
             updated_at = NOW()
         WHERE id = $6 AND status <> 'active'
         RETURNING *`,
                [
                    start,
                    end,
                    req.user?.userId || null,
                    paymentMethod || null,
                    paymentReference || null,
                    id,
                ]
            );

            // Activación atómica: el chequeo de status de arriba ocurre fuera de la tx, así que dos
            // activaciones casi simultáneas podrían pasarlo ambas. El UPDATE condicional (status <> 'active')
            // garantiza que solo UNA gane: el perdedor sale con 0 filas y NO inserta un segundo pago ni
            // duplica la lealtad.
            if (updatedResult.rowCount === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'La membresía ya está activa' });
            }

            let activationPointsAwarded = 0;
            if (paymentMethod) {
                // Cortesía $0: amount=0 (no da puntos ni suma a caja), sin descuento founder.
                const discount = isGratis
                    ? { amount: 0, applied: false, discountAmount: 0 }
                    : await consumeFounderFirstPackageDiscount({
                        db: client,
                        userId: membership.user_id,
                        listPrice: Number(membership.plan_price),
                    });
                const paymentAmount = discount.amount;
                const paymentNotes = isGratis
                    ? [notes, `Cortesía gratis. Motivo: ${gratisReason}`].filter(Boolean).join(' | ')
                    : discount.applied
                        ? [notes, `Descuento founder 10% aplicado (-$${discount.discountAmount})`].filter(Boolean).join(' | ')
                        : (notes || null);

                const shiftD = await openShiftForUser(req.user?.userId || '');
                const payResult = await client.query(
                    `INSERT INTO payments (
            user_id, membership_id, amount, currency,
            payment_method, reference, notes, status, processed_by, shift_id, facility_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', $8, $9, $10)
          RETURNING id`,
                    [
                        membership.user_id,
                        membership.id,
                        paymentAmount,
                        membership.plan_currency,
                        paymentMethod,
                        paymentReference || null,
                        paymentNotes,
                        req.user?.userId || null,
                        shiftD?.id || null,
                        shiftD?.facility_id || null,
                    ]
                );

                // Award loyalty points for activation — puntos por precio
                // (computePaymentPoints; efectivo 2×). classLimit ya no se usa.
                if (payResult.rows[0]?.id) {
                    activationPointsAwarded = await awardPaymentLoyaltyPoints({
                        db: client,
                        userId: membership.user_id,
                        paymentId: payResult.rows[0].id,
                        amount: paymentAmount,
                        paymentMethod,
                        classLimit: membership.plan_class_limit,
                    }).catch(e => { console.error('Loyalty points error:', e); return 0; });
                }
            }

            const shouldGenerateWalletPass = generateWalletPass !== false;
            if (shouldGenerateWalletPass) {
                const existingPasses = await client.query(
                    `SELECT platform FROM wallet_passes WHERE membership_id = $1`,
                    [membership.id]
                );
                const existingPlatforms = new Set(existingPasses.rows.map((row) => row.platform));

                const platforms: Array<'apple' | 'google'> = ['apple', 'google'];
                for (const platform of platforms) {
                    if (!existingPlatforms.has(platform)) {
                        await client.query(
                            `INSERT INTO wallet_passes (
                user_id, membership_id, platform, serial_number, pass_type_identifier, last_updated
              ) VALUES ($1, $2, $3, $4, $5, NOW())`,
                            [
                                membership.user_id,
                                membership.id,
                                platform,
                                randomUUID(),
                                platform === 'apple' ? process.env.APPLE_PASS_TYPE_IDENTIFIER || null : null,
                            ]
                        );
                    }
                }
            }

            await client.query('COMMIT');

            // Loyalty points notification (after commit)
            if (activationPointsAwarded > 0) {
                void notifyPointsEarnedExternal(membership.user_id, activationPointsAwarded, 'package_purchase');
            }

            // Send notifications
            const activated = updatedResult.rows[0];
            const user = await queryOne<any>('SELECT display_name, email, phone FROM users WHERE id = $1', [activated.user_id]);
            const planInfo = await queryOne<any>('SELECT name, class_limit FROM plans WHERE id = $1', [activated.plan_id]);
            if (user && planInfo) {
                const endStr = String(activated.end_date).split('T')[0];
                const startStr = String(activated.start_date).split('T')[0];
                if (user.email) {
                    sendMembershipActivatedEmail({
                        to: user.email,
                        clientName: user.display_name || 'Cliente',
                        planName: planInfo.name,
                        classesIncluded: planInfo.class_limit || null,
                        startDate: startStr,
                        endDate: endStr,
                    }).catch(e => console.error('Email notification error:', e));
                }
                if (user.phone) {
                    const fmtEnd = new Date(endStr + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
                    sendMembershipActivatedNotice(
                        user.phone, user.display_name || 'Cliente',
                        planInfo.name, planInfo.class_limit || null, fmtEnd
                    ).catch(e => console.error('WhatsApp notification error:', e));
                }
                // Update Apple + Google Wallet passes
                notifyMembershipRenewed(activated.id).catch(e => console.error('Wallet notification error:', e));
            }

            await logAction(query, {
                adminUserId: req.user!.userId,
                actionType: 'membership_activated',
                entityType: 'membership',
                entityId: activated.id,
                description: isGratis
                    ? `Membresía activada GRATIS (admin). Motivo: ${gratisReason}`
                    : 'Membresía activada (admin)',
                newData: {
                    plan_id: activated.plan_id,
                    user_id: activated.user_id,
                    status: activated.status,
                    payment_method: activated.payment_method,
                    ...(isGratis ? { gratis: true, reason: gratisReason } : {}),
                },
                req,
            });
            res.json(activated);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Activate membership error:', error);
        res.status(500).json({ error: 'Error al activar membresía' });
    }
});

// ============================================
// POST /api/memberships/:id/cancel - Cancel membership
// Body: { reason?: string, refund?: boolean }
// When refund=true: marks associated completed payments as 'refunded' and
// reverses the loyalty points awarded for each.
// ============================================
const CancelMembershipSchema = z.object({
    reason: z.string().trim().max(500).optional(),
    refund: z.boolean().optional(),
});

router.post('/:id/cancel', authenticate, requireElevated, async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;

        const parsed = CancelMembershipSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
        }
        const { reason, refund = false } = parsed.data;

        await client.query('BEGIN');

        const membershipResult = await client.query(
            'SELECT id, user_id, status FROM memberships WHERE id = $1 FOR UPDATE',
            [id]
        );
        const membership = membershipResult.rows[0];

        if (!membership) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Membresía no encontrada' });
        }

        // Cancelar/rechazar una membresía dispara reembolsos (marca pagos como 'refunded') y revierte
        // lealtad: es acción de staff elevado (admin, super_admin, recepción master), ya garantizada por
        // requireElevated. Un cliente NO puede auto-cancelar su membresía para borrar sus pagos de la
        // contabilidad ni manipular su saldo de puntos.

        // Idempotent: if already cancelled, return current state without further side effects.
        if (membership.status === 'cancelled') {
            const current = await client.query('SELECT * FROM memberships WHERE id = $1', [id]);
            await client.query('COMMIT');
            return res.json(current.rows[0]);
        }

        const updatedResult = await client.query(
            `UPDATE memberships
             SET status = 'cancelled',
                 cancelled_at = NOW(),
                 cancellation_reason = COALESCE($2, cancellation_reason),
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [id, reason ?? null]
        );
        const updated = updatedResult.rows[0];

        let refundedPaymentIds: string[] = [];
        let pointsReversedTotal = 0;

        if (refund) {
            // Lock the matching payments before refunding so concurrent reads see a consistent state.
            const paymentsResult = await client.query(
                `SELECT id FROM payments
                 WHERE membership_id = $1 AND status = 'completed'
                 FOR UPDATE`,
                [id]
            );
            refundedPaymentIds = paymentsResult.rows.map((row: { id: string }) => row.id);

            for (const paymentId of refundedPaymentIds) {
                await client.query(
                    `UPDATE payments SET status = 'refunded' WHERE id = $1`,
                    [paymentId]
                );
                pointsReversedTotal += await reversePaymentLoyaltyPoints({
                    db: client,
                    userId: membership.user_id,
                    paymentId,
                });
            }
        }

        await client.query('COMMIT');
        res.json({
            ...updated,
            refund: {
                applied: refund,
                payments_refunded: refundedPaymentIds,
                points_reversed: pointsReversedTotal,
            },
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Cancel membership error:', error);
        res.status(500).json({ error: 'Error al cancelar membresía' });
    } finally {
        client.release();
    }
});

// ============================================
// POST /api/memberships/:id/pause - Pausar membresía (staff)
// Para ausencias temporales (vacaciones, lesión). Solo desde 'active'.
// ============================================
const PauseMembershipSchema = z.object({ reason: z.string().trim().max(500).optional() });

router.post('/:id/pause', authenticate, requireRole('admin', 'super_admin', 'reception'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const parsed = PauseMembershipSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
        }
        const updated = await queryOne(
            `UPDATE memberships
             SET status = 'paused', paused_at = NOW(),
                 pause_reason = COALESCE($2, pause_reason), updated_at = NOW()
             WHERE id = $1 AND status = 'active'
             RETURNING *`,
            [id, parsed.data.reason ?? null]
        );
        if (!updated) {
            return res.status(409).json({ error: 'Solo se puede pausar una membresía activa' });
        }
        res.json(updated);
    } catch (error) {
        console.error('Pause membership error:', error);
        res.status(500).json({ error: 'Error al pausar membresía' });
    }
});

// ============================================
// POST /api/memberships/:id/resume - Reanudar membresía (staff)
// Extiende end_date por los días que estuvo pausada (no se pierde tiempo).
// ============================================
router.post('/:id/resume', authenticate, requireRole('admin', 'super_admin', 'reception'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updated = await queryOne(
            `UPDATE memberships
             SET status = 'active',
                 end_date = CASE
                     WHEN end_date IS NOT NULL AND paused_at IS NOT NULL
                     THEN end_date + (CURRENT_DATE - paused_at::date)
                     ELSE end_date
                 END,
                 paused_at = NULL,
                 pause_reason = NULL,
                 updated_at = NOW()
             WHERE id = $1 AND status = 'paused'
             RETURNING *`,
            [id]
        );
        if (!updated) {
            return res.status(409).json({ error: 'Solo se puede reanudar una membresía pausada' });
        }
        res.json(updated);
    } catch (error) {
        console.error('Resume membership error:', error);
        res.status(500).json({ error: 'Error al reanudar membresía' });
    }
});

// ============================================
// PATCH /api/memberships/:id/dates - Editar vigencia (start_date / end_date)
// Permiso: TODA la recepción (igual que /credits). Reactiva una membresía 'expired'
// si la nueva vigencia llega a hoy o después; y la vence si quedó en el pasado.
// ============================================
const UpdateDatesSchema = z.object({
    startDate: dateString.optional(),
    endDate: dateString.optional(),
    reason: z.string().trim().max(500).optional(),
}).refine(
    (d) => d.startDate !== undefined || d.endDate !== undefined,
    { message: 'Proporciona startDate y/o endDate', path: ['startDate'] },
);

router.patch('/:id/dates', authenticate, requireRole('admin', 'super_admin', 'reception'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const parsed = UpdateDatesSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
        }
        const { startDate, endDate, reason } = parsed.data;

        const membership = await queryOne<any>('SELECT * FROM memberships WHERE id = $1', [id]);
        if (!membership) {
            return res.status(404).json({ error: 'Membresía no encontrada' });
        }

        // Validación: endDate >= startDate cuando ambos vienen.
        if (startDate && endDate && endDate < startDate) {
            return res.status(400).json({ error: 'El vencimiento no puede ser anterior al inicio' });
        }
        // También contra el valor existente si solo viene uno de los dos.
        const existingStart = membership.start_date
            ? (membership.start_date instanceof Date
                ? membership.start_date.toISOString().split('T')[0]
                : String(membership.start_date).split('T')[0])
            : null;
        const existingEnd = membership.end_date
            ? (membership.end_date instanceof Date
                ? membership.end_date.toISOString().split('T')[0]
                : String(membership.end_date).split('T')[0])
            : null;
        const effStart = startDate ?? existingStart;
        const effEnd = endDate ?? existingEnd;
        if (effStart && effEnd && effEnd < effStart) {
            return res.status(400).json({ error: 'El vencimiento no puede ser anterior al inicio' });
        }

        // Update dinámico de los campos enviados.
        const setClauses: string[] = [];
        const params: unknown[] = [];
        if (startDate !== undefined) {
            params.push(startDate);
            setClauses.push(`start_date = $${params.length}::date`);
        }
        if (endDate !== undefined) {
            params.push(endDate);
            setClauses.push(`end_date = $${params.length}::date`);
        }
        params.push(id);
        const updated = await queryOne<any>(
            `UPDATE memberships SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
            params
        );

        // Reactivación / consistencia inmediata vs hoy (zona México):
        //  - end_date >= hoy y status='expired' → 'active' (reactivar vencida editada a futuro)
        //  - end_date <  hoy y status='active'  → 'expired'
        const reactivated = await queryOne<any>(
            `UPDATE memberships
                SET status = CASE
                    WHEN end_date IS NOT NULL
                         AND end_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City')::date
                         AND status = 'expired' THEN 'active'
                    WHEN end_date IS NOT NULL
                         AND end_date < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City')::date
                         AND status = 'active' THEN 'expired'
                    ELSE status
                END,
                updated_at = NOW()
              WHERE id = $1
              RETURNING *`,
            [id]
        );
        const finalRow = reactivated ?? updated;

        const reasonText = typeof reason === 'string' && reason.trim() ? reason.trim() : null;
        await logAction(query, {
            adminUserId: req.user!.userId,
            actionType: 'membership_dates_updated',
            entityType: 'membership',
            entityId: id,
            description: reasonText
                ? `Vigencia editada por ${req.user!.role}: ${reasonText}`
                : `Vigencia editada por ${req.user!.role}`,
            oldData: {
                start_date: membership.start_date,
                end_date: membership.end_date,
                status: membership.status,
            },
            newData: {
                start_date: (finalRow as any).start_date,
                end_date: (finalRow as any).end_date,
                status: (finalRow as any).status,
                reason: reasonText,
            },
            req,
        });

        res.json(finalRow);
    } catch (error) {
        console.error('Update membership dates error:', error);
        res.status(500).json({ error: 'Error al editar la vigencia' });
    }
});

// ============================================
// PATCH /api/memberships/:id/credits - Adjust credits (Admin)
// ============================================
router.patch('/:id/credits', authenticate, requireRole('admin', 'super_admin', 'reception'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { classes_remaining, reformer_remaining, multi_remaining, reason } = req.body;
        const role = req.user!.role;

        // Validate each field present in the body
        const validate = (name: string, val: unknown) => {
            if (val !== undefined && val !== null && (typeof val !== 'number' || val < 0 || !Number.isInteger(val))) {
                return `${name} debe ser un entero >= 0 o null`;
            }
            return null;
        };
        const errs = [
            validate('classes_remaining', classes_remaining),
            validate('reformer_remaining', reformer_remaining),
            validate('multi_remaining', multi_remaining),
        ].filter(Boolean);
        if (errs.length) return res.status(400).json({ error: errs.join('; ') });

        // At least one field must be present
        if (classes_remaining === undefined && reformer_remaining === undefined && multi_remaining === undefined) {
            return res.status(400).json({ error: 'Proporciona al menos uno: reformer_remaining, multi_remaining o classes_remaining' });
        }

        const membership = await queryOne('SELECT * FROM memberships WHERE id = $1', [id]);
        if (!membership) {
            return res.status(404).json({ error: 'Membresía no encontrada' });
        }

        // Reglas específicas para recepción: motivo obligatorio y |delta| ≤ 3 por bucket.
        // Reception master y admin (o reception con creditos_sin_limite) no tienen límite de delta;
        // motivo sigue obligatorio para recepción normal.
        const meRow = await queryOne<{ role: string; permissions: unknown; is_reception_master: boolean }>(
            `SELECT role, permissions, is_reception_master FROM users WHERE id = $1`, [req.user!.userId]
        );
        const sinLimite = hasPermission({ role: meRow?.role, permissions: meRow?.permissions, is_reception_master: meRow?.is_reception_master }, 'creditos_sin_limite');
        if (!sinLimite) {
            const reasonText = typeof reason === 'string' ? reason.trim() : '';
            if (reasonText.length < 5) {
                return res.status(400).json({ error: 'Recepción debe incluir un motivo (mínimo 5 caracteres) para ajustar créditos.' });
            }
            const checkDelta = (label: string, before: number | null | undefined, after: number | null | undefined) => {
                if (after === undefined) return null;
                const b = before == null ? 0 : Number(before);
                const a = after == null ? 0 : Number(after);
                const delta = Math.abs(a - b);
                if (delta > 3) {
                    return `Recepción solo puede ajustar hasta ±3 créditos por movimiento en ${label} (intentaste ±${delta}). Pide a admin.`;
                }
                return null;
            };
            const deltaErrs = [
                checkDelta('reformer_remaining', (membership as any).reformer_remaining, reformer_remaining),
                checkDelta('multi_remaining', (membership as any).multi_remaining, multi_remaining),
                checkDelta('classes_remaining', (membership as any).classes_remaining, classes_remaining),
            ].filter(Boolean);
            if (deltaErrs.length) return res.status(403).json({ error: deltaErrs.join('; ') });
        }

        // Build dynamic SET clause for whichever fields are present
        const setClauses: string[] = [];
        const params: unknown[] = [];
        if (reformer_remaining !== undefined) {
            params.push(reformer_remaining);
            setClauses.push(`reformer_remaining = $${params.length}`);
        }
        if (multi_remaining !== undefined) {
            params.push(multi_remaining);
            setClauses.push(`multi_remaining = $${params.length}`);
        }
        if (classes_remaining !== undefined) {
            params.push(classes_remaining);
            setClauses.push(`classes_remaining = $${params.length}`);
        }
        params.push(id);
        const updated = await queryOne(
            `UPDATE memberships SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
            params
        );

        // classes_remaining es DERIVADA (legacy/display): recomputar desde los buckets
        // para que nunca quede desincronizada. Ninguna regla de reserva la usa.
        await query(
            `UPDATE memberships
                SET classes_remaining = CASE
                    WHEN reformer_remaining IS NULL OR multi_remaining IS NULL THEN NULL
                    ELSE reformer_remaining + multi_remaining END
              WHERE id = $1`,
            [id]
        );

        const reasonText = typeof reason === 'string' && reason.trim() ? reason.trim() : null;
        await logAction(query, {
            adminUserId: req.user!.userId,
            actionType: 'credits_modified',
            entityType: 'membership',
            entityId: id,
            description: reasonText
                ? `Ajuste de créditos por ${role}: ${reasonText}`
                : `Ajuste de créditos por ${role}`,
            oldData: {
                reformer_remaining: (membership as any).reformer_remaining,
                multi_remaining: (membership as any).multi_remaining,
                classes_remaining: (membership as any).classes_remaining,
            },
            newData: {
                reformer_remaining: (updated as any).reformer_remaining,
                multi_remaining: (updated as any).multi_remaining,
                classes_remaining: (updated as any).classes_remaining,
                reason: reasonText,
            },
            req,
        });

        res.json(updated);
    } catch (error) {
        console.error('Adjust credits error:', error);
        res.status(500).json({ error: 'Error al ajustar créditos' });
    }
});

export default router;
