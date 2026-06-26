import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { fillStudioCounts } from '../lib/dashboardStudio.js';
import { getStaffSales, getStaffSalesDetail } from '../lib/staffSales.js';

const router = Router();

// ============================================
// GET /api/reports/overview - Dashboard overview stats
// ============================================
router.get('/overview', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { startDate, endDate } = req.query;

        // Default: current month
        const periodStart = startDate as string || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
        const periodEnd = endDate as string || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0];

        // Total active members
        const activeMembers = await queryOne(
            `SELECT COUNT(DISTINCT user_id) as count FROM memberships WHERE status = 'active'`
        );

        // Total bookings in period
        const monthlyBookings = await queryOne(
            `SELECT COUNT(*) as count FROM bookings
             WHERE created_at >= $1::date AND created_at < ($2::date + 1)`,
            [periodStart, periodEnd]
        );

        // Revenue in period (payments + events).
        // Orders are intentionally excluded — every approved order now has a matching
        // payments row (admin physical sale, MP webhook, manual approval), so summing
        // both would double-count. All timestamps anchored to America/Mexico_City.
        const monthlyRevenue = await queryOne(
            `SELECT COALESCE(SUM(total), 0) as total FROM (
                SELECT SUM(amount) as total FROM payments
                WHERE (COALESCE(completed_at, created_at) AT TIME ZONE 'America/Mexico_City')::date BETWEEN $1::date AND $2::date
                  AND status = 'completed'
                UNION ALL
                SELECT SUM(amount) as total FROM event_registrations
                WHERE (paid_at AT TIME ZONE 'America/Mexico_City')::date BETWEEN $1::date AND $2::date
                  AND status = 'confirmed' AND amount > 0
            ) combined`,
            [periodStart, periodEnd]
        );

        // Ingresos manuales (manual_incomes) — el Dashboard debe incluirlos para que su cifra
        // de ingresos coincida con el tab de Pagos (antes solo sumaba payments + eventos).
        const manualMonthRevenue = await queryOne(
            `SELECT COALESCE(SUM(amount), 0) as total FROM manual_incomes
             WHERE income_date BETWEEN $1::date AND $2::date`,
            [periodStart, periodEnd]
        );
        const manualByMonth = await query<{ month: string; total: string }>(
            `SELECT TO_CHAR(DATE_TRUNC('month', income_date), 'YYYY-MM') as month, SUM(amount) as total
             FROM manual_incomes
             WHERE income_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
             GROUP BY 1`
        );
        const manualByMonthMap: Record<string, number> = {};
        for (const r of manualByMonth) manualByMonthMap[r.month] = parseFloat(r.total);

        // Classes this week
        const weeklyClasses = await queryOne(
            `SELECT COUNT(*) as count FROM classes
             WHERE date >= CURRENT_DATE AND date < CURRENT_DATE + 7 AND status = 'scheduled'`
        );

        // New members in period
        const newMembers = await queryOne(
            `SELECT COUNT(*) as count FROM users
             WHERE role = 'client' AND created_at >= $1::date AND created_at < ($2::date + 1)`,
            [periodStart, periodEnd]
        );

        // Attendance rate in period
        const attendanceRate = await queryOne(
            `SELECT
                COUNT(CASE WHEN status = 'checked_in' THEN 1 END) as checked_in,
                COUNT(CASE WHEN status IN ('confirmed', 'checked_in') THEN 1 END) as total
             FROM bookings
             WHERE created_at >= $1::date AND created_at < ($2::date + 1)`,
            [periodStart, periodEnd]
        );

        const rate = attendanceRate?.total > 0
            ? Math.round((attendanceRate.checked_in / attendanceRate.total) * 100)
            : 0;

        // Egresos in period
        const monthlyExpenses = await queryOne(
            `SELECT COALESCE(SUM(amount), 0) as total FROM egresos
             WHERE date >= $1::date AND date < ($2::date + 1) AND status = 'pagado'`,
            [periodStart, periodEnd]
        );

        // Average ticket per class purchased in period: total paid for class
        // packages divided by total classes acquired (4-class package = 4).
        const ticketStats = await queryOne<{ revenue: string; classes: string }>(
            `SELECT
                COALESCE(SUM(pay.amount), 0) AS revenue,
                COALESCE(SUM(pl.class_limit), 0) AS classes
             FROM payments pay
             JOIN memberships m ON pay.membership_id = m.id
             JOIN plans pl ON m.plan_id = pl.id
             WHERE (COALESCE(pay.completed_at, pay.created_at) AT TIME ZONE 'America/Mexico_City')::date BETWEEN $1::date AND $2::date
               AND pay.status = 'completed'
               AND pl.class_limit > 0`,
            [periodStart, periodEnd]
        );
        const classRevenue = parseFloat(ticketStats?.revenue || '0');
        const classesPurchased = parseInt(ticketStats?.classes || '0', 10);
        const avgTicketPerClass = classesPurchased > 0 ? classRevenue / classesPurchased : 0;

        // Revenue vs Expenses trend (last 6 months)
        const financialTrend = await query(
            `SELECT
                TO_CHAR(month_date, 'YYYY-MM') as month,
                TO_CHAR(month_date, 'Mon') as label,
                COALESCE(rev.total, 0)::numeric as revenue,
                COALESCE(exp.total, 0)::numeric as expenses
            FROM generate_series(
                DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months',
                DATE_TRUNC('month', CURRENT_DATE),
                '1 month'
            ) AS month_date
            LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(total), 0) as total FROM (
                    SELECT SUM(amount) as total FROM payments
                    WHERE status = 'completed'
                      AND (COALESCE(completed_at, created_at) AT TIME ZONE 'America/Mexico_City') >= month_date
                      AND (COALESCE(completed_at, created_at) AT TIME ZONE 'America/Mexico_City') < month_date + INTERVAL '1 month'
                    UNION ALL
                    SELECT SUM(amount) as total FROM event_registrations
                    WHERE status = 'confirmed' AND amount > 0
                      AND (paid_at AT TIME ZONE 'America/Mexico_City') >= month_date
                      AND (paid_at AT TIME ZONE 'America/Mexico_City') < month_date + INTERVAL '1 month'
                ) combined
            ) rev ON true
            LEFT JOIN LATERAL (
                SELECT SUM(amount) as total FROM egresos
                WHERE status = 'pagado'
                  AND date >= month_date
                  AND date < month_date + INTERVAL '1 month'
            ) exp ON true
            ORDER BY month_date ASC`
        );

        const revenue = parseFloat(monthlyRevenue?.total || '0') + parseFloat(manualMonthRevenue?.total || '0');
        const expenses = parseFloat(monthlyExpenses?.total || '0');

        res.json({
            activeMembers: parseInt(activeMembers?.count || '0'),
            monthlyBookings: parseInt(monthlyBookings?.count || '0'),
            monthlyRevenue: revenue,
            monthlyExpenses: expenses,
            netProfit: revenue - expenses,
            weeklyClasses: parseInt(weeklyClasses?.count || '0'),
            newMembers: parseInt(newMembers?.count || '0'),
            attendanceRate: rate,
            avgTicketPerClass,
            classRevenue,
            classesPurchased,
            financialTrend: financialTrend.map(r => {
                const manual = manualByMonthMap[r.month] || 0;
                const rev = parseFloat(r.revenue) + manual;
                return {
                    month: r.month,
                    label: r.label,
                    revenue: rev,
                    expenses: parseFloat(r.expenses),
                    profit: rev - parseFloat(r.expenses),
                };
            }),
        });
    } catch (error) {
        console.error('Get overview error:', error);
        res.status(500).json({ error: 'Error al obtener resumen' });
    }
});

