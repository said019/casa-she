import { Router, Request, Response } from 'express';
import { query, queryOne, pool } from '../config/database.js';
import { logAction } from '../lib/audit.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { z } from 'zod';
import { resolveRequestFacility } from '../lib/requestFacility.js';
import { sendBookingConfirmation, sendCancellationNotice, sendWhatsAppMessage } from '../lib/whatsapp.js';
import { sendBookingConfirmationEmail } from '../services/email.js';
import { notifyAllUserDevices } from '../lib/apple-wallet.js';
import { upsertGoogleLoyaltyObject } from '../lib/google-wallet.js';
import { studioBookingError } from '../lib/membershipStudio.js';
import { selectMembershipForBooking, toDbClient, pickBestMembership } from '../lib/membershipSelection.js';
import { awardCheckinPoints } from '../lib/loyalty.js';
import { joinWaitlist, waitlistOffer, compactWaitlist, promoteNextFromWaitlist } from '../lib/waitlist.js';

const router = Router();

// Schema for Creating Booking
const CreateBookingSchema = z.object({
    classId: z.string().uuid(),
    membershipId: z.string().uuid().optional(), // Optional, if not provided we auto-select
    waitlist: z.boolean().optional(), // true = anotarse en lista de espera si la clase está llena
});

// ============================================
// GET /api/bookings - List bookings (Admin / Instructor / Reception)
// ============================================
router.get('/', authenticate, requireRole('admin', 'instructor', 'reception'), async (req: Request, res: Response) => {
    try {
        const { status, search, startDate, endDate } = req.query;

        // Facility scoping: reception is always limited to their assigned facility;
        // admin/instructor may optionally filter by ?facility_id=
        let facilityFilter: string | null = null;
        if (req.user?.role === 'reception') {
            const scope = await resolveRequestFacility(req.user, (req.query.facility_id as string) || null);
            if (scope.kind === 'error') return res.status(scope.status).json({ error: scope.message });
            if (scope.kind === 'facility') facilityFilter = scope.facilityId;
        } else if (req.query.facility_id) {
            facilityFilter = req.query.facility_id as string;
        }

        let queryStr = `
      SELECT
        b.id as booking_id,
        b.folio as folio,
        b.status as booking_status,
        b.created_at,
        b.checked_in_at,
        b.waitlist_position,
        u.id as user_id,
        u.display_name as user_name,
        u.email as user_email,
        u.phone as user_phone,
        c.id as class_id,
        c.date as class_date,
        c.start_time as class_start_time,
        c.end_time as class_end_time,
        ct.name as class_name,
        i.display_name as instructor_name,
        m.id as membership_id,
        p.name as plan_name,
        b.is_free_booking,
        b.booked_by,
        bb.display_name as booked_by_name,
        bb.role as booked_by_role,
        cb.display_name as checked_in_by_name,
        xb.display_name as cancelled_by_name,
        b.cancelled_at,
        b.cancellation_reason,
        f.name as facility_name
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      LEFT JOIN users bb ON bb.id = b.booked_by
      LEFT JOIN users cb ON cb.id = b.checked_in_by
      LEFT JOIN users xb ON xb.id = b.cancelled_by
      JOIN classes c ON b.class_id = c.id
      JOIN class_types ct ON c.class_type_id = ct.id
      JOIN instructors i ON c.instructor_id = i.id
      LEFT JOIN facilities f ON c.facility_id = f.id
      LEFT JOIN memberships m ON b.membership_id = m.id
      LEFT JOIN plans p ON m.plan_id = p.id
      WHERE 1=1
    `;

        const params: any[] = [];
        let paramCount = 1;

        if (status) {
            queryStr += ` AND b.status = $${paramCount++}`;
            params.push(status);
        }

        if (search) {
            queryStr += ` AND (
        u.display_name ILIKE $${paramCount} OR
        u.email ILIKE $${paramCount} OR
        ct.name ILIKE $${paramCount}
      )`;
            params.push(`%${search}%`);
            paramCount++;
        }

        if (startDate) {
            queryStr += ` AND c.date >= $${paramCount++}`;
            params.push(startDate);
        }

        if (endDate) {
            queryStr += ` AND c.date <= $${paramCount++}`;
            params.push(endDate);
        }

        // Filtro por usuario (útil para ver el historial/futuro de un cliente específico).
        const userIdFilter = req.query.userId as string | undefined;

        // El scope de sucursal aplica a la lista GENERAL (check-in del día en su sucursal), pero NO
        // cuando se piden las reservas de UN cliente concreto: ahí recepción debe ver TODAS sus
        // reservas, porque la clienta puede reservar en cualquier sucursal (antes se le escondían,
        // p.ej., las de San Miguel al entrar como recepción Tepa).
        if (facilityFilter && !userIdFilter) {
            queryStr += ` AND c.facility_id = $${paramCount++}`;
            params.push(facilityFilter);
        }

        if (userIdFilter) {
            queryStr += ` AND b.user_id = $${paramCount++}`;
            params.push(userIdFilter);
        }

        // Paginación compatible: la respuesta sigue siendo un array, pero acotada.
        // Por defecto los 200 más recientes; ?limit (máx 500) y ?offset para paginar.
        const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '200'), 10) || 200, 1), 500);
        const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);
        queryStr += ` ORDER BY c.date DESC, c.start_time DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
        params.push(limit, offset);

        const bookings = await query(queryStr, params);
        const formattedBookings = bookings.map((b: any) => ({
            ...b,
            class_date: b.class_date instanceof Date ? b.class_date.toISOString().split('T')[0] : b.class_date
        }));
        res.json(formattedBookings);
    } catch (error) {
        console.error('List bookings error:', error);
        res.status(500).json({ error: 'Error al listar reservas' });
    }
});

// Schema for Bulk Booking (Monthly) — Admin only
const BulkBookingSchema = z.object({
    scheduleId: z.string().uuid(),
    userId: z.string().uuid(),
    month: z.number().int().min(0).max(11),
    year: z.number().int().min(2024).max(2099),
    membershipId: z.string().uuid().optional(),
    selectedDates: z
        .array(z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Formato YYYY-MM-DD'))
        .max(40)
        .optional(),
});

// ============================================
// POST /api/bookings/bulk-month - Create multiple bookings for a month (Admin)
// Allows admin to pick specific dates via selectedDates[]
// ============================================
router.post('/bulk-month', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    const validation = BulkBookingSchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(400).json({ error: 'Datos inválidos', details: validation.error.flatten().fieldErrors });
    }

    const { scheduleId, userId, month, year, membershipId, selectedDates } = validation.data;

    const now = new Date();
    const startOfMonthDate = new Date(year, month, 1);
    const endOfMonthDate = new Date(year, month + 1, 0);

    let effectiveStart = startOfMonthDate;
    if (now.getMonth() === month && now.getFullYear() === year) {
        effectiveStart = now;
    } else if (endOfMonthDate < now) {
        return res.status(400).json({ error: 'El mes seleccionado ya ha pasado.' });
    } else if (startOfMonthDate < now) {
        effectiveStart = now;
    }

    const startDateStr = effectiveStart.toISOString().split('T')[0];
    const endDateStr = endOfMonthDate.toISOString().split('T')[0];

    // Fetch schedule details (read-only, fine outside tx)
    const schedule = await queryOne<any>(
        `SELECT * FROM schedules WHERE id = $1 AND is_active = true`,
        [scheduleId]
    );

    if (!schedule) {
        return res.status(404).json({ error: 'Horario no encontrado o inactivo.' });
    }

    // Resolve class category once — all classes in a bulk-month share the same class_type
    const classTypeRow = await queryOne<{ category: 'reformer' | 'multi' }>(
        `SELECT category FROM class_types WHERE id = $1`,
        [schedule.class_type_id]
    );
    if (!classTypeRow) {
        return res.status(400).json({ error: 'No se pudo determinar la categoría del tipo de clase.' });
    }
    const bulkCategory: 'reformer' | 'multi' = classTypeRow.category;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Lock candidate classes FOR UPDATE to prevent overbooking races.
        // Match by class type + start time + day of week — schedule_id and instructor
        // are inconsistently populated on generated classes.
        const classSelectSql = `
            SELECT c.id, c.date, c.start_time, c.end_time,
                   c.max_capacity, c.current_bookings,
                   ct.name as class_type_name,
                   i.display_name as instructor_name
            FROM classes c
            JOIN class_types ct ON c.class_type_id = ct.id
            JOIN instructors i ON c.instructor_id = i.id
            WHERE c.class_type_id = $1
              AND SUBSTRING(c.start_time::text, 1, 5) = $2
              AND EXTRACT(DOW FROM c.date) = $3
              AND c.date >= $4 AND c.date <= $5
              AND c.status = 'scheduled'
              AND c.booking_closed = false
              AND c.current_bookings < c.max_capacity
            ORDER BY c.date ASC
            FOR UPDATE OF c
        `;

        const classesResult = await client.query(classSelectSql, [
            schedule.class_type_id,
            String(schedule.start_time).substring(0, 5),
            schedule.day_of_week,
            startDateStr,
            endDateStr,
        ]);
        let classesToBook: any[] = classesResult.rows;

        if (classesToBook.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'No se encontraron clases programadas para este horario en el mes seleccionado.' });
        }

        if (selectedDates && selectedDates.length > 0) {
            const selectedSet = new Set(selectedDates.map(d => d.split('T')[0]));
            classesToBook = classesToBook.filter((c: any) => {
                const cDate = c.date instanceof Date
                    ? c.date.toISOString().split('T')[0]
                    : String(c.date).split('T')[0];
                return selectedSet.has(cDate);
            });

            if (classesToBook.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Ninguna de las fechas seleccionadas tiene clases disponibles.' });
            }
        }

        // Exclude classes already booked by the user (non-cancelled)
        const classIds = classesToBook.map((c: any) => c.id);
        const existingResult = await client.query(
            `SELECT class_id FROM bookings
             WHERE user_id = $1 AND status != 'cancelled' AND class_id = ANY($2::uuid[])`,
            [userId, classIds]
        );
        const existingClassIds = new Set(existingResult.rows.map((b: any) => b.class_id));
        let targetClasses = classesToBook.filter((c: any) => !existingClassIds.has(c.id));

        if (targetClasses.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'El usuario ya tiene reservas para todas las clases seleccionadas.' });
        }

        // Pick membership. The RANKING ignores end_date (admin owns scheduling),
        // but the chosen membership's vigencia IS enforced on the class set below:
        // clases posteriores al end_date se excluyen. classes_remaining IS NULL =
        // unlimited → válido. Ranking via shared pickBestMembership
        // (bounded-before-unlimited, soonest end_date, oldest created_at).
        const bulkCatCol = bulkCategory === 'reformer' ? 'reformer_remaining' : 'multi_remaining';
        let membership: any = null;
        if (membershipId) {
            const { rows } = await client.query(
                `SELECT * FROM memberships WHERE id = $1 AND user_id = $2 FOR UPDATE`,
                [membershipId, userId]
            );
            membership = rows[0] || null;
        } else {
            // Bulk SELECTION ignores end_date for ranking (the chosen membership's
            // vigencia is enforced on the class set below). We keep the local query
            // and centralize RANKING via the shared pickBestMembership. classFacilityId=null:
            // bulk classes may span studios, so only unbound/unlimited
            // memberships are studio-eligible (matches prior bulk behavior).
            const { rows } = await client.query(
                `SELECT m.*,
                        COALESCE(m.facility_id, o.facility_id) AS bound_facility_id
                 FROM memberships m
                 LEFT JOIN orders o ON o.id = m.order_id
                 WHERE m.user_id = $1 AND m.status = 'active'
                   AND (m.${bulkCatCol} IS NULL OR m.${bulkCatCol} >= $2)
                 FOR UPDATE OF m`,
                [userId, targetClasses.length]
            );
            const candidates = rows.map((r: any) => ({
                id: r.id,
                reformer_remaining: r.reformer_remaining ?? null,
                multi_remaining: r.multi_remaining ?? null,
                end_date: r.end_date ? new Date(r.end_date).toISOString() : null,
                created_at: new Date(r.created_at).toISOString(),
                bound_facility_id: r.bound_facility_id ?? null,
            }));
            const winner = pickBestMembership(candidates, bulkCategory, null);
            membership = winner ? rows.find((r: any) => r.id === winner.id) ?? null : null;
        }

        if (!membership) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'No se encontró una membresía válida con suficientes créditos para las clases seleccionadas.' });
        }

        // Vigencia: el dueño quiere bloquear reservas en clases posteriores al vencimiento
        // EN TODOS LADOS, incluido el agendado masivo. Se excluyen las clases cuyo día es
        // posterior al end_date de la membresía elegida. NULL end_date = ilimitado (no filtra).
        const bulkEndDate: string | null = membership.end_date
            ? (membership.end_date instanceof Date
                ? membership.end_date.toISOString().split('T')[0]
                : String(membership.end_date).split('T')[0])
            : null;
        if (bulkEndDate) {
            targetClasses = targetClasses.filter((c: any) => {
                const cDate = c.date instanceof Date
                    ? c.date.toISOString().split('T')[0]
                    : String(c.date).split('T')[0];
                return cDate <= bulkEndDate;
            });
            if (targetClasses.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'La membresía vence antes de las fechas seleccionadas. No hay clases dentro de la vigencia.' });
            }
        }

        const bulkCatRemaining = membership[bulkCatCol];
        if (bulkCatRemaining !== null && bulkCatRemaining < targetClasses.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `Membresía insuficiente. Se requieren ${targetClasses.length} créditos de ${bulkCategory === 'reformer' ? 'Reformer' : 'Multiclases'}, tiene ${bulkCatRemaining}.`
            });
        }

        // Deduct credits from the category bucket (only if bounded, i.e. not NULL=unlimited)
        if (bulkCatRemaining !== null) {
            await client.query(
                `UPDATE memberships SET ${bulkCatCol} = ${bulkCatCol} - $1 WHERE id = $2`,
                [targetClasses.length, membership.id]
            );
        }

        // Create bookings. The DB trigger update_class_booking_count auto-increments
        // classes.current_bookings, so we don't bump it manually here.
        // consumed_category is set when a credit was deducted (non-NULL bucket); NULL when unlimited.
        const bulkConsumedCategory: 'reformer' | 'multi' | null = bulkCatRemaining !== null ? bulkCategory : null;
        const bookingIds: string[] = [];
        for (const cls of targetClasses) {
            const { rows } = await client.query(
                `INSERT INTO bookings (class_id, user_id, membership_id, status, consumed_category, booked_by)
                 VALUES ($1, $2, $3, 'confirmed', $4, $5) RETURNING id`,
                [cls.id, userId, membership.id, bulkConsumedCategory, req.user?.userId ?? null]
            );
            bookingIds.push(rows[0].id);
        }

        await client.query('COMMIT');

        // --- Side effects AFTER commit (failures here don't rollback reservations) ---
        // WhatsApp de resumen de reserva múltiple DESACTIVADO (política 2026-06-23:
        // solo 3 mensajes por WhatsApp).

        return res.json({
            success: true,
            bookedCount: bookingIds.length,
            message: `Se han agendado ${bookingIds.length} clase${bookingIds.length !== 1 ? 's' : ''} exitosamente.`,
        });
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch { /* ignore */ }
        console.error('Bulk booking error:', error);
        return res.status(500).json({ error: 'Error al procesar reserva masiva' });
    } finally {
        client.release();
    }
});

// ============================================
// POST /api/bookings - Create a booking
// ============================================
router.post('/', authenticate, async (req: Request, res: Response) => {
    const userId = req.user?.userId;

    if (!userId) {
        return res.status(401).json({ error: 'No autorizado' });
    }

    try {
        const validation = CreateBookingSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: 'Datos inválidos', details: validation.error.flatten().fieldErrors });
        }

        // Interruptor global (admin / recepción master): si las reservas están apagadas,
        // la clienta no puede agendar por su cuenta (recepción sí, vía admin-book).
        const bookingSwitch = await queryOne<{ value: any }>(
            `SELECT value FROM system_settings WHERE key = 'booking_enabled'`
        );
        if (bookingSwitch?.value?.enabled === false) {
            return res.status(403).json({
                error: 'Las reservas están pausadas por el estudio. Escríbenos a recepción para agendar.',
                code: 'BOOKING_DISABLED',
            });
        }

        const { classId, waitlist } = validation.data;
        let { membershipId } = validation.data;

        // 1. Get Class Details (check capacity)
        const classDetails = await queryOne(
            `SELECT c.*, ct.category AS class_category
               FROM classes c
               JOIN class_types ct ON ct.id = c.class_type_id
              WHERE c.id = $1`,
            [classId]
        );

        if (!classDetails) return res.status(404).json({ error: 'Clase no encontrada' });
        if (classDetails.status !== 'scheduled') return res.status(400).json({ error: 'Esta clase no esta disponible' });
        if (classDetails.booking_closed) return res.status(400).json({ error: 'Esta clase está cerrada para nuevas reservas' });
        if (classDetails.current_bookings >= classDetails.max_capacity) {
            if (waitlist === true) {
                const joined = await joinWaitlist({ userId, classId });
                if (!joined.ok) {
                    return res.status(joined.status).json({ error: joined.error, ...(joined.code ? { code: joined.code } : {}) });
                }
                return res.status(201).json(joined.booking);
            }
            const offer = await waitlistOffer(classId);
            return res.status(400).json({ error: 'Clase llena', ...offer });
        }

        // Check if studio is closed on this date
        const classDateStr = classDetails.date instanceof Date
            ? classDetails.date.toISOString().split('T')[0]
            : String(classDetails.date).split('T')[0];
        const closedDay = await queryOne(
            `SELECT id, reason FROM studio_closed_days WHERE date = $1`,
            [classDateStr]
        );
        if (closedDay) {
            return res.status(400).json({
                error: `El estudio está cerrado este día: ${closedDay.reason || 'Día inhábil'}`
            });
        }

        // Check if class is in the past
        const now = new Date();
        // Format date properly - classDetails.date might be a Date object or string
        let dateStr: string;
        if (classDetails.date instanceof Date) {
            // Get local date parts to avoid UTC shift
            const d = classDetails.date;
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            dateStr = `${year}-${month}-${day}`;
        } else {
            // If it's already a string, take the date part
            dateStr = String(classDetails.date).split('T')[0];
        }

        const timeStr = classDetails.start_time.substring(0, 5); // HH:MM

        // Create class datetime in Mexico timezone (UTC-6)
        // The class time is stored in local Mexico time, so we need to compare properly
        // We construct an ISO string with the offset to ensure precise comparison
        const classDateTime = new Date(`${dateStr}T${timeStr}:00-06:00`);

        // Debug log
        console.log('Booking time check:', {
            now: now.toISOString(),
            classDate: dateStr,
            classTime: timeStr,
            classDateTime: classDateTime.toISOString(),
            isPast: classDateTime < now
        });

        if (isNaN(classDateTime.getTime())) {
            console.error('Invalid class date generated', { dateStr, timeStr });
            return res.status(500).json({ error: 'Error interno: Fecha de clase inválida' });
        }

        if (now >= classDateTime) {
            return res.status(400).json({
                error: 'No puedes reservar esta clase, el horario ya pasó.'
            });
        }

        // ============================================
        // LÍMITES DE RESERVA CONFIGURABLES (booking_policies)
        // Solo aplican al AUTO-SERVICIO de la clienta. El staff (admin / super_admin /
        // recepción) entra por /admin-book o /bulk-month — pero si llegara a pegarle a
        // este POST, lo dejamos pasar igual que el resto del flujo de cliente. Replica
        // el criterio del gate `booking_enabled`: el path de cliente es el que tiene
        // rol 'client'. Leemos el valor CRUDO de la key (sin inyectar defaults) para
        // NO cambiar el comportamiento actual cuando una política no está configurada.
        // ============================================
        if (req.user?.role === 'client') {
            // Reglamento obligatorio: la clienta debe haberlo aceptado antes de su 1ra reserva.
            const reg = await queryOne<{ reglamento_accepted_at: string | null }>(
                `SELECT reglamento_accepted_at FROM users WHERE id = $1`,
                [req.user.userId]
            );
            if (!reg?.reglamento_accepted_at) {
                return res.status(403).json({
                    error: 'Debes aceptar el reglamento antes de reservar tu primera clase.',
                    code: 'REGLAMENTO_REQUIRED',
                });
            }

            const polRow = await queryOne<{ value: any }>(
                `SELECT value FROM system_settings WHERE key = 'booking_policies'`
            );
            const pol = polRow?.value ?? {};

            // min_hours_before_booking: si > 0 y la clase empieza en menos de N horas → 400.
            const minHours = Number(pol.min_hours_before_booking ?? 0);
            if (minHours > 0) {
                const hoursUntilClass = (classDateTime.getTime() - now.getTime()) / 3_600_000;
                if (hoursUntilClass < minHours) {
                    return res.status(400).json({
                        error: `Debes reservar con al menos ${minHours} hora${minHours === 1 ? '' : 's'} de anticipación.`,
                    });
                }
            }

            // max_advance_days: si > 0 y la fecha de la clase es posterior a (hoy + N días) → 400.
            // Comparamos por día calendario (zona México), igual que dateStr/now del archivo.
            const maxAdvance = Number(pol.max_advance_days ?? 0);
            if (maxAdvance > 0) {
                const todayMx = new Date(
                    now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' })
                );
                const lastAllowed = new Date(todayMx);
                lastAllowed.setHours(0, 0, 0, 0);
                lastAllowed.setDate(lastAllowed.getDate() + maxAdvance);
                const yyyy = lastAllowed.getFullYear();
                const mm = String(lastAllowed.getMonth() + 1).padStart(2, '0');
                const dd = String(lastAllowed.getDate()).padStart(2, '0');
                const lastAllowedStr = `${yyyy}-${mm}-${dd}`;
                if (dateStr > lastAllowedStr) {
                    return res.status(400).json({
                        error: `Solo puedes reservar con hasta ${maxAdvance} día${maxAdvance === 1 ? '' : 's'} de anticipación.`,
                    });
                }
            }

            // max_bookings_per_day: ILIMITADO si ≤ 0 o null. Si > 0, cuenta las reservas
            // activas (booked/confirmed, NO canceladas) de esta clienta para clases del
            // MISMO día calendario (classes.date guarda la fecha local de México).
            const maxPerDay = Number(pol.max_bookings_per_day ?? 0);
            if (maxPerDay > 0) {
                // status activos = los que ocupan un lugar ese día (mismo criterio que
                // nómina/coach-payroll): 'confirmed' y 'checked_in'. Excluye waitlist,
                // cancelled y no_show.
                const cntRow = await queryOne<{ n: string }>(
                    `SELECT COUNT(*) AS n
                       FROM bookings b
                       JOIN classes c ON c.id = b.class_id
                      WHERE b.user_id = $1
                        AND c.date = $2::date
                        AND b.status IN ('confirmed', 'checked_in')`,
                    [userId, dateStr]
                );
                if (Number(cntRow?.n ?? 0) >= maxPerDay) {
                    return res.status(400).json({
                        error: `Alcanzaste el máximo de ${maxPerDay} reserva${maxPerDay === 1 ? '' : 's'} por día.`,
                    });
                }
            }
        }

        // === FREE CLASS PATH: skip membership check entirely ===
        const isFreeClass = !!classDetails.is_free;

        // ---- Transactional critical region ----
        // The duplicate-booking check, membership selection (FOR UPDATE lock),
        // credit re-fetch, credit decrement and booking INSERT must all run on a
        // single connection inside one transaction so the row lock is held and
        // the credit-deduction / double-booking races are eliminated.
        const client = await pool.connect();
        let clientReleased = false;
        const releaseClient = () => {
            if (!clientReleased) {
                clientReleased = true;
                client.release();
            }
        };

        let newBooking: any;
        let consumedCategory: 'reformer' | 'multi' | null = null;
        try {
            await client.query('BEGIN');

            // 2. Check for existing booking (inside tx — closes double-booking race)
            const existing = await client.query(
                `SELECT id FROM bookings WHERE class_id = $1 AND user_id = $2 AND status != 'cancelled'`,
                [classId, userId]
            );
            if (existing.rows.length > 0) {
                await client.query('ROLLBACK');
                releaseClient();
                return res.status(400).json({ error: 'Ya tienes una reserva para esta clase' });
            }

            if (!isFreeClass) {
                if (membershipId) {
                    // Explicit membership: validate ownership, status, credits, studio.
                    const membershipRes = await client.query(
                        `SELECT m.*, COALESCE(m.facility_id, o.facility_id) AS bound_facility_id,
                                f.name AS bound_facility_name
                         FROM memberships m
                         LEFT JOIN orders o ON o.id = m.order_id
                         LEFT JOIN facilities f ON f.id = COALESCE(m.facility_id, o.facility_id)
                         WHERE m.id = $1 AND m.user_id = $2`,
                        [membershipId, userId]
                    );
                    const membership = membershipRes.rows[0];
                    if (!membership) {
                        await client.query('ROLLBACK');
                        releaseClient();
                        return res.status(403).json({ error: 'Membresía inválida' });
                    }
                    if (membership.status !== 'active') {
                        await client.query('ROLLBACK');
                        releaseClient();
                        return res.status(403).json({ error: 'Membresía no activa' });
                    }
                    // Vigencia vs la fecha de la CLASE: si la membresía vence antes del día
                    // de la clase, no se puede usar para reservarla. NULL = ilimitado (válido).
                    const mEnd = membership.end_date
                        ? (membership.end_date instanceof Date
                            ? membership.end_date.toISOString().split('T')[0]
                            : String(membership.end_date).split('T')[0])
                        : null;
                    if (mEnd && mEnd < dateStr) {
                        await client.query('ROLLBACK');
                        releaseClient();
                        return res.status(403).json({ error: 'Membresía vencida para la fecha de la clase' });
                    }
                    const cat: 'reformer' | 'multi' = classDetails.class_category;
                    const catCol = cat === 'reformer' ? 'reformer_remaining' : 'multi_remaining';
                    const catRemaining = membership[catCol];
                    if (catRemaining !== null && catRemaining <= 0) {
                        await client.query('ROLLBACK');
                        releaseClient();
                        return res.status(403).json({
                            error: `Tu membresía no incluye clases de ${cat === 'reformer' ? 'Reformer' : 'Multiclases'} o ya no te quedan créditos.`,
                        });
                    }
                    const studioErr = studioBookingError(
                        membership.bound_facility_id ?? null,
                        classDetails.facility_id ?? null,
                        membership.bound_facility_name ?? null
                    );
                    if (studioErr) {
                        await client.query('ROLLBACK');
                        releaseClient();
                        return res.status(422).json({ error: studioErr });
                    }
                } else {
                    // Auto-select: studio filtering happens inside the selector, so a
                    // valid mixto is used instead of being blocked by an individual
                    // bound to a different studio. Runs on the transactional
                    // connection so its FOR UPDATE lock is actually held.
                    const picked = await selectMembershipForBooking({
                        db: toDbClient(client),
                        userId: userId as string,
                        category: classDetails.class_category,
                        classFacilityId: classDetails.facility_id ?? null,
                        requiredCredits: 1,
                        classDate: dateStr,
                    });
                    if (!picked) {
                        await client.query('ROLLBACK');
                        releaseClient();
                        return res.status(400).json({
                            error: 'No tienes una membresía válida con créditos para una clase en este estudio.'
                        });
                    }
                    membershipId = picked.id;
                }

                // Deduct credit only for paid classes (category-aware)
                const cat2: 'reformer' | 'multi' = classDetails.class_category;
                const catCol2 = cat2 === 'reformer' ? 'reformer_remaining' : 'multi_remaining';
                const creditRes = await client.query(
                    `SELECT ${catCol2} AS remaining FROM memberships WHERE id = $1`,
                    [membershipId]
                );
                const creditRow = creditRes.rows[0];
                if (creditRow && creditRow.remaining !== null) {
                    // Self-guarding decrement: only deducts when a credit is
                    // actually available. If a concurrent booking won the race
                    // and consumed the last credit, rowCount will be 0.
                    const dec = await client.query(
                        `UPDATE memberships SET ${catCol2} = ${catCol2} - 1 WHERE id = $1 AND ${catCol2} > 0`,
                        [membershipId]
                    );
                    if (dec.rowCount === 0) {
                        await client.query('ROLLBACK');
                        releaseClient();
                        return res.status(403).json({ error: 'Sin créditos disponibles en esta membresía' });
                    }
                    consumedCategory = cat2;
                }
            } else {
                // Free class: no membership required, no credit deducted
                membershipId = null as any;
            }

            // Insert booking (membership_id null for free classes)
            const insertRes = await client.query(
                `INSERT INTO bookings (class_id, user_id, membership_id, status, is_free_booking, consumed_category, booked_by)
             VALUES ($1, $2, $3, 'confirmed', $4, $5, $6)
             RETURNING *`,
                [classId, userId, membershipId, isFreeClass, consumedCategory, userId]
            );
            newBooking = insertRes.rows[0];

            await client.query('COMMIT');
        } catch (txErr) {
            try { await client.query('ROLLBACK'); } catch { /* ignore */ }
            throw txErr;
        } finally {
            releaseClient();
        }

        // Note: trigger_update_booking_count updates the classes table count automatically.

        // Send booking confirmation (WhatsApp + email) — async, don't block response
        try {
            const notifSettings = await queryOne(
                "SELECT value FROM system_settings WHERE key = 'notification_settings'"
            );
            const shouldSend = notifSettings?.value?.send_booking_confirmation !== false;

            // Horas mínimas para cancelar (política real) para el texto del correo.
            const cancelPolicy = await queryOne<{ value: { min_hours?: number } }>(
                "SELECT value FROM system_settings WHERE key = 'cancellation_policy'"
            );
            const cancelHours = Number(cancelPolicy?.value?.min_hours ?? 4);

            if (shouldSend) {
                const user = await queryOne<{ display_name: string; phone: string; email: string }>(
                    'SELECT display_name, phone, email FROM users WHERE id = $1',
                    [userId]
                );
                const classInfo = await queryOne<any>(`
                    SELECT ct.name as class_name, c.date, c.start_time, c.end_time,
                           i.display_name as instructor_name,
                           f.name as facility_name
                    FROM classes c
                    JOIN class_types ct ON c.class_type_id = ct.id
                    JOIN instructors i ON c.instructor_id = i.id
                    LEFT JOIN facilities f ON c.facility_id = f.id
                    WHERE c.id = $1
                `, [classId]);

                if (classInfo) {
                    const isoDate = classInfo.date instanceof Date
                        ? `${classInfo.date.getUTCFullYear()}-${String(classInfo.date.getUTCMonth()+1).padStart(2,'0')}-${String(classInfo.date.getUTCDate()).padStart(2,'0')}`
                        : String(classInfo.date).split('T')[0];
                    const startHm = classInfo.start_time?.substring(0, 5);

                    if (user?.phone) {
                        const classDateEs = new Date(isoDate + 'T00:00:00').toLocaleDateString('es-MX');
                        sendBookingConfirmation(
                            user.phone,
                            user.display_name,
                            classInfo.class_name,
                            classDateEs,
                            startHm,
                            undefined,
                            classInfo.facility_name || undefined
                        ).catch(err => console.error('[WhatsApp] Error sending booking confirmation:', err));
                    }
                    if (user?.email) {
                        sendBookingConfirmationEmail({
                            to: user.email,
                            clientName: user.display_name || 'Cliente',
                            className: classInfo.class_name,
                            instructorName: classInfo.instructor_name || null,
                            classDate: isoDate,
                            classStartTime: classInfo.start_time,
                            classEndTime: classInfo.end_time,
                            facilityName: classInfo.facility_name || null,
                            cancelHours,
                        }).catch(err => console.error('[email] booking confirmation:', err));
                    }
                }
            }
        } catch (notifErr) {
            console.error('[notifications] booking confirm non-blocking error:', notifErr);
        }

        // Update Apple + Google Wallet passes (credits changed)
        notifyAllUserDevices(userId, '✅ Reserva confirmada', 'Tu pase se actualizó con tu nueva reserva')
            .catch(e => console.error('Apple Wallet booking notify error:', e));
        if (membershipId) {
            upsertGoogleLoyaltyObject(membershipId).catch(e => console.error('Google Wallet booking error:', e));
        }

        res.status(201).json(newBooking);

    } catch (error) {
        console.error('Create booking error:', error);
        res.status(500).json({ error: 'Error al procesar reserva' });
    }
});

// ============================================
// POST /api/bookings/admin-book - Admin creates booking for a specific user
// ============================================
router.post('/admin-book', authenticate, requireRole('admin', 'super_admin', 'reception'), async (req: Request, res: Response) => {
    const { classId, userId, force } = req.body;
    // Forzar sobrecupo (meter a alguien aunque la clase esté llena) es SOLO admin/super_admin
    // (decisión de la dueña: "solo admin"). Recepción NO puede forzar.
    const canForce = req.user?.role === 'admin' || req.user?.role === 'super_admin';
    const forcing = force === true && canForce;

    if (!classId || !userId) {
        return res.status(400).json({ error: 'classId y userId son requeridos' });
    }

    try {
        const classDetails = await queryOne(
            `SELECT c.*, ct.category AS class_category
               FROM classes c JOIN class_types ct ON ct.id = c.class_type_id
              WHERE c.id = $1`,
            [classId]
        );

        if (!classDetails) return res.status(404).json({ error: 'Clase no encontrada' });
        if (classDetails.status === 'cancelled') return res.status(400).json({ error: 'Esta clase está cancelada' });
        // NOTA: el candado `booking_closed` solo frena las auto-reservas de clientes.
        // Admin y recepción SÍ pueden agendar a un cliente aunque la clase esté cerrada.
        // Cupo lleno: bloquea salvo que un admin lo fuerce explícitamente (sobrecupo).
        if (classDetails.current_bookings >= classDetails.max_capacity && !forcing) {
            return res.status(400).json({ error: 'Clase llena' });
        }

        const isFreeClass = !!classDetails.is_free;
        // "Invitada": el staff marca ESTA reserva como gratis (cortesía/convenio) — sin plan
        // y sin descontar crédito, aunque la clase no sea gratis para todas.
        const freeBooking = isFreeClass || req.body.free === true;

        // Fecha de la clase (YYYY-MM-DD, en hora local para no recorrer un día por UTC),
        // para que el motor compare la vigencia de la membresía contra el día de la clase.
        let adminClassDateStr: string;
        if (classDetails.date instanceof Date) {
            const d = classDetails.date;
            adminClassDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        } else {
            adminClassDateStr = String(classDetails.date).split('T')[0];
        }

        // Igual que la reserva del cliente: consume 1 crédito (por categoría) de la mejor
        // membresía del usuario. Transacción + FOR UPDATE para evitar carreras.
        const client = await pool.connect();
        let released = false;
        const release = () => { if (!released) { released = true; client.release(); } };
        let newBooking: any;
        let membershipId: string | null = null;
        let consumedCategory: 'reformer' | 'multi' | null = null;
        try {
            await client.query('BEGIN');

            const existing = await client.query(
                `SELECT id FROM bookings WHERE class_id = $1 AND user_id = $2 AND status != 'cancelled'`,
                [classId, userId]
            );
            if (existing.rows.length > 0) {
                await client.query('ROLLBACK'); release();
                return res.status(400).json({ error: 'Este usuario ya tiene una reserva para esta clase' });
            }

            if (!freeBooking) {
                const picked = await selectMembershipForBooking({
                    db: toDbClient(client),
                    userId: userId as string,
                    category: classDetails.class_category,
                    classFacilityId: classDetails.facility_id ?? null,
                    requiredCredits: 1,
                    classDate: adminClassDateStr,
                });
                if (!picked) {
                    await client.query('ROLLBACK'); release();
                    return res.status(400).json({ error: 'El cliente no tiene una membresía válida con créditos para una clase en este estudio.' });
                }
                membershipId = picked.id;
                const cat: 'reformer' | 'multi' = classDetails.class_category;
                const col = cat === 'reformer' ? 'reformer_remaining' : 'multi_remaining';
                const creditRes = await client.query(`SELECT ${col} AS remaining FROM memberships WHERE id = $1`, [membershipId]);
                if (creditRes.rows[0] && creditRes.rows[0].remaining !== null) {
                    const dec = await client.query(`UPDATE memberships SET ${col} = ${col} - 1 WHERE id = $1 AND ${col} > 0`, [membershipId]);
                    if (dec.rowCount === 0) {
                        await client.query('ROLLBACK'); release();
                        return res.status(400).json({ error: 'El cliente no tiene créditos disponibles en esta membresía.' });
                    }
                    consumedCategory = cat;
                }
            }

            const ins = await client.query(
                `INSERT INTO bookings (class_id, user_id, membership_id, status, is_free_booking, consumed_category, booked_by)
                 VALUES ($1, $2, $3, 'confirmed', $4, $5, $6)
                 RETURNING *`,
                [classId, userId, membershipId, freeBooking, consumedCategory, req.user?.userId ?? null]
            );
            newBooking = ins.rows[0];
            await client.query('COMMIT');
        } catch (txErr) {
            try { await client.query('ROLLBACK'); } catch { /* ignore */ }
            throw txErr;
        } finally {
            release();
        }

        res.status(201).json(newBooking);
    } catch (error) {
        console.error('Admin book error:', error);
        res.status(500).json({ error: 'Error al crear la reserva' });
    }
});

// ============================================
// GET /api/bookings/my-bookings - List user's bookings
// ============================================
router.get('/my-bookings', authenticate, async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    try {
        const bookings = await query(
            `SELECT v.*, b.is_free_booking, b.folio AS folio
             FROM user_bookings_view v
             JOIN bookings b ON b.id = v.booking_id
             WHERE v.user_id = $1`,
            [userId]
        );

        const formattedBookings = bookings.map((b: any) => ({
            ...b,
            class_date: b.class_date instanceof Date ? b.class_date.toISOString().split('T')[0] : b.class_date,
            date: b.date instanceof Date ? b.date.toISOString().split('T')[0] : b.date // Handle potential alias
        }));

        res.json(formattedBookings);
    } catch (error) {
        console.error('My bookings error:', error);
        res.status(500).json({ error: 'Error al obtener reservas' });
    }
});

// ============================================
// GET /api/bookings/waitlist - Filas por clase (staff con permiso 'reservas')
// OJO: path fijo declarado ANTES de '/:id' para que no lo capture.
// ============================================
router.get('/waitlist', authenticate, requirePermission('reservas'), async (req: Request, res: Response) => {
    try {
        const scope = await resolveRequestFacility(req.user, (req.query.facility_id as string) || null);
        if (scope.kind === 'error') return res.status(scope.status).json({ error: scope.message });
        const facilityId = scope.kind === 'facility' ? scope.facilityId : ((req.query.facility_id as string) || null);
        const date = (req.query.date as string) || null;

        const rows = await query(`
            SELECT b.id AS booking_id, b.waitlist_position, b.created_at, b.membership_id,
                   u.id AS user_id, u.display_name, u.phone,
                   c.id AS class_id, c.date, c.start_time, c.end_time, c.max_capacity, c.current_bookings, c.facility_id,
                   ct.name AS class_type_name, ct.category, i.display_name AS instructor_name, f.name AS facility_name,
                   m.reformer_remaining, m.multi_remaining
            FROM bookings b
            JOIN classes c ON c.id = b.class_id
            JOIN class_types ct ON ct.id = c.class_type_id
            LEFT JOIN instructors i ON i.id = c.instructor_id
            LEFT JOIN facilities f ON f.id = c.facility_id
            JOIN users u ON u.id = b.user_id
            LEFT JOIN memberships m ON m.id = b.membership_id
            WHERE b.status = 'waitlist'
              AND c.date >= (NOW() AT TIME ZONE 'America/Mexico_City')::date
              AND ($1::uuid IS NULL OR c.facility_id = $1::uuid)
              AND ($2::date IS NULL OR c.date = $2::date)
            ORDER BY c.date, c.start_time, b.waitlist_position`,
            [facilityId, date]);

        const byClass = new Map<string, any>();
        for (const r of rows as any[]) {
            if (!byClass.has(r.class_id)) {
                byClass.set(r.class_id, {
                    class_id: r.class_id, date: r.date, start_time: r.start_time, end_time: r.end_time,
                    class_type_name: r.class_type_name, category: r.category,
                    instructor_name: r.instructor_name, facility_name: r.facility_name, facility_id: r.facility_id,
                    max_capacity: r.max_capacity, current_bookings: r.current_bookings,
                    queue: [],
                });
            }
            byClass.get(r.class_id).queue.push({
                booking_id: r.booking_id, waitlist_position: r.waitlist_position, created_at: r.created_at,
                user_id: r.user_id, display_name: r.display_name, phone: r.phone,
                reformer_remaining: r.reformer_remaining, multi_remaining: r.multi_remaining,
            });
        }
        res.json([...byClass.values()]);
    } catch (error) {
        console.error('GET waitlist error:', error);
        res.status(500).json({ error: 'Error al obtener lista de espera' });
    }
});

/** Recepción sin multi_sucursal solo gestiona filas de su sucursal (mismo criterio que el cancel). */
async function receptionFacilityBlock(req: Request, classId: string): Promise<{ status: number; error: string } | null> {
    if (req.user?.role !== 'reception') return null;
    const me = await queryOne<{ default_facility_id: string | null; permissions: any }>(
        `SELECT default_facility_id, permissions FROM users WHERE id = $1`, [req.user.userId]);
    if (me?.permissions?.multi_sucursal === true) return null;
    const cls = await queryOne<{ facility_id: string | null }>(
        `SELECT facility_id FROM classes WHERE id = $1`, [classId]);
    if (me?.default_facility_id && cls?.facility_id && me.default_facility_id !== cls.facility_id) {
        return { status: 403, error: 'Solo puedes gestionar la lista de espera de tu sucursal' };
    }
    return null;
}

// ============================================
// POST /api/bookings/:id/waitlist-promote - Promoción manual (staff)
// ============================================
router.post('/:id/waitlist-promote', authenticate, requirePermission('reservas'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const wl = await queryOne<{ class_id: string; status: string }>(
            `SELECT class_id, status FROM bookings WHERE id = $1`, [id]);
        if (!wl) return res.status(404).json({ error: 'Reserva no encontrada' });
        if (wl.status !== 'waitlist') return res.status(400).json({ error: 'Esta reserva no está en lista de espera' });
        const blocked = await receptionFacilityBlock(req, wl.class_id);
        if (blocked) return res.status(blocked.status).json({ error: blocked.error });
        const cls = await queryOne<{ current_bookings: number; max_capacity: number }>(
            `SELECT current_bookings, max_capacity FROM classes WHERE id = $1`, [wl.class_id]);
        if (!cls || cls.current_bookings >= cls.max_capacity) {
            return res.status(400).json({ error: 'La clase no tiene cupo disponible' });
        }
        const result = await promoteNextFromWaitlist({ classId: wl.class_id, specificBookingId: id });
        if (!result.promoted) {
            return res.status(400).json({ error: 'La clienta no tiene créditos disponibles de esta categoría' });
        }
        await logAction(query, {
            adminUserId: req.user!.userId, actionType: 'waitlist_promoted', entityType: 'booking',
            entityId: id, description: 'Promoción manual desde lista de espera',
            newData: { class_id: wl.class_id }, req,
        });
        res.json({ message: 'Promovida', booking_id: id });
    } catch (error) {
        console.error('waitlist-promote error:', error);
        res.status(500).json({ error: 'Error al promover' });
    }
});

// ============================================
// POST /api/bookings/:id/waitlist-remove - Quitar de la fila (staff)
// ============================================
router.post('/:id/waitlist-remove', authenticate, requirePermission('reservas'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const wl = await queryOne<{ class_id: string }>(
            `SELECT class_id FROM bookings WHERE id = $1 AND status = 'waitlist'`, [id]);
        if (!wl) return res.status(404).json({ error: 'No está en lista de espera' });
        const blocked = await receptionFacilityBlock(req, wl.class_id);
        if (blocked) return res.status(blocked.status).json({ error: blocked.error });
        await query(
            `UPDATE bookings SET status = 'cancelled', cancelled_at = NOW(),
             cancellation_reason = 'Retirada de lista de espera por recepción',
             cancelled_by = $2
             WHERE id = $1`,
            [id, req.user?.userId ?? null]
        );
        await compactWaitlist(wl.class_id);
        await logAction(query, {
            adminUserId: req.user!.userId, actionType: 'waitlist_removed', entityType: 'booking',
            entityId: id, description: 'Retirada de lista de espera', newData: { class_id: wl.class_id }, req,
        });
        res.json({ message: 'Retirada de la fila' });
    } catch (error) {
        console.error('waitlist-remove error:', error);
        res.status(500).json({ error: 'Error al quitar de la fila' });
    }
});

// ============================================
// PATCH /api/bookings/:id/waitlist-position - Subir/bajar (staff)
// ============================================
router.patch('/:id/waitlist-position', authenticate, requirePermission('reservas'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const direction = req.body?.direction;
        if (direction !== 'up' && direction !== 'down') {
            return res.status(400).json({ error: "direction debe ser 'up' o 'down'" });
        }
        const peek = await queryOne<{ class_id: string }>(
            `SELECT class_id FROM bookings WHERE id = $1 AND status = 'waitlist'`, [id]);
        if (!peek) return res.status(404).json({ error: 'No está en lista de espera' });
        const blocked = await receptionFacilityBlock(req, peek.class_id);
        if (blocked) return res.status(blocked.status).json({ error: blocked.error });

        // Swap atómico bajo lock: una promoción/compactación concurrente no debe
        // dejar posiciones duplicadas ni pintar posición en una reserva ya confirmada.
        const client = await pool.connect();
        let swapped: { from: number; to: number; classId: string } | null = null;
        try {
            await client.query('BEGIN');
            const meRes = await client.query(
                `SELECT class_id, waitlist_position FROM bookings WHERE id = $1 AND status = 'waitlist' FOR UPDATE`, [id]);
            const me = meRes.rows[0];
            if (!me) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'No está en lista de espera' });
            }
            const targetPos = direction === 'up' ? me.waitlist_position - 1 : me.waitlist_position + 1;
            const nbRes = await client.query(
                `SELECT id FROM bookings WHERE class_id = $1 AND status = 'waitlist' AND waitlist_position = $2 FOR UPDATE`,
                [me.class_id, targetPos]);
            const neighbor = nbRes.rows[0];
            if (!neighbor) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Ya está en el extremo de la fila' });
            }
            await client.query(`UPDATE bookings SET waitlist_position = $2, updated_at = NOW() WHERE id = $1`, [neighbor.id, me.waitlist_position]);
            await client.query(`UPDATE bookings SET waitlist_position = $2, updated_at = NOW() WHERE id = $1`, [id, targetPos]);
            await client.query('COMMIT');
            swapped = { from: me.waitlist_position, to: targetPos, classId: me.class_id };
        } catch (txErr) {
            await client.query('ROLLBACK').catch(() => { /* ya */ });
            throw txErr;
        } finally {
            client.release();
        }
        await logAction(query, {
            adminUserId: req.user!.userId, actionType: 'waitlist_reordered', entityType: 'booking',
            entityId: id, description: `Posición ${swapped.from} → ${swapped.to}`,
            newData: { class_id: swapped.classId, direction }, req,
        });
        res.json({ message: 'Posición actualizada', waitlist_position: swapped.to });
    } catch (error) {
        console.error('waitlist-position error:', error);
        res.status(500).json({ error: 'Error al reordenar' });
    }
});

// ============================================
// GET /api/bookings/:id - Booking detail
// ============================================
router.get('/:id', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;
        const isAdmin = req.user?.role === 'admin' || req.user?.role === 'instructor';

        const booking = await queryOne(
            `SELECT 
        b.id as booking_id,
        b.status as booking_status,
        b.created_at,
        b.checked_in_at,
        b.waitlist_position,
        b.membership_id,
        u.id as user_id,
        u.display_name as user_name,
        u.email as user_email,
        c.id as class_id,
        c.date as class_date,
        c.start_time as class_start_time,
        c.end_time as class_end_time,
        ct.name as class_name,
        ct.color as class_type_color,
        i.display_name as instructor_name,
        b.booked_by,
        bb.display_name as booked_by_name,
        bb.role as booked_by_role
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      LEFT JOIN users bb ON bb.id = b.booked_by
      JOIN classes c ON b.class_id = c.id
      JOIN class_types ct ON c.class_type_id = ct.id
      JOIN instructors i ON c.instructor_id = i.id
      WHERE b.id = $1`,
            [id]
        );

        if (!booking) {
            return res.status(404).json({ error: 'Reserva no encontrada' });
        }

        if (!isAdmin && booking.user_id !== userId) {
            return res.status(403).json({ error: 'No autorizado' });
        }

        // Strip sensitive fields for non-admin users
        const response: any = {
            ...booking,
            class_date: booking.class_date instanceof Date ? booking.class_date.toISOString().split('T')[0] : booking.class_date
        };
        if (!isAdmin) {
            delete response.user_email;
        }

        res.json(response);
    } catch (error) {
        console.error('Get booking error:', error);
        res.status(500).json({ error: 'Error al obtener reserva' });
    }
});

// ============================================
// GET /api/bookings/:id/cancel-preview - Preview cancellation outcome
// ============================================
router.get('/:id/cancel-preview', authenticate, async (req: Request, res: Response) => {
    const userId = req.user?.userId!;
    const bookingId = req.params.id;
    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'super_admin';

    try {
        const rows = await query(
            `SELECT * FROM preview_cancel_booking($1::uuid, $2::uuid, $3::boolean)`,
            [bookingId, userId, isAdmin]
        );
        const r = rows[0];
        if (!r) return res.status(500).json({ error: 'No se pudo evaluar la cancelación' });

        const httpStatus = r.out_error_code ? (
            r.out_error_code === 'BOOKING_NOT_FOUND' ? 404 :
            r.out_error_code === 'NOT_OWNER' ? 403 :
            400
        ) : 200;

        res.status(httpStatus).json({
            canCancel: !!r.out_can_cancel,
            willRefund: !!r.out_would_refund,
            hoursUntilClass: r.out_hours_until_class !== null ? Math.round(Number(r.out_hours_until_class) * 10) / 10 : null,
            minHours: r.out_min_hours !== null ? Number(r.out_min_hours) : null,
            cancellationsUsed: r.out_cancellations_used ?? 0,
            cancellationLimit: r.out_cancellation_limit ?? 2,
            reason: r.out_reason,
            code: r.out_error_code,
            // legacy compatibility for older clients
            isWithinWindow: r.out_hours_until_class !== null && Number(r.out_hours_until_class) >= Number(r.out_min_hours || 5),
        });
    } catch (error: any) {
        console.error('Cancel preview error:', error.message);
        res.status(500).json({ error: 'Error al obtener vista previa de cancelación' });
    }
});

// ============================================
// POST /api/bookings/:id/cancel - Cancel booking
// ============================================
router.post('/:id/cancel', authenticate, async (req: Request, res: Response) => {
    const userId = req.user?.userId!;
    const bookingId = req.params.id;
    // Recepción tiene poderes de override (ventana, límites) igual que admin, pero
    // solo para reservas de su sucursal.
    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'super_admin' || req.user?.role === 'reception';

    // Scope de sucursal para recepción: la reserva debe ser de una clase de su facility.
    if (req.user?.role === 'reception') {
        const myFacility = await queryOne<{ default_facility_id: string | null }>(
            `SELECT default_facility_id FROM users WHERE id = $1`,
            [userId]
        );
        const bookingFacility = await queryOne<{ facility_id: string | null }>(
            `SELECT c.facility_id FROM bookings b JOIN classes c ON c.id = b.class_id WHERE b.id = $1`,
            [bookingId]
        );
        if (!bookingFacility) {
            return res.status(404).json({ error: 'Reserva no encontrada', code: 'BOOKING_NOT_FOUND' });
        }
        if (myFacility?.default_facility_id && bookingFacility.facility_id
            && myFacility.default_facility_id !== bookingFacility.facility_id) {
            return res.status(403).json({
                error: 'Solo puedes cancelar reservas de tu sucursal',
                code: 'WRONG_FACILITY',
            });
        }
    }

    // El staff (admin/recepción) puede elegir explícitamente si devolver el crédito,
    // vía el switch "Devolver el crédito al cliente" del diálogo (estilo Fitune). Si lo
    // manda, manda sobre la lógica automática. Para el cliente (auto-cancelación) va null.
    const forceRefund = (isAdmin && typeof req.body?.refundCredit === 'boolean')
        ? req.body.refundCredit
        : null;
    // "Quitar forzado" del staff: permite quitar reservas ya atendidas (checked_in/no_show)
    // o de clases ya iniciadas (bypassa los candados de estado/clase iniciada). Solo staff.
    const forceRemove = isAdmin && req.body?.force === true;

    // === Single source of truth: cancel_booking() SQL function ===
    // Validates ownership, status, class-not-started, cancellation window,
    // refunds credit, increments counters — all inside one transaction with row lock.
    let cancelResult: any;
    try {
        const rows = await query(
            `SELECT * FROM cancel_booking($1::uuid, $2::uuid, $3::boolean, $4::boolean, $5::boolean)`,
            [bookingId, userId, isAdmin, forceRefund, forceRemove]
        );
        cancelResult = rows[0];
    } catch (err: any) {
        const code: string = (err.message || '').split('\n')[0].replace('cancel_booking: ', '');
        if (code.includes('BOOKING_NOT_FOUND')) {
            return res.status(404).json({ error: 'Reserva no encontrada', code: 'BOOKING_NOT_FOUND' });
        }
        if (code.includes('NOT_OWNER')) {
            return res.status(403).json({ error: 'No autorizado', code: 'NOT_OWNER' });
        }
        if (code.includes('ALREADY_CANCELLED')) {
            return res.status(400).json({ error: 'La reserva ya estaba cancelada', code: 'ALREADY_CANCELLED' });
        }
        if (code.includes('CLASS_ALREADY_STARTED')) {
            return res.status(400).json({
                error: 'No puedes cancelar una clase que ya empezó o terminó',
                code: 'CLASS_ALREADY_STARTED',
            });
        }
        if (code.includes('CANCELLATIONS_DISABLED')) {
            return res.status(400).json({
                error: 'Las cancelaciones están desactivadas por el studio',
                code: 'CANCELLATIONS_DISABLED',
            });
        }
        if (code.includes('CANCELLATION_WINDOW_EXCEEDED')) {
            const m = code.match(/CANCELLATION_WINDOW_EXCEEDED:(\d+(?:\.\d+)?)h/);
            const hours = m ? m[1] : '5';
            return res.status(400).json({
                error: `Cancelaciones permitidas hasta ${hours}h antes de la clase`,
                code: 'CANCELLATION_WINDOW_EXCEEDED',
            });
        }
        if (code.includes('INVALID_STATUS')) {
            return res.status(400).json({ error: 'Esta reserva no se puede cancelar en su estado actual', code: 'INVALID_STATUS' });
        }
        if (code.includes('CLASS_NOT_FOUND')) {
            return res.status(404).json({ error: 'Clase no encontrada', code: 'CLASS_NOT_FOUND' });
        }
        console.error('cancel_booking error:', err);
        return res.status(500).json({ error: 'Error al cancelar reserva' });
    }

    // Re-fetch the row for downstream logic (waitlist promotion / notifications)
    const booking = await queryOne(`SELECT * FROM bookings WHERE id = $1`, [bookingId]);
    if (!booking) {
        return res.status(500).json({ error: 'Estado inconsistente tras cancelación' });
    }
    const cancelled = booking;
    const shouldRefund = !!cancelResult.out_refunded;
    const refundReason = shouldRefund ? '' : 'Sin devolución';
    // Registrar quién canceló (solo staff — cliente queda NULL = "ella misma")
    if (['admin', 'super_admin', 'reception'].includes(req.user?.role || '')) {
        await query(
            `UPDATE bookings SET cancelled_by = $1 WHERE id = $2`,
            [req.user!.userId, bookingId]
        );
        // Enriquecer la bitácora con nombres legibles (usuario + clase) para que diga
        // claramente "a quién y en qué clase", además del flag de reembolso.
        const info = await queryOne<{ user_name: string; class_name: string; class_date: string }>(
            `SELECT u.display_name AS user_name, ct.name AS class_name, c.date AS class_date
               FROM bookings b
               JOIN users u ON u.id = b.user_id
               JOIN classes c ON c.id = b.class_id
               JOIN class_types ct ON ct.id = c.class_type_id
              WHERE b.id = $1`,
            [bookingId]
        ).catch(() => null);
        const who = info?.user_name ? ` de ${info.user_name}` : '';
        const inClass = info?.class_name ? ` en ${info.class_name}` : '';
        await logAction(query, {
            adminUserId: userId,
            actionType: 'booking_cancelled',
            entityType: 'booking',
            entityId: bookingId,
            description: `Canceló la reserva${who}${inClass} — ${shouldRefund ? 'crédito devuelto' : 'sin devolver crédito'}`,
            newData: {
                class_id: (booking as any).class_id,
                refunded: shouldRefund,
                user_name: info?.user_name,
                class_name: info?.class_name,
                class_date: info?.class_date,
            },
            req,
        });
    }
    const updatedMembership = booking.membership_id
        ? await queryOne(`SELECT cancellations_used FROM memberships WHERE id=$1`, [booking.membership_id])
        : null;

    try {
        // Señal tomada DENTRO del lock de cancel_booking (no de una lectura previa,
        // que podía quedar rancia si una promoción concurrente confirmaba la reserva):
        // la rama waitlist de la función devuelve out_hours_until_class = NULL.
        const wasWaitlistExit = cancelResult.out_hours_until_class === null;
        if (wasWaitlistExit) {
            // Salida de fila: no se liberó cupo; solo compactar posiciones.
            await compactWaitlist(booking.class_id).catch(e => console.error('[WAITLIST] compact:', e));
        } else {
            // Se liberó un cupo: promoción automática (lib aplica política,
            // corte de horas, cobro de crédito, salto sin crédito y avisos).
            await promoteNextFromWaitlist({ classId: booking.class_id });
        }

        // Send WhatsApp cancellation notice
        try {
            const notifSettings = await queryOne(
                "SELECT value FROM system_settings WHERE key = 'notification_settings'"
            );
            const shouldNotify = notifSettings?.value?.send_cancellation_notice !== false;

            if (shouldNotify) {
                const user = await queryOne('SELECT display_name, phone FROM users WHERE id = $1', [booking.user_id]);
                const classInfo2 = await queryOne(`
                    SELECT ct.name as class_name, c.date, f.name as facility_name
                    FROM classes c
                    JOIN class_types ct ON c.class_type_id = ct.id
                    LEFT JOIN facilities f ON c.facility_id = f.id
                    WHERE c.id = $1
                `, [booking.class_id]);

                if (user?.phone && classInfo2) {
                    const dateStr = classInfo2.date instanceof Date
                        ? classInfo2.date.toLocaleDateString('es-MX')
                        : String(classInfo2.date).split('T')[0];
                    const reason = shouldRefund
                        ? undefined
                        : refundReason || 'No aplica reembolso';
                    sendCancellationNotice(
                        user.phone, user.display_name, classInfo2.class_name, dateStr, reason, shouldRefund,
                        classInfo2.facility_name || undefined
                    ).catch(err => console.error('[WhatsApp] Cancel notice error:', err));
                }
            }
        } catch (waErr) {
            console.error('[WhatsApp] Non-blocking error:', waErr);
        }

        // Update Apple + Google Wallet passes (credits changed)
        notifyAllUserDevices(booking.user_id, '⚠️ Reserva cancelada', shouldRefund ? 'Crédito devuelto' : 'Sin reembolso')
            .catch(e => console.error('Apple Wallet cancel notify error:', e));
        if (booking.membership_id) {
            upsertGoogleLoyaltyObject(booking.membership_id).catch(e => console.error('Google Wallet cancel error:', e));
        }

        res.json({
            ...cancelled,
            refunded: shouldRefund,
            message: shouldRefund
                ? 'Reserva cancelada. Se ha reembolsado el credito.'
                : `Reserva cancelada sin reembolso: ${refundReason || 'Condiciones no cumplidas'}.`,
            cancellationsUsed: updatedMembership?.cancellations_used
        });

    } catch (error) {
        console.error('Cancel booking error:', error);
        res.status(500).json({ error: 'Error al cancelar reserva' });
    }
});

// ============================================
// GET /api/bookings/class/:classId - List attendees (Admin / Instructor / Recepción)
// Recepción incluida: ya puede ver bookings y la nómina (requirePermission('nomina')),
// así que el diálogo de asistentes de la nómina necesita el mismo acceso (antes daba 403).
// ============================================
router.get('/class/:classId', authenticate, requireRole('admin', 'instructor', 'reception'), async (req: Request, res: Response) => {
    try {
        // include_cancelled=true trae también las reservas canceladas (para la pestaña "Cancelado"
        // del panel estilo Fitune). Por defecto se omiten para no inflar la lista.
        const includeCancelled = req.query.include_cancelled === 'true';
        const attendees = await query(
            `SELECT
                b.id as booking_id, b.status, b.checked_in_at, b.waitlist_position,
                u.id as user_id, u.display_name, u.email, u.photo_url, u.phone,
                m.id as membership_id, p.name as plan_name, b.is_free_booking,
                b.booked_by,
                bb.display_name as booked_by_name,
                bb.role as booked_by_role
             FROM bookings b
             JOIN users u ON b.user_id = u.id
             LEFT JOIN users bb ON bb.id = b.booked_by
             LEFT JOIN memberships m ON b.membership_id = m.id
             LEFT JOIN plans p ON m.plan_id = p.id
             WHERE b.class_id = $1 ${includeCancelled ? '' : `AND b.status != 'cancelled'`}
             ORDER BY b.waitlist_position ASC NULLS FIRST, u.display_name ASC`,
            [req.params.classId]
        );
        res.json(attendees);
    } catch (error) {
        console.error('List attendees error:', error);
        res.status(500).json({ error: 'Error al obtener asistentes' });
    }
});

// ============================================
// POST /api/bookings/:id/check-in - Check-in User
// ============================================
router.post('/:id/check-in', authenticate, requireRole('admin', 'instructor'), async (req: Request, res: Response) => {
    try {
        const bookingId = req.params.id;

        // This update triggers the DB function we want to disable/avoid?
        // We will disable the trigger in index.ts, so this just marks status.
        const booking = await queryOne<{ id: string; user_id: string }>(
            `UPDATE bookings
             SET status = 'checked_in', checked_in_at = NOW(), checked_in_by = $1
             WHERE id = $2
             RETURNING *`,
            [req.user?.userId, bookingId]
        );

        if (!booking) return res.status(404).json({ error: 'Reserva no encontrada' });

        // Award attendance loyalty points (idempotent; non-blocking on failure)
        void awardCheckinPoints(booking.user_id, booking.id);

        res.json(booking);
    } catch (error) {
        console.error('Check-in error:', error);
        res.status(500).json({ error: 'Error al realizar check-in' });
    }
});

// Reverts a check-in done by mistake — booking goes back to 'confirmed' state.
router.post('/:id/uncheck-in', authenticate, requireRole('admin', 'instructor'), async (req: Request, res: Response) => {
    try {
        const bookingId = req.params.id;

        const booking = await queryOne(
            `UPDATE bookings
             SET status = 'confirmed', checked_in_at = NULL, checked_in_by = NULL, updated_at = NOW()
             WHERE id = $1 AND status = 'checked_in'
             RETURNING *`,
            [bookingId]
        );

        if (!booking) return res.status(404).json({ error: 'Reserva no encontrada o no estaba en check-in' });

        res.json(booking);
    } catch (error) {
        console.error('Uncheck-in error:', error);
        res.status(500).json({ error: 'Error al deshacer check-in' });
    }
});

export default router;
