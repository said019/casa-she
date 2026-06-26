import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/database.js';
import { authenticate, requireRole, optionalAuth } from '../middleware/auth.js';
import { cancelClassWithRefunds } from '../lib/cancel-class.js';
import { sendEventAnnouncementEmail } from '../services/email.js';
import { sendAlertToAllDevices, recordPassUpdate, notifyAllUserDevices } from '../lib/apple-wallet.js';
import { sendMessageToAllGoogleObjects, upsertGoogleLoyaltyObject, sendGoogleWalletMessage } from '../lib/google-wallet.js';

const router = Router();

// ============================================
// SCHEMAS
// ============================================

const CreateEventSchema = z.object({
    type: z.enum(['masterclass', 'workshop', 'retreat', 'challenge', 'openhouse', 'special']),
    title: z.string().min(3).max(200),
    description: z.string().min(10).max(2000),
    instructor_name: z.string().min(2).max(100),
    instructor_photo: z.string().url().optional().nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    end_time: z.string().regex(/^\d{2}:\d{2}$/),
    location: z.string().min(2).max(200),
    capacity: z.coerce.number().int().min(1).max(500),
    price: z.coerce.number().min(0),
    early_bird_price: z.coerce.number().min(0).optional().nullable(),
    early_bird_deadline: z.string().optional().nullable(),
    member_discount: z.coerce.number().min(0).max(100).optional().default(0),
    image: z.string().url().optional().nullable(),
    requirements: z.string().max(500).optional().default(''),
    includes: z.array(z.string()).optional().default([]),
    tags: z.array(z.string()).optional().default([]),
    status: z.enum(['draft', 'published']).optional().default('draft'),
    waitlist_enabled: z.boolean().optional().default(true),
    required_payment: z.boolean().optional().default(true),
    wallet_pass: z.boolean().optional().default(true),
    auto_reminders: z.boolean().optional().default(false),
    allow_cancellations: z.boolean().optional().default(false),
});

const UpdateEventSchema = CreateEventSchema.partial().extend({
    status: z.enum(['draft', 'published', 'cancelled', 'completed']).optional(),
});

const RegisterSchema = z.object({
    name: z.string().min(2).max(100),
    email: z.string().email(),
    phone: z.string().max(20).optional().default(''),
    payment_method: z.enum(['card', 'transfer', 'cash', 'free']).optional(),
    payment_reference: z.string().max(200).optional(),
});

// ============================================
// HELPERS
// ============================================

function mapEventRow(row: any) {
    // Normalize date: PostgreSQL DATE comes as Date object or ISO string
    let dateStr = '';
    if (row.date) {
        const d = row.date instanceof Date ? row.date : new Date(row.date);
        dateStr = d.toISOString().split('T')[0]; // "2026-02-14"
    }

    // Normalize time: PostgreSQL TIME comes as "HH:MM:SS", we want "HH:MM"
    const normalizeTime = (t: string | null): string => {
        if (!t) return '';
        const str = String(t);
        // Already HH:MM or HH:MM:SS
        const match = str.match(/^(\d{2}:\d{2})/);
        return match ? match[1] : str;
    };

    return {
        id: row.id,
        title: row.title,
        description: row.description,
        type: row.type,
        instructor: row.instructor_name,
        instructorPhoto: row.instructor_photo,
        date: dateStr,
        startTime: normalizeTime(row.start_time),
        endTime: normalizeTime(row.end_time),
        location: row.location,
        capacity: row.capacity,
        registered: row.registered || 0,
        price: parseFloat(row.price) || 0,
        earlyBirdPrice: row.early_bird_price ? parseFloat(row.early_bird_price) : null,
        earlyBirdDeadline: row.early_bird_deadline,
        memberDiscount: parseFloat(row.member_discount) || 0,
        image: row.image,
        status: row.status,
        tags: row.tags || [],
        requirements: row.requirements || '',
        includes: row.includes || [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        waitlistEnabled: row.waitlist_enabled ?? true,
        requiredPayment: row.required_payment ?? true,
        walletPass: row.wallet_pass ?? true,
        autoReminders: row.auto_reminders ?? false,
        allowCancellations: row.allow_cancellations ?? false,
    };
}

// ============================================
// PUBLIC: GET /api/events - List published events (for clients)
// ============================================
router.get('/', optionalAuth, async (req: Request, res: Response) => {
    try {
        const { type, upcoming } = req.query;

        let sql = `
            SELECT * FROM events
            WHERE status = 'published'
        `;
        const params: any[] = [];
        let paramIdx = 1;

        if (type && type !== 'all') {
            sql += ` AND type = $${paramIdx++}`;
            params.push(type);
        }

        if (upcoming === 'true') {
            sql += ` AND date >= CURRENT_DATE`;
        }

        sql += ` ORDER BY date ASC, start_time ASC`;

        const events = await query(sql, params);
        res.json(events.map(mapEventRow));
    } catch (error) {
        console.error('List events error:', error);
        res.status(500).json({ error: 'Error al obtener eventos' });
    }
});

// ============================================
// ADMIN: GET /api/events/admin/all - All events (including drafts)
// ============================================
router.get('/admin/all', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const events = await query(`SELECT * FROM events ORDER BY date DESC, start_time DESC`);

        // Fetch registrations for each event
        const eventsWithRegs = await Promise.all(
            events.map(async (event) => {
                const registrations = await query(
                    `SELECT id, name, email, phone, status, amount, payment_method, payment_reference,
                            paid_at, checked_in, checked_in_at, waitlist_position, notes, created_at
                     FROM event_registrations
                     WHERE event_id = $1
                     ORDER BY created_at ASC`,
                    [event.id]
                );

                return {
                    ...mapEventRow(event),
                    registrations: registrations.map((r) => ({
                        id: r.id,
                        name: r.name,
                        email: r.email,
                        phone: r.phone || '',
                        status: r.status,
                        amount: parseFloat(r.amount) || 0,
                        paidAt: r.paid_at,
                        checkedIn: r.checked_in,
                        paymentMethod: r.payment_method,
                        paymentReference: r.payment_reference,
                    })),
                };
            })
        );

        res.json(eventsWithRegs);
    } catch (error) {
        console.error('Admin list events error:', error);
        res.status(500).json({ error: 'Error al obtener eventos' });
    }
});

