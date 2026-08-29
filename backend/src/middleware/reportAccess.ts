import type { Request, Response, NextFunction } from 'express';
import { queryOne } from '../config/database.js';
import { isReportRole } from '../lib/operationalAccess.js';

/** Reportes son la única excepción a la paridad admin/recepción. */
export async function requireReportAccess(req: Request, res: Response, next: NextFunction) {
    if (!req.user?.userId) return res.status(401).json({ error: 'No autorizado' });
    try {
        const current = await queryOne<{ role: string; is_active: boolean }>(
            'SELECT role, is_active FROM users WHERE id = $1',
            [req.user.userId],
        );
        if (current?.is_active === true && isReportRole(current.role)) return next();
        return res.status(403).json({
            error: 'Acceso denegado',
            message: 'Los reportes están disponibles únicamente para administración.',
        });
    } catch (error) {
        console.error('requireReportAccess error:', error);
        return res.status(500).json({ error: 'Error de autorización' });
    }
}
