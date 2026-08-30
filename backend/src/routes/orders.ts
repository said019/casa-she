import { Router, Request, Response } from 'express';
import { civilDate, resolvePaidMembershipDates } from '../lib/membershipActivation.js';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { query, queryOne, pool } from '../config/database.js';
import { authenticate, requireRole, optionalAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { applyDiscountToOrder, resolveDiscountForOrder } from './discount-codes.js';
import { sendMembershipActivatedEmail, sendOrderRejectedEmail } from '../services/email.js';
import { sendMembershipActivatedNotice, sendWhatsAppMessage } from '../lib/whatsapp.js';
import { awardPaymentLoyaltyPoints, awardReferralBonus, reversePaymentLoyaltyPoints, reverseReferralBonus, consumeSampleClassDiscount, canBuySamplePlan } from '../lib/loyalty.js';
import { toDbClient } from '../lib/membershipSelection.js';
import { notifyMembershipRenewed, notifyPointsEarnedExternal } from '../lib/notifications.js';
import { mpConfigured, createPreference, syncPayment } from '../lib/mercadopago.js';
import { finalizePaidOrder } from '../lib/orderFulfillment.js';
import { ImageStorageError, subirComprobante } from '../lib/imageStorage.js';
import { downloadGoogleDriveFile } from '../lib/googleDrive.js';
import { hasPermission } from '../lib/permissions.js';

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

const DATA_URL_MIME_TYPE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i;
const BASE64_DATA_URL = /^data:([a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/i;
const BASE64_CONTENT = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const DEFAULT_PAYMENT_PROOF_FILE_NAME = 'comprobante';
const MAX_PAYMENT_PROOF_FILE_NAME_LENGTH = 255;
const GOOGLE_DRIVE_FILE_ID = /^[A-Za-z0-9_-]{10,}$/;

class PaymentProofRequestError extends Error {
    constructor(
        public readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = 'PaymentProofRequestError';
    }
}

export class PaymentProofDataUrlError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PaymentProofDataUrlError';
    }
}

export interface DecodedPaymentProofData {
    buffer: Buffer;
    mimeType: string;
}

export function normalizePaymentProofFileName(fileName: unknown): string {
    if (fileName === null || fileName === undefined) {
        return DEFAULT_PAYMENT_PROOF_FILE_NAME;
    }

    if (typeof fileName !== 'string') {
        throw new PaymentProofDataUrlError('El nombre del comprobante no es válido');
    }

    const normalizedFileName = fileName.trim();
    return normalizedFileName
        ? normalizedFileName.slice(0, MAX_PAYMENT_PROOF_FILE_NAME_LENGTH)
        : DEFAULT_PAYMENT_PROOF_FILE_NAME;
}

function isAllowedProofMimeType(mimeType: string): boolean {
    return /^image\/[a-z0-9!#$&^_.+-]+$/i.test(mimeType) || mimeType === 'application/pdf';
}

/**
 * Extracts only the Drive file IDs emitted by our storage layer (plus the
 * equivalent Drive viewer URLs used by older records). It intentionally does
 * not accept arbitrary HTTP URLs, so proof delivery never becomes an SSRF
 * proxy.
 */
export function extractGoogleDriveFileId(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (GOOGLE_DRIVE_FILE_ID.test(trimmed)) return trimmed;

    let url: URL;
    try {
        url = new URL(trimmed);
    } catch {
        return null;
    }

    if (url.protocol !== 'https:' || !['drive.google.com', 'www.drive.google.com'].includes(url.hostname.toLowerCase())) {
        return null;
    }

    const filePathMatch = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]{10,})(?:\/|$)/);
    if (filePathMatch) return filePathMatch[1];

    if (['/thumbnail', '/uc', '/open'].includes(url.pathname)) {
        const id = url.searchParams.get('id') || '';
        return GOOGLE_DRIVE_FILE_ID.test(id) ? id : null;
    }

    return null;
}

