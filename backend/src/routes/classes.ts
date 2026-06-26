import { Router, Request, Response } from 'express';
import { query, queryOne, pool } from '../config/database.js';
import { logAction } from '../lib/audit.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { requireElevated } from '../middleware/elevation.js';
import {
    sendClassAssignmentNotification,
    sendSubstitutionAcceptedNotification,
    sendRecurringClassAssignmentNotification,
    sendClassCancelledToCoach,
} from '../services/email.js';
import { writeInAppNotificationForInstructor } from '../lib/in-app-notifications.js';
import { cancelClassWithRefunds } from '../lib/cancel-class.js';
import { z } from 'zod';
import { optionalAuth } from '../middleware/auth.js';
import { capacityError } from '../lib/schedule.js';
import { resolveRequestFacility } from '../lib/requestFacility.js';

const router = Router();

// Schema for Class creation
const ClassSchema = z.object({
    classTypeId: z.string().uuid(),
    instructorId: z.string().uuid(),
    facilityId: z.string().uuid().optional().nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido'),
    startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:MM requerido'),
    endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:MM requerido'),
    maxCapacity: z.number().int().positive(),
});

// Schema for Bulk Generation
const GenerateSchema = z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido'),
    facilityId: z.string().uuid().optional(),   // generar solo una sucursal; omitir = ambas
});

