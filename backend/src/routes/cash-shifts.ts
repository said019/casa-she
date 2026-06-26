import { Router, Request, Response } from 'express';
import { query, queryOne, pool } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { computeExpectedCash, computeDifference } from '../lib/cashReconciliation.js';
import { resolveRequestFacility } from '../lib/requestFacility.js';
import { logAction } from '../lib/audit.js';
import { isElevated } from '../lib/elevation.js';
import { requireElevated } from '../middleware/elevation.js';

const router = Router();
const STAFF = ['admin', 'super_admin', 'reception'] as const;

// Caja POR RECEPCIONISTA: "tu caja abierta". Una abierta por persona; pueden haber varias por
// sucursal a la vez (2 recepcionistas = 2 cajas, cada una su cajón y su corte). El índice único
// uq_one_open_shift_per_user lo garantiza a nivel de base de datos.
async function openShiftForUser(userId: string) {
    return queryOne(`SELECT * FROM cash_shifts WHERE opened_by = $1 AND status = 'open'`, [userId]);
}

// Acumulados del turno (efectivo y por método). Incluye egresos pagados en efectivo
// dentro del turno (status='pagado', payment_method='cash') para que el corte cuadre.
async function shiftTotals(shiftId: string) {
    const salesCash = await queryOne(`SELECT COALESCE(SUM(total),0) s FROM sales WHERE shift_id=$1 AND payment_method='cash' AND status <> 'cancelled'`, [shiftId]);
    // Solo pagos 'completed': un pago reembolsado (membresía cancelada) sale del corte de caja.
    const payCash = await queryOne(`SELECT COALESCE(SUM(amount),0) s FROM payments WHERE shift_id=$1 AND payment_method='cash' AND status='completed'`, [shiftId]);
    const cin = await queryOne(`SELECT COALESCE(SUM(amount),0) s FROM cash_movements WHERE shift_id=$1 AND type='cash_in'`, [shiftId]);
    const cout = await queryOne(`SELECT COALESCE(SUM(amount),0) s FROM cash_movements WHERE shift_id=$1 AND type='cash_out'`, [shiftId]);
    const egrCash = await queryOne(`SELECT COALESCE(SUM(amount),0) s FROM egresos WHERE shift_id=$1 AND status='pagado' AND payment_method='cash'`, [shiftId]);
    const byMethod = await query(
        `SELECT method, SUM(amt) total FROM (
            SELECT payment_method::text method, total amt FROM sales WHERE shift_id=$1 AND status <> 'cancelled'
            UNION ALL SELECT payment_method::text, amount FROM payments WHERE shift_id=$1 AND status='completed'
         ) x GROUP BY method`, [shiftId]);
    return {
        cashSales: Number(salesCash?.s ?? 0) + Number(payCash?.s ?? 0),
        cashIn: Number(cin?.s ?? 0),
        cashOut: Number(cout?.s ?? 0),
        cashEgresos: Number(egrCash?.s ?? 0),
        byMethod,
    };
}

// Desglose POR VENDEDORA dentro del turno (clave cuando 2+ recepcionistas comparten la caja):
// cuánto cobró cada quién, por método. Datos de sales.seller_id + payments.processed_by.
async function shiftBySeller(shiftId: string) {
    return query(
        `SELECT seller, method, SUM(amt) AS total, COUNT(*) AS n FROM (
            SELECT COALESCE(u.display_name, '(sin vendedor)') AS seller, s.payment_method::text AS method, s.total AS amt
              FROM sales s LEFT JOIN users u ON u.id = s.seller_id
             WHERE s.shift_id = $1 AND s.status <> 'cancelled'
            UNION ALL
            SELECT COALESCE(u.display_name, '(sin vendedor)'), p.payment_method::text, p.amount
              FROM payments p LEFT JOIN users u ON u.id = p.processed_by
             WHERE p.shift_id = $1 AND p.status = 'completed'
         ) x GROUP BY seller, method ORDER BY seller, method`,
        [shiftId]
    );
}

