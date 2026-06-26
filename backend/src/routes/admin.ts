import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { z } from 'zod';
import {
    sendInstructorMagicLink,
    sendInstructorCredentials,
    sendClassAssignmentNotification,
    sendMembershipActivatedEmail,
    sendEventAnnouncementEmail,
    sendClientWelcomeEmail,
    sendOrderRejectedEmail,
    sendPointsEarnedEmail,
    sendPasswordResetEmail,
} from '../services/email.js';
import { getFrontendUrl } from '../services/email-templates.js';
import { fillStudioCounts } from '../lib/dashboardStudio.js';

const router = Router();

// v2 — fixed date() SQL queries to use classes.date column directly
// Middleware to ensure admin access for all routes in this file
router.use(authenticate, requireRole('admin'));

// ============================================
// GET /api/admin/stats - Dashboard KPIs
// ============================================
router.get('/stats', async (req: Request, res: Response) => {
    try {
        // "Today" anchored to America/Mexico_City — DB lives in UTC, but the studio operates in CDMX.
        const todayResult = await queryOne<{ d: string }>(
            `SELECT TO_CHAR((NOW() AT TIME ZONE 'America/Mexico_City')::date, 'YYYY-MM-DD') AS d`
        );
        const today = todayResult?.d || new Date().toISOString().split('T')[0];

        // Parallel queries for efficiency - each wrapped to avoid one failure crashing all
        const safeQuery = async <T>(text: string, params?: any[]): Promise<T | null> => {
            try { return await queryOne<T>(text, params); } catch { return null; }
        };

        const [
            scheduledClasses,
            confirmedBookings,
            activeMemberships,
            todaysRevenue,
            facilitiesRows,
            classesByStudioRaw,
            manualIncomeToday
        ] = await Promise.all([
            safeQuery<{ count: string }>(`
        SELECT COUNT(*) as count FROM classes
        WHERE date = $1
      `, [today]),

            safeQuery<{ count: string }>(`
        SELECT COUNT(*) as count
        FROM bookings b
        JOIN classes c ON b.class_id = c.id
        WHERE c.date = $1 AND b.status = 'confirmed'
      `, [today]),

            safeQuery<{ count: string }>(`
        SELECT COUNT(*) as count FROM memberships WHERE status = 'active'
      `),

            safeQuery<{ gross: string; card_fee: string }>(`
        SELECT
          COALESCE(SUM(amount), 0) AS gross,
          COALESCE(SUM(card_fee_amount), 0) AS card_fee
        FROM (
          -- Payments include the 4% surcharge in the amount; card_fee_amount lives on the parent order
          SELECT p.amount, COALESCE(o.card_fee_amount, 0) AS card_fee_amount
          FROM payments p
          LEFT JOIN orders o ON o.id = p.order_id
          WHERE (COALESCE(p.completed_at, p.created_at) AT TIME ZONE 'America/Mexico_City')::date = $1
            AND p.status = 'completed'
          UNION ALL
          SELECT amount, 0 AS card_fee_amount
          FROM event_registrations
          WHERE (paid_at AT TIME ZONE 'America/Mexico_City')::date = $1 AND status = 'confirmed'
        ) combined
      `, [today]),

            (async () => {
                try {
                    return await query(`SELECT id, name FROM facilities WHERE is_active = true ORDER BY sort_order ASC`);
                } catch { return []; }
            })(),

            (async () => {
                try {
                    return await query(`SELECT facility_id, COUNT(*)::int AS count FROM classes WHERE date = $1 GROUP BY facility_id`, [today]);
                } catch { return []; }
            })(),

            safeQuery<{ total: string }>(`
        SELECT COALESCE(SUM(amount), 0) AS total FROM manual_incomes WHERE income_date = $1
      `, [today])
        ]);

        const gross = parseFloat(todaysRevenue?.gross || '0');
        const cardFee = parseFloat(todaysRevenue?.card_fee || '0');
        const net = Math.max(gross - cardFee, 0);

        const classesByStudio = fillStudioCounts((facilitiesRows || []) as any[], (classesByStudioRaw || []) as any[]);
        const manualToday = parseFloat((manualIncomeToday as any)?.total || '0');

        res.json({
            scheduledClasses: parseInt(scheduledClasses?.count || '0'),
            confirmedBookings: parseInt(confirmedBookings?.count || '0'),
            activeMemberships: parseInt(activeMemberships?.count || '0'),
            revenue: gross + manualToday,
            revenueGross: gross + manualToday,
            revenueNet: net + manualToday,
            revenueCardFees: cardFee,
            classesByStudio,
        });

    } catch (error) {
        console.error('Admin stats error:', error);
        res.json({
            scheduledClasses: 0,
            confirmedBookings: 0,
            activeMemberships: 0,
            revenue: 0
        });
    }
});

