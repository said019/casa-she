import { Router, Request, Response } from 'express';
import { query, queryOne, pool } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { logAction } from '../lib/audit.js';
import { buildCoachPayrollEgreso } from '../lib/coachPayrollEgreso.js';
import {
    PayrollPeriod,
    currentPeriodToken,
    isValidPeriodToken,
    normalizeFrequency,
    resolvePeriodToken,
} from '../lib/payrollPeriod.js';

const router = Router();
const ADMIN = ['admin', 'super_admin'] as const;

// Frecuencia configurada (settings.payroll_config). Default 'monthly'.
async function getPayrollFrequency(): Promise<'biweekly' | 'monthly'> {
    const r = await queryOne<{ value: any }>(
        `SELECT value FROM system_settings WHERE key = 'payroll_config'`
    );
    const v = r?.value ? (typeof r.value === 'string' ? JSON.parse(r.value) : r.value) : {};
    return normalizeFrequency(v?.frequency);
}

// Resuelve el periodo de nómina. Si llega un token explícito válido (?period= o el
// legacy ?month=YYYY-MM), su FORMA manda. Si no, usa el periodo actual (CDMX) según la
// frecuencia configurada.
async function resolvePeriod(raw?: string): Promise<PayrollPeriod> {
    if (raw && isValidPeriodToken(raw)) {
        return resolvePeriodToken(raw);
    }
    const freq = await getPayrollFrequency();
    const today = await queryOne<{ d: string }>(
        `SELECT TO_CHAR((NOW() AT TIME ZONE 'America/Mexico_City')::date, 'YYYY-MM-DD') AS d`
    );
    return resolvePeriodToken(currentPeriodToken(freq, today!.d));
}

function periodInput(req: Request): string | undefined {
    return (req.query.period as string | undefined) || (req.query.month as string | undefined);
}

// ============================================
// GET /api/coach-payroll?period=YYYY-MM[-Q1|-Q2][&facility_id=uuid]
// Devuelve cada coach activo con: tarifa, clases impartidas del periodo, total y estado de pago.
// Una clase cuenta cuando classes.status='completed' (el cron auto-marca 15 min después
// de end_time; ver services/cron-jobs.ts). Acepta ?month=YYYY-MM legacy (mensual).
// ============================================
router.get('/', authenticate, requirePermission('nomina'), async (req: Request, res: Response) => {
    try {
        const period = await resolvePeriod(periodInput(req));
        const facilityId = (req.query.facility_id as string | undefined) || null;

        const rows = await query<any>(`
            WITH cls AS (
              SELECT c.instructor_id, COUNT(*) AS classes_count
              FROM classes c
              WHERE c.status = 'completed'
                -- Solo cuenta si HUBO GENTE en la clase: ≥1 reserva real (confirmada o con
                -- check-in). NO cuenta lista de espera ni slots vacíos. El cron auto-marca
                -- 'completed' toda clase pasada (incluso vacías) y hace auto check-in 30 min
                -- después de iniciar, así que las confirmadas quedan como asistidas.
                AND EXISTS (SELECT 1 FROM bookings b WHERE b.class_id = c.id AND b.status IN ('confirmed', 'checked_in'))
                AND c.date >= ($1::date)
                AND c.date <  ($2::date)
                AND ($3::uuid IS NULL OR c.facility_id = $3::uuid)
              GROUP BY c.instructor_id)
            SELECT i.id, i.display_name, i.photo_url, i.pay_rate_per_class,
                   COALESCE(cls.classes_count, 0) AS classes_count,
                   pay.classes_count   AS p_classes,
                   pay.pay_rate_per_class AS p_rate,
                   pay.amount          AS p_amount,
                   pay.facility_id     AS p_facility,
                   pay.paid_at, pay.paid_by
            FROM instructors i
            LEFT JOIN cls ON cls.instructor_id = i.id
            LEFT JOIN coach_payouts pay
              ON pay.instructor_id = i.id
             AND pay.period_start  = $1::date
             AND pay.period_end    = $4::date
             AND pay.facility_id IS NOT DISTINCT FROM $3::uuid
            WHERE i.is_active = true
            ORDER BY i.display_name`,
            [period.start, period.endExclusive, facilityId, period.endIncl]);

        const result = rows.map((r: any) => {
            const rate = r.pay_rate_per_class != null ? Number(r.pay_rate_per_class) : null;
            const classes_count = Number(r.classes_count);
            const total = rate != null ? Math.round(classes_count * rate * 100) / 100 : null;
            const paid = r.paid_at != null;
            return {
                instructor_id: r.id,
                display_name: r.display_name,
                photo_url: r.photo_url,
                pay_rate_per_class: rate,
                classes_count,
                total,
                paid,
                payout: paid ? {
                    classes_count: Number(r.p_classes),
                    pay_rate_per_class: Number(r.p_rate),
                    amount: Number(r.p_amount),
                    facility_id: r.p_facility,
                    paid_at: r.paid_at,
                    paid_by: r.paid_by,
                } : null,
            };
        });

        res.json({
            frequency: period.frequency,
            period: period.token,
            period_label: period.label,
            period_start: period.start,
            period_end: period.endIncl,
            facility_id: facilityId,
            rows: result,
        });
    } catch (error) {
        console.error('GET /coach-payroll error:', error);
        res.status(500).json({ error: 'Error al obtener nómina' });
    }
});

