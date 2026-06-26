import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/database.js';
import { pool } from '../config/database.js';
import { optionalAuth, authenticate, requireRole } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendClientWelcomeEmail } from '../services/email.js';
import { sendClientWelcome } from '../lib/whatsapp.js';

const router = Router();

// Compatibility endpoint for legacy frontend code that still calls /api/migrations/plans
router.get('/plans', optionalAuth, async (req: Request, res: Response) => {
    try {
        const canSeeAll = ['admin', 'super_admin'].includes(req.user?.role || '');
        const showAll = canSeeAll && req.query.all === 'true';

        let queryStr = `
            SELECT
                id, name, description, price, currency,
                duration_days, class_limit, features, is_active, sort_order
            FROM plans
        `;

        if (!showAll) {
            queryStr += ` WHERE is_active = true`;
        }

        queryStr += ` ORDER BY sort_order ASC, price ASC`;

        const plans = await query(queryStr);

        const normalized = plans.map((plan: any) => ({
            ...plan,
            duration: plan.duration_days,
            classes: plan.class_limit ?? -1,
            active: plan.is_active,
            type: 'membership',
        }));

        res.json(normalized);
    } catch (error) {
        console.error('Legacy migration plans error:', error);
        res.status(500).json({ error: 'Error al obtener planes para migración' });
    }
});

// POST /api/migrations/client - Migrate/register existing client with membership
router.post('/client', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const {
            name, email, phone, birthDate, packageId,
            originalPaymentDate, originalAmount, paymentMethod,
            receiptReference, startDate, endDate,
            classesAlreadyUsed, notes, silent
        } = req.body;

        if (!name || !phone) {
            return res.status(400).json({ error: 'Nombre y teléfono son requeridos' });
        }

        // packageId es OPCIONAL: sin plan se crea solo la cuenta (lead/prueba reciente sin
        // membresía). Con plan, se crea la membresía como antes.
        let plan: any = null;
        if (packageId) {
            plan = await queryOne('SELECT * FROM plans WHERE id = $1', [packageId]);
            if (!plan) {
                return res.status(404).json({ error: 'Plan no encontrado' });
            }
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Check if user exists by email or phone
            let userId: string | null = null;
            let tempPassword = '';

            if (email) {
                const existing = await client.query(
                    'SELECT id FROM users WHERE email = $1',
                    [email]
                );
                if (existing.rows.length > 0) {
                    userId = existing.rows[0].id;
                }
            }

            if (!userId && phone) {
                const existing = await client.query(
                    'SELECT id FROM users WHERE phone = $1',
                    [phone]
                );
                if (existing.rows.length > 0) {
                    userId = existing.rows[0].id;
                }
            }

            // Si la clienta YA existía, rellena los datos que falten traídos de Fitune
            // (teléfono / fecha de nacimiento / nombre). Solo llena lo vacío; NO pisa lo que ya tenga.
            // Antes el import solo creaba cuentas nuevas, por eso las existentes quedaban sin teléfono.
            if (userId) {
                await client.query(
                    `UPDATE users SET
                        phone = CASE WHEN (phone IS NULL OR phone = '' OR phone ~ '^0+$') AND $2 <> '' THEN $2 ELSE phone END,
                        date_of_birth = COALESCE(date_of_birth, $3),
                        display_name = CASE WHEN (display_name IS NULL OR display_name = '') AND $4 <> '' THEN $4 ELSE display_name END,
                        updated_at = NOW()
                     WHERE id = $1`,
                    [userId, phone || '', birthDate || null, name || '']
                );
            }

            // Create user if doesn't exist
            if (!userId) {
                tempPassword = crypto.randomBytes(4).toString('hex');
                const hashedPassword = await bcrypt.hash(tempPassword, 10);

                const newUser = await client.query(`
                    INSERT INTO users (display_name, email, phone, date_of_birth, password_hash, role)
                    VALUES ($1, $2, $3, $4, $5, 'client')
                    RETURNING id
                `, [name, email || null, phone, birthDate || null, hashedPassword]);

                userId = newUser.rows[0].id;
            }

            // Create membership only if a plan was given (account-only migration otherwise)
            let membershipId: string | null = null;
            if (packageId && plan) {
                const classesTotal = plan.class_limit || 0;
                const used = classesAlreadyUsed || 0;
                const remaining = classesTotal > 0 ? Math.max(classesTotal - used, 0) : null;

                const membership = await client.query(`
                    INSERT INTO memberships (
                        user_id, plan_id, start_date, end_date,
                        classes_remaining, reformer_remaining, multi_remaining,
                        status, payment_method,
                        payment_reference, is_migration, migration_notes,
                        classes_used_before_migration
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9, true, $10, $11)
                    RETURNING id
                `, [
                    userId, packageId,
                    startDate || null, // antes default = HOY → metía fecha falsa en migraciones sin startDate (bug de la 086)
                    endDate,
                    remaining,
                    plan.reformer_credits ?? null,
                    plan.multi_credits ?? null,
                    paymentMethod || 'cash',
                    receiptReference || null,
                    notes || `Migración: $${originalAmount || plan.price} pagado ${originalPaymentDate || 'sin fecha'}`,
                    classesAlreadyUsed || 0
                ]);
                membershipId = membership.rows[0].id;
            }

            await client.query('COMMIT');

            // Send welcome credentials only if a NEW user was created (tempPassword was generated).
            // 'silent' (migración masiva) omite el aviso para no enviar correos/WhatsApp en lote.
            let emailSent = false;
            let whatsappSent = false;
            if (tempPassword && !silent) {
                if (email) {
                    try {
                        await sendClientWelcomeEmail({
                            to: email,
                            clientName: name,
                            email,
                            temporaryPassword: tempPassword,
                        });
                        emailSent = true;
                    } catch (e) {
                        console.error('Migrate: error sending welcome email:', e);
                    }
                }
                // WhatsApp de bienvenida de MIGRACIÓN DESACTIVADO (política 2026-06-23:
                // solo 3 mensajes por WhatsApp; la migración Fitune va en lotes grandes).
                // El email de bienvenida se mantiene.
            }

            res.status(201).json({
                userId,
                packageId: packageId || null,
                membershipId,
                tempPassword: tempPassword || '(usuario existente)',
                success: true,
                emailSent,
                whatsappSent,
            });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error('Migrate client error:', error);
        res.status(500).json({ error: error.message || 'Error al migrar cliente' });
    }
});

