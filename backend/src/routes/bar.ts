import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne, pool } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getSetting } from '../lib/settings.js';
import { isBarOpenAt, BAR_CATEGORY_NAMES, computeBarTotals, pointsForTotal, canBarTransition, canCustomerCancel, type BarStatus } from '../lib/bar.js';
import { spendBarPoints, refundBarPoints } from '../lib/barPoints.js';
import { sendWebPushToUser } from '../lib/web-push.js';
import { createPreference, mpConfigured } from '../lib/mercadopago.js';

const router = Router();

// GET /api/bar/config — ¿está habilitada la barra? (para mostrar/ocultar la sección)
router.get('/config', authenticate, async (_req: Request, res: Response) => {
  const c = await getSetting('bar_config');
  res.json({
    enabled: c.enabled === true,
    card_enabled: c.card_enabled !== false,
    points_enabled: c.points_enabled === true,
    points_redemption_rate: Number(c.points_redemption_rate ?? 10),
    card_surcharge_percent: Number(c.card_surcharge_percent ?? 0),
    cancellation_window_minutes: Number(c.cancellation_window_minutes ?? 60),
    prep_time_minutes: Number(c.prep_time_minutes ?? 15),
  });
});

// GET /api/bar/pickup-suggestions
router.get('/pickup-suggestions', authenticate, async (req: Request, res: Response) => {
  const c = await getSetting('bar_config');
  const offset = Number(c.pickup_offset_minutes ?? 0);
  const lead = Number(c.lead_time_max_hours ?? 4);
  const now = new Date();
  // Próxima reserva confirmada + fin de clase
  const nx = await queryOne<{ date: string; end_time: string; class_name: string }>(
    `SELECT c.date, c.end_time, COALESCE(ct.name,'Clase') AS class_name
     FROM bookings b JOIN classes c ON c.id=b.class_id
     LEFT JOIN class_types ct ON ct.id=c.class_type_id
     WHERE b.user_id=$1 AND b.status='confirmed'
       AND (c.date + c.start_time) > (NOW() AT TIME ZONE 'America/Mexico_City')
     ORDER BY c.date ASC, c.start_time ASC LIMIT 1`, [req.user!.userId]);
  let after_class: { pickup_iso: string; class_name: string; ends_iso: string } | null = null;
  if (nx) {
    const ends = new Date(`${String(nx.date).slice(0,10)}T${String(nx.end_time).slice(0,5)}:00-06:00`);
    const pickup = new Date(ends.getTime() + offset * 60_000);
    after_class = { pickup_iso: pickup.toISOString(), class_name: nx.class_name, ends_iso: ends.toISOString() };
  }
  const manual_window = {
    earliest_iso: new Date(now.getTime() + 5 * 60_000).toISOString(),
    latest_iso: new Date(now.getTime() + lead * 3_600_000).toISOString(),
  };
  res.json({ after_class, manual_window });
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

  // Rama PUNTOS: la orden + items + descuento de puntos + flip a 'paid' se crean
  // en UNA SOLA transacción atómica. Así un crash a mitad de camino no deja una
  // orden 'pending' huérfana (bebida gratis): un ROLLBACK borra todo.
  // Bloqueo por usuario (fila de users FOR UPDATE, igual que loyalty.ts) ANTES del
  // SUM del saldo → los gastos concurrentes del mismo usuario se serializan.
  if (paymentMethod === 'points') {
    const rate = Number(cfg.points_redemption_rate ?? 10);
    const needed = pointsForTotal(totals.total_mxn, rate);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Lock por usuario: serializa gastos concurrentes sin FOR UPDATE sobre el agregado.
      await client.query(`SELECT id FROM users WHERE id=$1 FOR UPDATE`, [userId]);
      const balRow = await client.query(
        `SELECT COALESCE(SUM(points),0)::int AS bal FROM loyalty_points WHERE user_id=$1`,
        [userId]);
      const balance = Number(balRow.rows[0]?.bal ?? 0);
      if (balance < needed) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'INSUFFICIENT_POINTS', needed, balance });
      }
      // Crea la orden ya como 'paid' con los puntos gastados, DENTRO de la transacción.
      const ins = await client.query(
        `INSERT INTO bar_orders (user_id, booking_id, status, pickup_time, payment_method, payment_status,
                                 subtotal_mxn, card_surcharge_mxn, total_mxn, customer_notes, points_spent)
         VALUES ($1, $2, 'pending', $3, 'points', 'paid', $4, $5, $6, $7, $8) RETURNING id`,
        [userId, bookingId ?? null, pickup.toISOString(),
         totals.subtotal_mxn, totals.surcharge_mxn, totals.total_mxn, notes ?? null, needed]);
      const orderId = ins.rows[0]?.id as string;
      if (!orderId) { await client.query('ROLLBACK'); return res.status(500).json({ error: 'ORDER_CREATION_FAILED' }); }
      for (const it of priced) {
        await client.query(
          `INSERT INTO bar_order_items (bar_order_id, product_id, product_name, quantity, unit_price_mxn, line_total_mxn)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [orderId, it.productId, it.name, it.quantity, it.unit_price_mxn, it.unit_price_mxn * it.quantity]);
      }
      await spendBarPoints(client, userId, needed, orderId);
      await client.query('COMMIT');
      return res.status(201).json({ id: orderId });
    } catch (e: any) {
      console.error('bar points charge failed:', e?.message);
      await client.query('ROLLBACK'); // borra la orden + items no comprometidos
      return res.status(500).json({ error: 'POINTS_CHARGE_FAILED' });
    } finally { client.release(); }
  }

  // Tarjeta y recepción: creación por auto-commit (no requieren atomicidad orden+gasto).
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

  if (paymentMethod === 'card') {
    if (!mpConfigured()) {
      await query(`DELETE FROM bar_orders WHERE id = $1`, [orderId]);
      return res.status(503).json({ error: 'Pago con tarjeta no disponible' });
    }
    const user = await queryOne<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [userId]);
    try {
      // MP debe cobrar subtotal + recargo. El recargo va como línea aparte para que
      // transaction_amount == total_mxn (si no, el estudio pierde el recargo).
      const mpItems = priced.map((p) => ({ title: p.name, quantity: p.quantity, unit_price: p.unit_price_mxn }));
      if (totals.surcharge_mxn > 0) {
        mpItems.push({ title: 'Uso de app', quantity: 1, unit_price: totals.surcharge_mxn });
      }
      const pref = await createPreference({
        orderId: `bar:${orderId}`,           // ← prefijo que el webhook enruta a la barra
        items: mpItems,
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
  const o = await queryOne<{ status: BarStatus; user_id: string; payment_method: string; points_spent: number | null }>(
    `SELECT status, user_id, payment_method, points_spent FROM bar_orders WHERE id = $1`, [req.params.id]);
  if (!o) return res.status(404).json({ error: 'NOT_FOUND' });
  if (!canBarTransition(o.status, to, 'staff')) return res.status(400).json({ error: 'INVALID_TRANSITION' });
  if (to === 'cancelled' && !req.body?.cancellationReason) return res.status(400).json({ error: 'REASON_REQUIRED' });
  const cfg = await getSetting('bar_config');
  const stamp = to === 'preparing' ? 'preparing_at' : to === 'ready' ? 'ready_at' : to === 'delivered' ? 'delivered_at' : 'cancelled_at';

  // Cancelación de staff: el flip de estado (con lock optimista) y el reembolso de
  // puntos van en UNA transacción atómica. Un crash entre ambos ya no deja deuda de
  // puntos silenciosa: el ROLLBACK revierte también el cambio de estado.
  if (to === 'cancelled') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const upd = await client.query(
        `UPDATE bar_orders SET status='cancelled', cancelled_at=NOW(), cancellation_reason=$1, cancelled_by='staff', updated_at=NOW()
         WHERE id=$2 AND status=$3 RETURNING id`,
        [req.body.cancellationReason, req.params.id, o.status]);
      if (upd.rowCount === 0) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'STATE_CHANGED' }); }
      if (o.payment_method === 'points' && o.points_spent && o.points_spent > 0) {
        await refundBarPoints(client, o.user_id, o.points_spent, req.params.id);
      }
      await client.query('COMMIT');
    } catch (e: any) {
      console.error('bar staff-cancel points refund failed:', e?.message);
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'CANCEL_FAILED' });
    } finally { client.release(); }
    return res.json({ ok: true, status: to });
  }

  // Otras transiciones (preparing/ready/delivered): auto-commit con lock optimista.
  const upd = await query(
    `UPDATE bar_orders SET status=$1, ${stamp}=NOW(), updated_at=NOW()
     WHERE id=$2 AND status=$3 RETURNING id`,
    [to, req.params.id, o.status]);
  if (upd.length === 0) return res.status(409).json({ error: 'STATE_CHANGED' });
  if (to === 'ready') {
    void sendWebPushToUser(o.user_id, { title: '¡Tu bebida está lista!', body: 'Pásala a recoger en la barra.', url: `/app/fuel-bar/order/${req.params.id}`, tag: 'bar_ready' });
  }
  if (to === 'preparing' && cfg.preparing_push) {
    void sendWebPushToUser(o.user_id, {
      title: 'Tu bebida se está preparando',
      body: `Estará lista en ~${Number(cfg.prep_time_minutes ?? 15)} min.`,
      url: `/app/fuel-bar/order/${req.params.id}`, tag: 'bar_preparing',
    });
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
  const cfg = await getSetting('bar_config');
  const full = await queryOne<{ pickup_time: string; payment_method: string; points_spent: number | null }>(
    `SELECT pickup_time, payment_method, points_spent FROM bar_orders WHERE id=$1`, [req.params.id]);
  if (full && !canCustomerCancel(new Date(full.pickup_time), new Date(), Number(cfg.cancellation_window_minutes ?? 60))) {
    return res.status(400).json({ error: 'CANCEL_WINDOW_CLOSED' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE bar_orders SET status='cancelled', cancelled_by='customer', cancelled_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND status=$2 RETURNING id`, [req.params.id, o.status]);
    if (upd.rowCount === 0) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'STATE_CHANGED' }); }
    if (full && full.payment_method === 'points' && full.points_spent && full.points_spent > 0) {
      await refundBarPoints(client, o.user_id, full.points_spent, req.params.id);
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); return res.status(500).json({ error: 'CANCEL_FAILED' }); }
  finally { client.release(); }
  res.json({ ok: true });
});

export default router;
