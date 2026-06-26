import { Router, Request, Response } from 'express';
import { query, queryOne, pool } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getLoyaltyConfig, saveLoyaltyConfig, syncUserLoyaltyPointsSnapshot } from '../lib/loyalty.js';

const router = Router();

// ============================================
// GET /api/loyalty/config - Get loyalty configuration
// ============================================
router.get('/config', authenticate, requireRole('admin'), async (_req: Request, res: Response) => {
    try {
        // Siempre devuelve la config COMPLETA y normalizada (los 9 campos), aunque
        // lo guardado en la BD sea parcial. Así el formulario muestra todos los
        // valores vigentes y nada queda "sin configurar".
        const config = await getLoyaltyConfig();
        res.json(config);
    } catch (error) {
        console.error('Get loyalty config error:', error);
        res.status(500).json({ error: 'Error al obtener configuración' });
    }
});

// ============================================
// GET /api/loyalty/config-public - Config de solo-lectura para el cliente
// ============================================
router.get('/config-public', authenticate, async (_req: Request, res: Response) => {
    try {
        const cfg = await getLoyaltyConfig();
        res.json({
            enabled: cfg.enabled,
            points_per_class: cfg.points_per_class,
            points_per_peso: cfg.points_per_peso,
            points_per_peso_cash: cfg.points_per_peso_cash,
            pesos_per_point: cfg.pesos_per_point,
            welcome_bonus: cfg.welcome_bonus,
            birthday_bonus: cfg.birthday_bonus,
            anniversary_bonus: cfg.anniversary_bonus,
            referral_bonus: cfg.referral_bonus,
            streak_bonus: cfg.streak_bonus,
        });
    } catch (error) {
        console.error('Get public loyalty config error:', error);
        res.status(500).json({ error: 'Error al obtener configuración' });
    }
});

// ============================================
// PUT /api/loyalty/config - Update loyalty configuration
// ============================================
router.put('/config', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        // Normaliza a los 9 campos y persiste la config COMPLETA (en ambas claves
        // que lee el motor). Antes guardaba el body crudo y dejaba campos sin
        // persistir, por lo que los crons/otorgamientos caían a valores por defecto.
        const config = await saveLoyaltyConfig(req.body, req.user?.userId);
        res.json({ message: 'Configuración actualizada', config });
    } catch (error) {
        console.error('Update loyalty config error:', error);
        res.status(500).json({ error: 'Error al actualizar configuración' });
    }
});

// ============================================
// GET /api/loyalty/my-streak - current consecutive-week attendance streak
// ============================================
router.get('/my-streak', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ error: 'No autorizado' });

        // Pull all weeks (Monday-anchored) where user attended ≥1 class
        const rows = await query<{ week: string }>(
            `SELECT DISTINCT TO_CHAR(DATE_TRUNC('week', c.date), 'YYYY-MM-DD') as week
             FROM bookings b
             JOIN classes c ON b.class_id = c.id
             WHERE b.user_id = $1 AND b.checked_in_at IS NOT NULL
             ORDER BY week DESC`,
            [userId]
        );

        const today = new Date();
        const mondayThisWeek = new Date(today);
        const day = (today.getDay() + 6) % 7; // Mon=0
        mondayThisWeek.setDate(today.getDate() - day);
        mondayThisWeek.setHours(0, 0, 0, 0);

        // Walk back from current week counting consecutive
        let streak = 0;
        const weekSet = new Set(rows.map(r => r.week));
        for (let i = 0; i < 60; i++) {
            const d = new Date(mondayThisWeek);
            d.setDate(d.getDate() - 7 * i);
            const tag = d.toISOString().slice(0, 10);
            if (weekSet.has(tag)) {
                streak++;
            } else {
                // First gap breaks the streak (skip current week if no class yet — only break on past)
                if (i === 0) continue;
                break;
            }
        }

        // Pairs of 2 weeks completed → eligible for next streak bonus when reaches even
        const bonusesAwarded = Math.floor(streak / 2);
        const nextBonusInWeeks = streak % 2 === 0 ? 2 : 1;

        res.json({
            currentStreakWeeks: streak,
            bonusesAwarded,
            nextBonusInWeeks,
            label: streak === 0 ? 'Sin racha' : `${streak} semana${streak === 1 ? '' : 's'} seguidas`,
        });
    } catch (error: any) {
        console.error('Get streak error:', error);
        res.status(500).json({ error: 'Error al obtener racha' });
    }
});

