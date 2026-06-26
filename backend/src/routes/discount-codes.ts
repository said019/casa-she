import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// ============================================
// SCHEMAS
// ============================================

const CreateDiscountCodeSchema = z.object({
    code: z.string().min(3).max(50).transform((v) => v.toUpperCase().trim()),
    description: z.string().max(500).optional().default(''),
    discount_type: z.enum(['percentage', 'fixed']),
    discount_value: z.number().positive(),
    max_uses: z.number().int().positive().optional().nullable(),
    valid_from: z.string().optional(),
    valid_until: z.string().optional().nullable(),
    min_purchase: z.number().min(0).optional().default(0),
    is_active: z.boolean().optional().default(true),
    plan_ids: z.array(z.string().uuid()).optional().default([]), // Empty = applies to ALL plans
    user_id: z.string().uuid().optional().nullable(), // If set, only this client can use the code
});

const UpdateDiscountCodeSchema = CreateDiscountCodeSchema.partial();

const ValidateCodeSchema = z.object({
    code: z.string().min(1).transform((v) => v.toUpperCase().trim()),
    plan_id: z.string().uuid(),
    subtotal: z.coerce.number().min(0),
});

// ============================================
// ADMIN: GET /api/discount-codes - List all codes
// ============================================
router.get('/', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const codes = await query(`
            SELECT dc.*,
                   COALESCE(
                       json_agg(
                           json_build_object('id', p.id, 'name', p.name)
                       ) FILTER (WHERE p.id IS NOT NULL),
                       '[]'
                   ) as applicable_plans
            FROM discount_codes dc
            LEFT JOIN discount_code_plans dcp ON dc.id = dcp.discount_code_id
            LEFT JOIN plans p ON dcp.plan_id = p.id
            GROUP BY dc.id
            ORDER BY dc.created_at DESC
        `);

        res.json(codes.map((c) => ({
            id: c.id,
            code: c.code,
            description: c.description,
            discountType: c.discount_type,
            discountValue: parseFloat(c.discount_value),
            maxUses: c.max_uses,
            currentUses: c.current_uses,
            validFrom: c.valid_from,
            validUntil: c.valid_until,
            minPurchase: parseFloat(c.min_purchase) || 0,
            isActive: c.is_active,
            applicablePlans: c.applicable_plans,
            createdAt: c.created_at,
        })));
    } catch (error) {
        console.error('List discount codes error:', error);
        res.status(500).json({ error: 'Error al obtener códigos de descuento' });
    }
});

// ============================================
// ADMIN: POST /api/discount-codes - Create code
// ============================================
router.post('/', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const data = CreateDiscountCodeSchema.parse(req.body);

        // Check code uniqueness
        const existing = await queryOne(`SELECT id FROM discount_codes WHERE code = $1`, [data.code]);
        if (existing) {
            return res.status(400).json({ error: `El código "${data.code}" ya existe` });
        }

        // Validate percentage max 100
        if (data.discount_type === 'percentage' && data.discount_value > 100) {
            return res.status(400).json({ error: 'El porcentaje no puede ser mayor a 100' });
        }

        const code = await queryOne(
            `INSERT INTO discount_codes (
                code, description, discount_type, discount_value,
                max_uses, valid_from, valid_until, min_purchase, is_active, user_id, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *`,
            [
                data.code, data.description, data.discount_type, data.discount_value,
                data.max_uses || null, data.valid_from || new Date().toISOString(),
                data.valid_until || null, data.min_purchase, data.is_active,
                data.user_id || null, req.user!.userId,
            ]
        );

        // Link to specific plans
        if (data.plan_ids.length > 0) {
            const planValues = data.plan_ids.map((pid, i) => `($1, $${i + 2})`).join(', ');
            await query(
                `INSERT INTO discount_code_plans (discount_code_id, plan_id) VALUES ${planValues}`,
                [code.id, ...data.plan_ids]
            );
        }

        res.status(201).json({
            id: code.id,
            code: code.code,
            message: 'Código de descuento creado exitosamente',
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Datos inválidos', details: error.errors });
        }
        console.error('Create discount code error:', error);
        res.status(500).json({ error: 'Error al crear código de descuento' });
    }
});