// POST /api/migrations/assign - Assign membership to existing user
router.post('/assign', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const {
            userId, packageId,
            originalPaymentDate, originalAmount, paymentMethod,
            receiptReference, startDate, endDate,
            classesAlreadyUsed, notes
        } = req.body;

        if (!userId || !packageId) {
            return res.status(400).json({ error: 'Usuario y plan son requeridos' });
        }

        // Verify user exists
        const user = await queryOne('SELECT id, display_name FROM users WHERE id = $1', [userId]);
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // Get plan
        const plan = await queryOne('SELECT * FROM plans WHERE id = $1', [packageId]);
        if (!plan) {
            return res.status(404).json({ error: 'Plan no encontrado' });
        }

        // Calculate classes remaining
        const classesTotal = plan.class_limit || 0;
        const used = classesAlreadyUsed || 0;
        const remaining = classesTotal > 0 ? Math.max(classesTotal - used, 0) : null;

        // Create membership
        const membership = await queryOne(`
            INSERT INTO memberships (
                user_id, plan_id, start_date, end_date,
                classes_remaining, reformer_remaining, multi_remaining,
                status, payment_method,
                payment_reference, is_migration, migration_notes,
                classes_used_before_migration
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9, true, $10, $11)
            RETURNING *
        `, [
            userId, packageId,
            startDate || null, // antes default = HOY → metía fecha falsa en migraciones sin startDate (bug de la 086)
            endDate,
            remaining,
            plan.reformer_credits ?? null,
            plan.multi_credits ?? null,
            paymentMethod || 'cash',
            receiptReference || null,
            notes || `Migración: $${originalAmount || plan.price} pagado ${originalPaymentDate || 'sin fecha'}`,
            classesAlreadyUsed || 0
        ]);

        res.status(201).json({
            success: true,
            membership,
            userName: user.display_name,
        });
    } catch (error: any) {
        console.error('Assign membership error:', error);
        res.status(500).json({ error: error.message || 'Error al asignar membresía' });
    }
});

