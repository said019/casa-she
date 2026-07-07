import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne, pool } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getSetting } from '../lib/settings.js';
import { isBarOpenAt, BAR_CATEGORY_NAMES, computeBarTotals, pointsForTotal, canBarTransition, type BarStatus } from '../lib/bar.js';
import { spendBarPoints } from '../lib/barPoints.js';
import { sendWebPushToUser } from '../lib/web-push.js';
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
  paymentMethod: z.enum(['reception', 'card', 'points']),
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

  // Gate por config: tarjeta y puntos requieren que estén habilitados.
  if (paymentMethod === 'card' && !cfg.card_enabled) return res.status(400).json({ error: 'CARD_DISABLED' });
  if (paymentMethod === 'points' && !cfg.points_enabled) return res.status(400).json({ error: 'POINTS_DISABLED' });

  // Cotiza cada producto EN SERVIDOR (el cliente nunca manda precio).
  const priced: { productId: string; name: string; quantity: number; unit_price_mxn: number }[] = [];
  for (const it of items) {
    const p = await queryOne<{ id: string; name: string; price: string; is_active: boolean }>(
      `SELECT id, name, price, is_active FROM products WHERE id = $1`, [it.productId]);
    if (!p || !p.is_active) return res.status(400).json({ error: 'PRODUCT_NOT_FOUND', productId: it.productId });
    priced.push({ productId: p.id, name: p.name, quantity: it.quantity, unit_price_mxn: Number(p.price) });
  }

  // Recargo SOLO para tarjeta.
  const surchargePct = paymentMethod === 'card' ? Number(cfg.card_surcharge_percent ?? 0) : 0;
  const totals = computeBarTotals(priced, { surchargePercent: surchargePct });

  // Inserta la orden + items. Todos los métodos entran como 'pending'; puntos se flipan a 'paid' en la transacción de descontar.
  const order = await queryOne<{ id: string }>(
    `INSERT INTO bar_orders (user_id, booking_id, status, pickup_time, payment_method, payment_status,
                             subtotal_mxn, card_surcharge_mxn, total_mxn, customer_notes)
     VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [userId, bookingId ?? null, pickup.toISOString(), paymentMethod,
     'pending',
     totals.subtotal_mxn, totals.surcharge_mxn, totals.total_mxn, notes ?? null]);
  if (!order) return res.status(500).json({ error: 'ORDER_CREATION_FAILED' });
  const orderId = order.id;
  for (const it of priced) {
    await query(
      `INSERT INTO bar_order_items (bar_order_id, product_id, product_name, quantity, unit_price_mxn, line_total_mxn)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orderId, it.productId, it.name, it.quantity, it.unit_price_mxn, it.unit_price_mxn * it.quantity]);
  }

  // Rama PUNTOS: transacción atómica con bloqueo de saldo para evitar carreras.
  if (paymentMethod === 'points') {
    const rate = Number(cfg.points_redemption_rate ?? 10);
    const needed = pointsForTotal(totals.total_mxn, rate);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const balRow = await client.query(
        `SELECT COALESCE(SUM(points),0)::int AS bal FROM loyalty_points WHERE user_id=$1 FOR UPDATE`,
        [userId]);
      const balance = Number(balRow.rows[0]?.bal ?? 0);
      if (balance < needed) {
        await client.query('ROLLBACK');
        await query(`DELETE FROM bar_orders WHERE id=$1`, [orderId]);
        return res.status(400).json({ error: 'INSUFFICIENT_POINTS', needed, balance });
      }
      await client.query(`UPDATE bar_orders SET points_spent=$1, payment_status='paid' WHERE id=$2`, [needed, orderId]);
      await spendBarPoints(client, userId, needed, orderId);
      await client.query('COMMIT');
    } catch (e: any) {
      console.error('bar points charge failed:', e?.message);
      await client.query('ROLLBACK');
      await query(`DELETE FROM bar_orders WHERE id=$1`, [orderId]);
      return res.status(500).json({ error: 'POINTS_CHARGE_FAILED' });
    } finally { client.release(); }
    return res.status(201).json({ id: orderId });
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

