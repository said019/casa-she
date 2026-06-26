import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Resuelve a qué caja imputar un egreso en EFECTIVO: la ÚNICA caja abierta de la sucursal.
// Si hay 0 o varias cajas abiertas (ambiguo) devuelve null → el egreso queda sin turno y el admin
// decide a qué caja imputarlo (evita restar de la caja equivocada). Fuente única usada por POST/PUT/bulk.
async function resolveFacilityOpenShift(facilityId: string | null | undefined): Promise<string | null> {
    if (!facilityId) return null;
    const open = await query<{ id: string }>(
        `SELECT id FROM cash_shifts WHERE facility_id = $1 AND status = 'open'`,
        [facilityId]
    );
    return Array.isArray(open) && open.length === 1 ? (open[0] as any).id : null;
}

// ============================================
// SCHEMAS
// ============================================

const CreateEgresoSchema = z.object({
    category: z.enum(['renta', 'servicios', 'internet', 'nomina', 'marketing', 'insumos', 'mantenimiento', 'seguros', 'otros']),
    concept: z.string().min(2).max(255),
    description: z.string().max(1000).optional().default(''),
    amount: z.coerce.number().positive(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.enum(['pendiente', 'pagado', 'cancelado']).optional().default('pendiente'),
    is_recurring: z.boolean().optional().default(false),
    recurring_day: z.coerce.number().int().min(1).max(31).optional().nullable(),
    vendor: z.string().max(255).optional().default(''),
    notes: z.string().max(1000).optional().default(''),
    distribution: z.record(z.number().min(0).max(100)).optional().default({}),
    receipt_url: z.string().optional().nullable(),
    receipt_file_name: z.string().optional().nullable(),
    facility_id: z.string().uuid().optional().nullable(),
    shift_id: z.string().uuid().optional().nullable(),
    payment_method: z.enum(['cash', 'transfer', 'card']).optional().default('cash'),
});

const UpdateEgresoSchema = CreateEgresoSchema.partial();

// ============================================
// GET /api/egresos - List egresos with filters
// ============================================
router.get('/', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { category, status, startDate, endDate, search, recurring, facility } = req.query;

        let sql = `SELECT e.*, f.name AS facility_name FROM egresos e LEFT JOIN facilities f ON f.id = e.facility_id WHERE 1=1`;
        const params: any[] = [];
        let idx = 1;

        if (facility && facility !== 'all') {
            sql += ` AND e.facility_id = $${idx++}`;
            params.push(facility);
        }
        if (category && category !== 'all') {
            sql += ` AND e.category = $${idx++}`;
            params.push(category);
        }
        if (status && status !== 'all') {
            sql += ` AND e.status = $${idx++}`;
            params.push(status);
        }
        if (startDate) {
            sql += ` AND e.date >= $${idx++}`;
            params.push(startDate);
        }
        if (endDate) {
            sql += ` AND e.date <= $${idx++}`;
            params.push(endDate);
        }
        if (search) {
            sql += ` AND (e.concept ILIKE $${idx} OR e.vendor ILIKE $${idx} OR e.description ILIKE $${idx})`;
            params.push(`%${search}%`);
            idx++;
        }
        if (recurring === 'true') {
            sql += ` AND e.is_recurring = true`;
        }

        sql += ` ORDER BY e.date DESC, e.created_at DESC`;

        const rows = await query(sql, params);
        res.json(rows.map(mapEgresoRow));
    } catch (error) {
        console.error('List egresos error:', error);
        res.status(500).json({ error: 'Error al obtener egresos' });
    }
});

