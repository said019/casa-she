import { Router, Request, Response } from 'express';
import { query, queryOne, pool } from '../config/database.js';
import { authenticate, requireRole, optionalAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { z } from 'zod';

const router = Router();

// Schema for Plan validation
const PlanSchema = z.object({
    name: z.string().min(2, 'El nombre es obligatorio'),
    description: z.string().optional(),
    // nonnegative (no positive): los planes internos van en $0. El POST exige >0 solo si NO es interno.
    price: z.number().nonnegative('El precio no puede ser negativo'),
    currency: z.string().default('MXN'),
    durationDays: z.number().int().positive('La duración debe ser positiva'),
    classLimit: z.number().int().positive().nullable().optional(), // null = unlimited
    // Créditos por categoría: null = ILIMITADO, 0 = sin acceso a esa categoría.
    reformerCredits: z.number().int().nonnegative().nullable().optional(),
    multiCredits: z.number().int().nonnegative().nullable().optional(),
    features: z.array(z.string()).default([]),
    isActive: z.boolean().default(true),
    // Plan INTERNO: no visible para clientes (catálogo/landing/app); solo admin y recepción
    // lo ven y lo asignan. color = pastilla para identificar en las reservas (hex #RRGGBB).
    isInternal: z.boolean().default(false),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color inválido (#RRGGBB)').nullable().optional(),
    sortOrder: z.number().int().default(0),
    packageType: z.enum(['individual', 'mixto', 'sample']).default('mixto'),
    requiresStudioSelection: z.boolean().default(false),
});

// ============================================
// GET /api/plans - List all active plans (Public/Admin)
// ============================================
router.get('/', optionalAuth, async (req: Request, res: Response) => {
    try {
        const role = req.user?.role;
        const isAdmin = role === 'admin' || role === 'super_admin';
        // Staff (admin/recepción) SÍ ve los planes internos de plataforma; las clientas NO.
        const isStaff = isAdmin || role === 'reception';
        const showAll = isAdmin && req.query.all === 'true';

        let queryStr = `
      SELECT
        id, name, description, price, currency, duration_days,
        class_limit, reformer_credits, multi_credits,
        features, is_active, sort_order,
        package_type, requires_studio_selection,
        is_internal, color
      FROM plans
    `;

        const conds: string[] = [];
        if (!showAll) conds.push(`is_active = true`);
        if (!isStaff) conds.push(`COALESCE(is_internal, false) = false`);
        if (conds.length) queryStr += ` WHERE ${conds.join(' AND ')}`;

        queryStr += ` ORDER BY sort_order ASC, price ASC`;

        const plans = await query(queryStr);
        res.json(plans);
    } catch (error) {
        console.error('List plans error:', error);
        res.status(500).json({ error: 'Error al obtener planes' });
    }
});

// ============================================
// GET /api/plans/:id - Plan detail (Public)
// ============================================
router.get('/:id', optionalAuth, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const role = req.user?.role;
        const isStaff = role === 'admin' || role === 'super_admin' || role === 'reception';
        const plan = await queryOne<any>(
            `SELECT
        id, name, description, price, currency, duration_days,
        class_limit, reformer_credits, multi_credits,
        features, is_active, sort_order,
        package_type, requires_studio_selection,
        is_internal, color
       FROM plans
       WHERE id = $1`,
            [id]
        );

        if (!plan) {
            return res.status(404).json({ error: 'Plan no encontrado' });
        }

        if (!plan.is_active) {
            return res.status(404).json({ error: 'Plan no disponible' });
        }

        // Los planes internos de plataforma no se exponen a clientas (solo staff).
        if (plan.is_internal && !isStaff) {
            return res.status(404).json({ error: 'Plan no encontrado' });
        }

        res.json(plan);
    } catch (error) {
        console.error('Get plan error:', error);
        res.status(500).json({ error: 'Error al obtener plan' });
    }
});

