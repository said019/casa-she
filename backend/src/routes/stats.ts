import { Router, Request, Response } from 'express';
import { queryOne } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// ============================================
// GET /api/stats/cash-payments-today
// ============================================
router.get('/cash-payments-today', authenticate, requireRole('admin'), async (_req: Request, res: Response) => {
    try {
        const paymentsRow = await queryOne<{
            payments_today: string;
            amount_today: string;
        }>(
            `SELECT
                COUNT(*) as payments_today,
                COALESCE(SUM(amount), 0) as amount_today
             FROM payments
             WHERE DATE(created_at AT TIME ZONE 'America/Mexico_City') = CURRENT_DATE
               AND payment_method IN ('cash', 'transfer')
               AND status = 'completed'`
        );

        const membershipsRow = await queryOne<{ count: string }>(
            `SELECT COUNT(*) as count
             FROM memberships
             WHERE DATE(created_at AT TIME ZONE 'America/Mexico_City') = CURRENT_DATE
               AND status IN ('active', 'pending_activation')`
        );

        const guestsRow = await queryOne<{ count: string }>(
            `SELECT COUNT(*) as count
             FROM guest_bookings
             WHERE DATE(created_at AT TIME ZONE 'America/Mexico_City') = CURRENT_DATE`
        );

        res.json({
            paymentsToday: parseInt(paymentsRow?.payments_today || '0'),
            amountToday: parseFloat(paymentsRow?.amount_today || '0'),
            membershipsActivated: parseInt(membershipsRow?.count || '0'),
            guestsToday: parseInt(guestsRow?.count || '0'),
        });
    } catch (error) {
        console.error('Cash payments today error:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

export default router;