// Schema para tanda de clases recurrentes (acotada: desde→hasta, varios días)
const RecurringClassSchema = z.object({
    classTypeId: z.string().uuid(),
    instructorId: z.string().uuid(),
    facilityId: z.string().uuid().optional().nullable(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:MM requerido'),
    endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:MM requerido'),
    maxCapacity: z.number().int().positive(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido'),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1, 'Selecciona al menos un día'),
});

// ============================================
// GET /api/classes - List classes (Public/Admin)
// ============================================
router.get('/', optionalAuth, async (req: Request, res: Response) => {
    try {
        const { start, end, start_date, end_date, instructorId, classTypeId } = req.query;

        // Accept both start/end and start_date/end_date
        const startParam = start || start_date;
        const endParam = end || end_date;

        if (!startParam || !endParam) {
            return res.status(400).json({ error: 'Se requieren parámetros start y end (YYYY-MM-DD)' });
        }

        const params: any[] = [startParam, endParam];
        let queryStr = `
      SELECT
        c.id, c.date, c.start_time, c.end_time, c.max_capacity,
        c.current_bookings, c.status, c.class_type_id, c.instructor_id,
        c.facility_id, c.is_free, c.free_label, c.booking_closed,
        ct.name as class_type_name, ct.color as class_type_color, ct.category,
        i.display_name as instructor_name, i.user_id as instructor_user_id,
        i.photo_url as instructor_photo,
        f.name as facility_name
      FROM classes c
      JOIN class_types ct ON c.class_type_id = ct.id
      JOIN instructors i ON c.instructor_id = i.id
      LEFT JOIN facilities f ON c.facility_id = f.id
      WHERE c.date >= $1 AND c.date <= $2
    `;
        let paramCount = 3;
        if (instructorId) { queryStr += ` AND c.instructor_id = $${paramCount++}`; params.push(instructorId); }
        if (classTypeId) { queryStr += ` AND c.class_type_id = $${paramCount++}`; params.push(classTypeId); }
        const category = req.query.category as string | undefined;
        if (category) { queryStr += ` AND ct.category = $${paramCount++}`; params.push(category); }
        if (req.user?.role === 'reception') {
            const scope = await resolveRequestFacility(req.user, (req.query.facility_id as string) || null);
            if (scope.kind === 'error') return res.status(scope.status).json({ error: scope.message });
            if (scope.kind === 'facility') { queryStr += ` AND c.facility_id = $${paramCount++}`; params.push(scope.facilityId); }
        } else if (req.query.facility_id) {
            queryStr += ` AND c.facility_id = $${paramCount++}`; params.push(req.query.facility_id);
        }
        // El público y las clientas NO ven clases canceladas; el staff (admin/recepción/coach) sí.
        const viewerRole = req.user?.role;
        const isStaffViewer = viewerRole === 'admin' || viewerRole === 'super_admin' || viewerRole === 'reception' || viewerRole === 'instructor';
        if (!isStaffViewer) {
            queryStr += ` AND c.status != 'cancelled'`;
        }
        queryStr += ` ORDER BY c.date ASC, c.start_time ASC`;

        const classes = await query(queryStr, params);

        // Format times and dates
        const formatted = classes.map((c: any) => {
            const dateStr = c.date instanceof Date
                ? c.date.toISOString().split('T')[0]
                : String(c.date).split('T')[0];
            return {
                ...c,
                date: dateStr, // Override raw Date → clean YYYY-MM-DD
                class_date: dateStr,
                start_time: c.start_time.substring(0, 5),
                end_time: c.end_time.substring(0, 5),
                capacity: c.max_capacity,
            };
        });

        // Cachear SOLO para visitantes públicos (landing). Para usuarios autenticados
        // (admin/recepción/cliente) NUNCA cachear: el admin editaba el coach y el navegador
        // seguía sirviendo la lista vieja ~30-90s → parecía que "no se guardaba / volvía al
        // coach original" (aunque en la base sí cambiaba), y lo cambiaban una y otra vez.
        // El contenido varía por auth (el staff ve canceladas; el público no) → Vary para
        // que las cachés no mezclen la variante pública con la autenticada.
        res.vary('Authorization');
        if (req.user) {
            res.set('Cache-Control', 'no-store');
        } else {
            res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
        }
        res.json(formatted);
    } catch (error) {
        console.error('List classes error:', error);
        res.status(500).json({ error: 'Error al obtener clases' });
    }
});

// ============================================
// POST /api/classes/bulk-delete - Delete empty classes in a date range
// ============================================
// ============================================
// FREE CLASSES — Opening Day & cortesías
// ============================================

// Mark a single class as free (or revert it)
router.patch('/:id/free', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    const { is_free, free_label } = req.body;
    if (typeof is_free !== 'boolean') {
        return res.status(400).json({ error: 'is_free must be boolean' });
    }
    try {
        const cls = await queryOne<any>(`SELECT id, is_free, current_bookings FROM classes WHERE id = $1`, [req.params.id]);
        if (!cls) return res.status(404).json({ error: 'Clase no encontrada' });

        // Safety: if turning OFF and there are existing bookings on this class,
        // refuse unless the admin explicitly confirms.
        if (cls.is_free && !is_free && cls.current_bookings > 0 && !req.body.force) {
            return res.status(409).json({
                error: 'Esta clase ya tiene reservas como gratis. Pasa force:true para confirmar.',
                code: 'HAS_FREE_BOOKINGS',
                bookings: cls.current_bookings,
            });
        }

        await query(
            `UPDATE classes SET is_free = $1, free_label = $2, updated_at = NOW() WHERE id = $3`,
            [is_free, is_free ? (free_label || 'Clase gratis') : null, req.params.id]
        );
        res.json({ ok: true, is_free });
    } catch (e: any) {
        console.error('PATCH /classes/:id/free error:', e.message);
        res.status(500).json({ error: 'Error al actualizar clase', detail: e.message });
    }
});

// PATCH /api/classes/:id/close-bookings — "cerrar" (candado) o reabrir una clase para
// nuevas reservas, SIN cancelarla. Admin + TODA la recepción (con scope de sucursal).
// Solo se puede cerrar cuando la clase no tiene reservas (lo que el dueño pidió).
router.patch('/:id/close-bookings', authenticate, requireRole('admin', 'super_admin', 'reception'), async (req: Request, res: Response) => {
    const { closed } = req.body;
    if (typeof closed !== 'boolean') {
        return res.status(400).json({ error: 'closed debe ser booleano' });
    }
    try {
        const cls = await queryOne<{ id: string; status: string; current_bookings: number; facility_id: string | null; booking_closed: boolean }>(
            `SELECT id, status, current_bookings, facility_id, booking_closed FROM classes WHERE id = $1`,
            [req.params.id]
        );
        if (!cls) return res.status(404).json({ error: 'Clase no encontrada' });

        // Scope de sucursal para recepción (admin/master ven todo).
        if (req.user?.role === 'reception') {
            const scope = await resolveRequestFacility(req.user, null);
            if (scope.kind === 'error') return res.status(scope.status).json({ error: scope.message });
            if (scope.kind === 'facility' && cls.facility_id !== scope.facilityId) {
                return res.status(403).json({ error: 'Esa clase no es de tu sucursal asignada.' });
            }
        }

        if (closed) {
            if (cls.status === 'cancelled') {
                return res.status(400).json({ error: 'Una clase cancelada no se puede cerrar' });
            }
            // "Agotar / cerrar cupo": se puede cerrar AUNQUE ya haya inscritas. Solo bloquea
            // nuevas reservas; las existentes se quedan (no se cancela ni reembolsa a nadie).
        }

        await query(`UPDATE classes SET booking_closed = $1, updated_at = NOW() WHERE id = $2`, [closed, req.params.id]);

        try {
            await logAction(query, {
                adminUserId: req.user!.userId,
                actionType: closed ? 'class_bookings_closed' : 'class_bookings_reopened',
                entityType: 'class',
                entityId: req.params.id,
                description: closed ? 'Clase cerrada para nuevas reservas' : 'Clase reabierta para reservas',
                req,
            });
        } catch (auditErr) {
            console.error('[close-bookings] audit failed (no bloquea):', auditErr);
        }

        res.json({ ok: true, booking_closed: closed });
    } catch (e: any) {
        console.error('PATCH /classes/:id/close-bookings error:', e.message);
        res.status(500).json({ error: 'Error al cerrar/abrir la clase', detail: e.message });
    }
});

// Bulk mark a date/time range as free (preview-or-commit pattern)
router.post('/bulk-mark-free', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    const { from_date, to_date, from_time, to_time, free_label, dry_run } = req.body;
    if (!from_date || !to_date) {
        return res.status(400).json({ error: 'from_date and to_date are required (YYYY-MM-DD)' });
    }
    const params: any[] = [from_date, to_date];
    let timeFilter = '';
    if (from_time) { params.push(from_time); timeFilter += ` AND start_time >= $${params.length}`; }
    if (to_time)   { params.push(to_time);   timeFilter += ` AND start_time <= $${params.length}`; }

    try {
        // Count what would be affected
        const matches = await query<{ id: string }>(
            `SELECT id FROM classes
             WHERE date BETWEEN $1 AND $2 ${timeFilter}
               AND status = 'scheduled'`,
            params
        );

        if (dry_run) {
            return res.json({ would_affect: matches.length, dry_run: true });
        }

        // Commit
        const labelParam = free_label || 'Clase gratis';
        await query(
            `UPDATE classes SET is_free = true, free_label = $${params.length + 1}, updated_at = NOW()
             WHERE date BETWEEN $1 AND $2 ${timeFilter}
               AND status = 'scheduled'`,
            [...params, labelParam]
        );
        res.json({ ok: true, affected: matches.length, label: labelParam });
    } catch (e: any) {
        console.error('Bulk-mark-free error:', e.message);
        res.status(500).json({ error: 'Error al marcar clases', detail: e.message });
    }
});

router.post('/bulk-delete', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { startDate, endDate } = req.body;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Se requieren startDate y endDate' });
        }

        const result = await query<{ id: string }>(
            `DELETE FROM classes
             WHERE date >= $1 AND date <= $2
               AND current_bookings = 0
               AND status != 'cancelled'
             RETURNING id`,
            [startDate, endDate]
        );

        res.json({ deleted: result.length, message: `${result.length} clases eliminadas` });
    } catch (error) {
        console.error('Bulk delete classes error:', error);
        res.status(500).json({ error: 'Error al eliminar clases' });
    }
});