// ============================================
// GET /api/coach-payroll/:instructorId/classes?period=...[&facility_id=uuid]
// Detalle de las clases impartidas (status='completed') que cuentan para la nómina.
// ============================================
router.get('/:instructorId/classes', authenticate, requirePermission('nomina'), async (req: Request, res: Response) => {
    try {
        const period = await resolvePeriod(periodInput(req));
        const facilityId = (req.query.facility_id as string | undefined) || null;
        const classes = await query<any>(
            `SELECT c.id, c.date, c.start_time, c.status,
                    ct.name AS class_type_name,
                    f.name AS facility_name,
                    (SELECT COUNT(*) FROM bookings b WHERE b.class_id = c.id AND b.status IN ('confirmed', 'checked_in')) AS reservas,
                    (SELECT COUNT(*) FROM bookings b WHERE b.class_id = c.id AND b.status = 'checked_in') AS asistencias
             FROM classes c
             JOIN class_types ct ON c.class_type_id = ct.id
             LEFT JOIN facilities f ON c.facility_id = f.id
             WHERE c.status = 'completed'
               AND EXISTS (SELECT 1 FROM bookings b WHERE b.class_id = c.id AND b.status IN ('confirmed', 'checked_in'))
               AND c.instructor_id = $1
               AND c.date >= ($2::date)
               AND c.date <  ($3::date)
               AND ($4::uuid IS NULL OR c.facility_id = $4::uuid)
             ORDER BY c.date, c.start_time`,
            [req.params.instructorId, period.start, period.endExclusive, facilityId],
        );
        res.json(classes);
    } catch (error) {
        console.error('GET /coach-payroll/:id/classes error:', error);
        res.status(500).json({ error: 'Error al obtener el detalle de clases' });
    }
});

// ============================================
// PUT /api/coach-payroll/rate/:instructorId { pay_rate_per_class }
// Permite editar la tarifa por clase del coach desde la pantalla de nómina.
// pay_rate_per_class puede ser null para "sin tarifa".
// ============================================
router.put('/rate/:instructorId', authenticate, requirePermission('nomina'), async (req: Request, res: Response) => {
    try {
        const raw = (req.body as any)?.pay_rate_per_class;
        let rate: number | null;
        if (raw === null || raw === '' || raw === undefined) {
            rate = null;
        } else {
            const n = Number(raw);
            if (!Number.isFinite(n) || n < 0) {
                return res.status(400).json({ error: 'pay_rate_per_class debe ser un número >= 0 o null' });
            }
            rate = n;
        }
        const row = await queryOne(
            `UPDATE instructors SET pay_rate_per_class = $1, updated_at = NOW()
             WHERE id = $2 RETURNING id, display_name, pay_rate_per_class`,
            [rate, req.params.instructorId]
        );
        if (!row) return res.status(404).json({ error: 'Instructor no encontrado' });
        await logAction(query, {
            adminUserId: req.user!.userId,
            actionType: 'coach_pay_rate_updated',
            entityType: 'instructor',
            entityId: req.params.instructorId,
            description: `Tarifa por clase del coach actualizada a ${rate ?? 'NULL'}`,
            newData: { pay_rate_per_class: rate },
            req,
        });
        res.json(row);
    } catch (error) {
        console.error('PUT /coach-payroll/rate error:', error);
        res.status(500).json({ error: 'Error al actualizar tarifa' });
    }
});

