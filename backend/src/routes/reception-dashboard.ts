/**
 * Reception dashboard — endpoint consolidado para el landing page de la recepcionista.
 * Devuelve en una sola llamada: estado de caja, KPIs del día, próximas clases.
 * Todo acotado a su sucursal vía resolveRequestFacility.
 */

import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { resolveRequestFacility } from '../lib/requestFacility.js';

const router = Router();
const STAFF = ['admin', 'super_admin', 'reception'] as const;

// Replicado mínimo de cash-shifts.openShift/shiftTotals — los originales son locales
// a routes/cash-shifts.ts. Si se promueven a un lib compartido en el futuro, eliminar este block.
async function openShiftForUser(userId: string) {
    return queryOne(`SELECT * FROM cash_shifts WHERE opened_by = $1 AND status = 'open'`, [userId]);
}
async function shiftTotals(shiftId: string) {
    const salesCash = await queryOne<{ s: string }>(
        `SELECT COALESCE(SUM(total),0) s FROM sales WHERE shift_id=$1 AND payment_method='cash' AND status <> 'cancelled'`,
        [shiftId]
    );
    const payCash = await queryOne<{ s: string }>(
        `SELECT COALESCE(SUM(amount),0) s FROM payments WHERE shift_id=$1 AND payment_method='cash'`,
        [shiftId]
    );
    const cin = await queryOne<{ s: string }>(
        `SELECT COALESCE(SUM(amount),0) s FROM cash_movements WHERE shift_id=$1 AND type='cash_in'`,
        [shiftId]
    );
    const cout = await queryOne<{ s: string }>(
        `SELECT COALESCE(SUM(amount),0) s FROM cash_movements WHERE shift_id=$1 AND type='cash_out'`,
        [shiftId]
    );
    return {
        cashSales: Number(salesCash?.s ?? 0) + Number(payCash?.s ?? 0),
        cashIn: Number(cin?.s ?? 0),
        cashOut: Number(cout?.s ?? 0),
    };
}