// ============================================
// GET /api/egresos/dashboard - Dashboard stats
// ============================================
router.get('/dashboard', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const monthsBack = parseInt(req.query.months as string) || 6;

        // Current month totals
        const currentMonth = await queryOne(`
            SELECT
                COALESCE(SUM(amount), 0) AS total,
                COALESCE(SUM(CASE WHEN status = 'pagado' THEN amount ELSE 0 END), 0) AS paid,
                COALESCE(SUM(CASE WHEN status = 'pendiente' THEN amount ELSE 0 END), 0) AS pending,
                COUNT(*) AS count
            FROM egresos
            WHERE date >= DATE_TRUNC('month', CURRENT_DATE)
              AND status != 'cancelado'
        `);

        // By category (current month)
        const byCategory = await query(`
            SELECT
                category,
                COALESCE(SUM(amount), 0) AS total,
                COUNT(*) AS count
            FROM egresos
            WHERE date >= DATE_TRUNC('month', CURRENT_DATE)
              AND status != 'cancelado'
            GROUP BY category
            ORDER BY total DESC
        `);

        // Monthly history
        const history = await query(`
            SELECT
                DATE_TRUNC('month', date) AS month,
                COALESCE(SUM(amount), 0) AS total,
                COUNT(*) AS count
            FROM egresos
            WHERE date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '${monthsBack} months'
              AND status != 'cancelado'
            GROUP BY DATE_TRUNC('month', date)
            ORDER BY month ASC
        `);

        // Distribution breakdown (aggregate distribution JSONB across current month)
        const distributionRows = await query(`
            SELECT distribution, amount
            FROM egresos
            WHERE date >= DATE_TRUNC('month', CURRENT_DATE)
              AND status != 'cancelado'
              AND distribution IS NOT NULL
              AND distribution != '{}'::jsonb
        `);

        // Calculate weighted distribution
        const distTotals: Record<string, number> = {};
        let distSum = 0;
        for (const row of distributionRows) {
            const dist = row.distribution as Record<string, number>;
            const amt = parseFloat(row.amount) || 0;
            for (const [key, pct] of Object.entries(dist)) {
                const allocated = amt * (pct / 100);
                distTotals[key] = (distTotals[key] || 0) + allocated;
                distSum += allocated;
            }
        }

        const distributionBreakdown = Object.entries(distTotals).map(([label, amount]) => ({
            label,
            amount: Math.round(amount * 100) / 100,
            percentage: distSum > 0 ? Math.round((amount / distSum) * 100) : 0,
        })).sort((a, b) => b.amount - a.amount);

        // By facility/sucursal (current month)
        const byFacility = await query(`
            SELECT e.facility_id, f.name AS facility_name,
                   COALESCE(SUM(e.amount), 0) AS total, COUNT(*) AS count
            FROM egresos e
            LEFT JOIN facilities f ON f.id = e.facility_id
            WHERE e.date >= DATE_TRUNC('month', CURRENT_DATE)
              AND e.status != 'cancelado'
            GROUP BY e.facility_id, f.name
            ORDER BY total DESC
        `);

        res.json({
            currentMonth: {
                total: parseFloat(currentMonth?.total || '0'),
                paid: parseFloat(currentMonth?.paid || '0'),
                pending: parseFloat(currentMonth?.pending || '0'),
                count: parseInt(currentMonth?.count || '0'),
            },
            byCategory: byCategory.map((r) => ({
                category: r.category,
                total: parseFloat(r.total) || 0,
                count: parseInt(r.count) || 0,
            })),
            history: history.map((r) => ({
                month: r.month,
                total: parseFloat(r.total) || 0,
                count: parseInt(r.count) || 0,
            })),
            distributionBreakdown,
            byFacility: byFacility.map((r) => ({
                facility_id: r.facility_id,
                facility_name: r.facility_name,
                total: parseFloat(r.total) || 0,
                count: parseInt(r.count) || 0,
            })),
        });
    } catch (error) {
        console.error('Egresos dashboard error:', error);
        res.status(500).json({ error: 'Error al obtener dashboard de egresos' });
    }
});

// ============================================
// POST /api/egresos - Create egreso
// ============================================
router.post('/', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const data = CreateEgresoSchema.parse(req.body);

        // Egreso pagado en EFECTIVO sin turno → asígnalo al turno abierto de la sucursal,
        // para que el dinero que salió de la caja cuadre en el corte (evita faltante "fantasma").
        let shiftId: string | null = data.shift_id || null;
        if (!shiftId && (data.payment_method || 'cash') === 'cash' && data.status === 'pagado') {
            shiftId = await resolveFacilityOpenShift(data.facility_id);
        }

        const row = await queryOne(
            `INSERT INTO egresos (
                category, concept, description, amount, date, status,
                is_recurring, recurring_day, vendor, notes, distribution,
                receipt_url, receipt_file_name, created_by,
                paid_at, facility_id, shift_id, payment_method
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10, $11,
                $12, $13, $14,
                $15, $16, $17, $18
            ) RETURNING *`,
            [
                data.category, data.concept, data.description, data.amount, data.date, data.status,
                data.is_recurring, data.recurring_day || null, data.vendor, data.notes,
                JSON.stringify(data.distribution),
                data.receipt_url || null, data.receipt_file_name || null, req.user!.userId,
                data.status === 'pagado' ? new Date() : null, data.facility_id || null,
                shiftId, data.payment_method || 'cash',
            ]
        );

        res.status(201).json(mapEgresoRow(row));
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Datos inválidos', details: error.errors });
        }
        console.error('Create egreso error:', error);
        res.status(500).json({ error: 'Error al crear egreso' });
    }
});