// ============================================
// ADMIN: POST /api/events/notify - Send event announcement to all active members
// ============================================
router.post('/notify', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { eventId } = req.body;
        if (!eventId) return res.status(400).json({ error: 'eventId requerido' });

        const event = await queryOne<any>('SELECT * FROM events WHERE id = $1', [eventId]);
        if (!event) return res.status(404).json({ error: 'Evento no encontrado' });

        // Get all active users with email
        const users = await query(
            `SELECT DISTINCT u.email FROM users u
             WHERE u.role = 'client' AND u.is_active = true AND u.email IS NOT NULL AND u.email != ''`
        );

        const emails = users.map((u: any) => u.email).filter(Boolean);
        if (emails.length === 0) return res.json({ sent: 0, message: 'No hay usuarios activos con email' });

        // Resend supports max 50 recipients per call, batch if needed
        const batchSize = 50;
        let totalSent = 0;
        for (let i = 0; i < emails.length; i += batchSize) {
            const batch = emails.slice(i, i + batchSize);
            const typeLabels: Record<string, string> = {
                masterclass: 'Masterclass', workshop: 'Workshop', retreat: 'Retiro',
                challenge: 'Challenge', openhouse: 'Open House', special: 'Clase Especial',
            };
            await sendEventAnnouncementEmail({
                to: batch,
                eventTitle: event.title,
                eventType: typeLabels[event.type] || event.type,
                eventDate: String(event.date).split('T')[0],
                startTime: event.start_time?.slice(0, 5) || '',
                endTime: event.end_time?.slice(0, 5) || '',
                location: event.location || 'Catarsis Studio',
                price: parseFloat(event.price) || 0,
                instructor: event.instructor_name || '',
                description: event.description || '',
            });
            totalSent += batch.length;
        }

        res.json({ sent: totalSent, message: `Notificación enviada a ${totalSent} usuarios` });
    } catch (error) {
        console.error('Notify event error:', error);
        res.status(500).json({ error: 'Error al enviar notificaciones' });
    }
});

// ============================================
// ADMIN: GET /api/events/registrations/pending - Pending event payments
// ============================================
router.get('/registrations/pending', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const registrations = await query(`
            SELECT r.id, r.name as user_name, r.email as user_email, r.amount,
                   r.payment_method, r.status, r.created_at,
                   e.title as event_title
            FROM event_registrations r
            JOIN events e ON r.event_id = e.id
            WHERE r.status = 'pending' AND r.amount > 0
            ORDER BY r.created_at ASC
        `);
        res.json(registrations);
    } catch (error) {
        console.error('Pending event registrations error:', error);
        res.status(500).json({ error: 'Error al obtener registros pendientes' });
    }
});