// ============================================
// GET /api/reports/classes - Class stats
// ============================================
router.get('/classes', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { startDate, endDate } = req.query;

        const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const end = endDate || new Date().toISOString().split('T')[0];

        // Classes by type
        const byType = await query(
            `SELECT ct.name, ct.color, COUNT(c.id) as total_classes,
                    SUM(c.current_bookings) as total_bookings
             FROM classes c
             JOIN class_types ct ON c.class_type_id = ct.id
             WHERE c.date BETWEEN $1 AND $2 AND c.status <> 'cancelled'
             GROUP BY ct.id, ct.name, ct.color
             ORDER BY total_bookings DESC`,
            [start, end]
        );

        // Average attendance by day of week
        const byDayOfWeek = await query(
            `SELECT EXTRACT(DOW FROM date) as day_of_week,
                    AVG(current_bookings) as avg_attendance
             FROM classes
             WHERE date BETWEEN $1 AND $2 AND status <> 'cancelled'
             GROUP BY EXTRACT(DOW FROM date)
             ORDER BY day_of_week`,
            [start, end]
        );

        // Popular times
        const byTime = await query(
            `SELECT start_time, AVG(current_bookings) as avg_attendance
             FROM classes
             WHERE date BETWEEN $1 AND $2 AND status <> 'cancelled'
             GROUP BY start_time
             ORDER BY avg_attendance DESC
             LIMIT 5`,
            [start, end]
        );

        // Occupancy rate
        const occupancy = await queryOne(
            `SELECT 
                SUM(current_bookings) as total_bookings,
                SUM(max_capacity) as total_capacity
             FROM classes
             WHERE date BETWEEN $1 AND $2 AND status <> 'cancelled'`,
            [start, end]
        );

        const occupancyRate = occupancy?.total_capacity > 0
            ? Math.round((occupancy.total_bookings / occupancy.total_capacity) * 100)
            : 0;

        const facilitiesRows = await query(
            `SELECT id, name FROM facilities WHERE is_active = true ORDER BY sort_order ASC`
        );
        const classesByStudioRaw = await query(
            `SELECT facility_id, COUNT(*)::int AS count
             FROM classes
             WHERE date BETWEEN $1 AND $2 AND status <> 'cancelled'
             GROUP BY facility_id`,
            [start, end]
        );
        const classesByStudio = fillStudioCounts(
            (facilitiesRows || []) as any[],
            (classesByStudioRaw || []) as any[]
        );

        res.json({
            byType,
            byDayOfWeek,
            byTime,
            occupancyRate,
            classesByStudio
        });
    } catch (error) {
        console.error('Get class stats error:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas de clases' });
    }
});