router.get('/dashboard', authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
    try {
        const scope = await resolveRequestFacility(req.user!, (req.query.facility_id as string) || null);
        if (scope.kind === 'error') return res.status(scope.status).json({ error: scope.message });
        const facilityId = scope.kind === 'facility' ? scope.facilityId : ((req.query.facility_id as string) || null);

        // Fecha de hoy en CDMX (igual patrón que commissions/coach-payroll).
        const todayRow = await queryOne<{ d: string }>(
            `SELECT (NOW() AT TIME ZONE 'America/Mexico_City')::date::text AS d`
        );
        const today = todayRow!.d;

        // 1) Caja abierta — por recepcionista: muestra TU caja (la del usuario), no la de la sucursal.
        let shiftBlock: { is_open: boolean; shift: unknown; totals: unknown } = {
            is_open: false, shift: null, totals: null,
        };
        const shift = await openShiftForUser(req.user!.userId);
        if (shift) {
            shiftBlock = {
                is_open: true,
                shift,
                totals: await shiftTotals((shift as { id: string }).id),
            };
        }

        // 2) Clases de hoy en su sucursal: total + completadas + lista de próximas (start_time > now).
        const classCountRow = await queryOne<{ total: string; completed: string }>(`
            SELECT
              COUNT(*) FILTER (WHERE c.status != 'cancelled') AS total,
              COUNT(*) FILTER (WHERE c.status = 'completed') AS completed
            FROM classes c
            WHERE c.date = $1::date
              AND ($2::uuid IS NULL OR c.facility_id = $2::uuid)`,
            [today, facilityId]);

        const upcomingClasses = await query<{
            id: string; start_time: string; end_time: string;
            class_type_name: string; instructor_name: string;
            current_bookings: number; max_capacity: number; status: string;
        }>(`
            SELECT c.id, c.start_time::text AS start_time, c.end_time::text AS end_time,
                   ct.name AS class_type_name, i.display_name AS instructor_name,
                   c.current_bookings, c.max_capacity, c.status
            FROM classes c
            JOIN class_types ct ON ct.id = c.class_type_id
            JOIN instructors i ON i.id = c.instructor_id
            WHERE c.date = $1::date
              AND c.status != 'cancelled'
              AND ($2::uuid IS NULL OR c.facility_id = $2::uuid)
              AND (c.start_time::time)::text > (NOW() AT TIME ZONE 'America/Mexico_City')::time::text
            ORDER BY c.start_time ASC
            LIMIT 5`,
            [today, facilityId]);

        // 3) Reservas del día y check-ins.
        const bookingsRow = await queryOne<{ total: string; checked_in: string; pending: string }>(`
            SELECT
              COUNT(b.id) FILTER (WHERE b.status IN ('confirmed','checked_in')) AS total,
              COUNT(b.id) FILTER (WHERE b.status = 'checked_in') AS checked_in,
              COUNT(b.id) FILTER (WHERE b.status = 'confirmed') AS pending
            FROM bookings b
            JOIN classes c ON c.id = b.class_id
            WHERE c.date = $1::date
              AND ($2::uuid IS NULL OR c.facility_id = $2::uuid)`,
            [today, facilityId]);

        // 4) Ingresos del día (sales POS + payments de membresías), agregados por método.
        // Los métodos en sales.payment_method son strings; los de payments.payment_method enum.
        const salesByMethodRows = await query<{ payment_method: string; n: string; amount: string }>(`
            SELECT s.payment_method::text AS payment_method,
                   COUNT(*) AS n,
                   COALESCE(SUM(s.total), 0) AS amount
            FROM sales s
            WHERE s.status <> 'cancelled'
              AND s.created_at >= ($1::date)::timestamp AT TIME ZONE 'America/Mexico_City'
              AND s.created_at <  (($1::date) + INTERVAL '1 day')::timestamp AT TIME ZONE 'America/Mexico_City'
              AND ($2::uuid IS NULL OR s.facility_id = $2::uuid)
            GROUP BY s.payment_method`,
            [today, facilityId]);

        const membershipsByMethodRows = await query<{ payment_method: string; n: string; amount: string }>(`
            SELECT p.payment_method::text AS payment_method,
                   COUNT(*) AS n,
                   COALESCE(SUM(p.amount), 0) AS amount
            FROM payments p
            LEFT JOIN memberships m ON m.id = p.membership_id
            WHERE p.membership_id IS NOT NULL
              AND p.status = 'completed'
              AND p.created_at >= ($1::date)::timestamp AT TIME ZONE 'America/Mexico_City'
              AND p.created_at <  (($1::date) + INTERVAL '1 day')::timestamp AT TIME ZONE 'America/Mexico_City'
              AND ($2::uuid IS NULL OR m.facility_id = $2::uuid OR m.facility_id IS NULL)
            GROUP BY p.payment_method`,
            [today, facilityId]);

        // Consolidación por método de pago (cash / card / transfer / online / otros).
        const byMethod: Record<string, { sales: number; memberships: number; total: number }> = {};
        const bump = (method: string, bucket: 'sales' | 'memberships', amount: number) => {
            const m = (method || 'otros').toLowerCase();
            if (!byMethod[m]) byMethod[m] = { sales: 0, memberships: 0, total: 0 };
            byMethod[m][bucket] += amount;
            byMethod[m].total += amount;
        };
        for (const r of salesByMethodRows) bump(r.payment_method, 'sales', Number(r.amount));
        for (const r of membershipsByMethodRows) bump(r.payment_method, 'memberships', Number(r.amount));

        const totalRevenue = Object.values(byMethod).reduce((s, x) => s + x.total, 0);
        const totalSales = Object.values(byMethod).reduce((s, x) => s + x.sales, 0);
        const totalMemberships = Object.values(byMethod).reduce((s, x) => s + x.memberships, 0);

        res.json({
            today,
            facility_id: facilityId,
            cash_shift: shiftBlock,
            classes: {
                total: Number(classCountRow?.total ?? 0),
                completed: Number(classCountRow?.completed ?? 0),
                upcoming: upcomingClasses.map((c) => ({
                    id: c.id,
                    start_time: c.start_time.slice(0, 5),
                    end_time: c.end_time.slice(0, 5),
                    class_type_name: c.class_type_name,
                    instructor_name: c.instructor_name,
                    current_bookings: Number(c.current_bookings),
                    max_capacity: Number(c.max_capacity),
                    status: c.status,
                })),
            },
            bookings: {
                total: Number(bookingsRow?.total ?? 0),
                checked_in: Number(bookingsRow?.checked_in ?? 0),
                pending: Number(bookingsRow?.pending ?? 0),
            },
            revenue: {
                total: totalRevenue,
                sales: totalSales,
                memberships: totalMemberships,
                by_method: byMethod,
            },
        });
    } catch (error) {
        console.error('GET /reception/dashboard error:', error);
        res.status(500).json({ error: 'Error al cargar el dashboard' });
    }
});