// ============================================
// ADMIN: PUT /api/discount-codes/:id - Update code
// ============================================
router.put('/:id', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const data = UpdateDiscountCodeSchema.parse(req.body);
        const codeId = req.params.id;

        // Build dynamic update
        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        const fieldMap: Record<string, string> = {
            code: 'code', description: 'description',
            discount_type: 'discount_type', discount_value: 'discount_value',
            max_uses: 'max_uses', valid_from: 'valid_from', valid_until: 'valid_until',
            min_purchase: 'min_purchase', is_active: 'is_active',
        };

        for (const [key, col] of Object.entries(fieldMap)) {
            if ((data as any)[key] !== undefined) {
                fields.push(`${col} = $${idx++}`);
                values.push((data as any)[key]);
            }
        }

        if (fields.length > 0) {
            values.push(codeId);
            const updated = await queryOne(
                `UPDATE discount_codes SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
                values
            );
            if (!updated) {
                return res.status(404).json({ error: 'Código no encontrado' });
            }
        }

        // Update plan associations if provided
        if (data.plan_ids !== undefined) {
            // Remove existing
            await query(`DELETE FROM discount_code_plans WHERE discount_code_id = $1`, [codeId]);

            // Insert new
            if (data.plan_ids.length > 0) {
                const planValues = data.plan_ids.map((_, i) => `($1, $${i + 2})`).join(', ');
                await query(
                    `INSERT INTO discount_code_plans (discount_code_id, plan_id) VALUES ${planValues}`,
                    [codeId, ...data.plan_ids]
                );
            }
        }

        res.json({ message: 'Código actualizado exitosamente' });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Datos inválidos', details: error.errors });
        }
        console.error('Update discount code error:', error);
        res.status(500).json({ error: 'Error al actualizar código' });
    }
});

// ============================================
// ADMIN: DELETE /api/discount-codes/:id - Delete code
// ============================================
router.delete('/:id', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const code = await queryOne(`DELETE FROM discount_codes WHERE id = $1 RETURNING id`, [req.params.id]);

        if (!code) {
            return res.status(404).json({ error: 'Código no encontrado' });
        }

        res.json({ message: 'Código eliminado' });
    } catch (error) {
        console.error('Delete discount code error:', error);
        res.status(500).json({ error: 'Error al eliminar código' });
    }
});

// ============================================
// PUBLIC: POST /api/discount-codes/validate - Validate & calculate discount
// ============================================
router.post('/validate', authenticate, async (req: Request, res: Response) => {
    try {
        const data = ValidateCodeSchema.parse(req.body);

        // Find code
        const code = await queryOne(
            `SELECT * FROM discount_codes WHERE code = $1 AND is_active = true`,
            [data.code]
        );

        if (!code) {
            return res.status(404).json({ error: 'Código no válido o expirado', valid: false });
        }

        // Personal code: only the assigned user can redeem it
        if (code.user_id && code.user_id !== req.user!.userId) {
            return res.status(403).json({ error: 'Este código no es para tu cuenta', valid: false });
        }

        // Check expiration
        const now = new Date();
        if (code.valid_from && new Date(code.valid_from) > now) {
            return res.status(400).json({ error: 'Este código aún no es válido', valid: false });
        }
        if (code.valid_until && new Date(code.valid_until) < now) {
            return res.status(400).json({ error: 'Este código ha expirado', valid: false });
        }

        // Check max uses
        if (code.max_uses !== null && code.current_uses >= code.max_uses) {
            return res.status(400).json({ error: 'Este código ha alcanzado el máximo de usos', valid: false });
        }

        // Check minimum purchase
        if (data.subtotal < parseFloat(code.min_purchase)) {
            return res.status(400).json({
                error: `El monto mínimo de compra es $${parseFloat(code.min_purchase)} MXN`,
                valid: false,
            });
        }

        // Check plan applicability
        const planLinks = await query(
            `SELECT plan_id FROM discount_code_plans WHERE discount_code_id = $1`,
            [code.id]
        );

        // If there are plan restrictions, check if this plan is included
        if (planLinks.length > 0) {
            const applicablePlanIds = planLinks.map((p) => p.plan_id);
            if (!applicablePlanIds.includes(data.plan_id)) {
                return res.status(400).json({
                    error: 'Este código no aplica para el paquete seleccionado',
                    valid: false,
                });
            }
        }

        // Calculate discount
        let discountAmount: number;
        if (code.discount_type === 'percentage') {
            discountAmount = Math.round(data.subtotal * (parseFloat(code.discount_value) / 100) * 100) / 100;
        } else {
            discountAmount = Math.min(parseFloat(code.discount_value), data.subtotal);
        }

        const finalTotal = Math.max(data.subtotal - discountAmount, 0);

        res.json({
            valid: true,
            code: code.code,
            discountType: code.discount_type,
            discountValue: parseFloat(code.discount_value),
            discountAmount,
            originalTotal: data.subtotal,
            finalTotal,
            description: code.description,
            codeId: code.id,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Datos inválidos', valid: false });
        }
        console.error('Validate discount code error:', error);
        res.status(500).json({ error: 'Error al validar código', valid: false });
    }
});

// ============================================
// INTERNAL: Apply discount to order (called from orders route)
// ============================================
/**
 * Valida un código de descuento por ID y CALCULA el descuento real en el servidor.
 * NO confía en montos enviados por el cliente (evita inyección de descuento →
 * paquete gratis). Mismas reglas que POST /validate, pero por id.
 */
export async function resolveDiscountForOrder(params: {
    codeId: string;
    planId: string;
    subtotal: number;
    userId: string;
}): Promise<{ ok: true; discountAmount: number } | { ok: false; error: string }> {
    const { codeId, planId, subtotal, userId } = params;

    const code = await queryOne<any>(
        `SELECT * FROM discount_codes WHERE id = $1 AND is_active = true`,
        [codeId]
    );
    if (!code) return { ok: false, error: 'Código de descuento no válido o inactivo' };

    // Código personal: solo el usuario asignado puede redimirlo.
    if (code.user_id && code.user_id !== userId) {
        return { ok: false, error: 'Este código no es para tu cuenta' };
    }

    const now = new Date();
    if (code.valid_from && new Date(code.valid_from) > now) {
        return { ok: false, error: 'Este código aún no es válido' };
    }
    if (code.valid_until && new Date(code.valid_until) < now) {
        return { ok: false, error: 'Este código ha expirado' };
    }
    if (code.max_uses !== null && code.current_uses >= code.max_uses) {
        return { ok: false, error: 'Este código ha alcanzado el máximo de usos' };
    }
    if (subtotal < parseFloat(code.min_purchase || '0')) {
        return { ok: false, error: `El monto mínimo de compra es $${parseFloat(code.min_purchase || '0')} MXN` };
    }

    // Aplicabilidad por plan (si el código está restringido a ciertos paquetes).
    const planLinks = await query<{ plan_id: string }>(
        `SELECT plan_id FROM discount_code_plans WHERE discount_code_id = $1`,
        [codeId]
    );
    if (planLinks.length > 0 && !planLinks.map((p) => p.plan_id).includes(planId)) {
        return { ok: false, error: 'Este código no aplica para el paquete seleccionado' };
    }

    // Cálculo server-authoritative.
    let discountAmount: number;
    if (code.discount_type === 'percentage') {
        discountAmount = Math.round(subtotal * (parseFloat(code.discount_value) / 100) * 100) / 100;
    } else {
        discountAmount = Math.min(parseFloat(code.discount_value), subtotal);
    }
    return { ok: true, discountAmount: Math.max(0, discountAmount) };
}

export async function applyDiscountToOrder(codeId: string, orderId: string, discountAmount: number) {
    // Increment usage
    await query(
        `UPDATE discount_codes SET current_uses = current_uses + 1 WHERE id = $1`,
        [codeId]
    );

    // Link discount to order
    await query(
        `UPDATE orders SET discount_code_id = $1, discount_amount = $2 WHERE id = $3`,
        [codeId, discountAmount, orderId]
    );
}

export default router;