// ============================================
// GET /api/reports/revenue - Revenue stats
// ============================================
router.get('/revenue', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, facilityId } = req.query;

        const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const end = endDate || new Date().toISOString().split('T')[0];
        // Filtro opcional por sucursal. 'all' o vacío => sin filtro.
        const fac = (typeof facilityId === 'string' && facilityId && facilityId !== 'all') ? facilityId : null;

        // All revenue queries are anchored to America/Mexico_City — the DB stores UTC
        // but the studio reports in local time.
        const TZ = 'America/Mexico_City';

        // La sucursal de un pago: columna directa, con respaldo a la membresía/orden.
        const FAC = `COALESCE(pay.facility_id, m.facility_id, o.facility_id)`;
        // payments siempre con LEFT JOIN a memberships/orders para poder atribuir/filtrar por sucursal.
        const PAY_FROM = `FROM payments pay
                LEFT JOIN memberships m ON pay.membership_id = m.id
                LEFT JOIN orders o ON pay.order_id = o.id`;
        const PAY_WHERE = `(COALESCE(pay.completed_at, pay.created_at) AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
                  AND pay.status = 'completed'`;
        const facClause = fac ? ` AND ${FAC} = $3` : '';
        const params: unknown[] = fac ? [start, end, fac] : [start, end];
        // Los eventos no tienen sucursal: solo se incluyen cuando NO se filtra por sucursal.
        const eventsUnion = (selectExpr: string, groupBy: string) => fac ? '' : `
                UNION ALL
                ${selectExpr}
                FROM event_registrations
                WHERE (paid_at AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
                  AND status = 'confirmed' AND amount > 0
                ${groupBy}`;

        // Daily revenue (payments + events)
        const daily = await query(
            `SELECT date, SUM(total) as total, SUM(count) as count FROM (
                SELECT (COALESCE(pay.completed_at, pay.created_at) AT TIME ZONE '${TZ}')::date as date, SUM(pay.amount) as total, COUNT(*) as count
                ${PAY_FROM}
                WHERE ${PAY_WHERE}${facClause}
                GROUP BY 1
                ${eventsUnion(`SELECT (paid_at AT TIME ZONE '${TZ}')::date as date, SUM(amount) as total, COUNT(*) as count`, 'GROUP BY 1')}
             ) combined GROUP BY date ORDER BY date`,
            params
        );

        // Revenue by payment method (payments + events)
        const byMethod = await query(
            `SELECT payment_method, SUM(total) as total, SUM(count) as count FROM (
                SELECT pay.payment_method, SUM(pay.amount) as total, COUNT(*) as count
                ${PAY_FROM}
                WHERE ${PAY_WHERE}${facClause}
                GROUP BY pay.payment_method
                ${eventsUnion('SELECT payment_method, SUM(amount) as total, COUNT(*) as count', 'GROUP BY payment_method')}
             ) combined GROUP BY payment_method`,
            params
        );

        // Revenue by plan (memberships; events sólo cuando no se filtra por sucursal)
        const byPlan = await query(
            `SELECT name, SUM(total) as total, SUM(count) as count FROM (
                SELECT p.name, SUM(pay.amount) as total, COUNT(*) as count
                FROM payments pay
                JOIN memberships m ON pay.membership_id = m.id
                JOIN plans p ON m.plan_id = p.id
                LEFT JOIN orders o ON pay.order_id = o.id
                WHERE ${PAY_WHERE}${facClause}
                GROUP BY p.id, p.name
                ${fac ? '' : `UNION ALL
                SELECT e.title as name, SUM(r.amount) as total, COUNT(*) as count
                FROM event_registrations r
                JOIN events e ON r.event_id = e.id
                WHERE (r.paid_at AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
                  AND r.status = 'confirmed' AND r.amount > 0
                GROUP BY e.id, e.title`}
             ) combined GROUP BY name ORDER BY total DESC`,
            params
        );

        // Total (payments + events)
        const total = await queryOne(
            `SELECT SUM(total) as total FROM (
                SELECT SUM(pay.amount) as total
                ${PAY_FROM}
                WHERE ${PAY_WHERE}${facClause}
                ${eventsUnion('SELECT SUM(amount) as total', '')}
             ) combined`,
            params
        );

        // Ingresos por sucursal (siempre todas — para la tarjeta de desglose). Eventos no tienen sucursal => excluidos.
        const byFacility = await query(
            `SELECT f.id as facility_id, f.name as facility_name, SUM(pay.amount) as total, COUNT(*) as count
             ${PAY_FROM}
             LEFT JOIN facilities f ON f.id = ${FAC}
             WHERE ${PAY_WHERE}
               AND ${FAC} IS NOT NULL
             GROUP BY f.id, f.name
             ORDER BY total DESC`,
            [start, end]
        );

        // Average ticket per class (respeta el filtro de sucursal)
        const ticketStats = await queryOne<{ revenue: string; classes: string }>(
            `SELECT
                COALESCE(SUM(pay.amount), 0) AS revenue,
                COALESCE(SUM(pl.class_limit), 0) AS classes
             FROM payments pay
             JOIN memberships m ON pay.membership_id = m.id
             JOIN plans pl ON m.plan_id = pl.id
             LEFT JOIN orders o ON pay.order_id = o.id
             WHERE ${PAY_WHERE}${facClause}
               AND pl.class_limit > 0`,
            params
        );
        const classRevenue = parseFloat(ticketStats?.revenue || '0');
        const classesPurchased = parseInt(ticketStats?.classes || '0', 10);
        const avgTicketPerClass = classesPurchased > 0 ? classRevenue / classesPurchased : 0;

        res.json({
            daily,
            byMethod,
            byPlan,
            byFacility,
            total: parseFloat(total?.total || '0'),
            avgTicketPerClass,
            classRevenue,
            classesPurchased,
        });
    } catch (error) {
        console.error('Get revenue stats error:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas de ingresos' });
    }
});

