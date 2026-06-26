import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ============================================
// GET /api/notifications?unread_only=true&limit=50
// Devuelve las notificaciones del caller (más recientes primero).
// ============================================
router.get('/', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ error: 'No autorizado' });
        const unreadOnly = req.query.unread_only === 'true';
        const rawLimit = Number(req.query.limit ?? 50);
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 && rawLimit <= 200 ? Math.floor(rawLimit) : 50;

        const rows = await query(`
            SELECT id, title, body, type, data, is_read, created_at
            FROM notifications
            WHERE user_id = $1
              AND ($2::boolean = false OR is_read = false)
            ORDER BY created_at DESC
            LIMIT $3`,
            [userId, unreadOnly, limit]
        );
        res.json(rows);
    } catch (error) {
        console.error('GET /notifications error:', error);
        res.status(500).json({ error: 'Error al obtener notificaciones' });
    }
});

// ============================================
// GET /api/notifications/unread-count
// Para el badge del bell icon.
// ============================================
router.get('/unread-count', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ error: 'No autorizado' });
        const row = await queryOne<{ n: string }>(
            `SELECT COUNT(*) AS n FROM notifications WHERE user_id = $1 AND is_read = false`,
            [userId]
        );
        res.json({ count: Number(row?.n ?? 0) });
    } catch (error) {
        console.error('GET /notifications/unread-count error:', error);
        res.status(500).json({ error: 'Error al obtener conteo' });
    }
});

// ============================================
// PUT /api/notifications/:id/read — marca una como leída (solo si es del caller)
// ============================================
router.put('/:id/read', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ error: 'No autorizado' });
        const row = await queryOne(
            `UPDATE notifications SET is_read = true
             WHERE id = $1 AND user_id = $2 RETURNING id`,
            [req.params.id, userId]
        );
        if (!row) return res.status(404).json({ error: 'Notificación no encontrada' });
        res.json({ ok: true });
    } catch (error) {
        console.error('PUT /notifications/:id/read error:', error);
        res.status(500).json({ error: 'Error al marcar como leída' });
    }
});

// ============================================
// POST /api/notifications/mark-all-read — marca todas las del caller
// ============================================
router.post('/mark-all-read', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ error: 'No autorizado' });
        await query(
            `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
            [userId]
        );
        res.json({ ok: true });
    } catch (error) {
        console.error('POST /notifications/mark-all-read error:', error);
        res.status(500).json({ error: 'Error al marcar todas como leídas' });
    }
});

export default router;