// ============================================
// GET /api/admin/birthdays - Birthdays this month
// ============================================
router.get('/birthdays', async (req: Request, res: Response) => {
    try {
        const birthdays = await query(
            `SELECT id, display_name, email, phone, photo_url, date_of_birth
             FROM users
             WHERE role = 'client'
               AND date_of_birth IS NOT NULL
               AND EXTRACT(MONTH FROM date_of_birth) = EXTRACT(MONTH FROM CURRENT_DATE)
             ORDER BY EXTRACT(DAY FROM date_of_birth) ASC`
        );
        res.json(birthdays);
    } catch (error) {
        console.error('Get birthdays error:', error);
        res.status(500).json({ error: 'Error al obtener cumpleaños' });
    }
});

// ============================================
// GET /api/admin/clients/:id/full-profile - Full client details
// ============================================
router.get('/clients/:id/full-profile', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // 1. Basic user info
        const user = await queryOne(`
      SELECT id, email, display_name, phone, photo_url, role,
             emergency_contact_name, emergency_contact_phone,
             health_notes, date_of_birth, created_at,
             tags, reception_notes
      FROM users WHERE id = $1
    `, [id]);

        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // 2. Admin notes (internal notes about the client)
        const notes = await query(`
      SELECT an.*, u.display_name as author_name
      FROM admin_notes an
      LEFT JOIN users u ON an.created_by = u.id
      WHERE an.user_id = $1
      ORDER BY an.created_at DESC
    `, [id]);

        // 3. Memberships history with plan details
        const memberships = await query(`
      SELECT m.*,
             p.name as plan_name,
             p.price as plan_price,
             p.class_limit,
             m.classes_remaining as credits_remaining,
             p.class_limit as credits_total,
             p.price as price_paid
      FROM memberships m
      JOIN plans p ON m.plan_id = p.id
      WHERE m.user_id = $1
      ORDER BY m.created_at DESC
    `, [id]);

        // 4. Booking history (past + upcoming) with class type + instructor
        const bookings = await query(`
      SELECT b.*,
             b.folio AS folio,
             ct.name as class_name,
             c.date,
             c.start_time,
             i.display_name as instructor_name
      FROM bookings b
      JOIN classes c ON b.class_id = c.id
      JOIN class_types ct ON c.class_type_id = ct.id
      LEFT JOIN instructors i ON c.instructor_id = i.id
      WHERE b.user_id = $1
      ORDER BY c.date DESC, c.start_time DESC
      LIMIT 30
    `, [id]);

        // 5. Total loyalty points (sum of all points)
        const loyalty = await queryOne<{ total: string }>(`
      SELECT COALESCE(SUM(points), 0) as total
      FROM loyalty_points
      WHERE user_id = $1
    `, [id]);

        // 6. Get current active membership (prefer one with class credits over inscription-only)
        const currentMembership = await queryOne(`
      SELECT m.*,
             p.name as plan_name,
             p.price as plan_price,
             p.class_limit
      FROM memberships m
      JOIN plans p ON m.plan_id = p.id
      WHERE m.user_id = $1 AND m.status = 'active'
      ORDER BY
        CASE WHEN p.class_limit IS NOT NULL AND p.class_limit > 0 THEN 0 ELSE 1 END,
        m.end_date DESC
      LIMIT 1
    `, [id]);

        res.json({
            ...user,
            notes,
            memberships,
            currentMembership,
            recentBookings: bookings,
            loyaltyPoints: parseInt(loyalty?.total || '0', 10)
        });

    } catch (error) {
        console.error('Full profile error:', error);
        res.status(500).json({ error: 'Error al obtener perfil completo' });
    }
});

