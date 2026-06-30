import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { query } from '../config/database.js';
import { sendWebPushToUser } from '../lib/web-push.js';
import { logAction } from '../lib/audit.js';

const router = Router();

/** Usuarios cliente con al menos una suscripción push. */
export async function countBroadcastRecipients(): Promise<number> {
    const rows = await query<{ n: string }>(
        `SELECT COUNT(DISTINCT s.user_id)::text AS n
         FROM push_subscriptions s JOIN users u ON u.id = s.user_id
         WHERE u.role = 'client'`,
    );
    return Number(rows[0]?.n ?? 0);
}

router.post('/broadcast', authenticate, requireRole('admin', 'super_admin'),
    async (req: Request, res: Response) => {
        try {
            const title = String(req.body?.title || '').trim();
            const body = String(req.body?.body || '').trim();
            const url = req.body?.url ? String(req.body.url) : '/app';
            if (!title || !body) return res.status(400).json({ error: 'Título y mensaje son obligatorios' });

            const targets = await query<{ user_id: string }>(
                `SELECT DISTINCT s.user_id FROM push_subscriptions s
                 JOIN users u ON u.id = s.user_id WHERE u.role = 'client'`,
            );
            let sent = 0;
            let pruned = 0;
            // Lotes para no saturar
            const CHUNK = 50;
            for (let i = 0; i < targets.length; i += CHUNK) {
                const slice = targets.slice(i, i + CHUNK);
                const results = await Promise.all(
                    slice.map((t) => sendWebPushToUser(t.user_id, { title, body, url, tag: 'broadcast' })),
                );
                for (const r of results) { sent += r.sent; pruned += r.pruned; }
            }
            await logAction(query, { adminUserId: (req as any).user?.userId, actionType: 'push_broadcast', entityType: 'push', description: title, newData: { title, body, url, recipients: targets.length, sent } });
            res.json({ recipients: targets.length, sent, pruned });
        } catch (err) {
            console.error('broadcast error:', err);
            res.status(500).json({ error: 'No se pudo enviar la difusión' });
        }
    });

export default router;