// ============================================
// GET /api/classes/:id - Class detail
// ============================================
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const classInfo = await queryOne(
            `SELECT
        c.id, c.date, c.start_time, c.end_time, c.max_capacity,
        c.current_bookings, c.status, c.class_type_id, c.instructor_id,
        c.facility_id, c.is_free, c.free_label, c.booking_closed,
        ct.name as class_type_name, ct.color as class_type_color,
        i.display_name as instructor_name, i.photo_url as instructor_photo,
        f.name as facility_name
      FROM classes c
      JOIN class_types ct ON c.class_type_id = ct.id
      JOIN instructors i ON c.instructor_id = i.id
      LEFT JOIN facilities f ON c.facility_id = f.id
      WHERE c.id = $1`,
            [id]
        );

        if (!classInfo) {
            return res.status(404).json({ error: 'Clase no encontrada' });
        }

        res.json({
            ...classInfo,
            date: classInfo.date.toISOString().split('T')[0],
            start_time: classInfo.start_time.substring(0, 5),
            end_time: classInfo.end_time.substring(0, 5),
        });
    } catch (error) {
        console.error('Get class error:', error);
        res.status(500).json({ error: 'Error al obtener clase' });
    }
});

// ============================================
// POST /api/classes - Create single class (Admin)
// ============================================
router.post('/', authenticate, requireElevated, async (req: Request, res: Response) => {
    try {
        const validation = ClassSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: 'Datos inválidos',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const data = validation.data;

        const ctCreate = await queryOne<{ category: string }>(`SELECT category FROM class_types WHERE id = $1`, [data.classTypeId]);
        const capErrCreate = capacityError(ctCreate?.category ?? 'multi', data.maxCapacity);
        if (capErrCreate) return res.status(400).json({ error: capErrCreate });

        const newClass = await queryOne(
            `INSERT INTO classes (
        class_type_id, instructor_id, facility_id, date, start_time, 
        end_time, max_capacity
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
            [
                data.classTypeId,
                data.instructorId,
                data.facilityId || null,
                data.date,
                data.startTime,
                data.endTime,
                data.maxCapacity,
            ]
        );

        // Notify the instructor about the new class assignment
        try {
            const instructorInfo = await queryOne<{
                email: string;
                display_name: string;
            }>(
                `SELECT i.email, i.display_name 
                 FROM instructors i 
                 WHERE i.id = $1`,
                [data.instructorId]
            );
            
            const classTypeInfo = await queryOne<{ name: string }>(
                'SELECT name FROM class_types WHERE id = $1',
                [data.classTypeId]
            );

            if (instructorInfo?.email && classTypeInfo) {
                await sendClassAssignmentNotification({
                    to: instructorInfo.email,
                    coachName: instructorInfo.display_name,
                    className: classTypeInfo.name,
                    classDate: data.date,
                    startTime: data.startTime,
                    endTime: data.endTime,
                    capacity: data.maxCapacity,
                });
            }
        } catch (notifyError) {
            console.error('Failed to notify instructor:', notifyError);
            // Don't fail class creation if notification fails
        }

        res.status(201).json(newClass);
    } catch (error) {
        console.error('Create class error:', error);
        res.status(500).json({ error: 'Error al crear clase' });
    }
});

// ============================================
// POST /api/classes/recurring - Tanda recurrente acotada (Admin / recepción elevada)
// ============================================
router.post('/recurring', authenticate, requireElevated, async (req: Request, res: Response) => {
    try {
        const validation = RecurringClassSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: 'Datos inválidos',
                details: validation.error.flatten().fieldErrors,
            });
        }
        const data = validation.data;

        // Orden y tope de rango (≈ 6 meses) — todo en UTC para evitar el bug de +1 día.
        const start = new Date(`${data.startDate}T00:00:00Z`);
        const end = new Date(`${data.endDate}T00:00:00Z`);
        if (end < start) {
            return res.status(400).json({ error: 'La fecha "hasta" debe ser igual o posterior a "desde".' });
        }
        const MAX_DAYS = 184;
        const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
        if (spanDays > MAX_DAYS) {
            return res.status(400).json({ error: 'El rango no puede exceder 6 meses.' });
        }

        // Capacidad según la categoría del tipo de clase (misma regla que POST /classes).
        const ct = await queryOne<{ category: string; name: string }>(
            `SELECT category, name FROM class_types WHERE id = $1`, [data.classTypeId]);
        if (!ct) return res.status(400).json({ error: 'Tipo de clase no encontrado.' });
        const capErr = capacityError(ct.category ?? 'multi', data.maxCapacity);
        if (capErr) return res.status(400).json({ error: capErr });

        // Días cerrados en el rango (se saltan).
        const closedRows = await query(
            `SELECT date FROM studio_closed_days WHERE date >= $1 AND date <= $2`,
            [data.startDate, data.endDate]);
        const closedDates = new Set(
            closedRows.map((r: any) => (r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date).split('T')[0])));

        const weekdaySet = new Set(data.weekdays);
        const facilityId = data.facilityId || null;

        const client = await pool.connect();
        let creadas = 0;
        const saltadas: { fecha: string; motivo: 'ocupado' | 'cerrado' }[] = [];
        try {
            await client.query('BEGIN');
            const current = new Date(start);
            while (current <= end) {
                const dow = current.getUTCDay();
                const dateStr = current.toISOString().split('T')[0];
                if (weekdaySet.has(dow)) {
                    if (closedDates.has(dateStr)) {
                        saltadas.push({ fecha: dateStr, motivo: 'cerrado' });
                    } else {
                        const existing = await client.query(
                            `SELECT id FROM classes
                               WHERE date = $1 AND start_time = $2
                                 AND status != 'cancelled'
                                 AND (facility_id = $3 OR ($3::uuid IS NULL AND facility_id IS NULL))`,
                            [dateStr, data.startTime, facilityId]);
                        if (existing.rows.length > 0) {
                            saltadas.push({ fecha: dateStr, motivo: 'ocupado' });
                        } else {
                            await client.query(
                                `INSERT INTO classes (class_type_id, instructor_id, facility_id, date, start_time, end_time, max_capacity)
                                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                                [data.classTypeId, data.instructorId, facilityId, dateStr, data.startTime, data.endTime, data.maxCapacity]);
                            creadas++;
                        }
                    }
                }
                current.setUTCDate(current.getUTCDate() + 1);
            }
            await client.query('COMMIT');
        } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
        } finally {
            client.release();
        }

        await logAction(query, {
            adminUserId: req.user!.userId,
            actionType: 'classes_recurring_created',
            entityType: 'class',
            description: `Tanda recurrente: ${creadas} clases creadas (${data.startDate} → ${data.endDate})`,
            newData: {
                creadas,
                saltadas: saltadas.length,
                startDate: data.startDate,
                endDate: data.endDate,
                weekdays: data.weekdays,
                classTypeId: data.classTypeId,
                instructorId: data.instructorId,
                facilityId,
            },
            req,
        });

        // Correo resumen al instructor (best-effort; no rompe la creación).
        if (creadas > 0) {
            try {
                const instructorInfo = await queryOne<{ email: string; display_name: string }>(
                    `SELECT email, display_name FROM instructors WHERE id = $1`, [data.instructorId]);
                if (instructorInfo?.email) {
                    const DOW_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
                    const dayLabels = [...data.weekdays].sort((a, b) => a - b).map((d) => DOW_ES[d]).join(', ');
                    await sendRecurringClassAssignmentNotification({
                        to: instructorInfo.email,
                        coachName: instructorInfo.display_name,
                        className: ct.name,
                        startDate: data.startDate,
                        endDate: data.endDate,
                        dayLabels,
                        startTime: data.startTime,
                        endTime: data.endTime,
                        capacity: data.maxCapacity,
                        count: creadas,
                    });
                }
            } catch (notifyError) {
                console.error('Failed to notify instructor (recurring):', notifyError);
            }
        }

        res.status(201).json({ creadas, saltadas });
    } catch (error) {
        console.error('Create recurring classes error:', error);
        res.status(500).json({ error: 'Error al crear clases recurrentes' });
    }
});

