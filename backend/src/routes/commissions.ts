import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { computeCommission, resolveCommissionSetting } from '../lib/commission.js';
import { getStaffSales, getStaffSalesDetail } from '../lib/staffSales.js';
import { logAction } from '../lib/audit.js';

const router = Router();
const ADMIN = ['admin', 'super_admin'] as const;

// Resuelve el mes (YYYY-MM); default = mes actual en CDMX
async function resolveMonth(raw?: string): Promise<string> {
    if (raw && /^\d{4}-\d{2}$/.test(raw)) return raw;
    const r = await queryOne<{ m: string }>(
        `SELECT TO_CHAR((NOW() AT TIME ZONE 'America/Mexico_City')::date, 'YYYY-MM') AS m`
    );
    return r!.m;
}

// Último día del mes (YYYY-MM-DD) para usar el helper por rango.
async function monthEndOf(monthStart: string): Promise<string> {
    const r = await queryOne<{ d: string }>(
        `SELECT TO_CHAR(($1::date + INTERVAL '1 month' - INTERVAL '1 day'),'YYYY-MM-DD') AS d`,
        [monthStart],
    );
    return r!.d;
}

// GET /api/commissions?month=YYYY-MM
router.get('/', authenticate, requireRole(...ADMIN), async (req: Request, res: Response) => {
    const month = await resolveMonth(req.query.month as string | undefined);
    const monthStart = `${month}-01`;
    const monthEnd = await monthEndOf(monthStart);

    const def = await queryOne<{ monthly_target: string; commission_rate: string }>(
        `SELECT monthly_target, commission_rate FROM commission_settings WHERE user_id IS NULL`
    );
    const defaultSetting = {
        monthly_target: Number(def?.monthly_target ?? 0),
        commission_rate: Number(def?.commission_rate ?? 0),
    };

    const sales = await getStaffSales(monthStart, monthEnd); // solo 'reception', incluye ceros
    const overrides = await query<any>(
        `SELECT user_id, monthly_target, commission_rate FROM commission_settings WHERE user_id IS NOT NULL`
    );
    const ovById = new Map(overrides.map((o: any) => [o.user_id, o]));
    const payouts = await query<any>(
        `SELECT * FROM commission_payouts WHERE period_month = $1::date`, [monthStart]
    );
    const poById = new Map(payouts.map((p: any) => [p.user_id, p]));

    const result = sales.map((s) => {
        const memberships_amount = s.public_memberships_amount; // BASE comisionable
        const products_amount = s.products_amount;
        const o = ovById.get(s.user_id);
        const override = o
            ? { monthly_target: Number(o.monthly_target), commission_rate: Number(o.commission_rate) }
            : null;
        const setting = resolveCommissionSetting(defaultSetting, override);
        const { reached, commission } = computeCommission({
            commissionableSales: memberships_amount,
            monthlyTarget: setting.monthly_target,
            commissionRate: setting.commission_rate,
        });
        const po = poById.get(s.user_id);
        const paid = !!po;
        return {
            user_id: s.user_id,
            display_name: s.display_name,
            default_facility_id: s.default_facility_id,
            memberships_amount,                              // = membresías públicas (base)
            memberships_count: s.public_memberships_count,
            products_amount,
            products_count: s.products_count,
            commissionable_amount: memberships_amount,       // explícito para el frontend
            total_sales: memberships_amount + products_amount, // informativo (no es la base)
            monthly_target: setting.monthly_target,
            commission_rate: setting.commission_rate,
            has_override: override != null,
            reached, commission, paid,
            payout: paid ? {
                total_sales: Number(po.total_sales),
                monthly_target: Number(po.monthly_target),
                commission_rate: Number(po.commission_rate),
                amount: Number(po.amount),
                paid_at: po.paid_at, paid_by: po.paid_by,
            } : null,
        };
    });

    res.json({ month, default: defaultSetting, rows: result });
});