// ============================================
// PUBLIC: GET /api/events/:id - Event detail
// ============================================
router.get('/:id', optionalAuth, async (req: Request, res: Response) => {
    try {
        const event = await queryOne(`SELECT * FROM events WHERE id = $1`, [req.params.id]);

        if (!event) {
            return res.status(404).json({ error: 'Evento no encontrado' });
        }

        // Only published events visible to non-admins
        if (event.status !== 'published' && (!req.user || !['admin', 'super_admin'].includes(req.user.role as string))) {
            return res.status(404).json({ error: 'Evento no encontrado' });
        }

        const mapped = mapEventRow(event);

        // If user is logged in, check their registration
        let myRegistration = null;
        if (req.user) {
            const reg = await queryOne(
                `SELECT id, status, amount, checked_in, payment_method, payment_reference, payment_proof_url, payment_proof_file_name, transfer_date
                 FROM event_registrations WHERE event_id = $1 AND user_id = $2`,
                [req.params.id, req.user.userId]
            );
            if (reg) {
                myRegistration = {
                    id: reg.id,
                    status: reg.status,
                    amount: parseFloat(reg.amount) || 0,
                    checkedIn: reg.checked_in,
                    paymentMethod: reg.payment_method,
                    paymentReference: reg.payment_reference,
                    hasPaymentProof: !!reg.payment_proof_url,
                    paymentProofFileName: reg.payment_proof_file_name,
                    transferDate: reg.transfer_date,
                };
            }
        }

        res.json({ ...mapped, myRegistration });
    } catch (error) {
        console.error('Get event error:', error);
        res.status(500).json({ error: 'Error al obtener evento' });
    }
});

// ============================================
// ADMIN: POST /api/events - Create event
// ============================================
router.post('/', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const data = CreateEventSchema.parse(req.body);

        const event = await queryOne(
            `INSERT INTO events (
                type, title, description, instructor_name, instructor_photo,
                date, start_time, end_time, location, capacity,
                price, currency, early_bird_price, early_bird_deadline,
                member_discount, image, requirements, includes, tags, status, created_by,
                waitlist_enabled, required_payment, wallet_pass, auto_reminders, allow_cancellations
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9, $10,
                $11, 'MXN', $12, $13,
                $14, $15, $16, $17, $18, $19, $20,
                $21, $22, $23, $24, $25
            ) RETURNING *`,
            [
                data.type, data.title, data.description, data.instructor_name, data.instructor_photo || null,
                data.date, data.start_time, data.end_time, data.location, data.capacity,
                data.price, data.early_bird_price || null, data.early_bird_deadline || null,
                data.member_discount, data.image || null, data.requirements,
                JSON.stringify(data.includes), JSON.stringify(data.tags), data.status, req.user!.userId,
                data.waitlist_enabled, data.required_payment, data.wallet_pass, data.auto_reminders, data.allow_cancellations,
            ]
        );

        // Auto-cancel overlapping classes if event is published
        let cancelledClasses: any[] = [];
        if (data.status === 'published') {
            cancelledClasses = await cancelOverlappingClasses(
                data.date, data.start_time, data.end_time,
                req.user!.userId, data.title
            );
        }

        // Send push notification to all Wallet passes when event is published
        if (data.status === 'published') {
            const evDate = new Date(data.date + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
            const pushTitle = `✨ Nuevo evento: ${data.title}`;
            const pushBody = `${evDate} • ${data.start_time}-${data.end_time} • ¡Inscríbete!`;
            // Apple Wallet
            sendAlertToAllDevices(pushTitle, pushBody).catch(e => console.error('Apple push error:', e));
            // Google Wallet
            sendMessageToAllGoogleObjects(pushTitle, pushBody).catch(e => console.error('Google push error:', e));
        }

        res.status(201).json({ ...mapEventRow(event), cancelledClasses });
    } catch (error) {
        if (error instanceof z.ZodError) {
            const fieldMessages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
            return res.status(400).json({ error: `Datos inválidos: ${fieldMessages}`, details: error.errors });
        }
        console.error('Create event error:', error);
        res.status(500).json({ error: 'Error al crear evento' });
    }
});