// ============================================
// POST /api/classes/generate - Bulk Generate (Admin)
// ============================================
router.post('/generate', authenticate, requireElevated, async (req: Request, res: Response) => {
    // Admin o recepción master. Genera la semana desde la plantilla (schedules),
    // para una sucursal (facilityId) o ambas (omitido).
    try {
        const validation = GenerateSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: 'Datos inválidos',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const { startDate, endDate, facilityId } = validation.data;

        // 1. Get active recurring schedules (opcionalmente filtradas por sucursal)
        const schedules = facilityId
            ? await query(
                `SELECT * FROM schedules
                 WHERE is_active = true AND is_recurring = true AND facility_id = $1`,
                [facilityId]
            )
            : await query(`
      SELECT * FROM schedules
      WHERE is_active = true AND is_recurring = true
    `);

        if (schedules.length === 0) {
            return res.json({ message: 'No hay horarios recurrentes activos para generar clases', count: 0 });
        }

        // 2. Get closed days in the range to skip them
        const closedRows = await query(
            `SELECT date FROM studio_closed_days WHERE date >= $1 AND date <= $2`,
            [startDate, endDate]
        );
        const closedDates = new Set(
            closedRows.map((r: any) => (r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date).split('T')[0]))
        );

        // 3. Iterate through dates range
        let current = new Date(startDate);
        const end = new Date(endDate);
        let classesCreated = 0;

        while (current <= end) {
            // getUTCDay() para que el día coincida con la fecha en toISOString() (UTC).
            // Con getDay() (hora local del servidor) las clases se generaban 1 día corridas.
            const dayOfWeek = current.getUTCDay();
            const dateStr = current.toISOString().split('T')[0];

            // Skip closed days
            if (closedDates.has(dateStr)) {
                current.setDate(current.getDate() + 1);
                continue;
            }

            // Find schedules for this day
            const daySchedules = schedules.filter((s: any) => s.day_of_week === dayOfWeek);

            for (const sched of daySchedules) {
                // Check if class already exists for this schedule on this date to avoid dupes
                // We use schedule_id to track origin
                const existing = await queryOne(
                    `SELECT id FROM classes WHERE schedule_id = $1 AND date = $2`,
                    [sched.id, dateStr]
                );

                if (!existing) {
                    // ON CONFLICT DO NOTHING: si ese slot ya está ocupado por una clase
                    // idéntica (índice único classes_slot_unique por fecha/hora/coach/
                    // disciplina/sucursal — p. ej. una clase creada a mano o desde otro
                    // horario), se SALTA en vez de tronar. Antes esto lanzaba un 500
                    // ("Error al generar clases") y abortaba toda la generación.
                    const inserted = await query(
                        `INSERT INTO classes (
                        schedule_id, class_type_id, instructor_id, facility_id, date,
                        start_time, end_time, max_capacity
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT DO NOTHING RETURNING id`,
                        [
                            sched.id,
                            sched.class_type_id,
                            sched.instructor_id,
                            sched.facility_id,
                            dateStr,
                            sched.start_time,
                            sched.end_time,
                            sched.max_capacity,
                        ]
                    );
                    if (inserted.length > 0) classesCreated++;
                }
            }

            // Next day directly
            current.setDate(current.getDate() + 1);
        }

        res.json({ message: 'Clases generadas exitosamente', count: classesCreated });

    } catch (error) {
        console.error('Generate classes error:', error);
        res.status(500).json({ error: 'Error al generar clases' });
    }
});

// ============================================
// PUT /api/classes/:id - Update class (Admin)
// ============================================
const ClassUpdateSchema = z.object({
    classTypeId: z.string().uuid().optional(),
    instructorId: z.string().uuid().optional(),
    facilityId: z.string().uuid().optional().nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido').optional(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:MM requerido').optional(),
    endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:MM requerido').optional(),
    maxCapacity: z.number().int().positive().optional(),
    status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
});