// ============================================
// POST /api/coach-payroll/payouts { instructor_id, period (o month legacy), facility_id? }
// Recalcula clases del periodo con la tarifa actual y congela snapshot. Marca como pagado.
// ============================================
router.post('/payouts', authenticate, requireRole(...ADMIN), async (req: Request, res: Response) => {
    try {
        const { instructor_id, period: periodTok, month, facility_id } = req.body as {
            instructor_id?: string; period?: string; month?: string; facility_id?: string | null;
        };
        const tok = periodTok || month;
        if (!instructor_id || !tok || !isValidPeriodToken(tok)) {
            return res.status(400).json({ error: 'instructor_id y period (YYYY-MM o YYYY-MM-Q1/Q2) requeridos' });
        }
        const period = resolvePeriodToken(tok);
        const facId = facility_id || null;

        const inst = await queryOne<{ pay_rate_per_class: string | null; display_name: string }>(
            `SELECT pay_rate_per_class, display_name FROM instructors WHERE id = $1 AND is_active = true`,
            [instructor_id]
        );
        if (!inst) return res.status(404).json({ error: 'Instructor no encontrado o inactivo' });
        if (inst.pay_rate_per_class == null) {
            return res.status(400).json({ error: 'El coach no tiene tarifa por clase configurada' });
        }
        const rate = Number(inst.pay_rate_per_class);

        const agg = await queryOne<{ classes_count: string }>(`
            SELECT COUNT(*) AS classes_count FROM classes c
            WHERE c.instructor_id = $1
              AND c.status = 'completed'
              AND EXISTS (SELECT 1 FROM bookings b WHERE b.class_id = c.id AND b.status IN ('confirmed', 'checked_in'))
              AND c.date >= ($2::date)
              AND c.date <  ($3::date)
              AND ($4::uuid IS NULL OR c.facility_id = $4::uuid)`,
            [instructor_id, period.start, period.endExclusive, facId]);
        const classes_count = Number(agg?.classes_count ?? 0);
        if (classes_count <= 0) {
            return res.status(400).json({ error: 'El coach no tiene clases impartidas en ese periodo' });
        }
        const amount = Math.round(classes_count * rate * 100) / 100;

        // Transacción: el pago (coach_payouts) y su egreso de nómina se crean juntos o no
        // se crea ninguno. Evita dejar un pago registrado sin su egreso en el reporte.
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const payoutRes = await client.query(
                `INSERT INTO coach_payouts
                    (instructor_id, period_month, period_start, period_end, facility_id, classes_count, pay_rate_per_class, amount, paid_by)
                 VALUES ($1,$2::date,$3::date,$4::date,$5,$6,$7,$8,$9) RETURNING *`,
                [instructor_id, period.monthStart, period.start, period.endIncl, facId, classes_count, rate, amount, req.user!.userId]
            );
            const row = payoutRes.rows[0];

            // Registrar automáticamente el pago como egreso categoría 'nomina' (estado pagado),
            // vinculado al payout vía source_payout_id para que el revert (DELETE) lo borre en cascada.
            const today = new Date().toISOString().split('T')[0];
            const eg = buildCoachPayrollEgreso({
                payoutId: row.id,
                coachName: inst.display_name,
                periodLabel: period.label,
                classesCount: classes_count,
                payRatePerClass: rate,
                amount,
                facilityId: facId,
                createdBy: req.user!.userId,
                today,
            });
            await client.query(
                `INSERT INTO egresos
                    (category, concept, description, amount, date, status,
                     vendor, distribution, created_by, paid_at,
                     facility_id, payment_method, source_payout_id)
                 VALUES ($1,$2,$3,$4,$5::date,$6,$7,'{}'::jsonb,$8,NOW(),$9,$10,$11)`,
                [eg.category, eg.concept, eg.description, eg.amount, eg.date, eg.status,
                 eg.vendor, eg.created_by, eg.facility_id, eg.payment_method, eg.source_payout_id]
            );

            await client.query('COMMIT');

            await logAction(query, {
                adminUserId: req.user!.userId,
                actionType: 'coach_payout_paid',
                entityType: 'instructor',
                entityId: instructor_id,
                description: `Nómina ${period.label} pagada (${classes_count} clases × ${rate}) → egreso registrado`,
                newData: { period: period.token, facility_id: facId, classes_count, pay_rate_per_class: rate, amount },
                req,
            });
            return res.status(201).json(row);
        } catch (e: any) {
            await client.query('ROLLBACK').catch(() => {});
            if (e?.code === '23505') {
                return res.status(409).json({ error: 'Esa nómina ya está marcada como pagada' });
            }
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('POST /coach-payroll/payouts error:', error);
        res.status(500).json({ error: 'Error al registrar el pago' });
    }
});