// ============================================
// ADMIN: PUT /api/events/:id - Update event
// ============================================
router.put('/:id', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const data = UpdateEventSchema.parse(req.body);

        // Get previous state to detect status change
        const previous = await queryOne(`SELECT status, date, start_time, end_time, title FROM events WHERE id = $1`, [req.params.id]);
        if (!previous) return res.status(404).json({ error: 'Evento no encontrado' });

        // Build dynamic update
        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        const fieldMap: Record<string, string> = {
            type: 'type', title: 'title', description: 'description',
            instructor_name: 'instructor_name', instructor_photo: 'instructor_photo',
            date: 'date', start_time: 'start_time', end_time: 'end_time',
            location: 'location', capacity: 'capacity', price: 'price',
            early_bird_price: 'early_bird_price', early_bird_deadline: 'early_bird_deadline',
            member_discount: 'member_discount', image: 'image', requirements: 'requirements',
            status: 'status',
            waitlist_enabled: 'waitlist_enabled', required_payment: 'required_payment',
            wallet_pass: 'wallet_pass', auto_reminders: 'auto_reminders',
            allow_cancellations: 'allow_cancellations',
        };

        for (const [key, col] of Object.entries(fieldMap)) {
            if ((data as any)[key] !== undefined) {
                fields.push(`${col} = $${idx++}`);
                values.push((data as any)[key]);
            }
        }

        // Handle JSONB fields
        if (data.includes !== undefined) {
            fields.push(`includes = $${idx++}`);
            values.push(JSON.stringify(data.includes));
        }
        if (data.tags !== undefined) {
            fields.push(`tags = $${idx++}`);
            values.push(JSON.stringify(data.tags));
        }

        if (fields.length === 0) {
            return res.status(400).json({ error: 'No hay campos para actualizar' });
        }

        values.push(req.params.id);
        const event = await queryOne(
            `UPDATE events SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
            values
        );

        if (!event) {
            return res.status(404).json({ error: 'Evento no encontrado' });
        }

        // Auto-cancel overlapping classes if event just became published or schedule changed while published
        let cancelledClasses: any[] = [];
        const nowPublished = event.status === 'published';
        const wasPublished = previous.status === 'published';
        const scheduleChanged = data.date || data.start_time || data.end_time;

        if (nowPublished && (!wasPublished || scheduleChanged)) {
            const evDate = event.date instanceof Date ? event.date.toISOString().split('T')[0] : String(event.date).split('T')[0];
            const evStart = String(event.start_time).slice(0, 5);
            const evEnd = String(event.end_time).slice(0, 5);
            cancelledClasses = await cancelOverlappingClasses(
                evDate, evStart, evEnd,
                req.user!.userId, event.title
            );
        }

        // Send push notification when event becomes published
        if (nowPublished && !wasPublished) {
            const evDate = event.date instanceof Date
                ? event.date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
                : new Date(String(event.date).split('T')[0] + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
            const pushTitle = `✨ Nuevo evento: ${event.title}`;
            const pushBody = `${evDate} • ${String(event.start_time).slice(0, 5)}-${String(event.end_time).slice(0, 5)} • ¡Inscríbete!`;
            sendAlertToAllDevices(pushTitle, pushBody).catch(e => console.error('Apple push error:', e));
            sendMessageToAllGoogleObjects(pushTitle, pushBody).catch(e => console.error('Google push error:', e));
        }

        res.json({ ...mapEventRow(event), cancelledClasses });
    } catch (error) {
        if (error instanceof z.ZodError) {
            const fieldMessages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
            return res.status(400).json({ error: `Datos inválidos: ${fieldMessages}`, details: error.errors });
        }
        console.error('Update event error:', error);
        res.status(500).json({ error: 'Error al actualizar evento' });
    }
});

// ============================================
// ADMIN: DELETE /api/events/:id - Delete event
// ============================================
router.delete('/:id', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const event = await queryOne(`DELETE FROM events WHERE id = $1 RETURNING id`, [req.params.id]);

        if (!event) {
            return res.status(404).json({ error: 'Evento no encontrado' });
        }

        res.json({ message: 'Evento eliminado' });
    } catch (error) {
        console.error('Delete event error:', error);
        res.status(500).json({ error: 'Error al eliminar evento' });
    }
});

// ============================================
// CLIENT: POST /api/events/:id/register - Register for event
// ============================================
router.post('/:id/register', authenticate, async (req: Request, res: Response) => {
    try {
        const data = RegisterSchema.parse(req.body);
        const eventId = req.params.id;
        const userId = req.user!.userId;

        // Get event
        const event = await queryOne(`SELECT * FROM events WHERE id = $1 AND status = 'published'`, [eventId]);
        if (!event) {
            return res.status(404).json({ error: 'Evento no encontrado o no disponible' });
        }

        // Check if already registered
        const existing = await queryOne(
            `SELECT id, status FROM event_registrations WHERE event_id = $1 AND user_id = $2`,
            [eventId, userId]
        );
        if (existing && existing.status !== 'cancelled') {
            return res.status(400).json({ error: 'Ya estás inscrito en este evento' });
        }

        // Calculate amount
        let amount = parseFloat(event.price) || 0;

        // Check if early bird applies
        if (event.early_bird_price && event.early_bird_deadline) {
            const now = new Date();
            const deadline = new Date(event.early_bird_deadline);
            if (now <= deadline) {
                amount = parseFloat(event.early_bird_price);
            }
        }

        // Check member discount
        if (event.member_discount > 0) {
            const membership = await queryOne(
                `SELECT id FROM memberships WHERE user_id = $1 AND status = 'active'`,
                [userId]
            );
            if (membership) {
                amount = Math.round(amount * (1 - parseFloat(event.member_discount) / 100));
            }
        }

        // Determine status
        const isFree = amount === 0;
        const isFull = (event.registered || 0) >= event.capacity;

        let status: string;
        let waitlistPosition: number | null = null;
        const selectedPaymentMethod: 'card' | 'transfer' | 'cash' | null =
            isFree ? null : ((data.payment_method === 'free' ? 'transfer' : (data.payment_method || 'transfer')) as 'card' | 'transfer' | 'cash');

        if (isFull) {
            // Check if waitlist is enabled
            if (event.waitlist_enabled === false) {
                return res.status(400).json({ error: 'El evento está lleno y no tiene lista de espera habilitada' });
            }
            // Add to waitlist
            const lastWaitlist = await queryOne(
                `SELECT MAX(waitlist_position) as max_pos FROM event_registrations WHERE event_id = $1 AND status = 'waitlist'`,
                [eventId]
            );
            waitlistPosition = (lastWaitlist?.max_pos || 0) + 1;
            status = 'waitlist';
        } else if (isFree) {
            status = 'confirmed';
        } else {
            status = 'pending';
        }

        // If re-registering after cancel, update existing row
        let registration;
        if (existing && existing.status === 'cancelled') {
            registration = await queryOne(
                `UPDATE event_registrations
                 SET name = $1, email = $2, phone = $3, status = $4,
                     amount = $5, payment_method = $6, payment_reference = $7,
                     waitlist_position = $8, paid_at = $9, updated_at = NOW()
                 WHERE id = $10 RETURNING *`,
                [
                    data.name, data.email, data.phone, status,
                    amount, selectedPaymentMethod, data.payment_reference || null,
                    waitlistPosition, isFree ? new Date() : null, existing.id,
                ]
            );
        } else {
            registration = await queryOne(
                `INSERT INTO event_registrations (
                    event_id, user_id, name, email, phone, status,
                    amount, payment_method, payment_reference, waitlist_position, paid_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *`,
                [
                    eventId, userId, data.name, data.email, data.phone, status,
                    amount, selectedPaymentMethod,
                    data.payment_reference || null, waitlistPosition, isFree ? new Date() : null,
                ]
            );
        }

        // For free events (auto-confirmed), update wallet passes
        if (isFree && userId) {
            try {
                const membership = await queryOne<{ id: string }>(
                    `SELECT id FROM memberships WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
                    [userId]
                );
                if (membership) {
                    recordPassUpdate(membership.id, null, null).catch(() => {});
                    notifyAllUserDevices(userId, '🎟️ ¡Registro confirmado!', `Tu lugar en ${event.title} está confirmado.`).catch(() => {});
                    upsertGoogleLoyaltyObject(membership.id).catch(() => {});
                    sendGoogleWalletMessage({ membershipId: membership.id, title: '🎟️ ¡Registro confirmado!', body: `Tu lugar en ${event.title} está confirmado.` }).catch(() => {});
                }
            } catch (err) {
                console.error('Wallet update after free event register error:', err);
            }
        }

        res.status(201).json({
            id: registration.id,
            status: registration.status,
            amount: parseFloat(registration.amount) || 0,
            isFree,
            waitlistPosition: registration.waitlist_position,
            message: isFull
                ? `Te agregamos a la lista de espera (posición ${waitlistPosition})`
                : isFree
                ? '¡Registro confirmado! Te esperamos en el evento.'
                : selectedPaymentMethod === 'cash'
                ? 'Registro pendiente. Puedes pagar en recepción del studio para confirmar tu lugar.'
                : 'Registro pendiente de pago. Una vez confirmado tu pago, recibirás la confirmación.',
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Datos inválidos', details: error.errors });
        }
        console.error('Register for event error:', error);
        res.status(500).json({ error: 'Error al registrarse en el evento' });
    }
});

