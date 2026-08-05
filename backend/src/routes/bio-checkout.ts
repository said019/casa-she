import crypto from 'node:crypto';
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool, query, queryOne } from '../config/database.js';
import { createPreference, mpConfigured } from '../lib/mercadopago.js';
import { generateToken } from '../middleware/auth.js';
import type { JwtPayload, User } from '../types/auth.js';

const router = Router();
const HOLD_MINUTES = 10;

const StartSchema = z.object({
    classId: z.string().uuid(),
    planId: z.string().uuid(),
    displayName: z.string().trim().min(2).max(120),
    email: z.string().trim().email(),
    phone: z.string().trim().min(10).max(20),
});

const CompleteSchema = z.object({
    token: z.string().min(32),
    password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
    acceptsTerms: z.literal(true),
});

function tokenHash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizeMexicanPhone(value: string): string | null {
    const digits = value.replace(/\D/g, '');
    const local = digits.startsWith('52') && digits.length === 12 ? digits.slice(2) : digits;
    return local.length === 10 ? `+52${local}` : null;
}

router.post('/start', async (req: Request, res: Response) => {
    const validation = StartSchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(400).json({ error: 'Revisa tu nombre, correo y teléfono.' });
    }
    if (!mpConfigured()) return res.status(503).json({ error: 'Pago con tarjeta no disponible.' });

    const { classId, planId, displayName } = validation.data;
    const email = validation.data.email.toLowerCase();
    const phone = normalizeMexicanPhone(validation.data.phone);
    if (!phone) return res.status(400).json({ error: 'Ingresa un teléfono mexicano de 10 dígitos.' });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000);
    const client = await pool.connect();
    let order: any;
    let plan: any;
    let userId = '';
    let isNewUser = false;

    try {
        await client.query('BEGIN');
        const classResult = await client.query<any>(
            `SELECT c.id, c.date, c.start_time, c.status, c.booking_closed,
                    c.current_bookings, c.max_capacity, c.facility_id, ct.name AS class_name
               FROM classes c JOIN class_types ct ON ct.id = c.class_type_id
              WHERE c.id = $1 FOR UPDATE`,
            [classId]
        );
        const selectedClass = classResult.rows[0];
        if (!selectedClass || selectedClass.status !== 'scheduled' || selectedClass.booking_closed) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Esta clase ya no está disponible.' });
        }
        const classDate = selectedClass.date instanceof Date
            ? selectedClass.date.toISOString().slice(0, 10)
            : String(selectedClass.date).slice(0, 10);
        const startsAt = new Date(`${classDate}T${String(selectedClass.start_time).slice(0, 5)}:00-06:00`);
        if (startsAt.getTime() <= Date.now()) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Esta clase ya comenzó.' });
        }
        const holds = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM bio_checkout_sessions
              WHERE class_id=$1 AND status IN ('pending_payment','paid','ready') AND expires_at > NOW()`,
            [classId]
        );
        if (Number(selectedClass.current_bookings) + Number(holds.rows[0]?.count || 0) >= Number(selectedClass.max_capacity)) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'La clase se acaba de llenar. Elige otro horario.' });
        }

        const planResult = await client.query<any>(
            `SELECT id, name, price, currency, class_limit, multi_credits, reformer_credits, duration_days, is_active, is_internal
               FROM plans WHERE id=$1`,
            [planId]
        );
        plan = planResult.rows[0];
        const planCredits = Number(plan?.class_limit ?? 0)
            || (Number(plan?.multi_credits ?? 0) + Number(plan?.reformer_credits ?? 0));
        if (!plan || plan.is_active === false || plan.is_internal === true || planCredits !== 1 || Number(plan.price) <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'La clase suelta no está disponible.' });
        }

        const existing = await client.query<any>(
            `SELECT u.id,
                    EXISTS (
                        SELECT 1 FROM bio_checkout_sessions s
                         WHERE s.user_id=u.id AND s.is_new_user=true AND s.status<>'completed'
                    ) AS bio_provisional
               FROM users u WHERE u.email=$1`,
            [email]
        );
        if (existing.rows[0]) {
            userId = existing.rows[0].id;
            isNewUser = existing.rows[0].bio_provisional === true;
            if (isNewUser) {
                const phoneOwner = await client.query<any>('SELECT id FROM users WHERE phone=$1 AND id<>$2', [phone, userId]);
                if (phoneOwner.rows[0]) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ error: 'Ese teléfono ya tiene otra cuenta. Usa el correo de esa cuenta.' });
                }
                await client.query(
                    `UPDATE users SET display_name=$1, phone=$2, updated_at=NOW() WHERE id=$3`,
                    [displayName, phone, userId]
                );
                await client.query(
                    `UPDATE bio_checkout_sessions SET status='cancelled', updated_at=NOW()
                      WHERE user_id=$1 AND is_new_user=true AND status='pending_payment'`,
                    [userId]
                );
            }
        } else {
            const phoneOwner = await client.query<any>('SELECT id FROM users WHERE phone=$1', [phone]);
            if (phoneOwner.rows[0]) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'Ese teléfono ya tiene una cuenta. Usa el correo de esa cuenta.' });
            }
            const temporaryHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
            const created = await client.query<any>(
                `INSERT INTO users (email, password_hash, display_name, phone, role, onboarding_required, accepts_communications)
                 VALUES ($1,$2,$3,$4,'client',true,false) RETURNING id`,
                [email, temporaryHash, displayName, phone]
            );
            userId = created.rows[0].id;
            isNewUser = true;
        }

        const amount = Number(plan.price);
        const orderResult = await client.query<any>(
            `INSERT INTO orders (user_id, plan_id, subtotal, tax_rate, tax_amount, total_amount,
                                 currency, payment_method, customer_notes, facility_id)
             VALUES ($1,$2,$3,0,0,$3,$4,'card',$5,$6) RETURNING *`,
            [userId, plan.id, amount, plan.currency || 'MXN', `Compra rápida Bio · clase ${classId}`, selectedClass.facility_id]
        );
        order = orderResult.rows[0];
        await client.query(
            `INSERT INTO bio_checkout_sessions
                (token_hash,user_id,class_id,plan_id,order_id,is_new_user,status,expires_at)
             VALUES ($1,$2,$3,$4,$5,$6,'pending_payment',$7)`,
            [tokenHash(rawToken), userId, classId, plan.id, order.id, isNewUser, expiresAt]
        );
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Bio checkout start error:', error);
        return res.status(500).json({ error: 'No pudimos iniciar el pago.' });
    } finally {
        client.release();
    }

    try {
        const backUrl = `${process.env.FRONTEND_URL}/bio/finalizar?token=${encodeURIComponent(rawToken)}`;
        const preference = await createPreference({
            orderId: order.id,
            orderNumber: order.order_number,
            items: [{ title: `${plan.name} · Reserva Casa Shé`, quantity: 1, unit_price: Number(order.total_amount) }],
            payerEmail: email,
            backUrl,
            expiresAt,
            notificationUrl: process.env.BACKEND_URL ? `${process.env.BACKEND_URL}/webhooks/mercadopago` : undefined,
        });
        await query(
            `UPDATE orders SET payment_provider='mercadopago', mp_checkout_url=$1, updated_at=NOW() WHERE id=$2`,
            [preference.checkoutUrl, order.id]
        );
        return res.status(201).json({ checkoutUrl: preference.checkoutUrl, expiresAt });
    } catch (error) {
        console.error('Bio MP preference error:', error);
        await query(`UPDATE bio_checkout_sessions SET status='cancelled' WHERE order_id=$1`, [order.id]);
        await query(`DELETE FROM orders WHERE id=$1`, [order.id]);
        if (isNewUser) await query(`DELETE FROM users WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM orders WHERE user_id=$1)`, [userId]);
        return res.status(502).json({ error: 'No pudimos abrir Mercado Pago.' });
    }
});

router.get('/status', async (req: Request, res: Response) => {
    const token = String(req.query.token || '');
    if (token.length < 32) return res.status(400).json({ error: 'Enlace inválido.' });
    const session = await queryOne<any>(
        `SELECT s.class_id, s.is_new_user, s.status AS session_status, s.expires_at,
                o.status AS order_status, u.email, u.display_name,
                c.date, c.start_time, ct.name AS class_name
           FROM bio_checkout_sessions s
           JOIN orders o ON o.id=s.order_id JOIN users u ON u.id=s.user_id
           JOIN classes c ON c.id=s.class_id JOIN class_types ct ON ct.id=c.class_type_id
          WHERE s.token_hash=$1`,
        [tokenHash(token)]
    );
    if (!session) return res.status(404).json({ error: 'Enlace no encontrado.' });
    return res.json({
        paid: session.order_status === 'approved',
        orderStatus: session.order_status,
        requiresLogin: !session.is_new_user,
        email: session.email,
        displayName: session.display_name,
        classId: session.class_id,
        className: session.class_name,
        date: session.date,
        startTime: session.start_time,
        expired: new Date(session.expires_at).getTime() <= Date.now() && session.order_status !== 'approved',
    });
});

router.post('/complete', async (req: Request, res: Response) => {
    const validation = CompleteSchema.safeParse(req.body);
    if (!validation.success) return res.status(400).json({ error: 'La contraseña debe tener 8 caracteres, una mayúscula y un número.' });
    const { token, password } = validation.data;
    const session = await queryOne<any>(
        `SELECT s.*, o.status AS order_status, u.password_hash, u.email
           FROM bio_checkout_sessions s JOIN orders o ON o.id=s.order_id JOIN users u ON u.id=s.user_id
          WHERE s.token_hash=$1`,
        [tokenHash(token)]
    );
    if (!session) return res.status(404).json({ error: 'Enlace no encontrado.' });
    if (session.order_status !== 'approved') return res.status(409).json({ error: 'El pago todavía no está confirmado.' });
    if (!session.is_new_user && !(await bcrypt.compare(password, session.password_hash))) {
        return res.status(401).json({ error: 'La contraseña de tu cuenta no es correcta.' });
    }
    if (session.is_new_user) {
        const passwordHash = await bcrypt.hash(password, 12);
        await query(
            `UPDATE users SET password_hash=$1, accepted_terms_at=NOW(), reglamento_accepted_at=NOW(),
                              onboarding_required=false, updated_at=NOW() WHERE id=$2`,
            [passwordHash, session.user_id]
        );
    } else {
        await query(
            `UPDATE users SET accepted_terms_at=COALESCE(accepted_terms_at,NOW()),
                              reglamento_accepted_at=COALESCE(reglamento_accepted_at,NOW()), updated_at=NOW() WHERE id=$1`,
            [session.user_id]
        );
    }
    await query(
        `UPDATE bio_checkout_sessions SET status='ready', expires_at=NOW()+INTERVAL '24 hours', updated_at=NOW()
          WHERE id=$1`,
        [session.id]
    );
    const user = await queryOne<User>(
        `SELECT id,email,phone,display_name,photo_url,role,emergency_contact_name,emergency_contact_phone,
                health_notes,accepts_communications,date_of_birth,receive_reminders,receive_promotions,
                receive_weekly_summary,created_at,updated_at FROM users WHERE id=$1`,
        [session.user_id]
    );
    if (!user) return res.status(500).json({ error: 'No pudimos activar tu portal.' });
    const payload: JwtPayload = { userId: user.id, email: user.email, role: user.role };
    return res.json({ token: generateToken(payload), user, classId: session.class_id, bioCheckoutToken: token });
});

export default router;