// ============================================
// POST /api/plans - Create new plan (Admin)
// ============================================
router.post('/', authenticate, requirePermission('editar_catalogo'), async (req: Request, res: Response) => {
    try {
        const validation = PlanSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: 'Datos inválidos',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const data = validation.data;

        // Un plan NO interno debe tener precio > 0 (los internos sí pueden ir en $0).
        if (!data.isInternal && !(data.price > 0)) {
            return res.status(400).json({ error: 'Datos inválidos', details: { price: ['El precio debe ser positivo'] } });
        }

        const newPlan = await queryOne(
            `INSERT INTO plans (
        name, description, price, currency, duration_days,
        class_limit, reformer_credits, multi_credits, features, is_active, sort_order,
        package_type, requires_studio_selection, is_internal, color
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
            [
                data.name,
                data.description,
                data.price,
                data.currency,
                data.durationDays,
                data.classLimit || null,
                // === undefined ? null : v  (no usar || null: confundiría 0 con "no enviado")
                data.reformerCredits === undefined ? null : data.reformerCredits,
                data.multiCredits === undefined ? null : data.multiCredits,
                JSON.stringify(data.features),
                data.isActive,
                data.sortOrder,
                data.packageType,
                data.requiresStudioSelection,
                data.isInternal,
                data.color ?? null,
            ]
        );

        res.status(201).json(newPlan);
    } catch (error) {
        console.error('Create plan error:', error);
        res.status(500).json({ error: 'Error al crear plan' });
    }
});

// ============================================
// PUT /api/plans/:id - Update plan (Admin)
// ============================================
router.put('/:id', authenticate, requirePermission('editar_catalogo'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const validation = PlanSchema.partial().safeParse(req.body);

        if (!validation.success) {
            return res.status(400).json({
                error: 'Datos inválidos',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const data = validation.data;

        // Check if plan exists
        const existingPlan = await queryOne('SELECT id FROM plans WHERE id = $1', [id]);
        if (!existingPlan) {
            return res.status(404).json({ error: 'Plan no encontrado' });
        }

        // Dynamic update
        const updates: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        if (data.name !== undefined) {
            updates.push(`name = $${paramCount++}`);
            values.push(data.name);
        }
        if (data.description !== undefined) {
            updates.push(`description = $${paramCount++}`);
            values.push(data.description);
        }
        if (data.price !== undefined) {
            updates.push(`price = $${paramCount++}`);
            values.push(data.price);
        }
        if (data.durationDays !== undefined) {
            updates.push(`duration_days = $${paramCount++}`);
            values.push(data.durationDays);
        }
        if (data.classLimit !== undefined) {
            updates.push(`class_limit = $${paramCount++}`);
            values.push(data.classLimit);
        }
        if (data.reformerCredits !== undefined) {
            updates.push(`reformer_credits = $${paramCount++}`);
            values.push(data.reformerCredits); // null = ilimitado, 0 = sin acceso
        }
        if (data.multiCredits !== undefined) {
            updates.push(`multi_credits = $${paramCount++}`);
            values.push(data.multiCredits);
        }
        if (data.features !== undefined) {
            updates.push(`features = $${paramCount++}`);
            values.push(JSON.stringify(data.features));
        }
        if (data.isActive !== undefined) {
            updates.push(`is_active = $${paramCount++}`);
            values.push(data.isActive);
        }
        if (data.isInternal !== undefined) {
            updates.push(`is_internal = $${paramCount++}`);
            values.push(data.isInternal);
        }
        if (data.color !== undefined) {
            updates.push(`color = $${paramCount++}`);
            values.push(data.color);
        }
        if (data.sortOrder !== undefined) {
            updates.push(`sort_order = $${paramCount++}`);
            values.push(data.sortOrder);
        }

        if (updates.length > 0) {
            values.push(id); // push id for WHERE clause
            const result = await queryOne(
                `UPDATE plans SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
                values
            );

            // If duration_days changed, recompute end_date for existing memberships of this plan.
            // Applies to active/paused/pending memberships — ignores expired/cancelled.
            if (data.durationDays !== undefined) {
                await query(
                    `UPDATE memberships
                     SET end_date = (start_date::date + ($1::int || ' days')::interval)::date
                     WHERE plan_id = $2
                       AND start_date IS NOT NULL
                       AND status IN ('active', 'paused', 'pending_payment', 'pending_activation')`,
                    [data.durationDays, id]
                );
            }

            return res.json(result);
        }

        res.json(existingPlan);
    } catch (error) {
        console.error('Update plan error:', error);
        res.status(500).json({ error: 'Error al actualizar plan' });
    }
});