// ============================================
// CLIENT: DELETE /api/events/:id/register - Cancel registration
// ============================================
router.delete('/:id/register', authenticate, async (req: Request, res: Response) => {
    try {
        const eventId = req.params.id;
        const userId = req.user!.userId;

        // Check if event allows cancellations
        const event = await queryOne(`SELECT allow_cancellations, date, start_time FROM events WHERE id = $1`, [eventId]);
        if (event && event.allow_cancellations === false) {
            return res.status(400).json({ error: 'Este evento no permite cancelaciones' });
        }

        // Check 48h cancellation window
        if (event) {
            const eventDateTime = new Date(`${event.date instanceof Date ? event.date.toISOString().split('T')[0] : event.date}T${event.start_time}`);
            const hoursUntilEvent = (eventDateTime.getTime() - Date.now()) / (1000 * 60 * 60);
            if (hoursUntilEvent < 48) {
                return res.status(400).json({ error: 'No puedes cancelar con menos de 48 horas de anticipación' });
            }
        }

        const registration = await queryOne(
            `UPDATE event_registrations
             SET status = 'cancelled', updated_at = NOW()
             WHERE event_id = $1 AND user_id = $2 AND status IN ('confirmed', 'pending', 'waitlist')
             RETURNING *`,
            [eventId, userId]
        );

        if (!registration) {
            return res.status(404).json({ error: 'No se encontró tu registro en este evento' });
        }

        res.json({ message: 'Registro cancelado exitosamente' });
    } catch (error) {
        console.error('Cancel registration error:', error);
        res.status(500).json({ error: 'Error al cancelar registro' });
    }
});