// ============================================
// DELETE /api/coach-payroll/payouts/:instructorId?period=...[&facility_id=uuid]
// Des-marca un pago.
// ============================================
router.delete('/payouts/:instructorId', authenticate, requireRole(...ADMIN), async (req: Request, res: Response) => {
    try {
        const tok = periodInput(req);
        const facId = (req.query.facility_id as string | undefined) || null;
        if (!tok || !isValidPeriodToken(tok)) {
            return res.status(400).json({ error: 'period (YYYY-MM o YYYY-MM-Q1/Q2) requerido' });
        }
        const period = resolvePeriodToken(tok);
        const del = await queryOne<any>(
            `DELETE FROM coach_payouts
             WHERE instructor_id = $1 AND period_start = $2::date AND period_end = $3::date
               AND facility_id IS NOT DISTINCT FROM $4::uuid
             RETURNING *`,
            [req.params.instructorId, period.start, period.endIncl, facId]
        );
        if (!del) return res.status(404).json({ error: 'No había nómina registrada para ese periodo' });
        await logAction(query, {
            adminUserId: req.user!.userId,
            actionType: 'coach_payout_unpaid',
            entityType: 'instructor',
            entityId: req.params.instructorId,
            description: `Nómina ${period.label} des-marcada`,
            oldData: { period: period.token, facility_id: facId, amount: Number(del.amount) },
            req,
        });
        res.json({ ok: true });
    } catch (error) {
        console.error('DELETE /coach-payroll/payouts error:', error);
        res.status(500).json({ error: 'Error al des-marcar el pago' });
    }
});

// ============================================
// GET /api/coach-payroll/me?period=...
// Coach mira su propia nómina del periodo (clases impartidas, tarifa, total, estado).
// ============================================
router.get('/me', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ error: 'No autorizado' });
        const own = await queryOne<{ id: string; pay_rate_per_class: string | null }>(
            `SELECT id, pay_rate_per_class FROM instructors WHERE user_id = $1`,
            [userId]
        );
        if (!own) return res.status(403).json({ error: 'No tienes un perfil de instructor' });
        const period = await resolvePeriod(periodInput(req));

        const agg = await queryOne<{ classes_count: string }>(`
            SELECT COUNT(*) AS classes_count FROM classes c
            WHERE c.instructor_id = $1
              AND c.status = 'completed'
              AND EXISTS (SELECT 1 FROM bookings b WHERE b.class_id = c.id AND b.status IN ('confirmed', 'checked_in'))
              AND c.date >= ($2::date)
              AND c.date <  ($3::date)`,
            [own.id, period.start, period.endExclusive]);

        const payouts = await query<any>(`
            SELECT period_month, period_start, period_end, facility_id, classes_count, pay_rate_per_class, amount, paid_at
            FROM coach_payouts
            WHERE instructor_id = $1 AND period_start = $2::date AND period_end = $3::date
            ORDER BY paid_at`,
            [own.id, period.start, period.endIncl]);

        const rate = own.pay_rate_per_class != null ? Number(own.pay_rate_per_class) : null;
        const classes_count = Number(agg?.classes_count ?? 0);
        const projected_total = rate != null ? Math.round(classes_count * rate * 100) / 100 : null;
        const paid_total = payouts.reduce((s: number, p: any) => s + Number(p.amount), 0);

        res.json({
            frequency: period.frequency,
            period: period.token,
            period_label: period.label,
            period_start: period.start,
            period_end: period.endIncl,
            pay_rate_per_class: rate,
            classes_count,
            projected_total,
            paid_total,
            payouts,
        });
    } catch (error) {
        console.error('GET /coach-payroll/me error:', error);
        res.status(500).json({ error: 'Error al obtener nómina' });
    }
});

export default router;