// ============================================
// PUT /api/egresos/:id - Update egreso
// ============================================
router.put('/:id', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const data = UpdateEgresoSchema.parse(req.body);

        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        const fieldMap: Record<string, string> = {
            category: 'category', concept: 'concept', description: 'description',
            amount: 'amount', date: 'date', status: 'status',
            is_recurring: 'is_recurring', recurring_day: 'recurring_day',
            vendor: 'vendor', notes: 'notes',
            receipt_url: 'receipt_url', receipt_file_name: 'receipt_file_name',
            facility_id: 'facility_id',
        };

        for (const [key, col] of Object.entries(fieldMap)) {
            if ((data as any)[key] !== undefined) {
                fields.push(`${col} = $${idx++}`);
                values.push((data as any)[key]);
            }
        }

        if (data.distribution !== undefined) {
            fields.push(`distribution = $${idx++}`);
            values.push(JSON.stringify(data.distribution));
        }

        // Al marcar 'pagado': fijar paid_at y, si es egreso en EFECTIVO sin turno, ligarlo a la caja
        // abierta de su sucursal (igual que el POST) para que el efectivo que sale cuadre en el corte.
        if (data.status === 'pagado') {
            fields.push(`paid_at = COALESCE(paid_at, NOW())`);
            const cur = await queryOne<{ status: string; facility_id: string | null; payment_method: string | null; shift_id: string | null }>(
                `SELECT status, facility_id, payment_method, shift_id FROM egresos WHERE id = $1`,
                [req.params.id]
            );
            if (cur && cur.status !== 'pagado' && !cur.shift_id && (cur.payment_method || 'cash') === 'cash') {
                const targetFacility = data.facility_id !== undefined ? data.facility_id : cur.facility_id;
                const linkShift = await resolveFacilityOpenShift(targetFacility);
                if (linkShift) {
                    fields.push(`shift_id = $${idx++}`);
                    values.push(linkShift);
                }
            }
        }

        if (fields.length === 0) {
            return res.status(400).json({ error: 'No hay campos para actualizar' });
        }

        values.push(req.params.id);
        const row = await queryOne(
            `UPDATE egresos SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
            values
        );

        if (!row) return res.status(404).json({ error: 'Egreso no encontrado' });
        res.json(mapEgresoRow(row));
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Datos inválidos', details: error.errors });
        }
        console.error('Update egreso error:', error);
        res.status(500).json({ error: 'Error al actualizar egreso' });
    }
});

// ============================================
// DELETE /api/egresos/:id - Delete egreso
// ============================================
router.delete('/:id', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const row = await queryOne(`DELETE FROM egresos WHERE id = $1 RETURNING id`, [req.params.id]);
        if (!row) return res.status(404).json({ error: 'Egreso no encontrado' });
        res.json({ message: 'Egreso eliminado' });
    } catch (error) {
        console.error('Delete egreso error:', error);
        res.status(500).json({ error: 'Error al eliminar egreso' });
    }
});

// ============================================
// POST /api/egresos/bulk - Bulk status update
// ============================================
router.post('/bulk', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { ids, action } = req.body as { ids: string[]; action: 'pagado' | 'delete' };

        if (!ids?.length) return res.status(400).json({ error: 'No se seleccionaron egresos' });

        if (action === 'pagado') {
            // Por egreso: liga los que pasan a pagado en EFECTIVO sin turno a la caja abierta de SU
            // sucursal (si es única), para que el efectivo que sale cuadre en el corte de esa caja.
            const rows = await query<{ id: string; status: string; facility_id: string | null; payment_method: string | null; shift_id: string | null }>(
                `SELECT id, status, facility_id, payment_method, shift_id FROM egresos WHERE id = ANY($1)`,
                [ids]
            );
            for (const e of rows) {
                const linkable = e.status !== 'pagado' && !e.shift_id && (e.payment_method || 'cash') === 'cash';
                const linkShift = linkable ? await resolveFacilityOpenShift(e.facility_id) : null;
                if (linkShift) {
                    await query(
                        `UPDATE egresos SET status = 'pagado', paid_at = COALESCE(paid_at, NOW()), shift_id = $2 WHERE id = $1`,
                        [e.id, linkShift]
                    );
                } else {
                    await query(
                        `UPDATE egresos SET status = 'pagado', paid_at = COALESCE(paid_at, NOW()) WHERE id = $1`,
                        [e.id]
                    );
                }
            }
        } else if (action === 'delete') {
            await query(`DELETE FROM egresos WHERE id = ANY($1)`, [ids]);
        } else {
            return res.status(400).json({ error: 'Acción inválida' });
        }

        res.json({ message: 'Operación completada', count: ids.length });
    } catch (error) {
        console.error('Bulk egresos error:', error);
        res.status(500).json({ error: 'Error en operación masiva' });
    }
});

// ============================================
// HELPER
// ============================================

function mapEgresoRow(row: any) {
    return {
        id: row.id,
        category: row.category,
        concept: row.concept,
        description: row.description || '',
        amount: parseFloat(row.amount) || 0,
        currency: row.currency || 'MXN',
        status: row.status,
        date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date).split('T')[0],
        paidAt: row.paid_at,
        isRecurring: row.is_recurring,
        recurringDay: row.recurring_day,
        vendor: row.vendor || '',
        notes: row.notes || '',
        distribution: row.distribution || {},
        receiptUrl: row.receipt_url,
        receiptFileName: row.receipt_file_name,
        facilityId: row.facility_id || null,
        facilityName: row.facility_name || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export default router;