// ============================================
// ADMIN: GET /api/events/:id/registrations - List registrations
// ============================================
router.get('/:id/registrations', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const registrations = await query(
            `SELECT r.*, u.display_name as user_display_name
             FROM event_registrations r
             LEFT JOIN users u ON r.user_id = u.id
             WHERE r.event_id = $1
             ORDER BY r.created_at ASC`,
            [req.params.id]
        );

        res.json(registrations.map((r) => ({
            id: r.id,
            userId: r.user_id,
            name: r.name,
            email: r.email,
            phone: r.phone || '',
            status: r.status,
            amount: parseFloat(r.amount) || 0,
            paymentMethod: r.payment_method,
            paymentReference: r.payment_reference,
            paidAt: r.paid_at,
            checkedIn: r.checked_in,
            checkedInAt: r.checked_in_at,
            waitlistPosition: r.waitlist_position,
            notes: r.notes,
            createdAt: r.created_at,
        })));
    } catch (error) {
        console.error('List registrations error:', error);
        res.status(500).json({ error: 'Error al obtener inscripciones' });
    }
});

// ============================================
// ADMIN: POST /api/events/:eventId/registrations - Add attendee manually
// ============================================
const AdminAddAttendeeSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional().default(''),
    status: z.enum(['confirmed', 'pending']).optional().default('confirmed'),
    amount: z.number().optional(),
});

