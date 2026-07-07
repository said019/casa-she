import { Router, Request, Response } from 'express';
import { query } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getSetting } from '../lib/settings.js';
import { isBarOpenAt, BAR_CATEGORY_NAMES } from '../lib/bar.js';

const router = Router();

// GET /api/bar/config — ¿está habilitada la barra? (para mostrar/ocultar la sección)
router.get('/config', authenticate, async (_req: Request, res: Response) => {
  const cfg = await getSetting('bar_config');
  res.json({ enabled: cfg.enabled === true });
});

// GET /api/bar/menu — menú (productos de categorías de barra) + estado abierto/cerrado.
router.get('/menu', authenticate, async (_req: Request, res: Response) => {
  const cfg = await getSetting('bar_config');
  if (!cfg.enabled) return res.status(503).json({ error: 'BAR_DISABLED' });
  const products = await query(
    `SELECT p.id, p.name, p.description, p.price, p.image_url, p.stock, pc.name AS category_name
     FROM products p JOIN product_categories pc ON pc.id = p.category_id
     WHERE p.is_active = true AND pc.name = ANY($1::text[])
     ORDER BY array_position($1::text[], pc.name), p.name`,
    [BAR_CATEGORY_NAMES as unknown as string[]]
  );
  res.json({ open: isBarOpenAt(cfg, new Date()), products });
});

export default router;
