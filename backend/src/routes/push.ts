import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { query } from '../config/database.js';

const router = Router();
router.use(authenticate);

// POST /api/push/subscribe
router.post('/subscribe', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.userId as string;
        const sub = req.body?.subscription;
        const endpoint = sub?.endpoint;
        const p256dh = sub?.keys?.p256dh;
        const auth = sub?.keys?.auth;
        if (!endpoint || !p256dh || !auth) {
            return res.status(400).json({ error: 'Suscripción inválida' });
        }
        await query(
            `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (endpoint) DO UPDATE
               SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh,
                   auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent, last_active_at = now()`,
            [userId, endpoint, p256dh, auth, (req.body?.userAgent || '').slice(0, 400) || null],
        );
        res.status(201).json({ ok: true });
    } catch (err) {
        console.error('push subscribe error:', err);
        res.status(500).json({ error: 'No se pudo registrar la suscripción' });
    }
});

// POST /api/push/unsubscribe
router.post('/unsubscribe', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.userId as string;
        const endpoint = req.body?.endpoint;
        if (!endpoint) return res.status(400).json({ error: 'Falta endpoint' });
        await query(`DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2`, [endpoint, userId]);
        res.json({ ok: true });
    } catch (err) {
        console.error('push unsubscribe error:', err);
        res.status(500).json({ error: 'No se pudo desuscribir' });
    }
});

export default router;