router.post('/:eventId/registrations', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const data = AdminAddAttendeeSchema.parse(req.body);
        const { eventId } = req.params;

        const event = await queryOne(`SELECT * FROM events WHERE id = $1`, [eventId]);
        if (!event) {
            return res.status(404).json({ error: 'Evento no encontrado' });
        }

        // Check if already registered
        const existing = await queryOne(
            `SELECT id, status FROM event_registrations WHERE event_id = $1 AND email = $2`,
            [eventId, data.email.toLowerCase()]
        );
        if (existing && existing.status !== 'cancelled') {
            return res.status(400).json({ error: 'Este email ya está registrado en el evento' });
        }

        // Find user by email
        const user = await queryOne<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [data.email.toLowerCase()]);

        const amount = data.amount ?? (parseFloat(event.price) || 0);
        const paidAt = data.status === 'confirmed' ? new Date() : null;

        let registration;
        if (existing && existing.status === 'cancelled') {
            registration = await queryOne(
                `UPDATE event_registrations
                 SET name = $1, email = $2, phone = $3, status = $4, amount = $5,
                     payment_method = 'cash', paid_at = $6, user_id = $7, updated_at = NOW()
                 WHERE id = $8 RETURNING *`,
                [data.name, data.email.toLowerCase(), data.phone, data.status, amount, paidAt, user?.id || null, existing.id]
            );
        } else {
            registration = await queryOne(
                `INSERT INTO event_registrations (event_id, user_id, name, email, phone, status, amount, payment_method, paid_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'cash', $8) RETURNING *`,
                [eventId, user?.id || null, data.name, data.email.toLowerCase(), data.phone, data.status, amount, paidAt]
            );
        }

        // If confirmed and has user, update wallet pass
        console.log(`[EVENT] Admin agregó asistente - email: ${data.email}, status: ${data.status}, user found: ${!!user}, user_id: ${user?.id || 'null'}`);
        if (data.status === 'confirmed' && user?.id) {
            console.log(`[EVENT] Buscando membresía activa para user_id: ${user.id}`);
            try {
                const membership = await queryOne<{ id: string }>(
                    `SELECT id FROM memberships WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
                    [user.id]
                );
                if (membership) {
                    console.log(`[EVENT] Membresía encontrada: ${membership.id} - Actualizando wallet...`);
                    const ev = await queryOne<{ title: string }>(
                        'SELECT title FROM events WHERE id = $1', [eventId]
                    );
                    const evTitle = ev?.title || 'evento';

                    recordPassUpdate(membership.id, null, null)
                        .then(() => console.log('[EVENT] Apple pass update registrado'))
                        .catch(err => console.error('[EVENT] Error Apple pass:', err));
                    notifyAllUserDevices(user.id, '🎟️ ¡Inscripción confirmada!', `Tu lugar en ${evTitle} está confirmado.`)
                        .then(count => console.log(`[EVENT] Push enviado a ${count} dispositivos Apple`))
                        .catch(err => console.error('[EVENT] Error Apple push:', err));
                    upsertGoogleLoyaltyObject(membership.id)
                        .then(r => console.log(`[EVENT] Google wallet: ${r.success ? 'OK' : r.error}`))
                        .catch(err => console.error('[EVENT] Error Google wallet:', err));
                    sendGoogleWalletMessage({ membershipId: membership.id, title: '🎟️ ¡Inscripción confirmada!', body: `Tu lugar en ${evTitle} está confirmado.` })
                        .catch(err => console.error('[EVENT] Error Google message:', err));
                } else {
                    console.log(`[EVENT] No hay membresía activa para user_id: ${user.id}`);
                }
            } catch (err) {
                console.error('[EVENT] Wallet update error:', err);
            }
        }

        res.status(201).json({ message: 'Asistente agregado', registration });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Datos inválidos', details: error.errors });
        }
        console.error('Admin add attendee error:', error);
        res.status(500).json({ error: 'Error al agregar asistente' });
    }
});

// ============================================
// ADMIN: PUT /api/events/:eventId/registrations/:regId - Update registration status
// ============================================
router.put('/:eventId/registrations/:regId', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { status, notes } = req.body;

        const validStatuses = ['confirmed', 'pending', 'waitlist', 'cancelled', 'no_show'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Estado inválido' });
        }

        const updates: string[] = [`status = $1`];
        const values: any[] = [status];
        let idx = 2;

        if (status === 'confirmed') {
            updates.push(`paid_at = COALESCE(paid_at, NOW())`);
        }

        if (notes !== undefined) {
            updates.push(`notes = $${idx++}`);
            values.push(notes);
        }

        values.push(req.params.regId, req.params.eventId);

        const reg = await queryOne(
            `UPDATE event_registrations SET ${updates.join(', ')}, updated_at = NOW()
             WHERE id = $${idx++} AND event_id = $${idx}
             RETURNING *`,
            values
        );

        if (!reg) {
            return res.status(404).json({ error: 'Registro no encontrado' });
        }

        // If confirmed, update wallet passes to show event info
        if (status === 'confirmed' && reg.user_id) {
            console.log(`[EVENT] Confirmación de evento - user_id: ${reg.user_id}`);
            try {
                const membership = await queryOne<{ id: string }>(
                    `SELECT id FROM memberships WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
                    [reg.user_id]
                );
                if (membership) {
                    console.log(`[EVENT] Membresía encontrada: ${membership.id} - Actualizando wallet...`);
                    const event = await queryOne<{ title: string }>(
                        'SELECT title FROM events WHERE id = $1', [req.params.eventId]
                    );
                    const evTitle = event?.title || 'evento';

                    // Apple: update pass + push notification
                    recordPassUpdate(membership.id, null, null)
                        .then(() => console.log('[EVENT] Apple pass update registrado'))
                        .catch(err => console.error('[EVENT] Error Apple pass update:', err));
                    notifyAllUserDevices(
                        reg.user_id,
                        '🎟️ ¡Registro confirmado!',
                        `Tu lugar en ${evTitle} está confirmado. Tu pase se actualizó.`
                    )
                        .then(count => console.log(`[EVENT] Push enviado a ${count} dispositivos Apple`))
                        .catch(err => console.error('[EVENT] Error Apple push:', err));

                    // Google: upsert object + message
                    upsertGoogleLoyaltyObject(membership.id)
                        .then(r => console.log(`[EVENT] Google wallet update: ${r.success ? 'OK' : r.error}`))
                        .catch(err => console.error('[EVENT] Error Google wallet:', err));
                    sendGoogleWalletMessage({
                        membershipId: membership.id,
                        title: '🎟️ ¡Registro confirmado!',
                        body: `Tu lugar en ${evTitle} está confirmado.`,
                    })
                        .then(ok => console.log(`[EVENT] Google wallet message: ${ok ? 'OK' : 'FAIL'}`))
                        .catch(err => console.error('[EVENT] Error Google message:', err));
                } else {
                    console.log(`[EVENT] No se encontró membresía activa para user_id: ${reg.user_id}`);
                }
            } catch (err) {
                console.error('[EVENT] Wallet update after event confirm error:', err);
            }
        } else if (status === 'confirmed') {
            console.log(`[EVENT] Confirmación sin user_id (invitado) - no se actualiza wallet`);
        }

        res.json({ message: 'Registro actualizado', status: reg.status });
    } catch (error) {
        console.error('Update registration error:', error);
        res.status(500).json({ error: 'Error al actualizar registro' });
    }
});

