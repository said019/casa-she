import { Request, Response, NextFunction } from 'express';
import { queryOne } from '../config/database.js';
import { hasPermission, PermissionKey } from '../lib/permissions.js';

/**
 * Gate por permiso de recepción. Usar DESPUÉS de `authenticate`.
 * admin/super_admin pasan siempre. reception pasa si tiene la clave (leída fresca de BD).
 */
export function requirePermission(key: PermissionKey, extraAllowedRoles: string[] = []) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const u = req.user;
    if (!u) return res.status(401).json({ error: 'No autorizado' });
    if (u.role === 'admin' || u.role === 'super_admin') return next();
    // Roles que siempre pasan además de admin (p.ej. instructor en check-in).
    // El candado granular solo aplica a 'reception'.
    if (extraAllowedRoles.includes(u.role)) return next();
    if (u.role !== 'reception') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    try {
      const row = await queryOne<{ role: string; permissions: unknown; is_reception_master: boolean }>(
        `SELECT role, permissions, is_reception_master FROM users WHERE id = $1`,
        [u.userId]
      );
      if (!row) return res.status(401).json({ error: 'No autorizado' });
      if (hasPermission({ role: row.role, permissions: row.permissions, is_reception_master: row.is_reception_master }, key)) {
        return next();
      }
      return res.status(403).json({ error: 'No tienes permiso para esta acción.' });
    } catch (e) {
      console.error('requirePermission error:', e);
      return res.status(500).json({ error: 'Error de autorización' });
    }
  };
}