// POST /open { facility_id?, opening_float }
router.post('/open', authenticate, requirePermission('caja'), async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    const scope = await resolveRequestFacility(req.user, req.body.facility_id || null);
    if (scope.kind === 'error') return res.status(scope.status).json({ error: scope.message });
    const facilityId = scope.kind === 'facility' ? scope.facilityId : (req.body.facility_id || null);
    const openingFloat = Number(req.body.opening_float ?? 0);
    if (!facilityId) return res.status(400).json({ error: 'Falta sucursal (facility_id) o sucursal asignada.' });
    const existing = await openShiftForUser(userId!);
    if (existing) return res.status(409).json({ error: 'Ya tienes una caja abierta. Ciérrala antes de abrir otra.', shift: existing });
    const shift = await queryOne(
        `INSERT INTO cash_shifts (facility_id, opened_by, opening_float, status) VALUES ($1,$2,$3,'open') RETURNING *`,
        [facilityId, userId, openingFloat]);
    await logAction(query, {
        adminUserId: userId!,
        actionType: 'cash_shift_opened',
        entityType: 'cash_shift',
        entityId: (shift as any).id,
        description: 'Apertura de caja',
        newData: { facility_id: facilityId, opening_float: openingFloat },
        req,
    });
    return res.status(201).json(shift);
});

// GET /current?facility_id=
router.get('/current', authenticate, requirePermission('caja'), async (req: Request, res: Response) => {
  // Caja por recepcionista: devuelve TU caja abierta (la del usuario que pregunta), no la de la sucursal.
  const shift = await openShiftForUser(req.user!.userId);
  if (!shift) return res.json({ shift: null });
  return res.json({ shift, totals: await shiftTotals((shift as any).id) });
});