router.put('/:id', authenticate, requireElevated, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const validation = ClassUpdateSchema.safeParse(req.body);

        if (!validation.success) {
            return res.status(400).json({
                error: 'Datos invalidos',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const data = validation.data;

        if (data.maxCapacity !== undefined) {
            const ctRow = await queryOne<{ category: string }>(
                data.classTypeId
                    ? `SELECT category FROM class_types WHERE id = $1`
                    : `SELECT ct.category FROM classes c JOIN class_types ct ON ct.id = c.class_type_id WHERE c.id = $1`,
                [data.classTypeId ?? req.params.id]
            );
            const capErrPut = capacityError(ctRow?.category ?? 'multi', data.maxCapacity);
            if (capErrPut) return res.status(400).json({ error: capErrPut });
        }

        // Check class exists
        const existing = await queryOne('SELECT * FROM classes WHERE id = $1', [id]);
        if (!existing) {
            return res.status(404).json({ error: 'Clase no encontrada' });
        }

        // Build dynamic update query
        const updates: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        if (data.classTypeId !== undefined) {
            updates.push(`class_type_id = $${paramCount++}`);
            values.push(data.classTypeId);
        }
        if (data.instructorId !== undefined) {
            updates.push(`instructor_id = $${paramCount++}`);
            values.push(data.instructorId);
        }
        if (data.facilityId !== undefined) {
            updates.push(`facility_id = $${paramCount++}`);
            values.push(data.facilityId);
        }
        if (data.date !== undefined) {
            updates.push(`date = $${paramCount++}`);
            values.push(data.date);
        }
        if (data.startTime !== undefined) {
            updates.push(`start_time = $${paramCount++}`);
            values.push(data.startTime);
        }
        if (data.endTime !== undefined) {
            updates.push(`end_time = $${paramCount++}`);
            values.push(data.endTime);
        }
        if (data.maxCapacity !== undefined) {
            // Validate max capacity is not less than current bookings
            if (data.maxCapacity < existing.current_bookings) {
                return res.status(400).json({
                    error: `La capacidad no puede ser menor a las reservas actuales (${existing.current_bookings})`
                });
            }
            updates.push(`max_capacity = $${paramCount++}`);
            values.push(data.maxCapacity);
        }
        if (data.status !== undefined) {
            updates.push(`status = $${paramCount++}`);
            values.push(data.status);
        }

        if (updates.length === 0) {
            return res.json(existing);
        }

        values.push(id);
        const result = await queryOne(
            `UPDATE classes SET ${updates.join(', ')}, updated_at = NOW()
             WHERE id = $${paramCount} RETURNING *`,
            values
        );

        // Cambio de instructor: audit + advertencia si el mes ya tiene nómina pagada.
        // La nómina (admin y coach) cuenta EN VIVO desde classes.instructor_id, así que
        // el cambio surte efecto inmediato — excepto contra el snapshot de coach_payouts.
        let payrollWarning: string | null = null;
        const instructorChanged = data.instructorId !== undefined && data.instructorId !== existing.instructor_id;
        const existingDateStr = existing.date instanceof Date
            ? existing.date.toISOString().slice(0, 10)
            : String(existing.date).slice(0, 10);
        const dateChanged = data.date !== undefined && String(data.date) !== existingDateStr;
        if (instructorChanged) {
            await logAction(query, {
                adminUserId: req.user!.userId,
                actionType: 'class_instructor_changed',
                entityType: 'class',
                entityId: id,
                description: 'Instructor de clase cambiado',
                oldData: { instructor_id: existing.instructor_id },
                newData: { instructor_id: data.instructorId, date: result.date, start_time: result.start_time },
                req,
            });
            // Aviso al nuevo coach (fuera de la app) de que se le asignó esta clase.
            try {
                const coach = await queryOne<{ email: string; display_name: string }>(
                    `SELECT email, display_name FROM instructors WHERE id = $1`, [data.instructorId]);
                const ct = await queryOne<{ name: string }>(`SELECT name FROM class_types WHERE id = $1`, [result.class_type_id]);
                if (coach?.email) {
                    const dateStr = result.date instanceof Date ? result.date.toISOString().slice(0, 10) : String(result.date).slice(0, 10);
                    await sendClassAssignmentNotification({
                        to: coach.email, coachName: coach.display_name, className: ct?.name || 'una clase',
                        classDate: dateStr,
                        startTime: String(result.start_time).slice(0, 5),
                        endTime: String(result.end_time).slice(0, 5),
                        capacity: result.max_capacity,
                    });
                }
            } catch (e) { console.error('coach reassign email:', e); }
        }
        if ((instructorChanged || dateChanged) && existing.status === 'completed') {
            // Cubre ambos meses (la fecha pudo cruzar de mes) y respeta la sucursal del
            // payout (NULL = nómina global; específico debe coincidir con la clase).
            const paid = await query<{ display_name: string; period_month: Date }>(
                `SELECT DISTINCT i.display_name, p.period_month
                 FROM coach_payouts p JOIN instructors i ON i.id = p.instructor_id
                 WHERE p.period_month IN (date_trunc('month', $1::date)::date, date_trunc('month', $2::date)::date)
                   AND p.instructor_id = ANY($3::uuid[])
                   AND (p.facility_id IS NULL OR p.facility_id IS NOT DISTINCT FROM $4::uuid)`,
                [result.date, existing.date, [existing.instructor_id, data.instructorId].filter(Boolean), result.facility_id ?? null]);
            if (paid.length) {
                const nombres = [...new Set(paid.map(p => p.display_name))].join(', ');
                const meses = [...new Set(paid.map(p => new Date(p.period_month).toISOString().slice(0, 7)))].join(' y ');
                payrollWarning = `Ojo: la nómina de ${meses} de ${nombres} ya fue pagada; este cambio NO modifica el pago registrado. Si aplica, des-marca el pago y vuelve a pagar con el conteo corregido.`;
            }
        }

        res.json({ ...result, payrollWarning });
    } catch (error) {
        console.error('Update class error:', error);
        res.status(500).json({ error: 'Error al actualizar clase' });
    }
});

// ============================================
// GET /api/classes/:id/series-dates - Fechas próximas de la MISMA clase recurrente
// (mismo tipo + sucursal + hora + día de la semana). Para el selector de "fechas específicas".
// ============================================
router.get('/:id/series-dates', authenticate, requireElevated, async (req: Request, res: Response) => {
    try {
        const ref = await queryOne<{ class_type_id: string; facility_id: string | null; start_time: string; date: any }>(
            'SELECT class_type_id, facility_id, start_time, date FROM classes WHERE id = $1', [req.params.id]
        );
        if (!ref) return res.status(404).json({ error: 'Clase no encontrada' });
        const rows = await query<{ id: string; date: any; instructor_id: string; instructor_name: string }>(
            `SELECT c.id, c.date, c.instructor_id, i.display_name AS instructor_name
             FROM classes c JOIN instructors i ON i.id = c.instructor_id
             WHERE c.class_type_id = $1
               AND COALESCE(c.facility_id::text,'') = COALESCE($2::text,'')
               AND c.start_time = $3
               AND EXTRACT(DOW FROM c.date) = EXTRACT(DOW FROM $4::date)
               AND c.date >= (NOW() AT TIME ZONE 'America/Mexico_City')::date
               AND c.status <> 'cancelled'
             ORDER BY c.date
             LIMIT 60`,
            [ref.class_type_id, ref.facility_id, ref.start_time, ref.date]
        );
        res.json(rows);
    } catch (error) {
        console.error('Series dates error:', error);
        res.status(500).json({ error: 'Error al obtener fechas de la serie' });
    }
});

// ============================================
// POST /api/classes/:id/change-instructor - Cambiar el coach de una clase con ALCANCE:
//   scope = 'this'   → solo esta clase (este día)
//   scope = 'series' → todas las clases FUTURAS de esa misma recurrencia + el horario base
//   scope = 'dates'  → solo las fechas seleccionadas (de esa recurrencia)
// NO notifica a nadie (es un ajuste operativo). Solo elevados (admin / recepción master).
// ============================================
router.post('/:id/change-instructor', authenticate, requireElevated, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const instructorId = (req.body?.instructor_id as string | undefined)?.trim();
        const scope = (req.body?.scope as string | undefined) || 'this';
        const dates = Array.isArray(req.body?.dates) ? (req.body.dates as string[]) : [];
        if (!instructorId) return res.status(400).json({ error: 'Falta el coach (instructor_id).' });
        if (!['this', 'series', 'dates'].includes(scope)) return res.status(400).json({ error: 'scope inválido.' });
        if (scope === 'dates' && dates.length === 0) return res.status(400).json({ error: 'Selecciona al menos una fecha.' });

        const inst = await queryOne<{ id: string; display_name: string; is_active: boolean }>(
            'SELECT id, display_name, is_active FROM instructors WHERE id = $1', [instructorId]
        );
        if (!inst) return res.status(404).json({ error: 'Coach no encontrado.' });
        if (inst.is_active === false) return res.status(400).json({ error: 'Ese coach está inactivo.' });

        const ref = await queryOne<{ class_type_id: string; facility_id: string | null; start_time: string; date: any; instructor_id: string }>(
            'SELECT class_type_id, facility_id, start_time, date, instructor_id FROM classes WHERE id = $1', [id]
        );
        if (!ref) return res.status(404).json({ error: 'Clase no encontrada.' });
        const refDateStr = ref.date instanceof Date ? ref.date.toISOString().slice(0, 10) : String(ref.date).slice(0, 10);

        let updated = 0;
        let scheduleUpdated = 0;

        if (scope === 'this') {
            const r = await query<{ id: string }>(
                `UPDATE classes SET instructor_id = $1, updated_at = NOW() WHERE id = $2 AND status <> 'cancelled' RETURNING id`,
                [instructorId, id]
            );
            updated = r.length;
        } else if (scope === 'series') {
            // Todas las clases futuras (desde la fecha de esta) de la misma recurrencia.
            const r = await query<{ id: string }>(
                `UPDATE classes SET instructor_id = $1, updated_at = NOW()
                 WHERE class_type_id = $2
                   AND COALESCE(facility_id::text,'') = COALESCE($3::text,'')
                   AND start_time = $4
                   AND EXTRACT(DOW FROM date) = EXTRACT(DOW FROM $5::date)
                   AND date >= $5::date
                   AND status <> 'cancelled'
                 RETURNING id`,
                [instructorId, ref.class_type_id, ref.facility_id, ref.start_time, refDateStr]
            );
            updated = r.length;
            // Persistir en el horario base (para que las clases futuras que se generen también).
            const s = await query<{ id: string }>(
                `UPDATE schedules SET instructor_id = $1, updated_at = NOW()
                 WHERE class_type_id = $2
                   AND COALESCE(facility_id::text,'') = COALESCE($3::text,'')
                   AND start_time = $4
                   AND day_of_week = EXTRACT(DOW FROM $5::date)
                 RETURNING id`,
                [instructorId, ref.class_type_id, ref.facility_id, ref.start_time, refDateStr]
            );
            scheduleUpdated = s.length;
        } else {
            // 'dates': solo las fechas elegidas de esa recurrencia.
            const r = await query<{ id: string }>(
                `UPDATE classes SET instructor_id = $1, updated_at = NOW()
                 WHERE class_type_id = $2
                   AND COALESCE(facility_id::text,'') = COALESCE($3::text,'')
                   AND start_time = $4
                   AND date = ANY($5::date[])
                   AND status <> 'cancelled'
                 RETURNING id`,
                [instructorId, ref.class_type_id, ref.facility_id, ref.start_time, dates]
            );
            updated = r.length;
        }

        await logAction(query, {
            adminUserId: req.user!.userId,
            actionType: 'class_instructor_changed',
            entityType: 'class',
            entityId: id,
            description: `Cambió el coach a "${inst.display_name}" (${scope === 'this' ? 'solo este día' : scope === 'series' ? 'toda la serie' : `${dates.length} fecha(s)`}); ${updated} clase(s) actualizada(s)`,
            oldData: { instructor_id: ref.instructor_id },
            newData: { instructor_id: instructorId, scope, classes_updated: updated, schedule_updated: scheduleUpdated },
            req,
        });

        res.json({ updated, scheduleUpdated, message: `Coach actualizado en ${updated} clase(s).` });
    } catch (error) {
        console.error('Change instructor error:', error);
        res.status(500).json({ error: 'Error al cambiar el coach' });
    }
});