// ============================================
// GET /api/loyalty/my-history - Get current user's points history
// ============================================
router.get('/my-history', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ error: 'No autorizado' });

        const history = await query(
            `SELECT lp.id, lp.points, lp.type, lp.description, lp.created_at,
                    ct.name as class_name
             FROM loyalty_points lp
             LEFT JOIN bookings b ON lp.related_booking_id = b.id
             LEFT JOIN classes c ON b.class_id = c.id
             LEFT JOIN class_types ct ON c.class_type_id = ct.id
             WHERE lp.user_id = $1
             ORDER BY lp.created_at DESC
             LIMIT 50`,
            [userId]
        );

        const balance = await queryOne<{ loyalty_points: number }>(
            `SELECT loyalty_points FROM users WHERE id = $1`,
            [userId]
        );

        res.json({
            history: history || [],
            totalPoints: balance?.loyalty_points || 0,
        });
    } catch (error) {
        console.error('Get my history error:', error);
        res.status(500).json({ error: 'Error al obtener historial' });
    }
});

// ============================================
// GET /api/loyalty/points/:userId - Get user points
// ============================================
router.get('/points/:userId', authenticate, async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        
        if (req.user?.role !== 'admin' && req.user?.userId !== userId) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        
        const result = await queryOne(
            `SELECT loyalty_points FROM users WHERE id = $1`,
            [userId]
        );
        
        res.json({ userId, totalPoints: result?.loyalty_points || 0 });
    } catch (error) {
        console.error('Get points error:', error);
        res.status(500).json({ error: 'Error al obtener puntos' });
    }
});

// ============================================
// POST /api/loyalty/points/:userId/adjust - Adjust user points (admin)
// ============================================
router.post('/points/:userId/adjust', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const { points, reason } = req.body;
        
        if (points === undefined) {
            return res.status(400).json({ error: 'points es requerido' });
        }

        const userRow = await queryOne(`SELECT id FROM users WHERE id = $1`, [userId]);
        if (!userRow) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const delta = Math.trunc(Number(points));
        if (!Number.isFinite(delta) || delta === 0) {
            return res.status(400).json({ error: 'points debe ser un entero distinto de 0' });
        }

        // Asentar en el ledger (auditable) y recalcular el saldo desde el ledger.
        const desc = `Ajuste manual${reason ? `: ${reason}` : ''} (por ${req.user?.userId || 'admin'})`;
        await query(
            `INSERT INTO loyalty_points (user_id, points, type, description)
             VALUES ($1, $2, 'adjustment', $3)`,
            [userId, delta, desc]
        );
        await syncUserLoyaltyPointsSnapshot(userId);

        const balRow = await queryOne<{ loyalty_points: number }>(
            `SELECT loyalty_points FROM users WHERE id = $1`,
            [userId]
        );

        res.json({
            message: 'Puntos ajustados',
            newBalance: balRow?.loyalty_points ?? 0,
            adjustment: delta,
            reason: reason || null,
        });
    } catch (error) {
        console.error('Adjust points error:', error);
        res.status(500).json({ error: 'Error al ajustar puntos' });
    }
});

// ============================================
// GET /api/loyalty/rewards - Get all rewards
// ============================================
router.get('/rewards', authenticate, async (req: Request, res: Response) => {
    try {
        const isAdmin = req.user?.role === 'admin';
        
        const rewards = await query(
            `SELECT id, name, description, points_cost, reward_type, reward_value, is_active, stock
             FROM loyalty_rewards
             ${!isAdmin ? 'WHERE is_active = true' : ''}
             ORDER BY points_cost ASC`
        );
        
        res.json(rewards);
    } catch (error) {
        console.error('Get rewards error:', error);
        res.status(500).json({ error: 'Error al obtener recompensas' });
    }
});

// ============================================
// POST /api/loyalty/rewards - Create reward (admin)
// ============================================
router.post('/rewards', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { name, description, reward_type, reward_value, is_active, stock } = req.body;
        // Accept both points_cost (new) and points_required (legacy) — store in BOTH columns
        const points = req.body.points_cost ?? req.body.points_required ?? 0;

        const result = await queryOne(
            `INSERT INTO loyalty_rewards (name, description, points_required, points_cost, reward_type, reward_value, is_active, stock)
             VALUES ($1, $2, $3, $3, $4, $5, $6, $7)
             RETURNING *`,
            [name, description, points, reward_type || 'discount', reward_value, is_active ?? true, stock ?? null]
        );

        res.status(201).json(result);
    } catch (error: any) {
        console.error('Create reward error:', error.message);
        res.status(500).json({ error: 'Error al crear recompensa', detail: error.message });
    }
});

// ============================================
// PUT /api/loyalty/rewards/:id - Update reward (admin)
// ============================================
router.put('/rewards/:id', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, description, points_cost, reward_type, reward_value, is_active, stock } = req.body;
        
        const result = await queryOne(
            `UPDATE loyalty_rewards
             SET name = COALESCE($1, name),
                 description = COALESCE($2, description),
                 points_cost = COALESCE($3, points_cost),
                 reward_type = COALESCE($4, reward_type),
                 reward_value = COALESCE($5, reward_value),
                 is_active = COALESCE($6, is_active),
                 stock = COALESCE($7, stock),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $8
             RETURNING *`,
            [name, description, points_cost, reward_type, reward_value, is_active, stock, id]
        );
        
        if (!result) {
            return res.status(404).json({ error: 'Recompensa no encontrada' });
        }
        
        res.json(result);
    } catch (error) {
        console.error('Update reward error:', error);
        res.status(500).json({ error: 'Error al actualizar recompensa' });
    }
});

