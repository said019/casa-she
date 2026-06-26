import { Router, Request, Response } from 'express';
import { query } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';

const router = Router();

// GET /api/admin/audit?user=&action=&entity=&from=&to=&limit=
router.get('/', authenticate, requirePermission('ver_audit'), async (req: Request, res: Response) => {
    const { user, action, entity, from, to } = req.query as Record<string, string | undefined>;
    const limit = Math.min(Number(req.query.limit) || 100, 500);

    const cond: string[] = [];
    const p: unknown[] = [];
    if (user) { p.push(user); cond.push(`a.admin_user_id = $${p.length}`); }
    if (action) { p.push(action); cond.push(`a.action_type = $${p.length}`); }
    if (entity) { p.push(entity); cond.push(`a.entity_type = $${p.length}`); }
    if (from) { p.push(from); cond.push(`a.created_at >= $${p.length}::date`); }
    // "Hasta" inclusivo del día completo: < (fecha + 1 día). Antes `<= 'YYYY-MM-DD'` se
    // interpretaba como medianoche y excluía TODO el día de hoy (no aparecía lo de hoy).
    if (to) { p.push(to); cond.push(`a.created_at < ($${p.length}::date + INTERVAL '1 day')`); }
    if (!from && !to) {
        cond.push(`a.created_at >= NOW() - INTERVAL '90 days'`);
    }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    p.push(limit);

    const rows = await query(
        `SELECT a.id, a.admin_user_id, a.action_type, a.entity_type, a.entity_id,
                a.description, a.old_data, a.new_data, a.ip_address, a.created_at,
                u.display_name AS admin_name, u.role AS admin_role
         FROM admin_actions a
         LEFT JOIN users u ON u.id = a.admin_user_id
         ${where}
         ORDER BY a.created_at DESC
         LIMIT $${p.length}`,
        p
    );
    res.json(rows);
});

export default router;