// POST /sell-membership { user_id, plan_id, payment_method, facility_id? }
router.post('/sell-membership', authenticate, requirePermission('vender'), async (req: Request, res: Response) => {
    const sellerId = req.user?.userId;
    const { user_id, plan_id, payment_method, reason, start_date } = req.body;
    if (!user_id || !plan_id) return res.status(400).json({ error: 'Falta user_id o plan_id' });
    // Fecha de inicio opcional (YYYY-MM-DD). Default: hoy. Permite cobrar hoy pero que la
    // membresía arranque otro día (p. ej. pagar sábado y que corra desde el lunes) sin perder días.
    const startStr = (typeof start_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(start_date)) ? start_date : null;
    const scope = await resolveRequestFacility(req.user, req.body.facility_id || null);
    if (scope.kind === 'error') return res.status(scope.status).json({ error: scope.message });
    // La sucursal puede venir del scope (recepción de 1 sucursal) o, para elevados sin sucursal
    // asignada (ej. recepción master), se deduce de la caja abierta más abajo. NO fallar aquí.
    let facilityId: string | null = scope.kind === 'facility' ? scope.facilityId : (req.body.facility_id || null);

    const pm: string = payment_method || 'cash';
    if (!['cash', 'transfer', 'card', 'gratis'].includes(pm)) {
        return res.status(400).json({ error: 'payment_method inválido (cash | transfer | card | gratis)' });
    }

    // Cortesía $0 ('gratis'): solo elevados (admin/super_admin o recepción master) y motivo obligatorio.
    // No requiere caja abierta (un regalo $0 no afecta el corte).
    const isGratis = pm === 'gratis';
    const gratisReason = typeof reason === 'string' ? reason.trim() : '';
    if (isGratis) {
        if (!isElevated(req.user)) {
            return res.status(403).json({ error: 'Solo admin o recepción master pueden registrar membresías gratis.' });
        }
        if (gratisReason.length < 5) {
            return res.status(400).json({ error: 'El motivo es obligatorio para una membresía gratis (mínimo 5 caracteres).' });
        }
    }

    // Caja POR RECEPCIONISTA: el cobro real se ata a TU caja (la del vendedor), no a la de la sucursal.
    // Una cortesía $0 ('gratis') omite la caja porque no afecta el corte.
    const shift = isGratis ? null : await openShiftForUser(sellerId!);
    if (!isGratis && !shift) return res.status(409).json({ error: 'Abre tu caja antes de vender.', code: 'NO_OPEN_SHIFT' });
    // La venta pertenece a la sucursal de TU caja abierta (fuente de verdad para elevados sin
    // sucursal asignada). Solo entonces exigimos sucursal (evita el falso "Falta sucursal" de Ilse).
    if (!facilityId && shift) facilityId = (shift as any).facility_id;
    if (!facilityId) return res.status(400).json({ error: 'Falta sucursal' });

    const plan = await queryOne(
        `SELECT id, price, currency, duration_days, class_limit, reformer_credits, multi_credits FROM plans WHERE id=$1 AND is_active=true`,
        [plan_id]
    );
    if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });

    // Aviso de doble cobro: si la clienta YA tiene una membresía activa, no vender sin
    // confirmación explícita (body.confirm === true). Evita cobrar dos veces el mismo plan.
    if (req.body.confirm !== true) {
        const active = await queryOne<any>(
            `SELECT m.id, p.name, m.end_date, m.reformer_remaining, m.multi_remaining
               FROM memberships m JOIN plans p ON p.id = m.plan_id
              WHERE m.user_id = $1 AND m.status = 'active'
              ORDER BY m.end_date DESC NULLS LAST LIMIT 1`,
            [user_id]
        );
        if (active) {
            return res.status(409).json({
                code: 'HAS_ACTIVE_MEMBERSHIP',
                error: `La clienta ya tiene una membresía activa (${(active as any).name}). Confirma para venderle otra.`,
                activeMembership: active,
            });
        }
    }

    const policyRow = await queryOne(`SELECT value FROM system_settings WHERE key = 'cancellation_policy'`);
    const cancellationLimit = Number((policyRow as any)?.value?.cancellations_per_membership ?? 2);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const membershipResult = await client.query(
            `INSERT INTO memberships (
                user_id, plan_id, start_date, end_date, status,
                classes_remaining, reformer_remaining, multi_remaining,
                payment_method, payment_reference, cancellation_limit,
                activated_by, activated_at, facility_id
            ) VALUES ($1,$2,COALESCE($11::date, CURRENT_DATE), COALESCE($11::date, CURRENT_DATE) + ($3 || ' days')::interval, 'active',
                      $4,$5,$6,$7,$8,$9,$10,NOW(),$12)
            RETURNING *`,
            [
                user_id,
                (plan as any).id,
                String((plan as any).duration_days),
                (plan as any).class_limit ?? null,
                (plan as any).reformer_credits ?? null,
                (plan as any).multi_credits ?? null,
                pm,
                null,             // payment_reference
                cancellationLimit,
                sellerId,         // activated_by → atribución de la venta de mostrador
                startStr,         // $11: inicio elegido (o null → CURRENT_DATE)
                facilityId,       // $12: sucursal de la venta
            ]
        );
        const m = membershipResult.rows[0];

        await client.query(
            `INSERT INTO payments (
                user_id, membership_id, amount, currency,
                payment_method, reference, notes, status, processed_by, shift_id, facility_id
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,'completed',$8,$9,$10)`,
            [
                user_id,
                m.id,
                // Cortesía $0: amount=0 (no da puntos ni suma a caja). Si no, precio de lista del plan.
                isGratis ? 0 : (plan as any).price,
                (plan as any).currency ?? 'MXN',
                pm,
                null,   // reference
                isGratis ? `Cortesía gratis. Motivo: ${gratisReason}` : null,   // notes
                sellerId,
                // Sin caja para gratis: shift_id NULL (la cortesía no entra al corte).
                isGratis ? null : (shift as any).id,
                facilityId,
            ]
        );

        await client.query('COMMIT');
        await logAction(query, {
            adminUserId: sellerId!,
            actionType: 'membership_sold',
            entityType: 'membership',
            entityId: m.id,
            description: isGratis
                ? `Membresía GRATIS en mostrador. Motivo: ${gratisReason}`
                : 'Venta de membresía en mostrador',
            newData: {
                plan_id: m.plan_id,
                user_id: m.user_id,
                payment_method: m.payment_method,
                facility_id: facilityId,
                ...(isGratis ? { gratis: true, reason: gratisReason } : {}),
            },
            req,
        });
        return res.status(201).json(m);
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
});

