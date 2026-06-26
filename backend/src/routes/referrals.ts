import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// ============================================================
// GET /api/referrals/me — Get my referral code + stats
// ============================================================
router.get('/me', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.userId;

        let user = await queryOne<any>(
            `SELECT id, display_name, referral_code FROM users WHERE id = $1`,
            [userId]
        );
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        if (!user.referral_code) {
            const code = generateCode(user.display_name, userId);
            await query(`UPDATE users SET referral_code = $1 WHERE id = $2`, [code, userId]);
            user.referral_code = code;

            // Referidos desactivados: ya NO se crea la entrada en discount_codes.
        }

        const stats = await queryOne<any>(`
            SELECT
                COUNT(rr.id)::int           AS total_referrals,
                COALESCE(SUM(rr.points_awarded), 0)::int AS total_points_earned
            FROM referral_redemptions rr
            WHERE rr.referrer_id = $1
        `, [userId]);

        const recent = await query<any>(`
            SELECT u.display_name AS friend_name, rr.created_at, rr.points_awarded
            FROM referral_redemptions rr
            JOIN users u ON u.id = rr.referred_id
            WHERE rr.referrer_id = $1
            ORDER BY rr.created_at DESC
            LIMIT 10
        `, [userId]);

        res.json({
            code: user.referral_code,
            totalReferrals: stats?.total_referrals ?? 0,
            totalPointsEarned: stats?.total_points_earned ?? 0,
            recentReferrals: recent,
        });
    } catch (e: any) {
        console.error('[Referrals] GET /me:', e);
        res.status(500).json({ error: 'Error obteniendo código de referido' });
    }
});

// ============================================================
// POST /api/referrals/validate — Preview discount at checkout
// ============================================================
router.post('/validate', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.userId;
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: 'Código requerido' });

        const result = await validateCode(code.trim().toUpperCase(), userId);
        res.json(result);
    } catch (e: any) {
        res.status(400).json({ error: e.message, errorCode: e.errorCode ?? 'INVALID' });
    }
});

// ============================================================
// POST /api/referrals/redeem — After confirmed purchase
// ============================================================
router.post('/redeem', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.userId;
        const { code, order_id } = req.body;
        if (!code) return res.status(400).json({ error: 'Código requerido' });

        const normalized = code.trim().toUpperCase();
        const validation = await validateCode(normalized, userId);

        await query(`
            INSERT INTO referral_redemptions (code, referrer_id, referred_id, order_id, points_awarded)
            VALUES ($1, $2, $3, $4, 10)
        `, [normalized, validation.referrerId, userId, order_id ?? null]);

        // Award 10 loyalty points to referrer
        await query(`
            INSERT INTO loyalty_points (user_id, points, type, description)
            VALUES ($1, 10, 'referral', 'Amigo referido usó tu código')
        `, [validation.referrerId]);

        res.json({ success: true, discountPercent: 10, pointsAwardedToReferrer: 10 });
    } catch (e: any) {
        res.status(400).json({ error: e.message, errorCode: e.errorCode ?? 'REDEEM_FAILED' });
    }
});

// ============================================================
// Helpers
// ============================================================
function generateCode(displayName: string, userId: string): string {
    const prefix = (displayName ?? 'USER')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z]/g, '')
        .toUpperCase()
        .slice(0, 5) || 'USER';
    const suffix = userId.replace(/-/g, '').toUpperCase().slice(0, 5);
    return `${prefix}-${suffix}`;
}

async function validateCode(code: string, userId: string) {
    const owner = await queryOne<any>(
        `SELECT id, display_name FROM users WHERE referral_code = $1`, [code]
    );
    if (!owner) { const e: any = new Error('El código no existe'); e.errorCode = 'INVALID_CODE'; throw e; }
    if (owner.id === userId) { const e: any = new Error('No puedes usar tu propio código'); e.errorCode = 'SELF_REFERRAL'; throw e; }

    const used = await queryOne<any>(
        `SELECT id FROM referral_redemptions WHERE referred_id = $1`, [userId]
    );
    if (used) { const e: any = new Error('Ya usaste un código de referido antes'); e.errorCode = 'ALREADY_REDEEMED'; throw e; }

    return { valid: true, referrerId: owner.id, referrerName: owner.display_name, discountPercent: 10 };
}

export default router;