// ============================================
// GET /api/reports/retention - Retention stats (Detailed)
// ============================================
router.get('/retention', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { startDate, endDate } = req.query;
        const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const end = endDate || new Date().toISOString().split('T')[0];

        // 1. General Booking Stats (Attendance Flow)
        const bookingStats = await queryOne(
            `SELECT 
                COUNT(*) as total_bookings,
                COUNT(CASE WHEN b.status = 'checked_in' THEN 1 END) as attended,
                COUNT(CASE WHEN b.status = 'cancelled' AND b.cancellation_reason ILIKE '%menos de%' THEN 1 END) as late_cancellations,
                COUNT(CASE WHEN b.status = 'cancelled' AND b.cancellation_reason NOT ILIKE '%menos de%' AND b.cancellation_reason NOT ILIKE '%admin%' THEN 1 END) as early_cancellations,
                COUNT(CASE WHEN b.status = 'confirmed' AND c.date < NOW() THEN 1 END) as no_shows
             FROM bookings b
             JOIN classes c ON b.class_id = c.id
             WHERE c.date BETWEEN $1 AND $2`,
            [start, end]
        );

        // 2. Economic Impact (Approximate lost revenue)
        // Calculating based on average class price or specific logic if available.
        // For now, we return counts so frontend can multiply by avg price.

        // 3. Reposition Stats
        // Assuming repositions are identified via specific plan categories or tracking. 
        // If not explicit, we skip specific reposition logic or approximate.
        // We can track 'cancellations_used' increments from memberships update.
        const repositions = await queryOne(
            `SELECT SUM(cancellations_used) as created FROM memberships`
        );

        // 4. Users with most No-Shows/Late Cancels
        const riskyUsers = await query(
            `SELECT u.id, u.display_name, u.email,
                    COUNT(CASE WHEN b.status = 'confirmed' AND c.date < NOW() THEN 1 END) as no_shows,
                    COUNT(CASE WHEN b.status = 'cancelled' AND b.cancellation_reason ILIKE '%menos de%' THEN 1 END) as late_cancels
             FROM bookings b
             JOIN classes c ON b.class_id = c.id
             JOIN users u ON b.user_id = u.id
             WHERE c.date BETWEEN $1 AND $2
             GROUP BY u.id, u.display_name, u.email
             HAVING COUNT(CASE WHEN b.status = 'confirmed' AND c.date < NOW() THEN 1 END) > 0 
                OR COUNT(CASE WHEN b.status = 'cancelled' AND b.cancellation_reason ILIKE '%menos de%' THEN 1 END) > 0
             ORDER BY no_shows DESC, late_cancels DESC
             LIMIT 10`,
            [start, end]
        );

        // 5. Membership Retention (Renewal Rate)
        const renewalData = await queryOne(
            `WITH expired AS (
                 SELECT id, user_id, end_date FROM memberships
                 WHERE status = 'expired' AND end_date BETWEEN $1::date AND $2::date
              ),
              renewed AS (
                 SELECT e.id FROM expired e
                 WHERE EXISTS (
                     SELECT 1 FROM memberships m2
                     WHERE m2.user_id = e.user_id AND m2.id <> e.id
                       AND m2.created_at::date >= (e.end_date - INTERVAL '7 days')::date
                       AND m2.created_at::date <= (e.end_date + INTERVAL '45 days')::date
                 )
              )
              SELECT
                 (SELECT COUNT(*) FROM expired) as expired_count,
                 (SELECT COUNT(*) FROM renewed) as renewed_count`,
            [start, end]
        );

        const renewalRate = renewalData?.expired_count > 0
            ? Math.round((renewalData.renewed_count / renewalData.expired_count) * 100)
            : 0;

        res.json({
            summary: {
                totalBookings: parseInt(bookingStats?.total_bookings || '0'),
                attended: parseInt(bookingStats?.attended || '0'),
                lateCancellations: parseInt(bookingStats?.late_cancellations || '0'),
                earlyCancellations: parseInt(bookingStats?.early_cancellations || '0'),
                noShows: parseInt(bookingStats?.no_shows || '0'),
            },
            repositions: {
                created: parseInt(repositions?.created || '0'),
                // tracked elsewhere if needed
            },
            riskyUsers,
            retentionMetrics: {
                renewalRate,
                expiredLast90Days: parseInt(renewalData?.expired_count || '0'),
                renewedLast90Days: parseInt(renewalData?.renewed_count || '0')
            }
        });
    } catch (error) {
        console.error('Get retention stats error:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas de retención' });
    }
});