const staffOnly = requireRole('admin', 'super_admin', 'reception');

router.get('/orders/queue', authenticate, staffOnly, async (_req: Request, res: Response) => {
  const rows = await query(
    `SELECT o.*, u.display_name AS user_name,
            COALESCE(json_agg(json_build_object('name', i.product_name, 'qty', i.quantity)) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
     FROM bar_orders o JOIN users u ON u.id = o.user_id
     LEFT JOIN bar_order_items i ON i.bar_order_id = o.id
     WHERE o.status IN ('pending','preparing','ready')
     GROUP BY o.id, u.display_name ORDER BY o.pickup_time ASC`);
  res.json(rows);
});

router.patch('/orders/:id/status', authenticate, staffOnly, async (req: Request, res: Response) => {
  const to = req.body?.status as BarStatus;
  if (!to) return res.status(400).json({ error: 'MISSING_STATUS' });
  const o = await queryOne<{ status: BarStatus; user_id: string }>(`SELECT status, user_id FROM bar_orders WHERE id = $1`, [req.params.id]);
  if (!o) return res.status(404).json({ error: 'NOT_FOUND' });
  if (!canBarTransition(o.status, to, 'staff')) return res.status(400).json({ error: 'INVALID_TRANSITION' });
  if (to === 'cancelled' && !req.body?.cancellationReason) return res.status(400).json({ error: 'REASON_REQUIRED' });
  const stamp = to === 'preparing' ? 'preparing_at' : to === 'ready' ? 'ready_at' : to === 'delivered' ? 'delivered_at' : 'cancelled_at';
  // Lock optimista: solo transiciona si el estado no cambió por otra terminal.
  const upd = await query(
    `UPDATE bar_orders SET status=$1, ${stamp}=NOW(), cancellation_reason=$2, cancelled_by=$3, updated_at=NOW()
     WHERE id=$4 AND status=$5 RETURNING id`,
    [to, to === 'cancelled' ? req.body.cancellationReason : null, to === 'cancelled' ? 'staff' : null, req.params.id, o.status]);
  if (upd.length === 0) return res.status(409).json({ error: 'STATE_CHANGED' });
  if (to === 'ready') {
    void sendWebPushToUser(o.user_id, { title: '¡Tu bebida está lista!', body: 'Pásala a recoger en la barra.', url: `/app/fuel-bar/order/${req.params.id}`, tag: 'bar_ready' });
  }
  res.json({ ok: true, status: to });
});

router.post('/orders/:id/charge', authenticate, staffOnly, async (req: Request, res: Response) => {
  const o = await queryOne<{ payment_method: string; payment_status: string }>(`SELECT payment_method, payment_status FROM bar_orders WHERE id = $1`, [req.params.id]);
  if (!o) return res.status(404).json({ error: 'NOT_FOUND' });
  if (o.payment_method !== 'reception') return res.status(400).json({ error: 'NOT_RECEPTION_ORDER' });
  if (o.payment_status === 'paid') return res.status(400).json({ error: 'ALREADY_PAID' });
  await query(`UPDATE bar_orders SET payment_status='paid', updated_at=NOW() WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

router.delete('/orders/:id', authenticate, async (req: Request, res: Response) => {
  const o = await queryOne<{ status: BarStatus; user_id: string }>(`SELECT status, user_id FROM bar_orders WHERE id = $1`, [req.params.id]);
  if (!o) return res.status(404).json({ error: 'NOT_FOUND' });
  if (o.user_id !== req.user!.userId) return res.status(403).json({ error: 'FORBIDDEN' });
  if (!canBarTransition(o.status, 'cancelled', 'customer')) return res.status(400).json({ error: 'CANNOT_CANCEL' });
  const upd = await query(
    `UPDATE bar_orders SET status='cancelled', cancelled_by='customer', cancelled_at=NOW(), updated_at=NOW()
     WHERE id=$1 AND status=$2 RETURNING id`,
    [req.params.id, o.status]);
  if (upd.length === 0) return res.status(409).json({ error: 'STATE_CHANGED' });
  res.json({ ok: true });
});

export default router;