// ─── Agenda de check-in ────────────────────────────────────────────────────
// Clases de hoy de la sucursal CON sus asistentes, para hacer check-in rápido
// desde el dashboard. El front agrupa por hora. Acotado a la sucursal.
router.get('/checkin-agenda', authenticate, requireRole(...STAFF), async (req: Request, res: Response) => {
    try {
        const scope = await resolveRequestFacility(req.user!, (req.query.facility_id as string) || null);
        if (scope.kind === 'error') return res.status(scope.status).json({ error: scope.message });
        const facilityId = scope.kind === 'facility' ? scope.facilityId : ((req.query.facility_id as string) || null);

        const todayRow = await queryOne<{ d: string }>(
            `SELECT (NOW() AT TIME ZONE 'America/Mexico_City')::date::text AS d`
        );
        const today = todayRow!.d;

        const classes = await query<{
            id: string; start_time: string; end_time: string;
            class_type_name: string; class_type_color: string | null;
            instructor_name: string; current_bookings: number; max_capacity: number; status: string;
        }>(`
            SELECT c.id, c.start_time::text AS start_time, c.end_time::text AS end_time,
                   ct.name AS class_type_name, ct.color AS class_type_color,
                   i.display_name AS instructor_name,
                   c.current_bookings, c.max_capacity, c.status
            FROM classes c
            JOIN class_types ct ON ct.id = c.class_type_id
            JOIN instructors i ON i.id = c.instructor_id
            WHERE c.date = $1::date AND c.status != 'cancelled'
              AND ($2::uuid IS NULL OR c.facility_id = $2::uuid)
            ORDER BY c.start_time ASC`,
            [today, facilityId]);

        type Att = {
            class_id: string; booking_id: string; user_id: string; display_name: string;
            photo_url: string | null; status: string; checked_in_at: string | null;
            is_first_class: boolean | null; plan_name: string | null;
            plan_color: string | null; plan_is_internal: boolean | null;
        };
        const ids = classes.map((c) => c.id);
        const attendees = ids.length
            ? await query<Att>(`
                SELECT b.class_id, b.id AS booking_id, b.user_id, u.display_name, u.photo_url,
                       b.status, b.checked_in_at::text AS checked_in_at, cl.is_first_class,
                       p.name AS plan_name, p.color AS plan_color, p.is_internal AS plan_is_internal
                FROM bookings b
                JOIN users u ON u.id = b.user_id
                LEFT JOIN checkin_logs cl ON cl.booking_id = b.id
                LEFT JOIN memberships m ON m.id = b.membership_id
                LEFT JOIN plans p ON p.id = m.plan_id
                WHERE b.class_id = ANY($1::uuid[]) AND b.status NOT IN ('cancelled')
                ORDER BY CASE b.status WHEN 'checked_in' THEN 1 WHEN 'confirmed' THEN 2 WHEN 'waitlist' THEN 3 ELSE 4 END, u.display_name`,
                [ids])
            : [];

        const byClass = new Map<string, Att[]>();
        for (const a of attendees) {
            const arr = byClass.get(a.class_id) ?? [];
            arr.push(a);
            byClass.set(a.class_id, arr);
        }

        res.json({
            today,
            facility_id: facilityId,
            classes: classes.map((c) => ({
                id: c.id,
                start_time: c.start_time.slice(0, 5),
                end_time: c.end_time.slice(0, 5),
                class_type_name: c.class_type_name,
                class_type_color: c.class_type_color,
                instructor_name: c.instructor_name,
                current_bookings: Number(c.current_bookings),
                max_capacity: Number(c.max_capacity),
                status: c.status,
                attendees: (byClass.get(c.id) ?? []).map((a) => ({
                    booking_id: a.booking_id,
                    user_id: a.user_id,
                    display_name: a.display_name,
                    photo_url: a.photo_url,
                    status: a.status,
                    checked_in_at: a.checked_in_at,
                    is_first_class: a.is_first_class,
                    plan_name: a.plan_name,
                    plan_color: a.plan_color,
                    plan_is_internal: a.plan_is_internal,
                })),
            })),
        });
    } catch (error) {
        console.error('GET /reception/checkin-agenda error:', error);
        res.status(500).json({ error: 'Error al cargar la agenda de check-in' });
    }
});

export default router;
