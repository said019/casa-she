import { Request, Response, NextFunction } from 'express';
import { isElevated } from '../lib/elevation.js';

/**
 * Middleware para endpoints elevados: admin/super_admin o reception+master.
 * Responde 403 si el usuario autenticado no califica.
 *
 * Usar DESPUÉS de `authenticate`.
 */
export function requireElevated(req: Request, res: Response, next: NextFunction) {
    if (!isElevated(req.user)) {
        return res.status(403).json({ error: 'Requiere acceso elevado.' });
    }
    next();
}