// ============================================
// DELETE /api/classes/:id - Cancel class (Admin)
// ============================================
router.delete('/:id', authenticate, requireElevated, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        // Get class info first
        const classInfo = await queryOne('SELECT * FROM classes WHERE id = $1', [id]);
        if (!classInfo) {
            return res.status(404).json({ error: 'Clase no encontrada' });
        }

        if (classInfo.status === 'cancelled') {
            return res.status(400).json({ error: 'La clase ya esta cancelada' });
        }

        // scope='series' → cancela TODAS las clases futuras del mismo horario recurrente:
        // mismo día de la semana + misma hora + mismo tipo + misma sucursal, desde esta fecha en adelante.
        if ((req.body?.scope as string) === 'series') {
            const siblings = await query<{ id: string }>(
                `SELECT id FROM classes
                   WHERE status != 'cancelled'
                     AND date >= $1::date
                     AND EXTRACT(DOW FROM date) = EXTRACT(DOW FROM $1::date)
                     AND start_time = $2
                     AND class_type_id = $3
                     AND (facility_id = $4 OR ($4::uuid IS NULL AND facility_id IS NULL))
                   ORDER BY date ASC`,
                [classInfo.date, classInfo.start_time, classInfo.class_type_id, classInfo.facility_id]
            );
            let cancelledClasses = 0, seriesBookings = 0, seriesRefunds = 0;
            for (const s of siblings) {
                const r = await cancelClassWithRefunds(s.id, req.user?.userId || '', reason || 'Cancelada por administrador (serie)');
                if (r.class) { cancelledClasses++; seriesBookings += r.cancelledBookings; seriesRefunds += r.refundedCredits; }
            }
            try {
                await logAction(query, {
                    adminUserId: req.user!.userId,
                    actionType: 'class_series_cancelled',
                    entityType: 'class',
                    entityId: id,
                    description: `Canceló ${cancelledClasses} clases del horario recurrente`,
                    newData: { cancelledClasses, cancelledBookings: seriesBookings, refundedCredits: seriesRefunds },
                    req,
                });
            } catch { /* best-effort */ }

            // Aviso al coach original (fuera de la app): resumen de la serie cancelada.
            try {
                if (cancelledClasses > 0) {
                    const coach = await queryOne<{ email: string; display_name: string }>(
                        `SELECT email, display_name FROM instructors WHERE id = $1`, [classInfo.instructor_id]);
                    const ct = await queryOne<{ name: string }>(`SELECT name FROM class_types WHERE id = $1`, [classInfo.class_type_id]);
                    if (coach?.email) {
                        const dateStr = classInfo.date instanceof Date ? classInfo.date.toISOString().slice(0, 10) : String(classInfo.date).slice(0, 10);
                        await sendClassCancelledToCoach({
                            to: coach.email, coachName: coach.display_name, className: ct?.name || 'tu clase',
                            classDate: dateStr, startTime: String(classInfo.start_time).slice(0, 5), count: cancelledClasses,
                        });
                    }
                }
            } catch (e) { console.error('coach series cancel email:', e); }

            return res.json({
                message: `Se cancelaron ${cancelledClasses} clases de este horario`,
                cancelledClasses,
                cancelledBookings: seriesBookings,
                refundedCredits: seriesRefunds,
            });
        }

        const { class: result, cancelledBookings, refundedCredits } = await cancelClassWithRefunds(
            id,
            req.user?.userId || '',
            reason || 'Cancelada por administrador'
        );

        // Aviso al coach (fuera de la app) de que su clase se canceló.
        try {
            const coach = await queryOne<{ email: string; display_name: string }>(
                `SELECT email, display_name FROM instructors WHERE id = $1`, [classInfo.instructor_id]);
            const ct = await queryOne<{ name: string }>(`SELECT name FROM class_types WHERE id = $1`, [classInfo.class_type_id]);
            if (coach?.email) {
                const dateStr = classInfo.date instanceof Date ? classInfo.date.toISOString().slice(0, 10) : String(classInfo.date).slice(0, 10);
                await sendClassCancelledToCoach({
                    to: coach.email, coachName: coach.display_name, className: ct?.name || 'tu clase',
                    classDate: dateStr,
                    startTime: String(classInfo.start_time).slice(0, 5),
                    endTime: String(classInfo.end_time).slice(0, 5),
                });
            }
        } catch (e) { console.error('coach cancel email:', e); }

        res.json({
            message: 'Clase cancelada exitosamente',
            class: result,
            cancelledBookings,
            refundedCredits
        });
    } catch (error) {
        console.error('Cancel class error:', error);
        res.status(500).json({ error: 'Error al cancelar clase' });
    }
});

