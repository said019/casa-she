import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/database.js';
import { pool } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { resolveRequestFacility } from '../lib/requestFacility.js';
import { logAction } from '../lib/audit.js';

const router = Router();

// POST /api/sales - Create a POS sale
router.post('/', authenticate, requirePermission('vender'), async (req: Request, res: Response) => {
    try {
        const { userId, items, paymentMethod, notes, discount, gratis } = req.body;
        const isGratis = gratis === true;
        const sellerId = req.user?.userId;

        if (!items || items.length === 0) {
            return res.status(400).json({ error: 'La venta debe tener al menos un producto' });
        }
        // Cortesía (gratis): la venta va en $0 y el MOTIVO es obligatorio (accountability).
        // Disponible para CUALQUIER nivel de staff con permiso 'vender'.
        if (isGratis && !(typeof notes === 'string' && notes.trim())) {
            return res.status(400).json({ error: 'El motivo es obligatorio para registrar una cortesía (gratis).' });
        }

        // Require an open cash shift before accepting a sale
        const scope = await resolveRequestFacility(req.user, req.body.facility_id || null);
        if (scope.kind === 'error') return res.status(scope.status).json({ error: scope.message });
        // La sucursal puede venir del scope o, para elevados sin sucursal asignada (recepción master),
        // deducirse de la caja abierta. NO fallar aquí todavía.
        let facilityId: string | null = scope.kind === 'facility' ? scope.facilityId : (req.body.facility_id || null);
        // Caja por recepcionista: la venta se registra en TU caja (la del vendedor), no en la de la sucursal.
        const openShift = await queryOne<{ id: string; facility_id: string | null }>(
            `SELECT id, facility_id FROM cash_shifts WHERE opened_by=$1 AND status='open'`, [sellerId]);
        if (!openShift) return res.status(409).json({ error: 'Abre tu caja antes de registrar ventas.', code: 'NO_OPEN_SHIFT', facilityId });
        // La venta pertenece a la sucursal de TU caja abierta (fuente de verdad para elevados sin sucursal asignada).
        if (!facilityId) facilityId = openShift.facility_id;
        if (!facilityId) return res.status(400).json({ error: 'Falta sucursal' });

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Totales con precio del CATÁLOGO (no el unitPrice que mande el cliente)
            // y validación de cantidad/stock. Evita manipulación de precio en el POS.
            let subtotal = 0;
            const resolvedItems: { productId: string; name: string; quantity: number; unitPrice: number; lineTotal: number }[] = [];
            for (const item of items) {
                const quantity = Number(item.quantity);
                if (!Number.isInteger(quantity) || quantity <= 0) {
                    throw new Error('Cantidad inválida');
                }
                // FOR UPDATE: bloquea la fila del producto dentro de la tx para serializar ventas
                // concurrentes del mismo artículo (evita que dos ventas lean el mismo stock y lo dejen
                // negativo por sobreventa).
                const product = await client.query(
                    'SELECT id, name, price, stock FROM products WHERE id = $1 AND is_active = true FOR UPDATE',
                    [item.productId]
                );

                if (product.rows.length === 0) {
                    throw new Error(`Producto no encontrado: ${item.productId}`);
                }

                if (product.rows[0].stock < quantity) {
                    throw new Error(`Stock insuficiente para ${product.rows[0].name}`);
                }

                const unitPrice = parseFloat(product.rows[0].price);
                const lineTotal = Math.round(unitPrice * quantity * 100) / 100;
                subtotal += lineTotal;
                resolvedItems.push({ productId: item.productId, name: product.rows[0].name, quantity, unitPrice, lineTotal });
            }

            // Cortesía: descuento = subtotal completo → total $0, método 'gratis'. Si no, descuento
            // acotado normal (ni negativo ni mayor al subtotal).
            const discountAmount = isGratis
                ? subtotal
                : Math.round(Math.max(0, Math.min(Number(discount) || 0, subtotal)) * 100) / 100;
            const total = isGratis ? 0 : Math.round((subtotal - discountAmount) * 100) / 100;
            const method = isGratis ? 'gratis' : paymentMethod;

            // Create sale
            const sale = await client.query(`
                INSERT INTO sales (user_id, seller_id, subtotal, discount, total, payment_method, notes, facility_id, shift_id, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'completed')
                RETURNING *
            `, [userId || null, sellerId, subtotal, discountAmount, total, method, notes || null, facilityId, (openShift as any).id]);

            const saleId = sale.rows[0].id;

            // Create sale items and update stock (usa los items ya resueltos del catálogo)
            for (const item of resolvedItems) {
                await client.query(`
                    INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, subtotal)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [saleId, item.productId, item.name, item.quantity, item.unitPrice, item.lineTotal]);

                // Decrement stock
                await client.query(
                    'UPDATE products SET stock = stock - $1, updated_at = NOW() WHERE id = $2',
                    [item.quantity, item.productId]
                );
            }

            await client.query('COMMIT');

            res.status(201).json(sale.rows[0]);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error('Create sale error:', error);
        res.status(500).json({ error: error.message || 'Error al crear venta' });
    }
});

// PATCH /api/sales/:id/cancel — cancela una venta del turno ABIERTO: devuelve el stock y, si la
// venta fue en efectivo, registra un cash_out para que el corte cuadre. Ventas de turnos ya
// cerrados NO se cancelan aquí (requieren ajuste de un administrador — P1). Todo en transacción.
router.patch('/:id/cancel', authenticate, requirePermission('vender'), async (req: Request, res: Response) => {
    const saleId = req.params.id;
    const reason = (req.body?.reason ?? '').toString().trim();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const saleRes = await client.query('SELECT * FROM sales WHERE id = $1 FOR UPDATE', [saleId]);
        const sale = saleRes.rows[0];
        if (!sale) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Venta no encontrada' }); }
        if (sale.status === 'cancelled') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'La venta ya está cancelada' }); }

        // La venta debe pertenecer a un turno AÚN ABIERTO (para que el reembolso ajuste el corte vigente).
        const shiftRes = await client.query('SELECT status, opened_by FROM cash_shifts WHERE id = $1', [sale.shift_id]);
        const saleShift = shiftRes.rows[0];
        if (!saleShift || saleShift.status !== 'open') {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'La venta es de un turno cerrado; requiere ajuste de un administrador.', code: 'SHIFT_CLOSED' });
        }

        // Scope de caja: el reembolso registra un cash_out en la caja a la que pertenece la venta.
        // Solo el DUEÑO de esa caja (quien la abrió) o un admin pueden cancelarla. Sin esto, cualquier
        // recepción con 'vender' cancelaría ventas de OTRA caja/sucursal metiéndole un cash_out al cajón
        // ajeno (descuadre del corte de un tercero). Un recepción master tampoco toca la caja de otra.
        const isAdminRole = req.user?.role === 'admin' || req.user?.role === 'super_admin';
        if (!isAdminRole && saleShift.opened_by !== req.user?.userId) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Solo puedes cancelar ventas de tu propia caja.', code: 'NOT_YOUR_SHIFT' });
        }

        // Devolver el stock de cada producto de la venta.
        const items = await client.query('SELECT product_id, quantity FROM sale_items WHERE sale_id = $1', [saleId]);
        for (const it of items.rows) {
            await client.query('UPDATE products SET stock = stock + $1, updated_at = NOW() WHERE id = $2', [it.quantity, it.product_id]);
        }

        // Marcar la venta como cancelada (con motivo en notas).
        await client.query(
            `UPDATE sales SET status = 'cancelled', notes = COALESCE(notes, '') || $2, updated_at = NOW() WHERE id = $1`,
            [saleId, ` [CANCELADA${reason ? ': ' + reason : ''}]`]
        );

        // Reembolso de efectivo → cash_out al turno (solo si la venta fue en efectivo y total > 0).
        const refund = sale.payment_method === 'cash' ? Number(sale.total) : 0;
        if (refund > 0) {
            await client.query(
                `INSERT INTO cash_movements (shift_id, type, amount, reason, created_by) VALUES ($1, 'cash_out', $2, $3, $4)`,
                [sale.shift_id, refund, `Devolución venta cancelada${reason ? ': ' + reason : ''}`, req.user?.userId]
            );
        }

        await client.query('COMMIT');
        await logAction(query, {
            adminUserId: req.user!.userId,
            actionType: 'sale_cancelled',
            entityType: 'sale',
            entityId: saleId,
            description: 'Cancelación de venta POS',
            newData: { reason: reason || null, refund_cash: refund, payment_method: sale.payment_method },
            req,
        });
        return res.json({ ok: true, saleId, refunded: refund });
    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('Cancel sale error:', err);
        return res.status(500).json({ error: err.message || 'Error al cancelar la venta' });
    } finally {
        client.release();
    }
});

// GET /api/sales - List sales
router.get('/', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        // Enriquecido para el historial del POS: sucursal, estado del turno (para saber si la
        // venta aún se puede cancelar) y los productos vendidos.
        const sales = await query(`
            SELECT s.*, u.display_name as customer_name, seller.display_name as seller_name,
                   f.name as facility_name, sh.status as shift_status,
                   COALESCE((
                     SELECT json_agg(json_build_object('name', si.product_name, 'qty', si.quantity) ORDER BY si.product_name)
                     FROM sale_items si WHERE si.sale_id = s.id
                   ), '[]'::json) as items
            FROM sales s
            LEFT JOIN users u ON s.user_id = u.id
            LEFT JOIN users seller ON s.seller_id = seller.id
            LEFT JOIN facilities f ON f.id = s.facility_id
            LEFT JOIN cash_shifts sh ON sh.id = s.shift_id
            ORDER BY s.created_at DESC
            LIMIT 100
        `);
        res.json(sales);
    } catch (error) {
        console.error('List sales error:', error);
        res.status(500).json({ error: 'Error al obtener ventas' });
    }
});

export default router;