// ============================================
// GET /api/reports/platforms — actividad por plan interno (Totalpass/Wellhub/Fitpass) en un rango.
// ============================================
router.get('/platforms', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    const { startDate, endDate, facility_id } = req.query as Record<string, string | undefined>;
    const p: unknown[] = [startDate || '1900-01-01', endDate || '2999-12-31'];
    let facCond = '';
    if (facility_id) { p.push(facility_id); facCond = ` AND c.facility_id = $${p.length}`; }
    const rows = await query(
        `SELECT pl.name AS plan_name, pl.color,
                COUNT(DISTINCT m.user_id) FILTER (WHERE m.status = 'active') AS active_members,
                COUNT(b.id) FILTER (WHERE b.status <> 'cancelled' AND c.id IS NOT NULL) AS bookings,
                COUNT(b.id) FILTER (WHERE b.status = 'checked_in' AND c.id IS NOT NULL) AS checkins
           FROM plans pl
           LEFT JOIN memberships m ON m.plan_id = pl.id
           LEFT JOIN bookings b ON b.membership_id = m.id
           LEFT JOIN classes c ON c.id = b.class_id AND c.date BETWEEN $1 AND $2${facCond}
          WHERE pl.is_internal = true
          GROUP BY pl.name, pl.color
          ORDER BY pl.name`,
        p,
    );
    return res.json(rows);
});

// ============================================
// GET /api/reports/instructors - Instructor stats
// ============================================
router.get('/instructors', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, facility_id } = req.query as {
            startDate?: string; endDate?: string; facility_id?: string;
        };

        const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const end = endDate || new Date().toISOString().split('T')[0];
        const fac = facility_id && facility_id !== 'all' ? facility_id : null;

        const stats = await query(
            `SELECT
                i.id,
                i.display_name,
                i.photo_url,
                -- Statistics regarding Classes (opcional: filtra por sucursal)
                COUNT(DISTINCT c.id) as total_classes,
                COALESCE(SUM(c.current_bookings), 0) as total_students,
                COALESCE(AVG(c.current_bookings), 0) as avg_attendance,
                COALESCE(AVG(c.current_bookings::float / NULLIF(c.max_capacity, 0) * 100), 0) as avg_occupancy,
                -- Statistics regarding Reviews (no se filtran por sucursal — un review es del coach)
                (
                    SELECT COUNT(*)
                    FROM reviews r
                    WHERE r.instructor_id = i.id
                    AND r.created_at >= $1::timestamp
                    AND r.created_at <= $2::timestamp + INTERVAL '1 day'
                    AND r.status = 'published'
                ) as total_reviews,
                (
                    SELECT AVG(overall_rating)
                    FROM reviews r
                    WHERE r.instructor_id = i.id
                    AND r.created_at >= $1::timestamp
                    AND r.created_at <= $2::timestamp + INTERVAL '1 day'
                    AND r.status = 'published'
                ) as avg_rating
             FROM instructors i
             LEFT JOIN classes c ON i.id = c.instructor_id
                AND c.date >= $1
                AND c.date <= $2
                AND c.status != 'cancelled'
                AND ($3::uuid IS NULL OR c.facility_id = $3::uuid)
             WHERE i.is_active = true
             GROUP BY i.id
             ORDER BY avg_rating DESC NULLS LAST`,
            [start, end, fac]
        );

        res.json(stats);
    } catch (error) {
        console.error('Get instructor stats error:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas de instructores' });
    }
});

// ============================================
// GET /api/reports/sales-by-staff?from&to
// ============================================
router.get('/sales-by-staff', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const from = (req.query.from as string) || '1900-01-01';
        const to = (req.query.to as string) || '9999-12-31';
        const sales = await getStaffSales(from, to, { roles: ['reception', 'admin', 'super_admin'] });
        const rows = sales
            .filter((r) => r.memberships_count > 0 || r.products_count > 0)
            .sort((a, b) => (b.memberships_amount + b.products_amount) - (a.memberships_amount + a.products_amount))
            .map((r) => ({
                id: r.user_id,
                display_name: r.display_name,
                memberships_count: r.memberships_count,
                memberships_amount: r.memberships_amount,
                public_memberships_count: r.public_memberships_count,
                public_memberships_amount: r.public_memberships_amount,
                products_count: r.products_count,
                products_amount: r.products_amount,
            }));
        res.json(rows);
    } catch (error) {
        console.error('Get sales-by-staff error:', error);
        res.status(500).json({ error: 'Error al obtener ventas por staff' });
    }
});

