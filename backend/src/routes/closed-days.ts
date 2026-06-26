import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { cancelClassWithRefunds } from '../lib/cancel-class.js';

const router = Router();

const ClosedDaySchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().min(1).max(255),
});

// ============================================
// GET /api/closed-days - List all closed days
// ============================================
router.get('/', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const rows = await query(`SELECT * FROM studio_closed_days ORDER BY date DESC`);
        res.json(rows.map(mapRow));
    } catch (error) {
        console.error('List closed days error:', error);
        res.status(500).json({ error: 'Error al obtener días cerrados' });
    }
});

// ============================================
// GET /api/closed-days/range - Closed days in date range
// ============================================
router.get('/range', authenticate, async (req: Request, res: Response) => {
    try {
        const { start, end } = req.query;
        if (!start || !end) return res.status(400).json({ error: 'start y end son requeridos' });

        const rows = await query(
            `SELECT * FROM studio_closed_days WHERE date >= $1 AND date <= $2 ORDER BY date`,
            [start, end]
        );
        res.json(rows.map(mapRow));
    } catch (error) {
        console.error('Range closed days error:', error);
        res.status(500).json({ error: 'Error al obtener días cerrados' });
    }
});

// ============================================
// POST /api/closed-days - Create closed day + auto-cancel classes
// ============================================
router.post('/', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const data = ClosedDaySchema.parse(req.body);

        // Check if already exists
        const existing = await queryOne(`SELECT id FROM studio_closed_days WHERE date = $1`, [data.date]);
        if (existing) {
            return res.status(400).json({ error: 'Este día ya está marcado como cerrado' });
        }

        const row = await queryOne(
            `INSERT INTO studio_closed_days (date, reason, created_by)
             VALUES ($1, $2, $3) RETURNING *`,
            [data.date, data.reason, req.user!.userId]
        );

        // Auto-cancel all scheduled classes on that date
        const classesToCancel = await query(
            `SELECT id FROM classes WHERE date = $1 AND status = 'scheduled'`,
            [data.date]
        );

        let totalCancelledBookings = 0;
        let totalRefundedCredits = 0;

        for (const cls of classesToCancel) {
            const result = await cancelClassWithRefunds(
                cls.id,
                req.user!.userId,
                `Estudio cerrado: ${data.reason}`
            );
            totalCancelledBookings += result.cancelledBookings;
            totalRefundedCredits += result.refundedCredits;
        }

        res.status(201).json({
            closedDay: mapRow(row),
            cancelledClasses: classesToCancel.length,
            cancelledBookings: totalCancelledBookings,
            refundedCredits: totalRefundedCredits,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Datos inválidos', details: error.errors });
        }
        console.error('Create closed day error:', error);
        res.status(500).json({ error: 'Error al crear día cerrado' });
    }
});

// ============================================
// DELETE /api/closed-days/:id - Remove closed day
// ============================================
router.delete('/:id', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const row = await queryOne(`DELETE FROM studio_closed_days WHERE id = $1 RETURNING id`, [req.params.id]);
        if (!row) return res.status(404).json({ error: 'Día cerrado no encontrado' });
        res.json({ message: 'Día cerrado eliminado' });
    } catch (error) {
        console.error('Delete closed day error:', error);
        res.status(500).json({ error: 'Error al eliminar día cerrado' });
    }
});

function mapRow(row: any) {
    return {
        id: row.id,
        date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date).split('T')[0],
        reason: row.reason,
        createdAt: row.created_at,
    };
}

export default router;