// ============================================
// POST /api/admin/clients/:id/notes - Add internal note
// ============================================
const NoteSchema = z.object({
    content: z.string().min(1, 'El contenido es requerido'),
});

router.post('/clients/:id/notes', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const authorId = req.user?.userId;

        const validation = NoteSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: 'Contenido inválido' });
        }

        const newNote = await queryOne(`
      INSERT INTO admin_notes (user_id, created_by, note)
      VALUES ($1, $2, $3)
      RETURNING *, $2 as author_id
    `, [id, authorId, validation.data.content]);

        res.status(201).json(newNote);
    } catch (error) {
        console.error('Add note error:', error);
        res.status(500).json({ error: 'Error al agregar nota' });
    }
});

// ============================================
// GET /api/admin/notifications - Recent system activity feed
// ============================================
router.get('/notifications', async (req: Request, res: Response) => {
    try {
        // Combine recent events from payments, memberships, and bookings
        const notifications = await query(`
            (
                SELECT
                    p.id,
                    'payment' as type,
                    p.amount::text as title,
                    p.payment_method::text as detail,
                    p.status::text as status,
                    u.display_name as user_name,
                    p.created_at,
                    p.user_id
                FROM payments p
                JOIN users u ON p.user_id = u.id
                ORDER BY p.created_at DESC
                LIMIT 10
            )
            UNION ALL
            (
                SELECT
                    m.id,
                    'membership' as type,
                    pl.name as title,
                    m.status::text as detail,
                    m.status::text as status,
                    u.display_name as user_name,
                    m.created_at,
                    m.user_id
                FROM memberships m
                JOIN users u ON m.user_id = u.id
                JOIN plans pl ON m.plan_id = pl.id
                ORDER BY m.created_at DESC
                LIMIT 10
            )
            UNION ALL
            (
                SELECT
                    b.id,
                    'booking' as type,
                    ct.name as title,
                    b.status::text as detail,
                    b.status::text as status,
                    u.display_name as user_name,
                    b.created_at,
                    b.user_id
                FROM bookings b
                JOIN users u ON b.user_id = u.id
                JOIN classes c ON b.class_id = c.id
                JOIN class_types ct ON c.class_type_id = ct.id
                ORDER BY b.created_at DESC
                LIMIT 10
            )
            ORDER BY created_at DESC
            LIMIT 20
        `);

        // Count unread (items from last 24 hours)
        const countResult = await queryOne<{ count: string }>(`
            SELECT (
                (SELECT COUNT(*) FROM payments WHERE created_at > NOW() - INTERVAL '24 hours') +
                (SELECT COUNT(*) FROM memberships WHERE created_at > NOW() - INTERVAL '24 hours') +
                (SELECT COUNT(*) FROM bookings WHERE created_at > NOW() - INTERVAL '24 hours')
            ) as count
        `);

        res.json({
            notifications,
            unreadCount: parseInt(countResult?.count || '0'),
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.json({ notifications: [], unreadCount: 0 });
    }
});

// ============================================
// POST /api/admin/physical-sale - Register physical sale (cash/transfer)
// ============================================
router.post('/physical-sale', async (req: Request, res: Response) => {
    try {
        const { userId, planId, paymentDate, amount, paymentMethod, reference, notes } = req.body;

        if (!userId || !planId) {
            return res.status(400).json({ error: 'Usuario y plan son requeridos' });
        }

        // Verify user
        const user = await queryOne('SELECT id, display_name FROM users WHERE id = $1', [userId]);
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // Get plan
        const plan = await queryOne('SELECT * FROM plans WHERE id = $1', [planId]);
        if (!plan) {
            return res.status(404).json({ error: 'Plan no encontrado' });
        }

        // Calculate dates
        const startDate = paymentDate || new Date().toISOString().split('T')[0];
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + (plan.duration_days || 30));

        // Create membership
        const membership = await queryOne(`
            INSERT INTO memberships (
                user_id, plan_id, start_date, end_date,
                classes_remaining, reformer_remaining, multi_remaining,
                status, payment_method, payment_reference
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9)
            RETURNING *
        `, [
            userId, planId, startDate, endDate.toISOString().split('T')[0],
            plan.class_limit ?? null,
            plan.reformer_credits ?? null,
            plan.multi_credits ?? null,
            paymentMethod || 'cash',
            reference || null
        ]);

        // Create order record for reporting
        const order = await queryOne(`
            INSERT INTO orders (
                user_id, plan_id, subtotal, tax_amount, total_amount,
                currency, payment_method, customer_notes, status, paid_at, approved_at, membership_id
            ) VALUES ($1, $2, $3, 0, $3, 'MXN', $4, $5, 'approved', NOW(), NOW(), $6)
            RETURNING *
        `, [userId, planId, amount || plan.price, paymentMethod || 'cash', notes || null, membership.id]);

        // Create payment row so revenue reports include this physical sale
        const payment = await queryOne(`
            INSERT INTO payments (
                user_id, membership_id, order_id, amount, currency,
                payment_method, status, processed_by, completed_at
            ) VALUES ($1, $2, $3, $4, 'MXN', $5, 'completed', $6, NOW())
            RETURNING id
        `, [
            userId, membership.id, order.id,
            amount || plan.price,
            paymentMethod || 'cash',
            req.user?.userId || null,
        ]);

        // Notify the client (email + non-blocking) — fixes "no me llegó correo" on cash sales
        try {
            const clientUser = await queryOne<{ email: string; display_name: string | null }>(
                `SELECT email, display_name FROM users WHERE id = $1`, [userId]
            );
            if (clientUser?.email) {
                sendMembershipActivatedEmail({
                    to: clientUser.email,
                    clientName: clientUser.display_name || 'Cliente',
                    planName: plan.name,
                    classesIncluded: plan.class_limit || null,
                    startDate: startDate,
                    endDate: endDate.toISOString().split('T')[0],
                }).catch(e => console.error('[physical-sale] email error:', e));
            }
        } catch (e) {
            console.error('[physical-sale] notify error (non-blocking):', e);
        }

        res.status(201).json({
            success: true,
            membership,
            order,
            payment,
            userName: user.display_name,
        });
    } catch (error) {
        console.error('Physical sale error:', error);
        res.status(500).json({ error: 'Error al registrar venta física' });
    }
});

// ============================================
// POST /api/admin/test-emails
// Sends every email template to a target address with sample data so the
// admin can preview what subscribers actually receive.
// Body: { to: string }  (defaults to the calling admin's own email)
// ============================================
router.post('/test-emails', async (req: Request, res: Response) => {
    try {
        const adminUser = await queryOne<{ email: string; display_name: string | null }>(
            `SELECT email, display_name FROM users WHERE id = $1`,
            [req.user?.userId]
        );

        const to: string = (req.body?.to || adminUser?.email || '').trim();
        if (!to || !/^[^@]+@[^@]+\.[^@]+$/.test(to)) {
            return res.status(400).json({ error: 'Email destino inválido' });
        }

        const sampleName = (adminUser?.display_name || 'Tester').split(' ')[0] || 'Tester';
        const today = new Date();
        const startStr = today.toISOString().split('T')[0];
        const endDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
        const endStr = endDate.toISOString().split('T')[0];

        // Run sequentially to keep Resend rate-limit happy and have a clean per-template log
        const results: Array<{ template: string; trigger: string; ok: boolean; error?: string }> = [];
        const run = async (
            template: string,
            trigger: string,
            sender: () => Promise<unknown>,
        ) => {
            try {
                await sender();
                results.push({ template, trigger, ok: true });
            } catch (err: any) {
                results.push({ template, trigger, ok: false, error: err?.message || String(err) });
            }
        };

        await run(
            'instructor_magic_link',
            'Coach pide acceso desde /coach/login (correo con magic link de 10 min)',
            () => sendInstructorMagicLink({
                to,
                instructorName: sampleName,
                magicLink: `${getFrontendUrl()}/instructor/magic-login?token=DEMO-TOKEN-1234`,
            }),
        );

        await run(
            'instructor_credentials',
            'Admin crea un nuevo instructor (correo con credenciales iniciales)',
            () => sendInstructorCredentials({
                to,
                instructorName: sampleName,
                email: to,
                temporaryPassword: 'BalanceTemp2026!',
                loginUrl: `${getFrontendUrl()}/coach/login`,
                coachNumber: 'C-007',
            }),
        );

        await run(
            'class_assignment',
            'Admin asigna una clase recurrente o suelta a un coach',
            () => sendClassAssignmentNotification({
                to,
                coachName: sampleName,
                className: 'Hot Pilates',
                classDate: startStr,
                startTime: '07:00',
                endTime: '08:00',
                capacity: 6,
            }),
        );

        await run(
            'membership_activated',
            'Cliente compra/le activan un paquete (transferencia aprobada o pago con tarjeta)',
            () => sendMembershipActivatedEmail({
                to,
                clientName: sampleName,
                planName: 'Paquete 8 clases',
                classesIncluded: 8,
                startDate: startStr,
                endDate: endStr,
            }),
        );

        await run(
            'event_announcement',
            'Admin publica un evento y lo anuncia a la lista de clientes',
            () => sendEventAnnouncementEmail({
                to,
                eventTitle: 'Masterclass de Reformer',
                eventType: 'Masterclass',
                eventDate: startStr,
                startTime: '18:00',
                endTime: '19:30',
                location: 'BMB Studio — Sala Reformer',
                price: 350,
                instructor: 'Danna',
                description: 'Sesión especial enfocada en core profundo y postura, con cupo limitado a 6 lugares.',
            }),
        );

        await run(
            'client_welcome',
            'Admin crea cuenta a un cliente desde el panel (no autoregistro)',
            () => sendClientWelcomeEmail({
                to,
                clientName: sampleName,
                email: to,
                temporaryPassword: 'Bienvenida2026!',
            }),
        );

        await run(
            'order_rejected',
            'Admin rechaza el comprobante de pago de una transferencia',
            () => sendOrderRejectedEmail({
                to,
                clientName: sampleName,
                orderNumber: 'BR-2026-00042',
                planName: 'Paquete 4 clases',
                rejectionReason: 'El comprobante no muestra el monto correcto.',
            }),
        );

        await run(
            'points_earned',
            'Cliente gana puntos por compra/bienvenida/referido',
            () => sendPointsEarnedEmail({
                to,
                clientName: sampleName,
                pointsEarned: 60,
                totalPoints: 130,
                reasonLabel: 'tu compra de paquete',
            }),
        );

        await run(
            'password_reset',
            'Cliente pide recuperar contraseña desde /forgot-password',
            () => sendPasswordResetEmail({
                to,
                resetLink: `${getFrontendUrl()}/reset-password?token=DEMO-RESET-9876`,
            }),
        );

        const failed = results.filter((r) => !r.ok).length;
        res.json({
            to,
            sent: results.length - failed,
            failed,
            results,
        });
    } catch (error: any) {
        console.error('[admin] test-emails error:', error);
        res.status(500).json({ error: 'Error enviando correos de prueba', details: error?.message });
    }
});

export default router;