// POST /api/migrations/booking - Recrea una reserva traída de otra plataforma (Fitune).
// A diferencia de /bookings/admin-book, NO consume créditos, NO valida categoría ni cupo:
// la reserva ya existía en el sistema anterior, aquí solo se replica. Idempotente por
// (class_id, user_id) entre reservas no canceladas. El trigger update_class_booking_count
// mantiene classes.current_bookings, así que no lo tocamos a mano.
router.post('/booking', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    const { classId, userId, attended, attendedAt } = req.body;
    if (!classId || !userId) {
        return res.status(400).json({ error: 'classId y userId son requeridos' });
    }
    try {
        const cls = await queryOne<any>('SELECT id, status FROM classes WHERE id = $1', [classId]);
        if (!cls) return res.status(404).json({ error: 'Clase no encontrada' });
        if (cls.status === 'cancelled') return res.status(400).json({ error: 'La clase está cancelada' });

        const user = await queryOne<any>('SELECT id FROM users WHERE id = $1', [userId]);
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        // Idempotente: si ya hay una reserva activa para (clase, usuario), la devolvemos.
        const existing = await queryOne<any>(
            `SELECT * FROM bookings WHERE class_id = $1 AND user_id = $2 AND status != 'cancelled'`,
            [classId, userId]
        );
        if (existing) {
            return res.status(200).json({ booking: existing, alreadyExisted: true });
        }

        // Asistencia (clases pasadas migradas): attended=true → 'checked_in', false → 'no_show',
        // undefined → 'confirmed' (reserva futura normal).
        let status = 'confirmed';
        let checkedInAt: string | null = null;
        if (attended === true) { status = 'checked_in'; checkedInAt = attendedAt || null; }
        else if (attended === false) { status = 'no_show'; }

        const booking = await queryOne<any>(
            `INSERT INTO bookings (class_id, user_id, membership_id, status, is_free_booking, consumed_category, is_migration, checked_in_at)
             VALUES ($1, $2, NULL, $3, false, NULL, true, $4)
             RETURNING *`,
            [classId, userId, status, checkedInAt]
        );

        res.status(201).json({ booking, alreadyExisted: false });
    } catch (error: any) {
        console.error('Migration booking error:', error);
        res.status(500).json({ error: error.message || 'Error al recrear la reserva' });
    }
});

// POST /api/migrations/reconcile - Ajusta créditos restantes + vencimiento de una membresía
// a los valores reales de la plataforma anterior (Fitune availableTickets / currentPeriodEndAt).
// reformerRemaining/multiRemaining: número, o null = ilimitado. endDate opcional (ISO/fecha).
router.post('/reconcile', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    const { membershipId, reformerRemaining, multiRemaining, endDate } = req.body;
    if (!membershipId) {
        return res.status(400).json({ error: 'membershipId es requerido' });
    }
    // Validación: cada bucket es null (ilimitado) o entero >= 0
    const ok = (v: any) => v === null || v === undefined || (Number.isInteger(v) && v >= 0);
    if (!ok(reformerRemaining) || !ok(multiRemaining)) {
        return res.status(400).json({ error: 'reformerRemaining/multiRemaining deben ser entero>=0 o null' });
    }
    try {
        const m = await queryOne<any>('SELECT id FROM memberships WHERE id = $1', [membershipId]);
        if (!m) return res.status(404).json({ error: 'Membresía no encontrada' });

        const ref = reformerRemaining === undefined ? null : reformerRemaining;
        const mul = multiRemaining === undefined ? null : multiRemaining;
        // classes_remaining (total legado): null si algún bucket es ilimitado, si no la suma.
        const totalRemaining = (ref === null || mul === null) ? null : ref + mul;

        const updated = await queryOne<any>(`
            UPDATE memberships
               SET reformer_remaining = $2,
                   multi_remaining = $3,
                   classes_remaining = $4,
                   end_date = COALESCE($5, end_date),
                   updated_at = NOW()
             WHERE id = $1
             RETURNING id, reformer_remaining, multi_remaining, classes_remaining, end_date
        `, [membershipId, ref, mul, totalRemaining, endDate || null]);

        res.json({ success: true, membership: updated });
    } catch (error: any) {
        console.error('Reconcile membership error:', error);
        res.status(500).json({ error: error.message || 'Error al reconciliar membresía' });
    }
});