// ============================================
// ADMIN: POST /api/events/:eventId/checkin/:regId - Check in attendee
// ============================================
router.post('/:eventId/checkin/:regId', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const reg = await queryOne(
            `UPDATE event_registrations
             SET checked_in = true, checked_in_at = NOW(), checked_in_by = $1, updated_at = NOW()
             WHERE id = $2 AND event_id = $3
             RETURNING *`,
            [req.user!.userId, req.params.regId, req.params.eventId]
        );

        if (!reg) {
            return res.status(404).json({ error: 'Registro no encontrado' });
        }

        res.json({ message: 'Check-in exitoso', checkedIn: true });
    } catch (error) {
        console.error('Check-in error:', error);
        res.status(500).json({ error: 'Error al realizar check-in' });
    }
});

// ============================================
// CLIENT: PUT /api/events/:id/register/payment - Submit payment proof
// ============================================
router.put('/:id/register/payment', authenticate, async (req: Request, res: Response) => {
    try {
        const eventId = req.params.id;
        const userId = req.user!.userId;

        const { payment_method, transfer_reference, transfer_date, notes, file_data, file_name } = req.body;

        // Find the user's pending registration
        const registration = await queryOne(
            `SELECT id, status FROM event_registrations WHERE event_id = $1 AND user_id = $2 AND status = 'pending'`,
            [eventId, userId]
        );

        if (!registration) {
            return res.status(404).json({ error: 'No se encontró un registro pendiente de pago para este evento' });
        }

        const selectedPaymentMethod = payment_method === 'cash' ? 'cash' : 'transfer';

        if (selectedPaymentMethod === 'transfer' && !transfer_reference && !file_data) {
            return res.status(400).json({ error: 'Debes proporcionar una referencia de transferencia o un comprobante' });
        }

        const updates: string[] = [];
        const values: any[] = [];
        let idx = 1;

        updates.push(`payment_method = $${idx++}`);
        values.push(selectedPaymentMethod);

        if (selectedPaymentMethod === 'cash') {
            // Keep pending status; admin confirms once payment is received at studio.
            updates.push(`payment_reference = NULL`);
            updates.push(`transfer_date = NULL`);
            updates.push(`payment_proof_url = NULL`);
            updates.push(`payment_proof_file_name = NULL`);
        } else {
            if (transfer_reference) {
                updates.push(`payment_reference = $${idx++}`);
                values.push(transfer_reference);
            }

            if (transfer_date) {
                updates.push(`transfer_date = $${idx++}`);
                values.push(transfer_date);
            }

            if (file_data) {
                updates.push(`payment_proof_url = $${idx++}`);
                values.push(file_data);
                if (file_name) {
                    updates.push(`payment_proof_file_name = $${idx++}`);
                    values.push(file_name);
                }
            }
        }

        if (notes) {
            updates.push(`notes = $${idx++}`);
            values.push(notes);
        }

        values.push(registration.id);

        const updated = await queryOne(
            `UPDATE event_registrations SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
            values
        );

        res.json({
            message: selectedPaymentMethod === 'cash'
                ? 'Tu registro quedó marcado para pago en studio. Paga en recepción para confirmar tu lugar.'
                : 'Comprobante enviado exitosamente. Tu pago será verificado pronto.',
            registration: {
                id: updated.id,
                status: updated.status,
                paymentReference: updated.payment_reference,
                paymentProofUrl: updated.payment_proof_url ? true : false,
            },
        });
    } catch (error) {
        console.error('Submit event payment proof error:', error);
        res.status(500).json({ error: 'Error al enviar comprobante de pago' });
    }
});

// ============================================
// HELPER: Cancel classes that overlap with an event
// ============================================
async function cancelOverlappingClasses(
    date: string,
    startTime: string,
    endTime: string,
    cancelledBy: string,
    eventTitle: string
) {
    const overlapping = await query(
        `SELECT id FROM classes
         WHERE date = $1 AND status = 'scheduled'
           AND start_time < $2 AND end_time > $3`,
        [date, endTime, startTime]
    );

    const results = [];
    for (const cls of overlapping) {
        const result = await cancelClassWithRefunds(
            cls.id,
            cancelledBy,
            `Cancelada por evento: ${eventTitle}`
        );
        results.push({ classId: cls.id, ...result });
    }
    return results;
}

export default router;