// GET /api/reports/staff-sales-detail?staffId&from&to → desglose por colaborador (rango)
router.get('/staff-sales-detail', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const staffId = req.query.staffId as string | undefined;
        if (!staffId) return res.status(400).json({ error: 'staffId requerido' });
        const from = (req.query.from as string) || '1900-01-01';
        const to = (req.query.to as string) || '9999-12-31';
        const detail = await getStaffSalesDetail(staffId, from, to);
        res.json(detail);
    } catch (error) {
        console.error('Get staff-sales-detail error:', error);
        res.status(500).json({ error: 'Error al obtener desglose por colaborador' });
    }
});

// ============================================
// GET /api/reports/membership-movements?from&to
// ============================================
router.get('/membership-movements', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { from, to } = req.query as any;
        const rows = await query(`
            SELECT m.id, m.status, m.start_date, m.end_date, m.activated_at, m.cancelled_at, m.created_at,
                   u.display_name AS member, p.name AS plan, ab.display_name AS activated_by
            FROM memberships m
            JOIN users u ON u.id = m.user_id
            LEFT JOIN plans p ON p.id = m.plan_id
            LEFT JOIN users ab ON ab.id = m.activated_by
            WHERE m.is_migration = false
              AND ($1::date IS NULL OR m.created_at >= $1) AND ($2::date IS NULL OR m.created_at <= $2)
            ORDER BY m.created_at DESC LIMIT 500`, [from || null, to || null]);
        res.json(rows);
    } catch (error) {
        console.error('Get membership-movements error:', error);
        res.status(500).json({ error: 'Error al obtener movimientos de membresías' });
    }
});

// ============================================
// GET /api/reports/profit-by-facility - Utilidad por sucursal (ingresos - egresos)
// ============================================
router.get('/profit-by-facility', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { startDate, endDate } = req.query;
        const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const end = endDate || new Date().toISOString().split('T')[0];
        const TZ = 'America/Mexico_City';

        // Ingresos por sucursal (payments; los eventos no tienen sucursal => excluidos)
        const revRows = await query(
            `SELECT COALESCE(pay.facility_id, m.facility_id, o.facility_id) AS facility_id, SUM(pay.amount) AS total
             FROM payments pay
             LEFT JOIN memberships m ON pay.membership_id = m.id
             LEFT JOIN orders o ON pay.order_id = o.id
             WHERE (COALESCE(pay.completed_at, pay.created_at) AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
               AND pay.status = 'completed'
               AND COALESCE(pay.facility_id, m.facility_id, o.facility_id) IS NOT NULL
             GROUP BY 1`,
            [start, end]
        );

        // Egresos asignados a una sucursal (status != cancelado)
        const expRows = await query(
            `SELECT facility_id, SUM(amount) AS total
             FROM egresos
             WHERE date BETWEEN $1::date AND $2::date
               AND status = 'pagado'
               AND facility_id IS NOT NULL
             GROUP BY facility_id`,
            [start, end]
        );

        // Egresos generales (sin sucursal) — no se reparten por local en v1.
        const generalExp = await queryOne<{ total: string }>(
            `SELECT COALESCE(SUM(amount), 0) AS total
             FROM egresos
             WHERE date BETWEEN $1::date AND $2::date
               AND status = 'pagado'
               AND facility_id IS NULL`,
            [start, end]
        );

        // Sucursales BMB activas (siempre se listan, aunque estén en 0)
        const facs = await query(
            `SELECT id, name FROM facilities WHERE name ILIKE 'BMB%' AND is_active = true ORDER BY name`
        );

        const revMap = new Map(revRows.map((r: any) => [r.facility_id, parseFloat(r.total) || 0]));
        const expMap = new Map(expRows.map((r: any) => [r.facility_id, parseFloat(r.total) || 0]));

        const rows = facs.map((f: any) => {
            const revenue = (revMap.get(f.id) as number) || 0;
            const expenses = (expMap.get(f.id) as number) || 0;
            return { facility_id: f.id, facility_name: f.name, revenue, expenses, profit: revenue - expenses };
        });

        res.json({ rows, generalExpenses: parseFloat(generalExp?.total || '0') });
    } catch (error) {
        console.error('profit-by-facility error:', error);
        res.status(500).json({ error: 'Error al obtener utilidad por sucursal' });
    }
});