// ============================================
// DELETE /api/loyalty/rewards/:id - Delete reward (admin)
// ============================================
router.delete('/rewards/:id', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        
        const result = await queryOne(
            `DELETE FROM loyalty_rewards WHERE id = $1 RETURNING id`,
            [id]
        );
        
        if (!result) {
            return res.status(404).json({ error: 'Recompensa no encontrada' });
        }
        
        res.json({ message: 'Recompensa eliminada' });
    } catch (error) {
        console.error('Delete reward error:', error);
        res.status(500).json({ error: 'Error al eliminar recompensa' });
    }
});

// ============================================
// GET /api/loyalty/redemptions - Get all redemptions (admin)
// ============================================
router.get('/redemptions', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const redemptions = await query(
            `SELECT lr.*, 
                    u.display_name as user_name,
                    u.email as user_email,
                    lrw.name as reward_name
             FROM redemptions lr
             LEFT JOIN users u ON lr.user_id = u.id
             LEFT JOIN loyalty_rewards lrw ON lr.reward_id = lrw.id
             ORDER BY lr.created_at DESC
             LIMIT 100`
        );
        
        res.json(redemptions);
    } catch (error) {
        console.error('Get redemptions error:', error);
        res.status(500).json({ error: 'Error al obtener canjes' });
    }
});

// ============================================
// POST /api/loyalty/redeem - Redeem a reward
// ============================================
router.post('/redeem', authenticate, async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const client = await pool.connect();
    // Adaptador para reusar syncUserLoyaltyPointsSnapshot DENTRO de la transacción (así el snapshot
    // se recalcula viendo el asiento del canje, no contra una conexión aparte sin commitear).
    const txDb = { query: async (text: string, params?: unknown[]) => {
        const r = await client.query(text, params as any[]);
        return { rows: r.rows, rowCount: r.rowCount ?? 0 };
    } };
    try {
        const { rewardId } = req.body;
        await client.query('BEGIN');

        // FOR UPDATE en recompensa (stock) y usuario (saldo): serializa canjes concurrentes del mismo
        // usuario/recompensa para que no se pueda canjear por encima del saldo ni dejar el stock negativo.
        const rewardRes = await client.query(
            `SELECT * FROM loyalty_rewards WHERE id = $1 AND is_active = true FOR UPDATE`,
            [rewardId]
        );
        const reward = rewardRes.rows[0];
        if (!reward) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Recompensa no encontrada o no disponible' });
        }
        if (reward.stock !== null && reward.stock <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Recompensa agotada' });
        }

        const userRes = await client.query(
            `SELECT loyalty_points FROM users WHERE id = $1 FOR UPDATE`,
            [userId]
        );
        const user = userRes.rows[0];
        if (!user || user.loyalty_points < reward.points_cost) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Puntos insuficientes' });
        }

        // Registrar el canje (tabla redemptions; status 'pending' — se cumple en el studio).
        const redemptionRes = await client.query(
            `INSERT INTO redemptions (user_id, reward_id, points_spent, status)
             VALUES ($1, $2, $3, 'pending')
             RETURNING *`,
            [userId, rewardId, reward.points_cost]
        );
        const redemption = redemptionRes.rows[0];

        // Asentar el gasto de puntos en el ledger + recalcular el saldo (consistente con el historial).
        await client.query(
            `INSERT INTO loyalty_points (user_id, points, type, description)
             VALUES ($1, $2, 'redemption', $3)`,
            [userId, -Math.abs(reward.points_cost), `Canje: ${reward.name}`]
        );
        await syncUserLoyaltyPointsSnapshot(userId, txDb);

        // Descontar stock si aplica
        if (reward.stock !== null) {
            await client.query(
                `UPDATE loyalty_rewards SET stock = stock - 1 WHERE id = $1`,
                [rewardId]
            );
        }

        const balRes = await client.query(
            `SELECT loyalty_points FROM users WHERE id = $1`,
            [userId]
        );
        await client.query('COMMIT');

        res.json({
            message: 'Recompensa canjeada exitosamente',
            redemption,
            newBalance: balRes.rows[0]?.loyalty_points ?? (user.loyalty_points - reward.points_cost)
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Redeem error:', error);
        res.status(500).json({ error: 'Error al canjear recompensa' });
    } finally {
        client.release();
    }
});

export default router;