// POST /:id/movement { type, amount, reason }
router.post('/:id/movement', authenticate, requirePermission('caja'), async (req: Request, res: Response) => {
    const { type, amount, reason } = req.body;
    if (!['cash_in', 'cash_out'].includes(type)) return res.status(400).json({ error: 'type inválido' });
    // Monto: número finito y POSITIVO. Sin validar, un negativo invierte el sentido del movimiento y
    // un NaN (válido en numeric de Postgres) poluciona los SUM del corte dejándolo en NaN.
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
        return res.status(400).json({ error: 'Monto inválido: debe ser un número mayor a 0.' });
    }
    const shift = await queryOne(`SELECT * FROM cash_shifts WHERE id=$1 AND status='open'`, [req.params.id]);
    if (!shift) return res.status(404).json({ error: 'Turno no encontrado o cerrado.' });
    // Caja por recepcionista: solo el dueño del turno (o admin) puede mover efectivo en él.
    if ((shift as any).opened_by !== req.user?.userId && req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
        return res.status(403).json({ error: 'Solo puedes mover efectivo en tu propia caja.' });
    }
    const mv = await queryOne(
        `INSERT INTO cash_movements (shift_id, type, amount, reason, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [(shift as any).id, type, amt, reason || null, req.user?.userId]);
    await logAction(query, {
        adminUserId: req.user!.userId,
        actionType: 'cash_movement',
        entityType: 'cash_shift',
        entityId: (shift as any).id,
        description: 'Movimiento de caja',
        newData: { type, amount: amt, reason: reason || null },
        req,
    });
    return res.status(201).json(mv);
});

// POST /:id/close { counted_cash, notes? }
router.post('/:id/close', authenticate, requirePermission('caja'), async (req: Request, res: Response) => {
    const shift = await queryOne(`SELECT * FROM cash_shifts WHERE id=$1 AND status='open'`, [req.params.id]);
    if (!shift) return res.status(404).json({ error: 'Turno no encontrado o ya cerrado.' });
    // Caja por recepcionista: solo el dueño del turno (o admin) puede cerrar/hacer el corte.
    if ((shift as any).opened_by !== req.user?.userId && req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
        return res.status(403).json({ error: 'Solo puedes cerrar tu propia caja.' });
    }
    const t = await shiftTotals((shift as any).id);
    const expected = computeExpectedCash({
        openingFloat: Number((shift as any).opening_float),
        cashSales: t.cashSales,
        cashIn: t.cashIn,
        cashOut: t.cashOut,
        cashEgresos: t.cashEgresos,
    });
    // Cierre administrativo (force): admin cierra una caja ajena/olvidada desde el panel SIN
    // contar físico → se cierra al efectivo ESPERADO (diferencia 0). Solo admin/super_admin.
    const isAdminRole = req.user?.role === 'admin' || req.user?.role === 'super_admin';
    const forceClose = req.body.force === true && isAdminRole;
    const counted = forceClose ? expected : Number(req.body.counted_cash ?? 0);
    const difference = computeDifference(expected, counted);
    // Una diferencia material (faltante/sobrante) NO puede cerrarse sin justificación:
    // obliga a capturar una nota. Da accountability y evita cierres "a ciegas".
    const NOTE_THRESHOLD = 50;
    const notes = (req.body.notes ?? (forceClose ? 'Cierre administrativo desde el panel de cajas.' : '')).toString().trim();
    if (Math.abs(difference) > NOTE_THRESHOLD && !notes) {
        return res.status(400).json({
            error: `La diferencia de $${difference.toFixed(2)} requiere una nota que explique el faltante/sobrante para poder cerrar.`,
            code: 'NOTE_REQUIRED', expected, counted, difference,
        });
    }
    const closed = await queryOne(
        `UPDATE cash_shifts SET status='closed', closed_by=$2, closed_at=NOW(), expected_cash=$3, counted_cash=$4, difference=$5, notes=$6 WHERE id=$1 RETURNING *`,
        [(shift as any).id, req.user?.userId, expected, counted, difference, notes || null]);
    await logAction(query, {
        adminUserId: req.user!.userId,
        actionType: 'cash_shift_closed',
        entityType: 'cash_shift',
        entityId: (shift as any).id,
        description: 'Cierre de caja',
        newData: { expected, counted, difference },
        req,
    });
    return res.json({ shift: closed, totals: t });
});

// GET /  (admin lista)
router.get('/', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    const { facility_id, status, from, to } = req.query as Record<string, string | undefined>;
    const cond: string[] = [];
    const p: unknown[] = [];
    if (facility_id) { p.push(facility_id); cond.push(`cs.facility_id = $${p.length}`); }
    if (status) { p.push(status); cond.push(`cs.status = $${p.length}`); }
    if (from) { p.push(from); cond.push(`cs.opened_at >= $${p.length}`); }
    if (to) { p.push(to); cond.push(`cs.opened_at <= $${p.length}`); }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    return res.json(await query(
        `SELECT cs.*, ob.display_name AS opened_by_name, cb.display_name AS closed_by_name, f.name AS facility_name
           FROM cash_shifts cs
           LEFT JOIN users ob ON ob.id = cs.opened_by
           LEFT JOIN users cb ON cb.id = cs.closed_by
           LEFT JOIN facilities f ON f.id = cs.facility_id
         ${where} ORDER BY cs.opened_at DESC LIMIT 200`, p));
});

// GET /staff-status — para admin y recepción master: ¿qué recepcionistas tienen caja ABIERTA?
// Sirve para verificar que el equipo está operando (abrió su caja). Opcional ?facility_id= filtra
// por la sucursal ASIGNADA del recepcionista (la del header de scope). Debe ir ANTES de /:id.
router.get('/staff-status', authenticate, requireElevated, async (req: Request, res: Response) => {
    // Cuentas de prueba/sistema que NO deben aparecer en el panel de estado de cajas.
    const EXCLUDED_CAJA_EMAILS = ['recepcion@tepa.bmbstudio.mx'];
    const facilityId = (req.query.facility_id as string | undefined) || null;
    const p: unknown[] = [EXCLUDED_CAJA_EMAILS];
    let facilityCond = '';
    if (facilityId) { p.push(facilityId); facilityCond = ` AND u.default_facility_id = $${p.length}`; }
    const rows = await query(
        `SELECT u.id                       AS user_id,
                u.display_name,
                u.is_reception_master,
                u.default_facility_id       AS assigned_facility_id,
                af.name                     AS assigned_facility_name,
                (cs.id IS NOT NULL)         AS caja_open,
                cs.id                       AS shift_id,
                cs.opened_at,
                cs.opening_float,
                cs.facility_id              AS shift_facility_id,
                sf.name                     AS shift_facility_name
           FROM users u
           LEFT JOIN facilities af ON af.id = u.default_facility_id
           LEFT JOIN cash_shifts cs ON cs.opened_by = u.id AND cs.status = 'open'
           LEFT JOIN facilities sf ON sf.id = cs.facility_id
          WHERE u.role = 'reception' AND u.is_active = true
            AND u.email <> ALL($1::text[])${facilityCond}
          ORDER BY (cs.id IS NOT NULL) DESC, af.name NULLS LAST, u.display_name`, p);
    return res.json(rows);
});

// GET /mine — historial de MIS cajas (las que YO abrí), recientes primero. Para que cada
// quien (recepción normal, master, admin) vea su propio historial. Debe ir ANTES de /:id.
router.get('/mine', authenticate, requirePermission('caja'), async (req: Request, res: Response) => {
    const rows = await query(
        `SELECT cs.*, f.name AS facility_name, cb.display_name AS closed_by_name
           FROM cash_shifts cs
           LEFT JOIN facilities f ON f.id = cs.facility_id
           LEFT JOIN users cb ON cb.id = cs.closed_by
          WHERE cs.opened_by = $1
          ORDER BY cs.opened_at DESC LIMIT 60`,
        [req.user!.userId]);
    return res.json(rows);
});

// GET /:id (admin detalle) — incluye nombres (no UUID), desglose por vendedora y autor de cada movimiento.
router.get('/:id', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    const shift = await queryOne(
        `SELECT cs.*, ob.display_name AS opened_by_name, cb.display_name AS closed_by_name, f.name AS facility_name
           FROM cash_shifts cs
           LEFT JOIN users ob ON ob.id = cs.opened_by
           LEFT JOIN users cb ON cb.id = cs.closed_by
           LEFT JOIN facilities f ON f.id = cs.facility_id
          WHERE cs.id = $1`,
        [req.params.id]);
    if (!shift) return res.status(404).json({ error: 'No encontrado' });
    const movements = await query(
        `SELECT cm.*, u.display_name AS created_by_name
           FROM cash_movements cm LEFT JOIN users u ON u.id = cm.created_by
          WHERE cm.shift_id = $1 ORDER BY cm.created_at`,
        [(shift as any).id]);
    return res.json({
        shift,
        totals: await shiftTotals((shift as any).id),
        bySeller: await shiftBySeller((shift as any).id),
        movements,
    });
});

// GET /:id/sales — historial de VENTAS del turno (productos + membresías): qué se vendió,
// a quién, monto, método y vendedora. Para "ver si vendieron". requirePermission('caja')
// deja pasar a recepción (su turno) y a admin (cualquier turno).
router.get('/:id/sales', authenticate, requirePermission('caja'), async (req: Request, res: Response) => {
    // Recepción normal solo ve las ventas de SUS turnos; admin/super_admin/master, cualquiera.
    if (!isElevated(req.user)) {
        const owner = await queryOne<{ opened_by: string }>(`SELECT opened_by FROM cash_shifts WHERE id = $1`, [req.params.id]);
        if (!owner) return res.status(404).json({ error: 'Turno no encontrado.' });
        if (owner.opened_by !== req.user?.userId) {
            return res.status(403).json({ error: 'Solo puedes ver las ventas de tus propios turnos.' });
        }
    }
    const rows = await query(
        `SELECT 'producto' AS tipo, s.id::text AS id, s.total AS monto, s.payment_method::text AS metodo,
                s.created_at, COALESCE(u.display_name,'') AS vendedor,
                COALESCE((SELECT string_agg(si.quantity || '× ' || si.product_name, ', ')
                            FROM sale_items si WHERE si.sale_id = s.id), 'Venta de productos') AS detalle,
                NULL::text AS cliente
           FROM sales s LEFT JOIN users u ON u.id = s.seller_id
          WHERE s.shift_id = $1 AND s.status <> 'cancelled'
         UNION ALL
         SELECT 'membresía', p.id::text, p.amount, p.payment_method::text,
                p.created_at, COALESCE(pb.display_name,''),
                COALESCE(pl.name,'Membresía'), cu.display_name
           FROM payments p
           LEFT JOIN users pb ON pb.id = p.processed_by
           LEFT JOIN memberships m ON m.id = p.membership_id
           LEFT JOIN plans pl ON pl.id = m.plan_id
           LEFT JOIN users cu ON cu.id = p.user_id
          WHERE p.shift_id = $1 AND p.status = 'completed'
          ORDER BY created_at DESC`,
        [req.params.id]);
    return res.json(rows);
});

export default router;