function normalizedProofMimeType(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const mimeType = value.trim().toLowerCase();
    return isAllowedProofMimeType(mimeType) ? mimeType : null;
}

function setProofContentHeaders(res: Response, mimeType: string, fileName: unknown): void {
    const safeFileName = normalizePaymentProofFileName(fileName).replace(/[\r\n"]/g, '_');
    res.set({
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(safeFileName)}`,
        'Cache-Control': 'private, no-store, max-age=0',
        Pragma: 'no-cache',
        'X-Content-Type-Options': 'nosniff',
    });
}

async function isPaymentProofReviewer(userId: string): Promise<boolean> {
    const user = await queryOne<{ role: string; permissions: unknown; is_reception_master: boolean }>(
        `SELECT role, permissions, is_reception_master FROM users WHERE id = $1`,
        [userId],
    );
    return hasPermission(user, 'caja');
}

/**
 * Validates a browser data URL before it is decoded or sent to storage.
 * The declared file_type remains optional for backwards compatibility, but if
 * present it must describe exactly the same MIME type as the data URL.
 */
export function decodePaymentProofDataUrl(
    fileData: unknown,
    declaredFileType: unknown,
): DecodedPaymentProofData {
    if (typeof fileData !== 'string') {
        throw new PaymentProofDataUrlError('Debes adjuntar un comprobante válido');
    }

    const match = BASE64_DATA_URL.exec(fileData);
    if (!match || !BASE64_CONTENT.test(match[2])) {
        throw new PaymentProofDataUrlError('El comprobante debe ser un data URL base64 válido');
    }

    const mimeType = match[1].toLowerCase();
    if (!DATA_URL_MIME_TYPE.test(mimeType) || !isAllowedProofMimeType(mimeType)) {
        throw new PaymentProofDataUrlError('El comprobante debe ser una imagen o PDF');
    }

    if (declaredFileType !== null && declaredFileType !== undefined) {
        if (typeof declaredFileType !== 'string' || !declaredFileType.trim()) {
            throw new PaymentProofDataUrlError('El tipo de archivo del comprobante no es válido');
        }

        if (declaredFileType.trim().toLowerCase() !== mimeType) {
            throw new PaymentProofDataUrlError('El tipo de archivo no coincide con el comprobante');
        }
    }

    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length) {
        throw new PaymentProofDataUrlError('El comprobante no puede estar vacío');
    }
    if (buffer.toString('base64') !== match[2]) {
        throw new PaymentProofDataUrlError('El comprobante debe usar base64 canónico');
    }

    return { buffer, mimeType };
}

const ApproveOrderSchema = z.object({
    admin_notes: z.string().max(500).optional(),
    adminNotes: z.string().max(500).optional(), // Legacy support
    startDate: z.string().refine((value) => civilDate(value) !== null, 'Fecha de inicio inválida').optional(),
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
                    NULL::text as file_url,
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
                NULL::text as proof_url,
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
// GET /api/orders/:id/proofs/:proofId/content - Authenticated proof bytes
// ============================================
router.get('/:id/proofs/:proofId/content', authenticate, async (req: Request, res: Response) => {
    try {
        const { id, proofId } = req.params;
        const viewerId = req.user?.userId;
        if (!viewerId) return res.status(401).json({ error: 'No autorizado' });

        const proof = await queryOne<{
            user_id: string;
            file_url: string;
            file_name: string | null;
            mime_type: string | null;
        }>(`
            SELECT o.user_id, pp.file_url, pp.file_name, pp.mime_type
              FROM payment_proofs pp
              JOIN orders o ON o.id = pp.order_id
             WHERE pp.id = $1 AND pp.order_id = $2
        `, [proofId, id]);

        if (!proof) return res.status(404).json({ error: 'Comprobante no encontrado' });

        const isOwner = proof.user_id === viewerId;
        if (!isOwner && !(await isPaymentProofReviewer(viewerId))) {
            return res.status(403).json({ error: 'No autorizado para ver este comprobante' });
        }

        // Legacy records remain readable, but only the same canonical image/PDF
        // data URLs accepted on upload are decoded and served.
        if (proof.file_url?.trim().toLowerCase().startsWith('data:')) {
            let decoded: DecodedPaymentProofData;
            try {
                decoded = decodePaymentProofDataUrl(proof.file_url, proof.mime_type || undefined);
            } catch (error) {
                console.warn('Invalid legacy payment proof data URL:', error);
                return res.status(422).json({ error: 'El comprobante almacenado no es válido' });
            }
            setProofContentHeaders(res, decoded.mimeType, proof.file_name);
            return res.status(200).send(decoded.buffer);
        }

        const driveFileId = extractGoogleDriveFileId(proof.file_url);
        const mimeType = normalizedProofMimeType(proof.mime_type);
        if (!driveFileId || !mimeType) {
            // Never dereference unknown URLs from the database. This prevents
            // public/external URLs from being proxied through authenticated API.
            return res.status(422).json({ error: 'El comprobante almacenado no es compatible' });
        }

        let driveResponse: globalThis.Response;
        try {
            driveResponse = await downloadGoogleDriveFile(driveFileId);
        } catch (error) {
            console.error('Download payment proof from Google Drive error:', error);
            return res.status(502).json({ error: 'No se pudo obtener el comprobante' });
        }

        if (driveResponse.status === 404) {
            return res.status(404).json({ error: 'El archivo del comprobante ya no está disponible' });
        }
        if (!driveResponse.ok || !driveResponse.body) {
            console.error('Google Drive proof download failed:', { status: driveResponse.status, proofId });
            return res.status(502).json({ error: 'No se pudo obtener el comprobante' });
        }

        setProofContentHeaders(res, mimeType, proof.file_name);
        const stream = Readable.fromWeb(driveResponse.body as never);
        stream.on('error', (error) => {
            console.error('Google Drive proof stream error:', error);
            if (!res.headersSent) res.status(502).json({ error: 'No se pudo obtener el comprobante' });
            else res.destroy(error);
        });
        stream.pipe(res);
    } catch (error) {
        console.error('Get payment proof content error:', error);
        if (!res.headersSent) res.status(500).json({ error: 'Error al obtener comprobante' });
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
                NULL::text as file_url,
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

        // MercadoPago Checkout Pro para pago con tarjeta
        let checkout_url: string | null = null;
        if (payment_method === 'card') {
            if (!mpConfigured()) {
                await query(`DELETE FROM orders WHERE id = $1`, [order.id]);
                return res.status(503).json({ error: 'Pago con tarjeta no disponible' });
            }
            const user = await queryOne<{ display_name: string; email: string }>(
                `SELECT display_name, email FROM users WHERE id = $1`, [userId]);
            try {
                const pref = await createPreference({
                    orderId: order.id,
                    orderNumber: order.order_number,
                    items: [{ title: plan.name, quantity: 1, unit_price: Number(order.total_amount) }],
                    payerEmail: user?.email || undefined,
                    backUrl: `${process.env.FRONTEND_URL}/app/orders/${order.id}`,
                    notificationUrl: process.env.BACKEND_URL ? `${process.env.BACKEND_URL}/webhooks/mercadopago` : undefined,
                });
                checkout_url = pref.checkoutUrl;
                await query(
                    `UPDATE orders SET payment_provider='mercadopago', mp_checkout_url=$1, updated_at=NOW()
                     WHERE id=$2`,
                    [pref.checkoutUrl, order.id]);
            } catch (mpErr: any) {
                console.error('MercadoPago checkout error:', mpErr.message);
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

        if (!mpConfigured()) {
            return res.status(503).json({ error: 'Pago con tarjeta no disponible' });
        }
        if (order.mp_checkout_url) {
            return res.json({ checkout_url: order.mp_checkout_url });
        }
        const pref = await createPreference({
            orderId: order.id,
            orderNumber: order.order_number,
            items: [{ title: order.plan_name, quantity: 1, unit_price: Number(order.total_amount) }],
            payerEmail: order.user_email || undefined,
            backUrl: `${process.env.FRONTEND_URL}/app/orders/${order.id}`,
            notificationUrl: process.env.BACKEND_URL ? `${process.env.BACKEND_URL}/webhooks/mercadopago` : undefined,
        });
        await query(
            `UPDATE orders SET payment_method='card', payment_provider='mercadopago',
                    mp_checkout_url=$1, updated_at=NOW()
             WHERE id=$2`,
            [pref.checkoutUrl, order.id]);
        res.json({ checkout_url: pref.checkoutUrl });
    } catch (err: any) {
        console.error('Pay with card error:', err.message);
        res.status(500).json({ error: 'No se pudo generar el checkout' });
    }
});

// ============================================
// POST /api/orders/:id/sync-mp - Reconciliar manualmente un pago de MercadoPago (admin)
// Si el webhook no llegó (p. ej. firma mal configurada), el admin fuerza la
// re-consulta del estado real y aprueba la orden si el pago está approved.
// ============================================
router.post('/:id/sync-mp', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const order = await queryOne<{ id: string; mp_payment_id: string | null }>(
            `SELECT id, mp_payment_id FROM orders WHERE id = $1`, [id]);
        if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
        if (!order.mp_payment_id) {
            return res.status(400).json({ error: 'La orden no tiene un pago de MercadoPago que reconciliar.' });
        }
        const payment = await syncPayment(String(order.mp_payment_id));
        await query(
            `UPDATE orders SET mp_payment_status=$1, mp_status_detail=$2, provider_synced_at=NOW(), updated_at=NOW()
             WHERE id=$3`,
            [payment.status, payment.status_detail, id]);
        if (payment.status === 'approved') {
            await finalizePaidOrder(id, { provider: 'mercadopago', paymentRef: String(payment.id) });
        }
        res.json({ status: payment.status, status_detail: payment.status_detail });
    } catch (err: any) {
        console.error('sync-mp error:', err.message);
        res.status(500).json({ error: 'No se pudo reconciliar el pago' });
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
        const notes = req.body.notes || '';
        const file_data = req.body.file_data || null;

        let decodedProof: DecodedPaymentProofData;
        let fileName: string;
        try {
            // Decode before opening a DB transaction so malformed payloads never
            // create partial order/proof state.
            decodedProof = decodePaymentProofDataUrl(file_data, req.body.file_type);
            fileName = normalizePaymentProofFileName(req.body.file_name);
        } catch (error) {
            if (error instanceof PaymentProofDataUrlError) {
                return res.status(400).json({ error: error.message });
            }
            throw error;
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Keep the order row locked from the status/ownership validation
            // through the remote upload and the final write. Without this, a
            // cancellation/rejection/approval completed while Drive uploads
            // could be overwritten back to pending_verification.
            const lockedOrder = await client.query<{ status: string }>(
                `SELECT status FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE`,
                [id, userId],
            );
            if (lockedOrder.rowCount !== 1) {
                throw new PaymentProofRequestError(404, 'Orden no encontrada');
            }
            if (!['pending_payment', 'pending_verification'].includes(lockedOrder.rows[0].status)) {
                throw new PaymentProofRequestError(400, 'Esta orden ya no acepta comprobantes');
            }

            let fileUrl: string;
            try {
                fileUrl = await subirComprobante(decodedProof.buffer, decodedProof.mimeType, fileName);
            } catch (error) {
                if (error instanceof ImageStorageError) {
                    if (error.code === 'INVALID_MIME_TYPE') {
                        throw new PaymentProofRequestError(400, 'El comprobante debe ser una imagen o PDF');
                    }
                    if (error.code === 'BASE64_TOO_LARGE') {
                        throw new PaymentProofRequestError(413, 'Comprobante demasiado grande para almacenamiento local (máx 1MB sin Drive)');
                    }
                }
                throw error;
            }

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
                fileName,
                decodedProof.mimeType,
                transfer_reference,
                notes
            ]);

            // The lock above makes this conditional update normally exact. The
            // predicate is a second defense against any future code path that
            // changes the row before this statement.
            const updatedOrder = await client.query(`
                UPDATE orders SET status = 'pending_verification', updated_at = NOW()
                WHERE id = $1 AND user_id = $2
                  AND status IN ('pending_payment', 'pending_verification')
            `, [id, userId]);
            if (updatedOrder.rowCount !== 1) {
                throw new PaymentProofRequestError(409, 'La orden cambió de estado; vuelve a intentarlo');
            }

            await client.query('COMMIT');

            res.status(201).json({
                message: 'Comprobante registrado exitosamente',
                proof: proof.rows[0],
                newStatus: 'pending_verification'
            });
        } catch (err) {
            await client.query('ROLLBACK').catch(() => undefined);
            if (err instanceof PaymentProofRequestError) {
                return res.status(err.status).json({ error: err.message });
            }
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

        // Card orders are settled exclusively by the MercadoPago webhook (Checkout Pro).
        // Approving them by hand would grant a membership without a confirmed
        // payment, so manual approval is forbidden for this method. Para reconciliar
        // un pago que no se reflejó, usar POST /:id/sync-mp.
        if (order.payment_method === 'card') {
            return res.status(409).json({
                error: 'Las órdenes con tarjeta se aprueban automáticamente al confirmarse el pago. No requieren aprobación manual.',
            });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const lockedOrder = await client.query(`SELECT status FROM orders WHERE id = $1 FOR UPDATE`, [id]);
            if (!['pending_verification', 'pending_payment'].includes(lockedOrder.rows[0]?.status)) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'La orden ya fue procesada por otra solicitud.' });
            }

            const dates = await resolvePaidMembershipDates(client, {
                userId: order.user_id,
                durationDays: Number(order.duration_days || 0),
                explicitStartDate: civilDate(startDate),
            });
            const start = dates.startDate;
            const end = dates.endDate;

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
                const startStr = start;
                const endStr = end;
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
                    const fmtEnd = new Date(`${end}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
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

                // Lock antes de revertir para consistencia frente a lecturas concurrentes
                // (mismo patrón que PUT /memberships/:id/cancel).
                const refundedPayments = await client.query<{ id: string }>(`
                    SELECT id FROM payments
                    WHERE membership_id IN (SELECT id FROM memberships WHERE order_id = $1)
                      AND status = 'completed'
                    FOR UPDATE
                `, [id]);

                await client.query(`
                    UPDATE payments SET
                        status = 'refunded'
                    WHERE membership_id IN (
                        SELECT id FROM memberships WHERE order_id = $1
                    ) AND status = 'completed'
                `, [id]);

                // Revierte los puntos de lealtad otorgados por esos pagos y el bono de
                // referido de esta orden. Antes rechazar una orden ya aprobada cancelaba la
                // membresía y marcaba el pago 'refunded', pero la clienta conservaba los
                // puntos canjeables y el referidor su bono — dinero real que el estudio ya no
                // había cobrado de verdad.
                for (const row of refundedPayments.rows) {
                    await reversePaymentLoyaltyPoints({ db: client, userId: order.user_id, paymentId: row.id });
                }
                if (order.discount_code_id) {
                    const refRow = await client.query(
                        `SELECT referral_owner_id FROM discount_codes WHERE id = $1 AND is_referral = true
                           AND referral_owner_id IS NOT NULL AND referral_owner_id <> $2`,
                        [order.discount_code_id, order.user_id]
                    );
                    const ownerId = refRow.rows[0]?.referral_owner_id;
                    if (ownerId) {
                        await reverseReferralBonus({ db: client, referrerUserId: ownerId, orderId: order.id });
                    }
                }
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