// GET /api/commissions/range?from=YYYY-MM-DD&to=YYYY-MM-DD
// Estimación de comisión por rango (para el reporte de Ingresos). No registra pagos.
router.get('/range', authenticate, requireRole(...ADMIN), async (req: Request, res: Response) => {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    if (!from || !to) return res.status(400).json({ error: 'from y to (YYYY-MM-DD) requeridos' });

    const def = await queryOne<{ monthly_target: string; commission_rate: string }>(
        `SELECT monthly_target, commission_rate FROM commission_settings WHERE user_id IS NULL`
    );
    const defaultSetting = {
        monthly_target: Number(def?.monthly_target ?? 0),
        commission_rate: Number(def?.commission_rate ?? 0),
    };
    const overrides = await query<any>(
        `SELECT user_id, monthly_target, commission_rate FROM commission_settings WHERE user_id IS NOT NULL`
    );
    const ovById = new Map(overrides.map((o: any) => [o.user_id, o]));

    const sales = await getStaffSales(from, to);
    const rows = sales.map((s) => {
        const o = ovById.get(s.user_id);
        const override = o
            ? { monthly_target: Number(o.monthly_target), commission_rate: Number(o.commission_rate) }
            : null;
        const setting = resolveCommissionSetting(defaultSetting, override);
        const commission_estimate = Math.round((s.public_memberships_amount * setting.commission_rate / 100 + Number.EPSILON) * 100) / 100;
        return {
            user_id: s.user_id,
            display_name: s.display_name,
            public_memberships_count: s.public_memberships_count,
            public_memberships_amount: s.public_memberships_amount,
            products_count: s.products_count,
            products_amount: s.products_amount,
            monthly_target: setting.monthly_target,
            commission_rate: setting.commission_rate,
            commission_estimate,
        };
    });
    res.json({ from, to, rows });
});

// GET /api/commissions/detail?user_id=…&month=YYYY-MM → desglose del mes
router.get('/detail', authenticate, requireRole(...ADMIN), async (req: Request, res: Response) => {
    const userId = req.query.user_id as string | undefined;
    if (!userId) return res.status(400).json({ error: 'user_id requerido' });
    const month = await resolveMonth(req.query.month as string | undefined);
    const monthStart = `${month}-01`;
    const monthEnd = await monthEndOf(monthStart);
    const detail = await getStaffSalesDetail(userId, monthStart, monthEnd);
    res.json(detail);
});

// Valida montos (objetivo >= 0, rate 0..100)
function validateSetting(monthly_target: unknown, commission_rate: unknown): string | null {
    const t = Number(monthly_target);
    const r = Number(commission_rate);
    if (!Number.isFinite(t) || t < 0) return 'monthly_target debe ser un número >= 0';
    if (!Number.isFinite(r) || r < 0 || r > 100) return 'commission_rate debe estar entre 0 y 100';
    return null;
}

// GET /api/commissions/settings → { default, overrides[] }
router.get('/settings', authenticate, requireRole(...ADMIN), async (_req: Request, res: Response) => {
    const def = await queryOne<{ monthly_target: string; commission_rate: string }>(
        `SELECT monthly_target, commission_rate FROM commission_settings WHERE user_id IS NULL`
    );
    const overrides = await query(`
        SELECT cs.user_id, u.display_name, cs.monthly_target, cs.commission_rate
        FROM commission_settings cs JOIN users u ON u.id = cs.user_id
        WHERE cs.user_id IS NOT NULL
        ORDER BY u.display_name`);
    res.json({
        default: {
            monthly_target: Number(def?.monthly_target ?? 0),
            commission_rate: Number(def?.commission_rate ?? 0),
        },
        overrides,
    });
});

// PUT /api/commissions/settings/default { monthly_target, commission_rate }
router.put('/settings/default', authenticate, requireRole(...ADMIN), async (req: Request, res: Response) => {
    const err = validateSetting(req.body.monthly_target, req.body.commission_rate);
    if (err) return res.status(400).json({ error: err });
    const row = await queryOne(
        `UPDATE commission_settings SET monthly_target=$1, commission_rate=$2, updated_at=NOW()
         WHERE user_id IS NULL RETURNING *`,
        [Number(req.body.monthly_target), Number(req.body.commission_rate)]
    );
    res.json(row);
});