// ============================================
// GET /api/reports/top-clients — ranking de clientes por gasto (LTV)
// ============================================
router.get('/top-clients', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { startDate, endDate } = req.query;
        const start = (startDate as string) || new Date(Date.now() - 365 * 864e5).toISOString().split('T')[0];
        const end = (endDate as string) || new Date().toISOString().split('T')[0];
        // Gasto = valor de membresías (plan.price) + productos (sales). NO usa payments
        // porque los miembros migrados tienen la membresía directa, sin registro de pago;
        // contar memberships x precio cubre a todos sin doble-contar (1 venta = 1 membresía).
        const clients = await query(`
            WITH memb AS (
                SELECT m.user_id, SUM(p.price) amt, COUNT(*) n
                FROM memberships m JOIN plans p ON p.id = m.plan_id
                WHERE m.created_at::date BETWEEN $1 AND $2
                  AND m.is_migration = false AND p.price > 0
                GROUP BY m.user_id
            ),
            sal AS (
                SELECT user_id, SUM(total) amt FROM sales
                WHERE status <> 'cancelled' AND created_at::date BETWEEN $1 AND $2
                GROUP BY user_id
            ),
            att AS (
                SELECT user_id, COUNT(*) n FROM bookings
                WHERE status = 'checked_in' AND created_at::date BETWEEN $1 AND $2
                GROUP BY user_id
            )
            SELECT u.id, u.display_name, u.email, u.phone,
                COALESCE(memb.amt,0)::float AS membership_spend,
                COALESCE(sal.amt,0)::float AS product_spend,
                (COALESCE(memb.amt,0)+COALESCE(sal.amt,0))::float AS total_spend,
                COALESCE(memb.n,0)::int AS memberships_count,
                COALESCE(att.n,0)::int AS attended
            FROM users u
            LEFT JOIN memb ON memb.user_id = u.id
            LEFT JOIN sal ON sal.user_id = u.id
            LEFT JOIN att ON att.user_id = u.id
            WHERE u.role = 'client' AND (COALESCE(memb.amt,0)+COALESCE(sal.amt,0)) > 0
            ORDER BY total_spend DESC
            LIMIT 100
        `, [start, end]);
        res.json({ clients, startDate: start, endDate: end });
    } catch (error) {
        console.error('top-clients error:', error);
        res.status(500).json({ error: 'Error al obtener top de clientes' });
    }
});

// ============================================
// GET /api/reports/revenue-by-type — ingresos por tipo (membresías/productos/eventos)
// ============================================
router.get('/revenue-by-type', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { startDate, endDate } = req.query;
        const start = (startDate as string) || new Date(Date.now() - 30 * 864e5).toISOString().split('T')[0];
        const end = (endDate as string) || new Date().toISOString().split('T')[0];
        // Una sola fuente de verdad = el PAGO (alineado con /revenue).
        // Membresías y Productos salen de payments completados (membership_id / order_id);
        // Eventos de event_registrations por paid_at.
        const TZ = 'America/Mexico_City';
        const types = await query(`
            SELECT 'Membresías' AS type, COALESCE(SUM(pay.amount),0)::float AS total, COUNT(*)::int AS count
            FROM payments pay
            WHERE pay.membership_id IS NOT NULL AND pay.status = 'completed'
              AND (COALESCE(pay.completed_at, pay.created_at) AT TIME ZONE '${TZ}')::date BETWEEN $1 AND $2
            UNION ALL
            SELECT 'Productos', COALESCE(SUM(pay.amount),0)::float, COUNT(*)::int
            FROM payments pay
            WHERE pay.order_id IS NOT NULL AND pay.status = 'completed'
              AND (COALESCE(pay.completed_at, pay.created_at) AT TIME ZONE '${TZ}')::date BETWEEN $1 AND $2
            UNION ALL
            SELECT 'Eventos', COALESCE(SUM(amount),0)::float, COUNT(*)::int
            FROM event_registrations
            WHERE status = 'confirmed' AND amount > 0
              AND (paid_at AT TIME ZONE '${TZ}')::date BETWEEN $1 AND $2
        `, [start, end]);
        const total = (types as any[]).reduce((s, t) => s + (t.total || 0), 0);
        res.json({ types, total, startDate: start, endDate: end });
    } catch (error) {
        console.error('revenue-by-type error:', error);
        res.status(500).json({ error: 'Error al obtener ingresos por tipo' });
    }
});

// ============================================
// GET /api/reports/renewal-by-plan — tasa de renovación por plan
// ============================================
router.get('/renewal-by-plan', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { startDate, endDate } = req.query;
        const start = (startDate as string) || new Date(Date.now() - 180 * 864e5).toISOString().split('T')[0];
        const end = (endDate as string) || new Date().toISOString().split('T')[0];
        const plans = await query(`
            WITH expired AS (
                SELECT m.id, m.plan_id, m.user_id, m.end_date
                FROM memberships m
                WHERE m.status = 'expired' AND m.end_date BETWEEN $1 AND $2
            ),
            renew AS (
                SELECT e.id FROM expired e
                WHERE EXISTS (
                    SELECT 1 FROM memberships m2
                    WHERE m2.user_id = e.user_id AND m2.id <> e.id
                      AND m2.created_at::date >= (e.end_date - INTERVAL '7 days')::date
                      AND m2.created_at::date <= (e.end_date + INTERVAL '45 days')::date
                )
            )
            SELECT p.name AS plan_name,
                COUNT(*)::int AS expired_count,
                COUNT(r.id)::int AS renewed_count,
                COALESCE(ROUND(COUNT(r.id)::numeric / NULLIF(COUNT(*),0) * 100, 1), 0)::float AS renewal_rate
            FROM expired e
            JOIN plans p ON p.id = e.plan_id
            LEFT JOIN renew r ON r.id = e.id
            GROUP BY p.name
            ORDER BY expired_count DESC
        `, [start, end]);
        res.json({ plans, startDate: start, endDate: end });
    } catch (error) {
        console.error('renewal-by-plan error:', error);
        res.status(500).json({ error: 'Error al obtener renovación por plan' });
    }
});

