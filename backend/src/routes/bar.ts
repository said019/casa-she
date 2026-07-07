import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getSetting } from '../lib/settings.js';
import { isBarOpenAt, BAR_CATEGORY_NAMES, computeBarTotals } from '../lib/bar.js';
import { createPreference, mpConfigured } from '../lib/mercadopago.js';

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

const CreateBarOrder = z.object({
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().positive() })).min(1),
  pickupTime: z.string(),
  paymentMethod: z.enum(['reception', 'card']),
  notes: z.string().max(140).optional(),
  bookingId: z.string().uuid().optional(),
});

router.post('/orders', authenticate, async (req: Request, res: Response) => {
  const cfg = await getSetting('bar_config');
  if (!cfg.enabled) return res.status(503).json({ error: 'BAR_DISABLED' });
  const parsed = CreateBarOrder.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors });
  const { items, pickupTime, paymentMethod, notes, bookingId } = parsed.data;
  const userId = req.user!.userId;

  const pickup = new Date(pickupTime);
  if (isNaN(pickup.getTime()) || pickup.getTime() < Date.now() - 60_000) {
    return res.status(400).json({ error: 'INVALID_PICKUP_TIME' });
  }

  // Cotiza cada producto EN SERVIDOR (el cliente nunca manda precio).
  const priced: { productId: string; name: string; quantity: number; unit_price_mxn: number }[] = [];
  for (const it of items) {
    const p = await queryOne<{ id: string; name: string; price: string; is_active: boolean }>(
      `SELECT id, name, price, is_active FROM products WHERE id = $1`, [it.productId]);
    if (!p || !p.is_active) return res.status(400).json({ error: 'PRODUCT_NOT_FOUND', productId: it.productId });
    priced.push({ productId: p.id, name: p.name, quantity: it.quantity, unit_price_mxn: Number(p.price) });
  }
  const totals = computeBarTotals(priced);

  // Inserta la orden (pending) + items.
  const order = await queryOne<{ id: string }>(
    `INSERT INTO bar_orders (user_id, booking_id, status, pickup_time, payment_method, payment_status, subtotal_mxn, total_mxn, customer_notes)
     VALUES ($1, $2, 'pending', $3, $4, 'pending', $5, $6, $7) RETURNING id`,
    [userId, bookingId ?? null, pickup.toISOString(), paymentMethod, totals.subtotal_mxn, totals.total_mxn, notes ?? null]);
  const orderId = order!.id;
  for (const it of priced) {
    await query(
      `INSERT INTO bar_order_items (bar_order_id, product_id, product_name, quantity, unit_price_mxn, line_total_mxn)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orderId, it.productId, it.name, it.quantity, it.unit_price_mxn, it.unit_price_mxn * it.quantity]);
  }

  if (paymentMethod === 'card') {
    if (!mpConfigured()) {
      await query(`DELETE FROM bar_orders WHERE id = $1`, [orderId]);
      return res.status(503).json({ error: 'Pago con tarjeta no disponible' });
    }
    const user = await queryOne<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [userId]);
    try {
      const pref = await createPreference({
        orderId: `bar:${orderId}`,           // ← prefijo que el webhook enruta a la barra
        items: priced.map((p) => ({ title: p.name, quantity: p.quantity, unit_price: p.unit_price_mxn })),
        payerEmail: user?.email || undefined,
        backUrl: `${process.env.FRONTEND_URL}/app/fuel-bar/order/${orderId}`,
        notificationUrl: process.env.BACKEND_URL ? `${process.env.BACKEND_URL}/webhooks/mercadopago` : undefined,
      });
      await query(`UPDATE bar_orders SET provider='mercadopago', mp_checkout_url=$1, updated_at=NOW() WHERE id=$2`, [pref.checkoutUrl, orderId]);
      return res.status(201).json({ id: orderId, checkout_url: pref.checkoutUrl });
    } catch (e: any) {
      await query(`DELETE FROM bar_orders WHERE id = $1`, [orderId]);
      return res.status(502).json({ error: 'CARD_PAYMENT_FAILED' });
    }
  }
  // reception → entra a la cola sin pagar
  return res.status(201).json({ id: orderId });
});

// GET /api/bar/orders/mine — historial propio
router.get('/orders/mine', authenticate, async (req: Request, res: Response) => {
  const rows = await query(`SELECT * FROM bar_orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.user!.userId]);
  res.json(rows);
});

// GET /api/bar/orders/:id — detalle (dueño o staff) con items
router.get('/orders/:id', authenticate, async (req: Request, res: Response) => {
  const o = await queryOne<any>(`SELECT * FROM bar_orders WHERE id = $1`, [req.params.id]);
  if (!o) return res.status(404).json({ error: 'NOT_FOUND' });
  const staff = ['admin','super_admin','reception'].includes(req.user!.role);
  if (o.user_id !== req.user!.userId && !staff) return res.status(403).json({ error: 'FORBIDDEN' });
  const items = await query(`SELECT * FROM bar_order_items WHERE bar_order_id = $1`, [req.params.id]);
  res.json({ ...o, items });
});

export default router;