// ============================================
// POST /api/classes/:id/substitute - Substitute coach (Admin)
// ============================================
router.post('/:id/substitute', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { newInstructorId, reason } = req.body;

        if (!newInstructorId) {
            return res.status(400).json({ error: 'Se requiere nuevo instructor' });
        }

        // Get current class info
        const classInfo = await queryOne(
            `SELECT c.*, i.display_name as original_instructor_name
             FROM classes c
             JOIN instructors i ON c.instructor_id = i.id
             WHERE c.id = $1`,
            [id]
        );

        if (!classInfo) {
            return res.status(404).json({ error: 'Clase no encontrada' });
        }

        if (classInfo.status === 'cancelled') {
            return res.status(400).json({ error: 'No se puede sustituir una clase cancelada' });
        }

        // Get new instructor info
        const newInstructor = await queryOne(
            'SELECT id, display_name FROM instructors WHERE id = $1 AND is_active = true',
            [newInstructorId]
        );

        if (!newInstructor) {
            return res.status(404).json({ error: 'Instructor no encontrado o inactivo' });
        }

        // Check if new instructor already has a class at this time
        const conflict = await queryOne(`
            SELECT id FROM classes 
            WHERE instructor_id = $1 
              AND date = $2 
              AND status != 'cancelled'
              AND id != $3
              AND (
                  (start_time <= $4 AND end_time > $4)
                  OR (start_time < $5 AND end_time >= $5)
                  OR (start_time >= $4 AND end_time <= $5)
              )
        `, [newInstructorId, classInfo.date, id, classInfo.start_time, classInfo.end_time]);

        if (conflict) {
            return res.status(400).json({ error: 'El instructor tiene otra clase en este horario' });
        }

        const originalInstructorId = classInfo.instructor_id;

        // Update class with new instructor
        await queryOne(
            'UPDATE classes SET instructor_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newInstructorId, id]
        );

        // Record substitution
        await queryOne(`
            INSERT INTO coach_substitutions 
            (class_id, original_instructor_id, new_instructor_id, reason, substituted_by)
            VALUES ($1, $2, $3, $4, $5)
        `, [id, originalInstructorId, newInstructorId, reason || null, req.user?.userId]);

        // Get clients booked in this class for notification
        const bookedClients = await query(`
            SELECT u.id, u.email, u.display_name
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            WHERE b.class_id = $1 AND b.status IN ('confirmed', 'waitlist')
        `, [id]);

        // Notificaciones: nuevo instructor recibe asignación; original recibe "ya cubierto".
        // No bloquea la respuesta — try/catch independiente y log.
        try {
            const ctype = await queryOne<{ name: string }>(
                `SELECT name FROM class_types WHERE id = $1`, [classInfo.class_type_id]
            );
            const newInst = await queryOne<{ email: string | null; display_name: string }>(
                `SELECT email, display_name FROM instructors WHERE id = $1`, [newInstructorId]
            );
            const origInst = await queryOne<{ email: string | null; display_name: string }>(
                `SELECT email, display_name FROM instructors WHERE id = $1`, [originalInstructorId]
            );
            const startStr = String(classInfo.start_time).slice(0, 5);
            const endStr = String(classInfo.end_time).slice(0, 5);
            const dateStr = typeof classInfo.date === 'string'
                ? classInfo.date.slice(0, 10)
                : new Date(classInfo.date).toISOString().slice(0, 10);

            if (newInst?.email && ctype?.name) {
                await sendClassAssignmentNotification({
                    to: newInst.email,
                    coachName: newInst.display_name,
                    className: ctype.name,
                    classDate: dateStr,
                    startTime: startStr,
                    endTime: endStr,
                    capacity: Number(classInfo.max_capacity) || 0,
                });
            }
            if (origInst?.email && ctype?.name && newInst?.display_name) {
                await sendSubstitutionAcceptedNotification({
                    to: origInst.email,
                    originalCoachName: origInst.display_name,
                    substituteCoachName: newInst.display_name,
                    className: ctype.name,
                    classDate: dateStr,
                    startTime: startStr,
                    endTime: endStr,
                    note: reason || null,
                });
            }
            // Espejo in-app: nuevo coach (assigned) + original (substituted).
            if (ctype?.name) {
                await writeInAppNotificationForInstructor(newInstructorId, {
                    type: 'coach_assigned',
                    title: 'Nueva clase asignada',
                    body: `Se te asignó ${ctype.name} el ${dateStr} ${startStr}.`,
                    data: { class_id: id, by: 'admin' },
                });
                await writeInAppNotificationForInstructor(originalInstructorId, {
                    type: 'coach_substituted',
                    title: 'Tu clase fue reasignada',
                    body: `${newInst?.display_name ?? 'Otro coach'} tomará ${ctype.name} el ${dateStr} ${startStr}.`,
                    data: { class_id: id, by: 'admin', reason: reason || null },
                });
            }
        } catch (notifErr) {
            console.error('[notify] admin substitute failed:', notifErr);
        }
        // (Clientes ya reservados se notifican aparte por el flujo de class_cancelled/updated.)

        res.json({
            message: 'Instructor sustituido exitosamente',
            original_instructor: classInfo.original_instructor_name,
            new_instructor: newInstructor.display_name,
            affected_clients: bookedClients.length
        });
    } catch (error) {
        console.error('Substitute coach error:', error);
        res.status(500).json({ error: 'Error al sustituir instructor' });
    }
});