// PUT /api/commissions/settings/:userId { monthly_target, commission_rate } → upsert override
router.put('/settings/:userId', authenticate, requireRole(...ADMIN), async (req: Request, res: Response) => {
    const err = validateSetting(req.body.monthly_target, req.body.commission_rate);
    if (err) return res.status(400).json({ error: err });
    const row = await queryOne(
        `INSERT INTO commission_settings (user_id, monthly_target, commission_rate)
         VALUES ($1,$2,$3)
         ON CONFLICT (user_id) WHERE user_id IS NOT NULL
         DO UPDATE SET monthly_target=EXCLUDED.monthly_target, commission_rate=EXCLUDED.commission_rate, updated_at=NOW()
         RETURNING *`,
        [req.params.userId, Number(req.body.monthly_target), Number(req.body.commission_rate)]
    );
    res.json(row);
});

// DELETE /api/commissions/settings/:userId → quitar override (vuelve al default)
router.delete('/settings/:userId', authenticate, requireRole(...ADMIN), async (req: Request, res: Response) => {
    await query(`DELETE FROM commission_settings WHERE user_id = $1`, [req.params.userId]);
    res.json({ ok: true });
});

// POST /api/commissions/payouts { user_id, month } → recalcula, congela snapshot, marca pagada
router.post('/payouts', authenticate, requireRole(...ADMIN), async (req: Request, res: Response) => {
    const { user_id, month } = req.body as { user_id?: string; month?: string };
    if (!user_id || !month || !/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ error: 'user_id y month (YYYY-MM) requeridos' });
    }
    const monthStart = `${month}-01`;

    const monthEnd = await monthEndOf(monthStart);
    const sales = await getStaffSales(monthStart, monthEnd);
    const mine = sales.find((s) => s.user_id === user_id);
    const commissionable = mine?.public_memberships_amount ?? 0;

    const setting = await queryOne<{ monthly_target: string; commission_rate: string }>(`
        SELECT COALESCE(o.monthly_target, d.monthly_target) AS monthly_target,
               COALESCE(o.commission_rate, d.commission_rate) AS commission_rate
        FROM commission_settings d
        LEFT JOIN commission_settings o ON o.user_id = $1
        WHERE d.user_id IS NULL`, [user_id]);

    const total_sales = commissionable; // snapshot: base = membresías públicas
    const monthly_target = Number(setting?.monthly_target ?? 0);
    const commission_rate = Number(setting?.commission_rate ?? 0);
    const { commission } = computeCommission({ commissionableSales: total_sales, monthlyTarget: monthly_target, commissionRate: commission_rate });

    try {
        const row = await queryOne(
            `INSERT INTO commission_payouts
                (user_id, period_month, total_sales, monthly_target, commission_rate, amount, paid_by)
             VALUES ($1,$2::date,$3,$4,$5,$6,$7) RETURNING *`,
            [user_id, monthStart, total_sales, monthly_target, commission_rate, commission, req.user!.userId]
        );
        await logAction(query, {
            adminUserId: req.user!.userId,
            actionType: 'commission_paid',
            entityType: 'user',
            entityId: user_id,
            description: `Comisión ${month} pagada`,
            newData: { month, total_sales, monthly_target, commission_rate, amount: commission },
            req,
        });
        return res.status(201).json(row);
    } catch (e: any) {
        if (e?.code === '23505') return res.status(409).json({ error: 'Esa comisión ya está marcada como pagada' });
        throw e;
    }
});

// DELETE /api/commissions/payouts/:userId?month=YYYY-MM → des-marcar
router.delete('/payouts/:userId', authenticate, requireRole(...ADMIN), async (req: Request, res: Response) => {
    const month = req.query.month as string | undefined;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ error: 'month (YYYY-MM) requerido' });
    }
    const del = await queryOne<any>(
        `DELETE FROM commission_payouts WHERE user_id=$1 AND period_month=$2::date RETURNING *`,
        [req.params.userId, `${month}-01`]
    );
    if (!del) return res.status(404).json({ error: 'No había pago registrado para ese mes' });
    await logAction(query, {
        adminUserId: req.user!.userId,
        actionType: 'commission_unpaid',
        entityType: 'user',
        entityId: req.params.userId,
        description: `Comisión ${month} des-marcada`,
        oldData: { month, amount: Number(del.amount) },
        req,
    });
    res.json({ ok: true });
});

export default router;
