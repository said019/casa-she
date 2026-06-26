import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/database.js';
import { authenticate, requireRole, optionalAuth } from '../middleware/auth.js';
import { requireElevated } from '../middleware/elevation.js';
import { invalidateCache } from '../lib/settings.js';

const router = Router();

// ============================================
// BOOKING ENABLED — interruptor global de reservas de clientas. Lo prenden/apagan
// admin + recepción MASTER (requireElevated). Lo lee cualquier usuario autenticado.
// ============================================

router.get('/booking-enabled', authenticate, async (_req: Request, res: Response) => {
    try {
        const row = await queryOne<{ value: any }>(
            `SELECT value FROM system_settings WHERE key = 'booking_enabled'`
        );
        // Default: habilitado mientras nadie haya apagado el interruptor.
        res.json({ enabled: (row?.value?.enabled ?? true) !== false });
    } catch (error: any) {
        console.error('Get booking-enabled error:', error.message);
        res.status(500).json({ error: 'Error al obtener el estado de reservas' });
    }
});

router.put('/booking-enabled', authenticate, requireElevated, async (req: Request, res: Response) => {
    const enabled = req.body?.enabled;
    if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled debe ser booleano' });
    }
    try {
        await query(
            `INSERT INTO system_settings (key, value, description, updated_by, updated_at)
             VALUES ('booking_enabled', $1::jsonb, 'Interruptor global de reservas de clientas', $2, NOW())
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
            [JSON.stringify({ enabled }), req.user!.userId]
        );
        res.json({ ok: true, enabled });
    } catch (error: any) {
        console.error('Update booking-enabled error:', error.message);
        res.status(500).json({ error: 'Error al guardar el interruptor', detail: error.message });
    }
});

// ============================================
// CANCELLATION POLICY — exposed to all authenticated users (UX needs it),
// only writable by admin (canonical validation lives in cancel_booking RPC).
// ============================================

const POLICY_DEFAULT = {
    enabled: true,
    min_hours: 5,
    refund_credit_on_cancel: true,
    cancellations_per_membership: 999,
    late_cancel_message:
        'Esta clase ya no puede cancelarse a tiempo para recuperar tu crédito.',
};

const PolicySchema = z.object({
    enabled: z.boolean(),
    min_hours: z.coerce.number().int().min(0).max(168),
    refund_credit_on_cancel: z.boolean(),
    cancellations_per_membership: z.coerce.number().int().min(0).max(999),
    late_cancel_message: z.string().max(280).nullable().optional(),
});

// Lectura pública (optionalAuth): la usan las páginas públicas de Política y Términos para
// mostrar las horas reales sin hardcodear. Los datos no son sensibles.
router.get('/cancellation-policy', optionalAuth, async (_req: Request, res: Response) => {
    try {
        const row = await queryOne<{ value: any }>(
            `SELECT value FROM system_settings WHERE key = 'cancellation_policy'`
        );
        const merged = { ...POLICY_DEFAULT, ...(row?.value || {}) };
        res.json(merged);
    } catch (error: any) {
        console.error('Get cancellation policy error:', error.message);
        res.status(500).json({ error: 'Error al obtener política de cancelación' });
    }
});

router.put(
    '/cancellation-policy',
    authenticate,
    requireRole('admin', 'super_admin'),
    async (req: Request, res: Response) => {
        const parsed = PolicySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                error: 'Datos inválidos',
                details: parsed.error.flatten().fieldErrors,
            });
        }
        const value = {
            enabled: parsed.data.enabled,
            min_hours: parsed.data.min_hours,
            refund_credit_on_cancel: parsed.data.refund_credit_on_cancel,
            cancellations_per_membership: parsed.data.cancellations_per_membership,
            late_cancel_message: parsed.data.late_cancel_message ?? POLICY_DEFAULT.late_cancel_message,
        };
        try {
            await query(
                `INSERT INTO system_settings (key, value, updated_by, updated_at)
                 VALUES ('cancellation_policy', $1::jsonb, $2, NOW())
                 ON CONFLICT (key) DO UPDATE SET
                    value = EXCLUDED.value,
                    updated_by = EXCLUDED.updated_by,
                    updated_at = NOW()`,
                [JSON.stringify(value), req.user!.userId]
            );
            invalidateCache?.();
            res.json({ ok: true, policy: value });
        } catch (error: any) {
            console.error('Update cancellation policy error:', error.message);
            res.status(500).json({ error: 'Error al guardar política', detail: error.message });
        }
    }
);

// ============================================
// GET /api/settings/bank-info - Get bank info for transfers (public for authenticated users)
// IMPORTANT: This route must be before /:key to avoid being caught by the param route
// ============================================
router.get('/bank-info', authenticate, async (req: Request, res: Response) => {
    try {
        const setting = await queryOne(
            `SELECT value FROM system_settings WHERE key = 'bank_info'`
        );
        
        if (!setting || !setting.value) {
            // Return default bank info (datos reales del estudio).
            return res.json({
                bank_name: 'Mercado Pago',
                account_holder: 'Karla Ivonne Pérez García',
                account_number: '',
                clabe: '722969020755786887',
                reference_instructions: 'Usa tu nombre completo como referencia'
            });
        }
        
        // Parse the JSON value
        const bankInfo = typeof setting.value === 'string' 
            ? JSON.parse(setting.value) 
            : setting.value;
        
        res.json(bankInfo);
    } catch (error) {
        console.error('Get bank info error:', error);
        res.status(500).json({ error: 'Error al obtener datos bancarios' });
    }
});

// ============================================
// PUT /api/settings/bank-info - Update bank info (admin only)
// ============================================
router.put('/bank-info', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { bank_name, account_holder, account_number, clabe, reference_instructions } = req.body;
        
        const bankInfo = {
            bank_name,
            account_holder,
            account_number,
            clabe,
            reference_instructions
        };
        
        await query(
            `INSERT INTO system_settings (key, value, description, updated_by)
             VALUES ('bank_info', $1, 'Datos bancarios para transferencias', $2)
             ON CONFLICT (key) DO UPDATE
             SET value = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2`,
            [JSON.stringify(bankInfo), req.user?.userId]
        );
        
        invalidateCache('bank_info');
        res.json({ message: 'Datos bancarios actualizados', bankInfo });
    } catch (error) {
        console.error('Update bank info error:', error);
        res.status(500).json({ error: 'Error al actualizar datos bancarios' });
    }
});

// ============================================
// PAYROLL CONFIG — pay day & frequency.
// Read by any authenticated user (banner + selector de periodo en nómina);
// only writable by admin. La frecuencia SÍ determina la agrupación del cálculo:
//   'biweekly' = quincena (1–15 / 16–fin); 'monthly' = mes calendario.
//   (ver lib/payrollPeriod.ts y routes/coach-payroll.ts). pay_day es informativo.
// IMPORTANT: must be before /:key to avoid being caught by the param route.
// ============================================

const PAYROLL_CONFIG_DEFAULT = {
    frequency: 'monthly' as 'biweekly' | 'monthly',
    pay_day: 1,
};

const PayrollConfigSchema = z.object({
    frequency: z.enum(['biweekly', 'monthly']),
    pay_day: z.coerce.number().int().min(1).max(31),
});

router.get('/payroll-config', authenticate, async (_req: Request, res: Response) => {
    try {
        const row = await queryOne<{ value: any }>(
            `SELECT value FROM system_settings WHERE key = 'payroll_config'`
        );
        const value = row?.value
            ? (typeof row.value === 'string' ? JSON.parse(row.value) : row.value)
            : {};
        res.json({ ...PAYROLL_CONFIG_DEFAULT, ...value });
    } catch (error: any) {
        console.error('Get payroll config error:', error.message);
        res.status(500).json({ error: 'Error al obtener configuración de pago' });
    }
});

router.put(
    '/payroll-config',
    authenticate,
    requireRole('admin', 'super_admin'),
    async (req: Request, res: Response) => {
        const parsed = PayrollConfigSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                error: 'Datos inválidos',
                details: parsed.error.flatten().fieldErrors,
            });
        }
        const value = {
            frequency: parsed.data.frequency,
            pay_day: parsed.data.pay_day,
        };
        try {
            await query(
                `INSERT INTO system_settings (key, value, description, updated_by, updated_at)
                 VALUES ('payroll_config', $1::jsonb, 'Día de pago y frecuencia de nómina', $2, NOW())
                 ON CONFLICT (key) DO UPDATE SET
                    value = EXCLUDED.value,
                    updated_by = EXCLUDED.updated_by,
                    updated_at = NOW()`,
                [JSON.stringify(value), req.user!.userId]
            );
            invalidateCache('payroll_config');
            res.json({ ok: true, config: value });
        } catch (error: any) {
            console.error('Update payroll config error:', error.message);
            res.status(500).json({ error: 'Error al guardar configuración de pago', detail: error.message });
        }
    }
);

// ============================================
// GET /api/settings - Get all settings
// ============================================
router.get('/', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const settings = await query(`SELECT key, value, description FROM system_settings`);
        
        // Transform to object
        const settingsObj: Record<string, any> = {};
        settings.forEach((s: any) => {
            settingsObj[s.key] = s.value;
        });
        
        res.json(settingsObj);
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ error: 'Error al obtener configuración' });
    }
});

// ============================================
// PUT /api/settings - Update multiple settings
// ============================================
router.put('/', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const settings = req.body;
        
        for (const [key, value] of Object.entries(settings)) {
            await query(
                `INSERT INTO system_settings (key, value, updated_by)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (key) DO UPDATE
                 SET value = $2, updated_at = CURRENT_TIMESTAMP, updated_by = $3`,
                [key, JSON.stringify(value), req.user?.userId]
            );
        }
        
        invalidateCache(); // Clear all cache when bulk updating
        res.json({ message: 'Configuración actualizada' });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ error: 'Error al actualizar configuración' });
    }
});

// ============================================
// GET /api/settings/:key - Get specific setting (MUST BE AFTER specific routes like /bank-info)
// ============================================
router.get('/:key', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { key } = req.params;
        const setting = await queryOne(
            `SELECT key, value, description FROM system_settings WHERE key = $1`,
            [key]
        );
        
        if (!setting) {
            return res.status(404).json({ error: 'Configuración no encontrada' });
        }
        
        res.json(setting);
    } catch (error) {
        console.error('Get setting error:', error);
        res.status(500).json({ error: 'Error al obtener configuración' });
    }
});

// ============================================
// PUT /api/settings/:key - Update specific setting
// ============================================
router.put('/:key', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { key } = req.params;
        const { value } = req.body;
        
        const result = await queryOne(
            `UPDATE system_settings 
             SET value = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2
             WHERE key = $3
             RETURNING key, value, description`,
            [JSON.stringify(value), req.user?.userId, key]
        );
        
        if (!result) {
            // Insert if not exists
            const inserted = await queryOne(
                `INSERT INTO system_settings (key, value, updated_by)
                 VALUES ($1, $2, $3)
                 RETURNING key, value, description`,
                [key, JSON.stringify(value), req.user?.userId]
            );
            return res.json(inserted);
        }
        
        invalidateCache(key);
        res.json(result);
    } catch (error) {
        console.error('Update setting error:', error);
        res.status(500).json({ error: 'Error al actualizar configuración' });
    }
});

export default router;