// ============================================
// DELETE /api/plans/:id - Deactivate or hard-delete plan (Admin)
//   - ?hard=true  → borrado permanente (solo si no tiene membresías ligadas)
//   - default     → soft delete (is_active = false)
// ============================================
router.delete('/:id', authenticate, requirePermission('editar_catalogo'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const hard = req.query.hard === 'true';
        const force = req.query.force === 'true'; // implica hard + arrastra órdenes

        const existing = await queryOne<{ id: string }>('SELECT id FROM plans WHERE id = $1', [id]);
        if (!existing) {
            return res.status(404).json({ error: 'Plan no encontrado' });
        }

        if (hard || force) {
            const [memCountRow, ordCountRow] = await Promise.all([
                queryOne<{ count: string }>(
                    'SELECT COUNT(*) as count FROM memberships WHERE plan_id = $1',
                    [id]
                ),
                queryOne<{ count: string }>(
                    'SELECT COUNT(*) as count FROM orders WHERE plan_id = $1',
                    [id]
                ).catch(() => ({ count: '0' })),
            ]);
            const membershipsCount = parseInt(memCountRow?.count || '0', 10);
            const ordersCount = parseInt(ordCountRow?.count || '0', 10);

            // Membresías SIEMPRE bloquean el delete: tienen pagos, bookings, historia.
            if (membershipsCount > 0) {
                return res.status(409).json({
                    error: 'No se puede eliminar permanentemente',
                    message: `Este paquete tiene ${membershipsCount} membresía(s) asociada(s) con historial de clientes. Desactívalo en su lugar.`,
                    membershipsCount,
                    ordersCount,
                });
            }

            // Órdenes: en modo `hard` bloquean; en modo `force` se borran en cascada.
            if (ordersCount > 0 && !force) {
                return res.status(409).json({
                    error: 'No se puede eliminar permanentemente',
                    message: `Este paquete tiene ${ordersCount} orden(es) de compra asociada(s).`,
                    ordersCount,
                    canForce: true, // hint para el frontend: ofrece "borrar también las órdenes"
                });
            }

            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                if (force && ordersCount > 0) {
                    // ON DELETE CASCADE en payment_proofs (003_orders_payment_system.sql:85)
                    // → al borrar orders se limpian los proofs solos.
                    // payments.order_id es ON DELETE SET NULL → no bloquea.
                    await client.query('DELETE FROM orders WHERE plan_id = $1', [id]);
                }
                await client.query('DELETE FROM plans WHERE id = $1', [id]);
                await client.query('COMMIT');
                return res.json({
                    message: 'Plan eliminado permanentemente',
                    deletedOrders: force ? ordersCount : 0,
                });
            } catch (err: any) {
                try { await client.query('ROLLBACK'); } catch { /* noop */ }
                if (err?.code === '23503') {
                    return res.status(409).json({
                        error: 'No se puede eliminar permanentemente',
                        message: 'El paquete tiene datos relacionados que lo bloquean. Desactívalo en su lugar.',
                        detail: err.detail || null,
                    });
                }
                throw err;
            } finally {
                client.release();
            }
        }

        await query('UPDATE plans SET is_active = false WHERE id = $1', [id]);
        res.json({ message: 'Plan desactivado exitosamente' });
    } catch (error) {
        console.error('Delete plan error:', error);
        res.status(500).json({ error: 'Error al eliminar plan' });
    }
});

export default router;