// ============================================
// GET /api/reports/coach-ranking — ranking de coaches por estudiantes/clases
// ============================================
router.get('/coach-ranking', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, facilityId } = req.query;
        const start = (startDate as string) || new Date(Date.now() - 60 * 864e5).toISOString().split('T')[0];
        const end = (endDate as string) || new Date().toISOString().split('T')[0];
        const params: any[] = [start, end];
        let facFilter = '';
        if (facilityId && facilityId !== 'all') { params.push(facilityId); facFilter = ` AND c.facility_id = $3`; }
        const coaches = await query(`
            WITH cls AS (
                SELECT c.instructor_id,
                    COUNT(*) classes_taught,
                    AVG(CASE WHEN c.max_capacity > 0 THEN c.current_bookings::numeric / c.max_capacity * 100 END) avg_occ
                FROM classes c
                WHERE c.date BETWEEN $1 AND $2 AND c.status = 'completed'${facFilter}
                  AND EXISTS (SELECT 1 FROM bookings b WHERE b.class_id = c.id AND b.status IN ('confirmed','checked_in'))
                GROUP BY c.instructor_id
            ),
            chk AS (
                SELECT c.instructor_id, COUNT(*) checkins
                FROM bookings b JOIN classes c ON c.id = b.class_id
                WHERE b.status = 'checked_in' AND c.date BETWEEN $1 AND $2${facFilter}
                GROUP BY c.instructor_id
            )
            SELECT i.id, i.display_name, i.photo_url,
                COALESCE(cls.classes_taught,0)::int AS classes_taught,
                COALESCE(chk.checkins,0)::int AS checkins,
                COALESCE(ROUND(cls.avg_occ,0),0)::float AS avg_occupancy,
                i.pay_rate_per_class::float AS pay_rate_per_class,
                CASE WHEN i.pay_rate_per_class IS NULL THEN NULL::float
                     ELSE (COALESCE(cls.classes_taught,0) * i.pay_rate_per_class)::float END AS est_cost
            FROM instructors i
            LEFT JOIN cls ON cls.instructor_id = i.id
            LEFT JOIN chk ON chk.instructor_id = i.id
            WHERE i.is_active = true AND (COALESCE(cls.classes_taught,0) > 0 OR COALESCE(chk.checkins,0) > 0)
            ORDER BY checkins DESC, classes_taught DESC
        `, params);
        res.json({ coaches, startDate: start, endDate: end });
    } catch (error) {
        console.error('coach-ranking error:', error);
        res.status(500).json({ error: 'Error al obtener ranking de coaches' });
    }
});

// ============================================
// GET /api/reports/cancellation-reasons — motivos de cancelación agregados
// ============================================
router.get('/cancellation-reasons', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { startDate, endDate } = req.query;
        const start = (startDate as string) || new Date(Date.now() - 30 * 864e5).toISOString().split('T')[0];
        const end = (endDate as string) || new Date().toISOString().split('T')[0];
        const reasons = await query(`
            SELECT
                CASE
                    WHEN b.cancellation_reason IS NULL OR b.cancellation_reason = '' THEN 'Sin motivo'
                    WHEN b.cancellation_reason ILIKE '%menos de%' OR b.cancellation_reason ILIKE '%tard%' THEN 'Cancelación tardía'
                    WHEN b.cancellation_reason ILIKE '%admin%' THEN 'Administrativa'
                    WHEN b.cancellation_reason ILIKE '%no-show%' OR b.cancellation_reason ILIKE '%no asist%' THEN 'No-show'
                    ELSE b.cancellation_reason
                END AS reason,
                COUNT(*)::int AS count,
                COUNT(DISTINCT b.user_id)::int AS unique_users
            FROM bookings b
            WHERE b.status = 'cancelled' AND b.updated_at::date BETWEEN $1 AND $2
            GROUP BY reason
            ORDER BY count DESC
        `, [start, end]);
        const total = (reasons as any[]).reduce((s, r) => s + (r.count || 0), 0);
        res.json({ reasons, total, startDate: start, endDate: end });
    } catch (error) {
        console.error('cancellation-reasons error:', error);
        res.status(500).json({ error: 'Error al obtener motivos de cancelación' });
    }
});

export default router;