// POST /api/migrations/send-welcome { userId, emailOnly? }
// Onboarding de clientes migrados: genera una contraseña temporal NUEVA, la guarda,
// y envía el correo de bienvenida (usuario = su correo + contraseña temporal + link).
// Úsese una sola vez por cliente. Solo role='client'.
router.post('/send-welcome', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    const { userId, emailOnly, loginUrl } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId requerido' });
    try {
        const user = await queryOne<any>(
            'SELECT id, display_name, email, phone, role FROM users WHERE id = $1', [userId]
        );
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        if (user.role !== 'client') return res.status(400).json({ error: 'Solo aplica a clientes' });
        if (!user.email) return res.status(400).json({ error: 'El cliente no tiene correo' });

        // Nueva contraseña temporal (las originales no se guardan).
        const tempPassword = crypto.randomBytes(4).toString('hex');
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hashedPassword, userId]);

        let emailSent = false;
        let whatsappSent = false;
        try {
            await sendClientWelcomeEmail({
                to: user.email,
                clientName: user.display_name || 'Cliente',
                email: user.email,
                temporaryPassword: tempPassword,
                loginUrl: loginUrl || undefined,
            });
            emailSent = true;
        } catch (e) {
            console.error('[send-welcome] email error:', e);
        }
        // WhatsApp de bienvenida de MIGRACIÓN DESACTIVADO (política 2026-06-23:
        // solo 3 mensajes por WhatsApp). El email de bienvenida se mantiene.

        res.json({ success: true, emailSent, whatsappSent });
    } catch (error: any) {
        console.error('Send-welcome error:', error);
        res.status(500).json({ error: error.message || 'Error enviando bienvenida' });
    }
});

// GET /api/migrations/history - Migration history
router.get('/history', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;

        const records = await query(`
            SELECT
                m.id, m.user_id as "userId",
                u.display_name as "userName",
                u.email as "userEmail",
                u.phone as "userPhone",
                p.name as "packageName",
                m.payment_amount as "originalAmount",
                m.payment_date as "originalPaymentDate",
                m.created_at as "migratedAt",
                m.notes
            FROM memberships m
            JOIN users u ON m.user_id = u.id
            JOIN plans p ON m.plan_id = p.id
            WHERE m.is_migration = true
            ORDER BY m.created_at DESC
            LIMIT $1
        `, [limit]);

        res.json(records);
    } catch (error) {
        console.error('Migration history error:', error);
        res.status(500).json({ error: 'Error al obtener historial' });
    }
});

// GET /api/migrations/stats - Membership stats
router.get('/stats', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const stats = await queryOne(`
            SELECT
                COUNT(*) FILTER (WHERE status = 'active') as "totalActivas",
                COUNT(*) FILTER (WHERE status = 'active' AND is_migration = false) as "porVenta",
                COUNT(*) FILTER (WHERE status = 'active' AND is_migration = true) as "porMigracion",
                0 as "porPromo",
                0 as "porGift"
            FROM memberships
        `);

        res.json({
            totalActivas: parseInt(stats?.totalActivas || '0'),
            porVenta: parseInt(stats?.porVenta || '0'),
            porMigracion: parseInt(stats?.porMigracion || '0'),
            porPromo: parseInt(stats?.porPromo || '0'),
            porGift: parseInt(stats?.porGift || '0'),
        });
    } catch (error) {
        console.error('Migration stats error:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

// GET /api/migrations/audit - Volcado completo de membresías migradas para auditar vs Fitune.
// Devuelve los campos REALES guardados (fechas, estatus, plan, créditos) que /history no expone.
router.get('/audit', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const records = await query(`
            SELECT
                m.id,
                u.email,
                u.display_name AS "name",
                u.phone,
                to_char(u.date_of_birth, 'YYYY-MM-DD') AS "dob",
                p.name AS "plan",
                m.status,
                to_char(m.start_date, 'YYYY-MM-DD') AS "startDate",
                to_char(m.end_date, 'YYYY-MM-DD') AS "endDate",
                m.classes_remaining AS "classesRemaining",
                m.reformer_remaining AS "reformerRemaining",
                m.multi_remaining AS "multiRemaining",
                to_char(m.payment_date, 'YYYY-MM-DD') AS "paymentDate",
                to_char(m.created_at, 'YYYY-MM-DD HH24:MI') AS "migratedAt",
                m.migration_notes AS "notes"
            FROM memberships m
            JOIN users u ON m.user_id = u.id
            JOIN plans p ON m.plan_id = p.id
            WHERE m.is_migration = true
            ORDER BY u.email
        `);
        res.json({ count: records.length, records });
    } catch (error: any) {
        console.error('Migration audit error:', error);
        res.status(500).json({ error: error.message || 'Error en auditoría' });
    }
});

export default router;