// ============================================
// GET /api/classes/:id/attendees - Get class attendees (for calendar view)
// ============================================
router.get('/:id/attendees', authenticate, requireRole('admin', 'super_admin', 'instructor'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // Un instructor solo puede ver asistentes (incluye health_notes) de SUS
        // clases — no de las de otros coaches. Admin/super_admin ven todas.
        if (req.user!.role === 'instructor') {
            const own = await queryOne(
                `SELECT 1 FROM classes c
                 JOIN instructors i ON i.id = c.instructor_id
                 WHERE c.id = $1 AND i.user_id = $2`,
                [id, req.user!.userId]
            );
            if (!own) {
                return res.status(403).json({ error: 'No puedes ver asistentes de una clase que no impartes' });
            }
        }

        const attendees = await query(`
            SELECT
                b.id AS booking_id,
                b.status,
                b.waitlist_position,
                b.checked_in_at,
                u.id AS user_id,
                u.display_name,
                u.email,
                u.phone,
                u.photo_url,
                u.health_notes,
                u.alert_flag,
                u.alert_message
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            WHERE b.class_id = $1 AND b.status != 'cancelled'
            ORDER BY
                CASE b.status WHEN 'waitlist' THEN 2 ELSE 1 END,
                b.waitlist_position NULLS LAST,
                b.created_at
        `, [id]);

        const confirmed = attendees.filter((a: any) => a.status !== 'waitlist');
        const waitlist = attendees.filter((a: any) => a.status === 'waitlist');

        res.json({ confirmed, waitlist, total: confirmed.length, waitlist_count: waitlist.length });
    } catch (error) {
        console.error('Get attendees error:', error);
        res.status(500).json({ error: 'Error al obtener asistentes' });
    }
});

export default router;
